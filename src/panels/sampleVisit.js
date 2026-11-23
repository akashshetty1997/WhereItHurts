// A sample prep and visit (our demo script), for when there's no voice server: the public link,
// or the backend not running. Each line goes into the visit exactly as live speech would, with what
// the server would have found in it (body parts, pain path, rating, movement, follow-up), so the
// body glows, the pain path pulses, the PT's movements play, the movement check fills in, and the
// knee that never comes up is flagged at the end.
import { glow } from '@/scene/bodyApi'
import { regionLabel } from '@/regions'
import { visitStore } from '../visitStore'

const PATIENT_COLOR = '#F78FB3'

// Before the visit: what Alex says while recording the prep.
export const SAMPLE_PREP = [
  { text: 'My right shoulder aches. It’s about a six.', mark: { region: 'right_shoulder', type: 'aching', intensity: 6 } },
  { text: 'My left knee also aches a little. It’s about a three.', mark: { region: 'left_knee', type: 'aching', intensity: 3 } },
  { text: 'My goal is to put plates on the top shelf again.', goal: 'put plates on the top shelf again' },
]

// The visit. wait: ms before the next line (longer after a movement, so it can play).
export const SAMPLE_VISIT = [
  { speaker: 'pt', text: 'Hi Alex, I’m Dinesh, your physical therapist today.', regions: [] },
  { speaker: 'patient', text: 'Hi Dinesh, nice to meet you.', regions: [] },
  { speaker: 'pt', text: 'So, what brings you in today?', regions: [] },
  { speaker: 'patient', text: 'My right shoulder aches when I reach up to put plates away.', regions: ['right_shoulder'] },
  { speaker: 'pt', text: 'Does it stay in one place?', regions: ['right_shoulder'] },
  { speaker: 'patient', text: 'Sometimes it runs from my neck down into my shoulder.', regions: ['neck', 'right_shoulder'], path: ['neck', 'right_shoulder'], wait: 3200 },
  { speaker: 'pt', text: 'How bad is the shoulder right now, from zero to ten?', regions: ['right_shoulder'] },
  { speaker: 'patient', text: 'About a six.', regions: [], rating: 6 },
  { speaker: 'pt', text: 'Let me check your neck. Slowly turn your head to the left.', regions: ['neck'], movement: 'Turn your head to the left', wait: 7000 },
  { speaker: 'patient', text: 'Oh, the shoulder feels better. Maybe a two.', regions: ['right_shoulder'], rating: 2 },
  { speaker: 'pt', text: 'Now raise your right arm up for me, slowly.', regions: ['right_shoulder'], wait: 8000 },
  { speaker: 'patient', text: 'It starts hurting about halfway up, and it eases near the top.', regions: ['right_shoulder'] },
  { speaker: 'pt', text: 'We’ll work on your neck and shoulder with a few exercises at home.', regions: ['neck', 'right_shoulder'] },
  { speaker: 'pt', text: 'And let’s book a follow-up in two weeks.', regions: [], followUp: 'Follow-up in two weeks' },
  { speaker: 'patient', text: 'Sounds good, thanks.', regions: [] },
]
const GAP_MS = 2400

// Plays lines one after another; returns stop(). onLine(index) after each, onDone at the end.
function play(lines, apply, { onLine, onDone, gap = GAP_MS } = {}) {
  let stopped = false
  let timer = null
  const step = (i) => {
    if (stopped) return
    if (i >= lines.length) return onDone?.()
    apply(lines[i], i)
    onLine?.(i)
    timer = setTimeout(() => step(i + 1), lines[i].wait ?? gap)
  }
  timer = setTimeout(() => step(0), 600)
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

export function playSamplePrep(options) {
  return play(
    SAMPLE_PREP,
    (line) => {
      if (line.goal) visitStore.setGoal(line.goal)
      if (line.mark) {
        const painted = visitStore.get().painted.filter((p) => p.region !== line.mark.region)
        visitStore.setPainted([...painted, { ...line.mark, note: line.text }])
        glow(line.mark.region, visitStore.get().speakers?.patient?.color ?? PATIENT_COLOR)
      }
    },
    options,
  )
}

// What the prep line did, for the "Heard:" line.
export function describePrepLine(line) {
  if (line.goal) return `Goal: ${line.goal}`
  const m = line.mark
  return `${regionLabel(m.region)} · ${m.type} · ${m.intensity}/10`
}

export function playSampleVisit(options) {
  const run = Date.now().toString(36)
  return play(
    SAMPLE_VISIT,
    (line, i) => {
      const segment = {
        id: `sample-${run}-${i}`,
        speaker: line.speaker,
        text: line.text,
        regions: line.regions,
        path: line.path ?? [],
        rating: line.rating ?? null,
        movement: line.movement ?? null,
      }
      visitStore.addSegment(segment)
      if (line.followUp) visitStore.addFollowUp({ id: `fu-${segment.id}`, text: line.followUp, segmentId: segment.id })
    },
    options,
  )
}
