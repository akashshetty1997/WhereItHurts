// Which movement did the PT just ask for? Plays that body part's simulation during the visit
// (src/App.jsx → bodyApi.playMovement). Patient lines never count.
//   "Raise your right arm for me"           → { region: 'right_shoulder', direction: 1 }
//   "Slowly turn your head to the left"     → { region: 'neck', direction: 1 }   (left = +)
//   "Look over your right shoulder"         → { region: 'neck', direction: -1 }
//   "Bend your knee for me"                 → { region: 'left_knee', direction: 1 }
const RAISE = /\b(raise|lift|reach)\b/i
const ARM = /\b(arms?|shoulders?|up|overhead)\b/i
const NOT_ARM = /\b(legs?|knees?|foot|feet|head|chin|hips?|heels?|toes?)\b/i
const TURN_HEAD = /\b(turn|rotate)\b[^.?!]*\b(head|neck)\b|\blook\b[^.?!]*\b(left|right|over)\b/i
const BEND_KNEE = /\b(bend|straighten|flex)\b[^.?!]*\bknees?\b|\bsquat\b/i

export function spokenMovement(segment) {
  if (!segment || segment.speaker === 'patient') return null
  // "Over your head" is where the arm goes, not a movement of the head.
  const text = `${segment.movement ?? ''} ${segment.text ?? ''}`.replace(/\b(over|above) your head\b/gi, 'overhead')
  if (TURN_HEAD.test(text)) return { region: 'neck', direction: /\bright\b/i.test(text) ? -1 : 1 }
  // Only the left knee has a simulation.
  if (BEND_KNEE.test(text)) return /\bright knee\b/i.test(text) ? null : { region: 'left_knee', direction: 1 }
  if (RAISE.test(text) && ARM.test(text) && !NOT_ARM.test(text)) return /\bleft (arm|shoulder)\b/i.test(text) ? null : { region: 'right_shoulder', direction: 1 }
  return null
}
