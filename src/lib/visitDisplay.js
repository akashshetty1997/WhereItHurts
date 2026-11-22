import { Flame, Zap, Waves } from 'lucide-react'

// How visit data is shown: speaker names and pain-type colors.
// Full class strings (not built at runtime) so Tailwind can find them.

export const SPEAKER_NAMES = { pt: 'PT', doctor: 'PT', patient: 'Patient' }

export const SPEAKER_TEXT = { pt: 'text-pt', doctor: 'text-pt', patient: 'text-patient' }

export const PAIN_STYLES = {
  burning: { bar: 'bg-burning', text: 'text-burning', ring: 'data-[state=on]:ring-burning', label: 'Burning' },
  sharp: { bar: 'bg-sharp', text: 'text-sharp', ring: 'data-[state=on]:ring-sharp', label: 'Sharp' },
  aching: { bar: 'bg-aching', text: 'text-aching', ring: 'data-[state=on]:ring-aching', label: 'Aching' },
}

// A shape per pain type, so the type never depends on color alone (accessibility.md › Vision).
export const PAIN_ICONS = { burning: Flame, sharp: Zap, aching: Waves }

// Show Anatomy notes (visitStore.addAnatomyNote): why each structure went into the report, and the
// notes grouped by the complaint (region) they were shown for, in the order they were added.
export const ANATOMY_PURPOSE = { discussed: 'discussed with patient', examined: 'examined' }
export function groupAnatomyNotes(notes) {
  const groups = new Map()
  for (const n of notes) groups.set(n.complaintRegion, [...(groups.get(n.complaintRegion) ?? []), n])
  return [...groups]
}
