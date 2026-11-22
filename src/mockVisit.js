// Shared contract between all roles. Build against this until integration.
export const mockVisit = {
  visitId: 'live-01',
  speakers: {
    doctor: { color: '#4FC3F7' },
    patient: { color: '#FFB74D' },
  },
  painted: [
    { region: 'lower_back', type: 'aching', intensity: 0.6 },
    { region: 'left_leg', type: 'sharp', intensity: 0.8 },
    { region: 'left_knee', type: 'aching', intensity: 0.4 },
  ],
  segments: [
    {
      id: 's4',
      speaker: 'patient',
      start: 14.2,
      end: 18.9,
      text: 'It starts in my lower back and goes down my left leg.',
      regions: ['lower_back', 'left_leg'],
      path: ['lower_back', 'left_leg'],
    },
  ],
  followUps: [
    { id: 'f1', text: 'Follow-up visit in two weeks', segmentId: 's9' },
  ],
}
