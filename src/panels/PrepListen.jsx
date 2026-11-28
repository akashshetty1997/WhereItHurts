// Hands-free prep ("Before Your Visit"). The patient clicks Record Your Prep once (no holding),
// then just talks until they click Stop:
//   "My right shoulder aches, about a five."            -> marks the shoulder: aching, 5/10, their words
//   "I want to be able to put plates on the top shelf." -> sets the goal
// The mic is only on while recording, and the browser asks for it when Record is first clicked.
// Tapping a body part first makes a sentence that names no part describe that one.
// Prep sentences are not visit conversation, so they never count as "talked about".
import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { onRegionClick } from '@/scene/bodyApi'
import { startLive } from './liveVoice'
import { applyPrep, askClaude, unplaced } from './prepLine'

const FAILURES = {
  transcription_off: 'Hands-free listening is off on the server.',
  closed: 'Can’t reach the WhereItHurts server. Live listening runs on the demo laptop (see README).',
  mic: 'The microphone is blocked or missing. Allow it in the address bar.',
}

export default function PrepListen({ onFail }) {
  const [phase, setPhase] = useState('idle') // idle | starting | recording | stopping
  const [heard, setHeard] = useState(null) // last thing understood, shown to the patient
  const [level, setLevel] = useState(0)
  const live = useRef(null)
  const session = useRef(0) // ignores events from a recording that was already stopped

  function handle(event) {
    if (event.type === 'ready') setPhase('recording')
    else if (event.type === 'error') onFail(FAILURES[event.code] ?? `Listening error: ${event.code}`)
    else if (event.type === 'segment') {
      const { text, regions } = event.segment
      const understood = applyPrep(event.extraction ?? {}, regions, text)
      if (understood) return setHeard(understood)
      // Keywords couldn't place it (free phrasing, a misheard word): Claude reads it (~3 s).
      setHeard(`“${text}” Checking…`)
      askClaude(text)
        .then((found) => setHeard(applyPrep(found, found.regions ?? [], text) || unplaced(text)))
        .catch(() => setHeard(unplaced(text)))
    }
  }

  async function start() {
    const id = ++session.current
    setPhase('starting')
    try {
      const controller = await startLive({
        mode: 'prep',
        onLevel: (value) => id === session.current && setLevel(value),
        onEvent: (event) => id === session.current && handle(event),
        onClose: () => {
          if (id !== session.current || !live.current) return // stopped on purpose
          setPhase('idle')
          onFail(FAILURES.closed)
        },
      })
      if (id === session.current) live.current = controller
      else controller.stop() // Stop was clicked while the mic was opening
    } catch {
      if (id === session.current) {
        setPhase('idle')
        onFail(FAILURES.mic)
      }
    }
  }

  // Stop waits for the sentence still being spoken: the server only finishes it on "flush",
  // so its result arrives after the click and must still be handled.
  async function stop() {
    const controller = live.current
    live.current = null
    setPhase('stopping')
    setLevel(0)
    await controller?.stop()
    session.current++ // only now ignore anything else from this recording
    setPhase('idle')
  }

  // A tapped body part is the one a sentence describes when it names none.
  useEffect(() => onRegionClick((region) => live.current?.setRegion(region)), [])
  // Leaving prep (Start Visit) turns the mic off.
  useEffect(() => () => {
    session.current++
    live.current?.stop()
  }, [])

  const recording = phase === 'recording'

  return (
    <section className="space-y-3 rounded-xl bg-secondary/60 p-4" aria-label="Record your prep" aria-live="polite">
      {phase === 'idle' ? (
        <>
          <p className="text-base font-bold">Tell us where it hurts</p>
          <p className="text-sm leading-snug text-muted-foreground">
            Click Record, then just talk: “My right shoulder aches, about a five.” Say what you want to do again: “I want
            to be able to put plates on the top shelf.”
          </p>
          <Button className="h-11 w-full gap-2 text-base font-bold" onClick={start}>
            <Mic className="size-4" aria-hidden />
            Record Your Prep
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-base font-bold">
            <span
              className={
                recording
                  ? 'size-2.5 rounded-full bg-destructive motion-safe:animate-pulse'
                  : 'size-2.5 rounded-full bg-muted-foreground'
              }
              aria-hidden
            />
            {recording ? 'Recording · just talk' : phase === 'stopping' ? 'Finishing…' : 'Starting the microphone…'}
          </div>
          {recording && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-background" aria-hidden>
              <div
                className="h-full rounded-full bg-clear transition-[width] duration-100"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          )}
          <Button
            variant="outline"
            className="h-11 w-full gap-2 text-base font-bold"
            onClick={stop}
            disabled={phase === 'stopping'}
          >
            <Square className="size-4" aria-hidden />
            Stop Recording
          </Button>
        </>
      )}
      {heard && <p className="text-base font-bold leading-snug">Heard: {heard}</p>}
    </section>
  )
}
