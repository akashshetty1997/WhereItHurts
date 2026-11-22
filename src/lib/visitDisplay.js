// How visit data is shown: speaker names and pain-type colors.
// Full class strings (not built at runtime) so Tailwind can find them.

export const SPEAKER_NAMES = { pt: 'PT', doctor: 'PT', patient: 'Patient' }

export const SPEAKER_TEXT = { pt: 'text-pt', doctor: 'text-pt', patient: 'text-patient' }

export const PAIN_STYLES = {
  burning: { bar: 'bg-burning', text: 'text-burning', ring: 'data-[state=on]:ring-burning', label: 'Burning' },
  sharp: { bar: 'bg-sharp', text: 'text-sharp', ring: 'data-[state=on]:ring-sharp', label: 'Sharp' },
  aching: { bar: 'bg-aching', text: 'text-aching', ring: 'data-[state=on]:ring-aching', label: 'Aching' },
}
