// The pre-visit brief: what the PT should know before the patient walks in, from the last visit
// and today's prep (docs/NEXT_PHASE_PLAN.md → Task 4). It describes and never interprets:
// "Shoulder marked 6 last time, 4 today" is fine; "the shoulder is improving" is not.
// Pure: plain data in, plain data out, so it runs under `node --test`. Sections with nothing in
// them are left out (null or an empty list).
import { REGIONS } from '../regions.js'
import { toTen } from '../scene/intensity.js'
import { COVERAGE_LABELS, flaggedPain, goalCoverage } from './coverage.js'

const DAY_MS = 24 * 60 * 60 * 1000
const name = (region) => REGIONS[region] ?? region

export function daysBetween(fromIso, to = new Date()) {
  const start = new Date(fromIso)
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / DAY_MS)
}

// last: a history record ({ endedAt, visit }); today: the current visit (its prep so far).
export function buildBrief(last, today, now = new Date()) {
  if (!last?.visit) return null
  const v = last.visit
  const endedAt = last.endedAt ?? v.endedAt ?? v.startedAt
  const observations = v.observations ?? []

  const missed = flaggedPain(v).map((p) => ({
    region: p.region,
    text: `${name(p.region)} (${p.type}, ${toTen(p.intensity)}/10): ${COVERAGE_LABELS[p.coverage]}`,
  }))

  // Corrections the patient asked for that the PT hasn't settled (Task A1), if any were recorded.
  const corrections = observations
    .filter((o) => o.correction?.status === 'requested')
    .map((o) => ({ region: o.symptomRegion ?? null, text: `${o.movement || 'Movement check'}: the patient asked for a correction` }))

  const goal = v.goal?.text ? { text: v.goal.text, discussed: goalCoverage(v)?.discussed ?? false } : null

  const notConfirmed = observations
    .filter((o) => o.confirmed === false && !o.correction) // corrections have their own section
    .map((o) => ({ region: o.symptomRegion ?? o.assessedRegion ?? null, text: describeCheck(o) }))

  const movementChecks = observations
    .filter((o) => o.before != null || o.after != null)
    .map((o) => ({ region: o.assessedRegion ?? o.symptomRegion ?? null, text: describeCheck(o) }))

  const painArcs = Object.entries(v.painArcs ?? {}).map(([region, arc]) => ({ region, arc }))

  const anatomy = (v.anatomyNotes ?? []).map((n) => ({
    region: n.complaintRegion ?? n.structure?.region ?? null,
    text: `${n.structure?.label ?? 'Structure'}${n.structure?.anatomical ? ` (${n.structure.anatomical})` : ''}`,
  }))

  const followUps = (v.followUps ?? []).map((f) => ({ region: null, text: f.text }))

  return {
    since: endedAt ? { date: endedAt, daysAgo: daysBetween(endedAt, now) } : null,
    missed,
    corrections,
    goal,
    notConfirmed,
    movementChecks,
    painArcs,
    anatomy,
    followUps,
    today: compareMarks(v.painted ?? [], today?.painted ?? []),
  }
}

// "Turn your head to the left: right shoulder 5 → 2"
export function describeCheck(o) {
  const where = o.symptomRegion ? name(o.symptomRegion).toLowerCase() : 'pain'
  return `${o.movement || 'Movement'}: ${where} ${o.before ?? '–'} → ${o.after ?? '–'}`
}

// Today's marks against last time's: new, no longer marked, and rating changes. Numbers only.
export function compareMarks(before, now) {
  const was = new Map(before.map((p) => [p.region, p]))
  const is = new Map(now.map((p) => [p.region, p]))
  const items = []
  for (const p of now) {
    const old = was.get(p.region)
    if (!old) items.push({ region: p.region, text: `${name(p.region)}: newly marked today, ${toTen(p.intensity)}/10` })
    else if (toTen(old.intensity) !== toTen(p.intensity) || old.type !== p.type) {
      const type = old.type !== p.type ? ` (${old.type} last time, ${p.type} today)` : ''
      items.push({ region: p.region, text: `${name(p.region)}: ${toTen(old.intensity)}/10 last time, ${toTen(p.intensity)}/10 today${type}` })
    }
  }
  for (const p of before) {
    if (!is.has(p.region)) items.push({ region: p.region, text: `${name(p.region)}: marked last time, not marked today` })
  }
  return items
}
