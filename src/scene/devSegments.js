// Dev-only: the v2 role-play script as segments, to test glow without live speech.
// Open http://localhost:5173/?demo to play it on load.
export const DEV_SEGMENTS = [
  { speaker: 'pt', text: 'What brings you in today?', regions: [] },
  { speaker: 'patient', text: 'My right shoulder aches when I reach up to put plates away.', regions: ['right_shoulder'] },
  { speaker: 'pt', text: 'Does it stay in one place?', regions: ['right_shoulder'] },
  { speaker: 'patient', text: 'Sometimes it runs from my neck down into my shoulder.', regions: ['neck', 'right_shoulder'], path: ['neck', 'right_shoulder'] },
  { speaker: 'pt', text: 'How bad is the shoulder right now, zero to ten?', regions: ['right_shoulder'] },
  { speaker: 'patient', text: 'About a five.', regions: [] },
  { speaker: 'pt', text: 'Let me check your neck. Slowly turn your head to the left.', regions: ['neck'] },
  { speaker: 'patient', text: 'Oh, the shoulder feels better. Maybe a two.', regions: ['right_shoulder'] },
  { speaker: 'pt', text: "Let's work on your neck and shoulder, with exercises at home.", regions: ['neck', 'right_shoulder'] },
  { speaker: 'pt', text: "And let's book a follow-up in two weeks.", regions: [] },
  { speaker: 'patient', text: 'Okay, thanks.', regions: [] },
]

export const DEV_SEGMENT_GAP_MS = 1800
