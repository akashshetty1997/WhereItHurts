// Region ids (docs/PLAN.md → Data model). Left/right = the PATIENT's side.
// Keep in sync with backend/app/constants.py REGION_IDS.
export const REGIONS = {
  head: 'Head',
  neck: 'Neck',
  upper_back: 'Upper back',
  lower_back: 'Lower back',
  left_leg: 'Left leg',
  left_knee: 'Left knee',
  right_shoulder: 'Right shoulder',
}

export const REGION_IDS = Object.keys(REGIONS)

// The term a PT uses for the spine regions, shown next to the patient's word.
export const CLINICAL_TERMS = {
  neck: 'cervical spine',
  upper_back: 'thoracic spine',
  lower_back: 'lumbar spine',
}

// "Lower back (lumbar spine)", or just "Left knee".
export function regionLabel(id) {
  const term = CLINICAL_TERMS[id]
  return term ? `${REGIONS[id]} (${term})` : REGIONS[id]
}

export const PAIN_TYPES = ['burning', 'sharp', 'aching']
