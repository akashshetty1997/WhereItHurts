// The visit, recorded hands-free. Click Record the Visit once (no holding): the PT and the patient
// each say one sentence so the app learns their voices, then every sentence is labelled and lights
// the body on its own. Stop pauses (the voices are kept); Resume carries on; End Visit closes it.
// Calls onFail(reason) if the mic or the server isn't available.
import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { visitStore } from '../visitStore'
import { startLive } from './liveVoice'
import { addFollowUpFrom, refineLine } from './smartPass'

const STEPS = {
  pt: { step: 'Step 1 of 2', who: 'PT', say: '“Hi, I’m your physical therapist today.”', color: 'text-pt' },
  patient: { step: 'Step 2 of 2', who: 'Patient', say: '“Hi, I’m here about my shoulder.”', color: 'text-patient' },
}

const FAILURES = {
  transcription_off: 'Recording is off on the server (speech models not loaded).',
  closed: 'Can’t reach the WhereItHurts server. Live listening runs on the demo laptop (see README).',
  mic: 'The microphone is blocked or missing. Allow it in the address bar.',
}

export default function LiveListen({ onFail }) {
  // idle → starting → pt → patient → listening ⇄ paused (stopping in between)
  const [phase, setPhase] = useState('idle')
  const [retry, setRetry] = useState(false)
  const [level, setLevel] = useState(0)
  const [unsure, setUnsure] = useState(false)
  const live = useRef(null)
  const closing = useRef(false) // End Visit: the connection closing is expected
  const session = useRef(Date.now().toString(36)) // prefix for this recording's line ids

  function enroll(speaker) {
    setPhase(speaker)
    setRetry(false)
    live.current?.enroll(speaker)
  }

  function handle(event) {
    if (event.type === 'ready') enroll('pt')
    else if (event.type === 'enroll_retry') setRetry(true)
    else if (event.type === 'enrolled') {
      if (event.ready) setPhase('listening')
      else enroll('patient')
    } else if (event.type === 'segment') {
      // rating / movement feed the movement check (src/panels/movementLog.js).
      const { rating = null, movement = null, follow_up: followUp = null } = event.extraction ?? {}
      const previous = visitStore.get().segments.at(-1)?.text
      // Ids from the server restart with each connection; the session stamp keeps them unique
      // across Resume, Redo voices and a page refresh.
      const segment = { ...event.segment, id: `${session.current}-${event.segment.id}`, rating, movement }
      visitStore.addSegment(segment)
      addFollowUpFrom(segment, followUp)
      refineLine(segment, previous) // Claude improves the line in the background
      setUnsure(!event.sure)
    } else if (event.type === 'error') onFail(FAILURES[event.code] ?? `Recording error: ${event.code}`)
  }

  async function start() {
    setPhase('starting')
    try {
      live.current = await startLive({
        onLevel: setLevel,
        onEvent: handle,
        onClose: () => !closing.current && onFail(FAILURES.closed),
      })
    } catch {
      setPhase('idle')
      onFail(FAILURES.mic)
    }
  }

  async function pause() {
    setPhase('stopping')
    await live.current?.pause() // the sentence being spoken still comes through
    setPhase('paused')
  }

  function resume() {
    live.current?.resume()
    setPhase('listening')
  }

  // End Visit (this panel goes away): finish the last sentence, then close.
  useEffect(
    () => () => {
      closing.current = true
      live.current?.stop()
    },
    [],
  )

  const step = STEPS[phase]

  return (
    <section className="space-y-3 rounded-xl bg-secondary/60 p-4" aria-label="Record the visit" aria-live="polite">
      {phase === 'idle' && (
        <>
          <p className="text-base font-bold">Record the visit</p>
          <p className="text-sm leading-snug text-muted-foreground">
            Click Record, then the PT and the patient each say one sentence so the app learns their voices. After that,
            just talk: every line is labelled and lights up the body.
          </p>
          <Button className="h-11 w-full gap-2 text-base font-bold" onClick={start}>
            <Mic className="size-4" aria-hidden />
            Record the Visit
          </Button>
        </>
      )}

      {phase === 'starting' && <p className="text-base text-muted-foreground">Starting the microphone…</p>}

      {step && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-muted-foreground">{step.step} · Learning your voices</p>
          <p className="text-base leading-snug">
            <b className={step.color}>{step.who}</b>, say one sentence, like {step.say}
          </p>
          {retry && <p className="text-sm text-flag">A little longer, please: say a full sentence.</p>}
        </div>
      )}

      {(phase === 'listening' || phase === 'stopping') && (
        <div className="flex items-center gap-2 text-base font-bold">
          <span className="size-2.5 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden />
          {phase === 'stopping' ? 'Finishing…' : 'Recording · speakers recognized automatically'}
        </div>
      )}

      {phase === 'paused' && (
        <div className="flex items-center gap-2 text-base font-bold text-muted-foreground">
          <span className="size-2.5 rounded-full bg-muted-foreground" aria-hidden />
          Paused · voices kept
        </div>
      )}

      {(step || phase === 'listening') && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background" aria-hidden>
          <div
            className="h-full rounded-full bg-clear transition-[width] duration-100"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      )}

      {unsure && phase === 'listening' && (
        <p className="text-sm text-muted-foreground">Not sure who said the last line. Redo voices if it’s wrong.</p>
      )}

      {(phase === 'listening' || phase === 'stopping') && (
        <Button
          variant="outline"
          className="h-11 w-full gap-2 text-base font-bold"
          onClick={pause}
          disabled={phase === 'stopping'}
        >
          <Pause className="size-4" aria-hidden />
          Stop Recording
        </Button>
      )}

      {phase === 'paused' && (
        <div className="grid gap-2">
          <Button className="h-11 w-full gap-2 text-base font-bold" onClick={resume}>
            <Mic className="size-4" aria-hidden />
            Resume Recording
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => {
              live.current?.resume()
              enroll('pt')
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            Redo voices
          </Button>
        </div>
      )}
    </section>
  )
}
