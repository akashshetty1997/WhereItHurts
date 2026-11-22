// Hold-to-talk panel for the visit: hold PT or Patient (or the T / P key) while speaking.
// Each sentence -> /api/extract -> visitStore.addSegment, which lights the body.
// Only the logged-in user's role gets a button; "Test mode" shows both, for testing alone.
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useUser } from '@/auth/userContext'
import { cn } from '@/lib/utils'
import { visitStore } from '../visitStore'
import { SPEECH_SUPPORTED, extract, listen } from './speech'

const SPEAKERS = [
  { id: 'pt', label: 'PT', key: 't' },
  { id: 'patient', label: 'Patient', key: 'p' },
]

const ERRORS = {
  'not-allowed': 'Microphone is blocked. Allow it in the address bar, then try again.',
  'audio-capture': 'No microphone found.',
  network: 'Speech recognition needs an internet connection (Chrome sends audio to Google).',
}

export default function LiveSpeech() {
  const { user, testMode, setTestMode } = useUser()
  // Logged-in role only, unless test mode is on (or nobody is logged in).
  const speakers = testMode || !user ? SPEAKERS : SPEAKERS.filter((sp) => sp.id === user.role)
  const allowed = useRef(speakers)
  allowed.current = speakers
  const [talking, setTalking] = useState(null) // speaker id while a button is held
  const [interim, setInterim] = useState('')
  const [pending, setPending] = useState([]) // sentences waiting for /api/extract
  const [error, setError] = useState(null)
  const startedAt = useRef(Date.now()) // segment times are seconds since the visit started
  const stopRef = useRef(null)
  const count = useRef(0)

  const seconds = () => (Date.now() - startedAt.current) / 1000

  async function addSentence(text, speaker, start) {
    const id = `live-${++count.current}`
    const end = seconds()
    setPending((p) => [...p, { id, speaker, text }])
    let found = { regions: [], path: [] }
    try {
      found = await extract(text, speaker)
    } catch {
      setError('Backend not reachable: the line is saved but the body can’t light up. Is it running on :8000?')
    }
    setPending((p) => p.filter((line) => line.id !== id))
    visitStore.addSegment({
      id,
      speaker,
      start,
      end,
      text,
      regions: found.regions ?? [],
      path: found.path ?? [],
    })
  }

  function press(speaker) {
    if (stopRef.current || !SPEECH_SUPPORTED) return
    setError(null)
    setTalking(speaker)
    // One hold = one line. Chrome splits speech at pauses ("my right" / "shoulder hurts"),
    // so the pieces are collected and sent together once the button is released.
    const start = seconds()
    const parts = []
    const stop = listen({
      onInterim: (words) => setInterim([...parts, words].join(' ').trim()),
      onSentence: (text) => {
        parts.push(text)
        setInterim(parts.join(' '))
      },
      onEnd: () => {
        setInterim('')
        if (parts.length) addSentence(parts.join(' '), speaker, start)
        // Chrome can stop on its own (long silence) while the button is still held.
        if (stopRef.current === stop) {
          stopRef.current = null
          setTalking(null)
        }
      },
      onError: (code) => setError(ERRORS[code] ?? `Speech error: ${code}`),
    })
    stopRef.current = stop
  }

  function release() {
    stopRef.current?.()
    stopRef.current = null
    setTalking(null)
  }

  // Keys T (PT) and P (patient): hold to talk. Ignored while typing in a field.
  useEffect(() => {
    const typing = (e) => e.target.closest?.('input, textarea, [contenteditable="true"]')
    const down = (e) => {
      const s = allowed.current.find((sp) => sp.key === e.key.toLowerCase())
      if (s && !e.repeat && !typing(e)) press(s.id)
    }
    const up = (e) => {
      if (SPEAKERS.some((sp) => sp.key === e.key.toLowerCase())) release()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      release()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- press/release only read refs

  if (!SPEECH_SUPPORTED) {
    return <Warning>Live speech needs Chrome (Web Speech API).</Warning>
  }

  return (
    <section className="space-y-2" aria-label="Hold to talk">
      <div className={cn('grid gap-2', speakers.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {speakers.map((s) => {
          const on = talking === s.id
          return (
            <Button
              key={s.id}
              variant="outline"
              className={cn(
                'h-11 touch-none justify-between select-none',
                STYLES[s.id],
                on && 'animate-pulse text-background',
              )}
              onPointerDown={() => press(s.id)}
              onPointerUp={release}
              onPointerLeave={() => on && release()}
              aria-pressed={on}
            >
              {on ? 'Listening…' : `Hold: ${s.label}`}
              <kbd className="rounded border border-current px-1 text-xs opacity-70">
                {s.key.toUpperCase()}
              </kbd>
            </Button>
          )
        })}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={testMode}
          onChange={(e) => setTestMode(e.target.checked)}
          className="accent-current"
        />
        Test mode: show both speakers
      </label>
      {interim && <Line speaker={talking}>{interim}</Line>}
      {pending.map((line) => (
        <Line key={line.id} speaker={line.speaker}>
          {line.text} <span className="animate-pulse">…</span>
        </Line>
      ))}
      {error && <Warning>{error}</Warning>}
    </section>
  )
}

// Speaker colors from the theme (src/index.css --pt / --patient).
const STYLES = {
  pt: 'text-pt border-pt/50 aria-pressed:bg-pt',
  patient: 'text-patient border-patient/50 aria-pressed:bg-patient',
}
const LINE_BORDER = { pt: 'border-pt', patient: 'border-patient' }

function Line({ speaker, children }) {
  return (
    <p className={cn('border-l-2 pl-2 text-sm italic text-muted-foreground', LINE_BORDER[speaker])}>
      {children}
    </p>
  )
}

function Warning({ children }) {
  return <p className="rounded-xl bg-flag/10 p-3 text-sm text-flag ring-1 ring-flag/60">{children}</p>
}
