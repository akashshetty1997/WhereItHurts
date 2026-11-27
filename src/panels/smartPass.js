// The smart pass for visit lines. A line is shown at once from the keywords; then Claude reads it
// (with the line before it as context) and the line is improved in place: body parts the keywords
// missed (they glow when they arrive), a pain path, a rating, a movement, a fixed transcript, and
// a follow-up. Keyword findings are never removed. If Claude isn't available, nothing changes.
import { extractSmart } from '@/lib/api'
import { glow } from '@/scene/bodyApi'
import { visitStore } from '../visitStore'

export function addFollowUpFrom(segment, text) {
  if (text) visitStore.addFollowUp({ id: `fu-${segment.id}`, text, segmentId: segment.id })
}

export async function refineLine(segment, previousText) {
  let found
  try {
    found = await extractSmart(segment.text, segment.speaker, previousText)
  } catch {
    return // no Claude (off, offline, slow): the keyword version stays
  }
  const current = visitStore.get().segments.find((s) => s.id === segment.id)
  if (!current) return // New Visit happened in between

  const added = (found.regions ?? []).filter((r) => !current.regions.includes(r))
  const patch = {}
  if (added.length) patch.regions = [...current.regions, ...added]
  if ((found.path?.length ?? 0) > 1 && !((current.path?.length ?? 0) > 1)) patch.path = found.path
  if (current.rating == null && found.rating != null) patch.rating = found.rating
  if (!current.movement && found.movement) patch.movement = found.movement
  if (found.corrected_text && found.corrected_text !== current.text) patch.correctedText = found.corrected_text
  // Anatomy structures the PT named or described: Auto-follow opens them (src/scene/autoFollow.js).
  const newStructures = (found.structures ?? []).filter((id) => !(current.structures ?? []).includes(id))
  if (newStructures.length) patch.structures = [...(current.structures ?? []), ...newStructures]
  if (Object.keys(patch).length) visitStore.updateSegment(segment.id, patch)

  const color = visitStore.get().speakers?.[segment.speaker]?.color
  added.forEach((region) => glow(region, color))
  addFollowUpFrom(segment, found.follow_up)
}
