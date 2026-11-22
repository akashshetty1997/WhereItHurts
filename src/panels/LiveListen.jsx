// Hands-free listening for the visit. Starts with the visit: the PT and the patient each say
// one sentence so the app learns their voices, then every sentence is labelled and lights the
// body on its own. Calls onFail(reason) if the mic or the backend isn't available, so the
// panel can fall back to hold-to-talk.
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useUser } from '@/auth/userContext'
import { cn } from '@/lib/utils'
import { visitStore } from '../visitStore'
import { startLive } from './liveVoice'

const STEPS = {
  pt: {
    step: 'Step 1 of 2',
    who: 'PT',
    say: '“Hi, I’m your physical therapist today.”',
    color: 'text-pt',
  },
  patient: {
    step: 'Step 2 of 2',
    who: 'Patient',
    say: '“Hi, I’m here about my shoulder.”',
    color: 'text-patient',
  },
}

const FAILURES = {
  transcription_off: 'Live listening is off on the server (speech models not loaded).',
  closed: 'Lost the connection to the server.',
  mic: 'The microphone is blocked or missing. Allow it in the address bar.',
}

export default function LiveListen({ onFail }) {
  const { setTestMode } = useUser()
  const [phase, setPhase] = useState('starting') // starting | pt | patient | listening
  const [retry, setRetry] = useState(false)
  const [level, setLevel] = useState(0)
  const [unsure, setUnsure] = useState(false)
  const live = useRef(null)

  useEffect(() => {
    let cancelled = false
    let ending = false
    const enroll = (speaker) => {
      setPhase(speaker)
      setRetry(false)
      live.current?.enroll(speaker)
    }
    startLive({
      onLevel: setLevel,
      onEvent: (event) => {
        if (event.type === 'ready') enroll('pt')
        else if (event.type === 'enroll_retry') setRetry(true)
        else if (event.type === 'enrolled') {
          if (event.ready) setPhase('listening')
          else enroll('patient')
        } else if (event.type === 'segment') {
          // rating / movement feed the movement check (src/panels/movementLog.js).
          const { rating = null, movement = null } = event.extraction ?? {}
          visitStore.addSegment({ ...event.segment, rating, movement })
          setUnsure(!event.sure)
        } else if (event.type === 'error') onFail(FAILURES[event.code] ?? `Live listening error: ${event.code}`)
      },
      onClose: () => {
        if (!ending && !cancelled) onFail(FAILURES.closed)
      },
    })
      .then((controller) => {
        if (cancelled) controller.stop()
        else live.current = controller
      })
      .catch(() => !cancelled && onFail(FAILURES.mic))
    return () => {
      cancelled = true
      ending = true
      live.current?.stop()
      live.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one live session per visit

  const step = STEPS[phase]

  return (
    <section className="space-y-3" aria-label="Live listening" aria-live="polite">
      {phase === 'starting' && <p className="text-base text-muted-foreground">Starting the microphone…</p>}

      {step && (
        <div className="space-y-2 rounded-xl bg-secondary/60 p-4">
          <p className="text-sm font-bold text-muted-foreground">{step.step} · Learning your voices</p>
          <p className="text-base leading-snug">
            <b className={step.color}>{step.who}</b>, say one sentence, like {step.say}
          </p>
          {retry && <p className="text-sm text-flag">A little longer, please: say a full sentence.</p>}
        </div>
      )}

      {phase === 'listening' && (
        <div className="flex items-center gap-2 text-base font-bold">
          <span className="size-2.5 rounded-full bg-clear motion-safe:animate-pulse" aria-hidden />
          Listening · speakers recognized automatically
        </div>
      )}

      {phase !== 'starting' && <LevelMeter level={level} />}

      {unsure && phase === 'listening' && (
        <p className="text-sm text-muted-foreground">Not sure who said the last line. Redo voices if it’s wrong.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {phase === 'listening' && (
          <Button variant="ghost" size="sm" onClick={() => { setPhase('pt'); live.current?.enroll('pt') }}>
            Redo voices
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setTestMode(true)}>
          Use hold-to-talk instead
        </Button>
      </div>
    </section>
  )
}

function LevelMeter({ level }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
      <div className={cn('h-full rounded-full bg-clear transition-[width] duration-100')} style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  )
}
