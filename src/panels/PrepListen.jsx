// Hands-free prep ("Before Your Visit"): the mic is on and the patient just talks.
//   "My right shoulder aches, about a five."         -> marks the shoulder: aching, 5/10, their words
//   "I want to be able to put plates on the top shelf." -> sets the goal
// Tapping a body part first makes a sentence that names no part describe that one.
// Prep sentences are not visit conversation, so they never count as "talked about".
import { useEffect, useRef, useState } from 'react'
import { regionLabel } from '@/regions'
import { glow, onRegionClick } from '@/scene/bodyApi'
import { visitStore } from '../visitStore'
import { startLive } from './liveVoice'

const DEFAULT_TYPE = 'aching' // same defaults as the tap-and-pick card (src/scene/IntakePicker.jsx)
const DEFAULT_RATING = 5

const FAILURES = {
  transcription_off: 'Hands-free listening is off on the server.',
  closed: 'Lost the connection to the server.',
  mic: 'The microphone is blocked or missing. Allow it in the address bar.',
}

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

function describe(region) {
  const entry = visitStore.get().painted.find((p) => p.region === region)
  return `${regionLabel(region)} · ${entry.type} · ${entry.intensity}/10`
}

export default function PrepListen({ onFail }) {
  const [heard, setHeard] = useState(null) // last thing understood, shown to the patient
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const live = useRef(null)

  useEffect(() => {
    let cancelled = false
    const patientColor = visitStore.get().speakers?.patient?.color ?? '#FFB74D'
    startLive({
      mode: 'prep',
      onLevel: setLevel,
      onEvent: (event) => {
        if (event.type === 'ready') setListening(true)
        else if (event.type === 'error') onFail(FAILURES[event.code] ?? `Listening error: ${event.code}`)
        else if (event.type === 'segment') {
          const { text, regions } = event.segment
          const found = event.extraction ?? {}
          if (found.goal) {
            visitStore.setGoal(found.goal)
            setHeard(`Goal: ${found.goal}`)
          } else if (regions.length) {
            regions.forEach((region) => {
              markPain(region, { type: found.pain_type, rating: found.rating, note: text })
              glow(region, patientColor)
            })
            setHeard(regions.map(describe).join('; '))
          } else {
            setHeard(`“${text}”: which body part? Name it, or tap it on the body first.`)
          }
        }
      },
      onClose: () => !cancelled && onFail(FAILURES.closed),
    })
      .then((controller) => {
        if (cancelled) controller.stop()
        else live.current = controller
      })
      .catch(() => !cancelled && onFail(FAILURES.mic))

    // A tapped body part is the one a sentence describes when it names none.
    const offClick = onRegionClick((region) => live.current?.setRegion(region))
    return () => {
      cancelled = true
      offClick()
      live.current?.stop()
      live.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one listening session per prep

  return (
    <section className="space-y-3 rounded-xl bg-secondary/60 p-4" aria-label="Hands-free prep" aria-live="polite">
      <div className="flex items-center gap-2 text-base font-bold">
        <span
          className={listening ? 'size-2.5 rounded-full bg-clear motion-safe:animate-pulse' : 'size-2.5 rounded-full bg-muted-foreground'}
          aria-hidden
        />
        {listening ? 'Listening · just talk' : 'Starting the microphone…'}
      </div>
      <p className="text-sm leading-snug text-muted-foreground">
        Say where it hurts and how it feels, like “My right shoulder aches, about a five.” Say what you want to do again,
        like “I want to be able to put plates on the top shelf.”
      </p>
      {listening && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background" aria-hidden>
          <div className="h-full rounded-full bg-clear transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      )}
      {heard && <p className="text-base font-bold leading-snug">Heard: {heard}</p>}
    </section>
  )
}
