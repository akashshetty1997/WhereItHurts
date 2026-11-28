// Patient corrections to a movement check (docs/NEXT_PHASE_PLAN.md → Task A1).
//
// The patient presses Not Quite and says what's wrong: the numbers, the body part, or the
// wording. The PT then accepts the patient's version or keeps the original with a note.
// Nothing is ever deleted or overwritten without a trace: the recorded values stay in
// `correction.original` when the PT accepts, and the patient's version stays in
// `correction.patientVersion` when the PT keeps the original.
//
//   correction = { status: 'requested' | 'resolved', patientVersion: { before?, after?, region?,
//                  regionText?, text? }, note?, requestedAt, resolvedAt?,
//                  resolution?: 'accepted' | 'kept_original', ptNote?, original? }
//
// Each function returns the patch for visitStore.updateObservation. Pure, so it runs under node.
import { REGIONS } from '../regions.js'

export const CORRECTION_BADGE = 'Patient requested a correction'

// 'none' | 'requested' | 'accepted' | 'kept_original'
export function correctionState(o) {
  const c = o?.correction
  if (!c) return 'none'
  return c.status === 'requested' ? 'requested' : c.resolution
}

const cleanVersion = (v = {}) => {
  const out = {}
  for (const key of ['before', 'after']) {
    const n = v[key]
    if (n !== '' && n != null && Number.isInteger(Number(n)) && Number(n) >= 0 && Number(n) <= 10) out[key] = Number(n)
  }
  if (v.region && v.region in REGIONS) out.region = v.region
  if (v.regionText?.trim()) out.regionText = v.regionText.trim()
  if (v.text?.trim()) out.text = v.text.trim()
  return out
}

export function requestCorrection(o, patientVersion, now = new Date().toISOString()) {
  const version = cleanVersion(patientVersion)
  if (!Object.keys(version).length) throw new Error('Say what doesn’t match: the numbers, the body part or the words.')
  return { confirmed: false, correction: { status: 'requested', patientVersion: version, requestedAt: now } }
}

// The PT agrees: the patient's numbers and body part become the record. The recorded values are
// kept in `original` so the report can say what changed.
export function acceptCorrection(o, now = new Date().toISOString()) {
  const c = o.correction
  if (c?.status !== 'requested') return {}
  const v = c.patientVersion
  const original = { before: o.before, after: o.after, symptomRegion: o.symptomRegion ?? null, movement: o.movement, response: o.response ?? null }
  const before = v.before ?? o.before
  const after = v.after ?? o.after
  // Better / same / worse follows the accepted numbers ('moved' is the PT's own call and stays).
  const response =
    o.response === 'moved' || before == null || after == null ? o.response : after < before ? 'better' : after > before ? 'worse' : 'same'
  return {
    ...(v.before != null ? { before: v.before } : {}),
    ...(v.after != null ? { after: v.after } : {}),
    ...(response !== undefined ? { response } : {}),
    ...(v.region ? { symptomRegion: v.region } : {}),
    correction: { ...c, status: 'resolved', resolution: 'accepted', resolvedAt: now, original },
  }
}

// The PT keeps what was recorded; a note saying why is required.
export function keepOriginal(o, ptNote, now = new Date().toISOString()) {
  const c = o.correction
  if (c?.status !== 'requested') return {}
  if (!ptNote?.trim()) throw new Error('Add a note saying why the original stays.')
  return { correction: { ...c, status: 'resolved', resolution: 'kept_original', resolvedAt: now, ptNote: ptNote.trim() } }
}

// ---------- how it reads ----------

const part = (region, text) => (region ? REGIONS[region].toLowerCase() : text || 'pain')

// "5 → 4", "left knee, 5 → 4", "“Raise your arm sideways”"
export function describeVersion(v, fallback = {}) {
  const bits = []
  if (v.region || v.regionText) bits.push(part(v.region, v.regionText))
  if (v.before != null || v.after != null) bits.push(`${v.before ?? fallback.before ?? '–'} → ${v.after ?? fallback.after ?? '–'}`)
  if (v.text) bits.push(`“${v.text}”`)
  return bits.join(', ')
}

export const recordedVersion = (o) => ({ region: o.symptomRegion, before: o.before, after: o.after })

// The Take-Home Summary line for a movement check: a disputed value is never stated as fact.
export function takeHomeLine(o) {
  const did = o.movement ? `When you did “${o.movement}”, your` : 'Your'
  const fact = `${did} ${part(o.symptomRegion)} went from ${o.before} to ${o.after} out of 10.`
  const state = correctionState(o)
  if (state === 'requested') {
    return `You said this doesn’t match. You remember ${describeVersion(o.correction.patientVersion, o)}. Your PT will review it.`
  }
  if (state === 'accepted') return `${fact} (Corrected by you, accepted by your PT.)`
  if (state === 'kept_original') {
    const note = o.correction.ptNote ? ` Your PT noted: “${o.correction.ptNote}”` : ''
    return `${fact} You remembered ${describeVersion(o.correction.patientVersion, o)}.${note}`
  }
  if (o.confirmed == null) return `${fact} Not confirmed yet.`
  if (o.confirmed === false) return `You said this doesn’t match: ${part(o.symptomRegion)} ${o.before} → ${o.after}. Talk it through with your PT.`
  return fact
}

// The PT Report's "Patient confirmed" cell.
export function ptReportStatus(o) {
  const state = correctionState(o)
  const c = o.correction
  if (state === 'requested') {
    return `${CORRECTION_BADGE}. Recorded: ${describeVersion(recordedVersion(o))}. Patient: ${describeVersion(c.patientVersion, o)}.`
  }
  if (state === 'accepted') {
    return `Corrected by patient, accepted by PT (recorded: ${describeVersion({ region: c.original.symptomRegion, before: c.original.before, after: c.original.after })}).`
  }
  if (state === 'kept_original') {
    return `Patient remembered ${describeVersion(c.patientVersion, o)}; PT kept the original: “${c.ptNote}”`
  }
  return o.confirmed === true ? 'Yes' : o.confirmed === false ? 'No, disagrees' : 'Not asked'
}
