// What a prep sentence does, spoken (PrepListen) or typed (TypedLine): mark pain, set the goal.
import { regionLabel } from '@/regions'
import { glow } from '@/scene/bodyApi'
import { visitStore } from '../visitStore'

const DEFAULT_TYPE = 'aching' // same defaults as the tap-and-pick card (src/scene/IntakePicker.jsx)
const DEFAULT_RATING = 5

// One body part, merged into what was already marked (like the tap-and-pick card does).
function markPain(region, { type, rating, note }) {
  const painted = visitStore.get().painted
  const entry = painted.find((p) => p.region === region)
  const next = {
    region,
    type: entry?.type ?? DEFAULT_TYPE,
    intensity: entry?.intensity ?? DEFAULT_RATING,
    ...entry,
    note,
    ...(type ? { type } : {}),
    ...(rating != null ? { intensity: rating } : {}), // already 0–10
  }
  visitStore.setPainted([...painted.filter((p) => p.region !== region), next])
}

// Same wording as backend/app/constants.py PREP_CONTEXT: tells Claude this is the intake.
const PREP_CONTEXT =
  'Before the visit: the patient describes where it hurts or what they want to be able to do again.'

export async function askClaude(text) {
  const res = await fetch('/api/extract/smart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, speaker: 'patient', context: PREP_CONTEXT }),
  })
  if (!res.ok) throw new Error(`smart extract ${res.status}`)
  return res.json()
}

export const unplaced = (text) => `“${text}” Which body part? Name it, or tap it on the body first.`

function describe(region) {
  const entry = visitStore.get().painted.find((p) => p.region === region)
  return `${regionLabel(region)} · ${entry.type} · ${entry.intensity}/10`
}

// Use what was understood: the goal, and/or the body parts it describes. Returns what to show.
export function applyPrep(found, regions, text) {
  const heardNow = []
  if (found.goal) {
    visitStore.setGoal(found.goal)
    heardNow.push(`Goal: ${found.goal}`)
  }
  // A goal sentence only marks a body part when it also says how it hurts.
  const describesPain = !found.goal || found.pain_type || found.rating != null
  if (regions.length && describesPain) {
    const color = visitStore.get().speakers?.patient?.color ?? '#F78FB3'
    regions.forEach((region) => {
      markPain(region, { type: found.pain_type, rating: found.rating, note: text })
      glow(region, color)
    })
    heardNow.push(regions.map(describe).join('; '))
  }
  return heardNow.join(' · ')
}
