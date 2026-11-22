// MVP region ids (docs/PLAN.md → Data model). Left/right = the PATIENT's side.
export const REGIONS = {
  head: 'Head',
  neck: 'Neck',
  lower_back: 'Lower back',
  left_leg: 'Left leg',
  left_knee: 'Left knee',
  right_shoulder: 'Right shoulder',
}

export const REGION_IDS = Object.keys(REGIONS)

export const PAIN_TYPES = ['burning', 'sharp', 'aching']
