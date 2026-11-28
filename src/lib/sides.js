// Never guess a side (docs/NEXT_PHASE_PLAN.md → Task A3).
//
// A body part that has two sides, named without one ("my shoulder"), arrives in a line's
// `unsided` (the region id it would map to) instead of `regions`. The transcript asks "Which
// side? Right / Left":
//   - the side we have a region for → that region is added to the line (it glows as usual)
//   - the other side → a text-only note, "Left shoulder (mentioned; not shown on the body yet)"
// Until a side is picked the mention is "Shoulder (side not said)" and doesn't count toward
// coverage. Choices live on the line: segment.sides = { [unsidedRegion]: 'left' | 'right' }.
// Region ids come from src/regions.js, never a hard-coded list.
import { REGIONS } from '../regions.js'

const SIDES = ['right', 'left'] // the patient's side; right first, as a PT says it
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// "right_shoulder" → { side: 'right', part: 'shoulder' }; null for regions without a side.
export function splitSided(region) {
  const [side, ...rest] = region.split('_')
  return SIDES.includes(side) && rest.length ? { side, part: rest.join(' ') } : null
}

// The choices for an unsided mention: [{ side, label, region | null }], right first.
export function sideChoices(region) {
  const sided = splitSided(region)
  if (!sided) return []
  return SIDES.map((side) => {
    const id = `${side}_${sided.part.replace(/ /g, '_')}`
    return { side, label: cap(side), region: id in REGIONS ? id : null }
  })
}

export const partName = (region) => splitSided(region)?.part ?? REGIONS[region]?.toLowerCase() ?? region

// Picking a side for one mention on a line: the patch for visitStore.updateSegment.
export function resolveSide(segment, region, side) {
  const choice = sideChoices(region).find((c) => c.side === side)
  if (!choice) return {}
  const sides = { ...(segment.sides ?? {}), [region]: side }
  const regions = choice.region && !segment.regions.includes(choice.region) ? [...segment.regions, choice.region] : segment.regions
  return { sides, regions }
}

// Every side mention in a visit: { segmentId, region, part, side: 'left' | 'right' | 'unspecified', label, shown }
//   label   "Shoulder (side not said)" | "Left shoulder (mentioned; not shown on the body yet)" | "Right shoulder"
//   shown   true when the picked side is a region on the body
export function sideMentions(visit) {
  const out = []
  for (const s of visit.segments ?? []) {
    for (const region of s.unsided ?? []) {
      const side = s.sides?.[region] ?? 'unspecified'
      const part = partName(region)
      const choice = sideChoices(region).find((c) => c.side === side)
      const shown = !!choice?.region
      const label =
        side === 'unspecified'
          ? `${cap(part)} (side not said)`
          : shown
            ? `${cap(side)} ${part}`
            : `${cap(side)} ${part} (mentioned; not shown on the body yet)`
      out.push({ segmentId: s.id, region, part, side, label, shown })
    }
  }
  return out
}

// What the reports list under "Mentioned without a side": the ones still unspecified and the ones
// on a side the body doesn't have yet, once each.
export function sideNotes(visit) {
  const seen = new Set()
  return sideMentions(visit).filter((m) => {
    if (m.shown || seen.has(m.label)) return false
    seen.add(m.label)
    return true
  })
}
