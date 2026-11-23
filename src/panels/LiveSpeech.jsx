// Speech, recorded with one click (no holding):
//   prep  (mode 'paint'): PrepListen, Record Your Prep: the patient talks to mark pain and set the goal
//   visit (mode 'visit'): LiveListen, Record the Visit: both voices learned, then every line labelled
// If the mic or the server isn't available, it says so, offers to try again, and offers the sample
// prep / visit instead (src/panels/sampleVisit.js). On the public link ("Try the Demo", no server)
// the sample is offered straight away.
import { useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUser } from '@/auth/userContext'
import LiveListen from './LiveListen'
import PrepListen from './PrepListen'
import { SAMPLE_PREP, SAMPLE_VISIT, describePrepLine, playSamplePrep, playSampleVisit } from './sampleVisit'

export default function LiveSpeech({ mode = 'visit' }) {
  const { user } = useUser()
  const [failure, setFailure] = useState(null)
  const [attempt, setAttempt] = useState(0) // remounts the recorder on "Try Again"
  const prep = mode === 'paint'

  if (user?.guest || failure) {
    return (
      <div className="space-y-3">
        {failure && !user?.guest && (
          <div className="space-y-2 rounded-xl bg-destructive/10 p-3 ring-1 ring-destructive/50">
            <p className="text-sm text-destructive">{failure}</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setFailure(null)
                setAttempt((n) => n + 1)
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              Try Again
            </Button>
          </div>
        )}
        <SamplePlayer key={mode} prep={prep} />
      </div>
    )
  }
  return prep ? (
    <PrepListen key={`prep-${attempt}`} onFail={setFailure} />
  ) : (
    <LiveListen key={`visit-${attempt}`} onFail={setFailure} />
  )
}

// Plays the sample prep or visit, line by line, as if it were being said.
function SamplePlayer({ prep }) {
  const [state, setState] = useState('idle') // idle | playing | done
  const [line, setLine] = useState(null)
  const stop = useRef(null)
  useEffect(() => () => stop.current?.(), [])

  const lines = prep ? SAMPLE_PREP : SAMPLE_VISIT
  function start() {
    setState('playing')
    setLine(null)
    const options = { onLine: setLine, onDone: () => setState('done') }
    stop.current = prep ? playSamplePrep(options) : playSampleVisit(options)
  }
  function halt() {
    stop.current?.()
    setState('done')
  }
  const current = line != null ? lines[line] : null

  return (
    <section className="space-y-3 rounded-xl bg-secondary/60 p-4" aria-label={prep ? 'Sample prep' : 'Sample visit'} aria-live="polite">
      <p className="text-base font-bold">{prep ? 'Tell us where it hurts' : 'Record the visit'}</p>
      {state === 'idle' && (
        <>
          <p className="text-sm leading-snug text-muted-foreground">
            Live listening runs on the demo laptop. Here, play a sample instead: Alex {prep ? 'describes the pain and a goal' : 'and the PT talk through the visit'}, and everything happens as if it were spoken.
          </p>
          <Button className="h-11 w-full gap-2 text-base font-bold" onClick={start}>
            <Play className="size-4" aria-hidden />
            {prep ? 'Play Sample Prep' : 'Play Sample Visit'}
          </Button>
        </>
      )}
      {state === 'playing' && (
        <>
          <div className="flex items-center gap-2 text-base font-bold">
            <span className="size-2.5 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden />
            Playing the sample {prep ? 'prep' : 'visit'}
          </div>
          <Button variant="outline" className="h-11 w-full gap-2 text-base font-bold" onClick={halt}>
            <Square className="size-4" aria-hidden />
            Stop
          </Button>
        </>
      )}
      {state === 'done' && (
        <p className="text-sm leading-snug text-muted-foreground">
          {prep ? 'Sample prep done. Click Start Visit to go on.' : 'Sample visit done. Click End Visit to see what was missed.'}
        </p>
      )}
      {prep && current && (
        <p className="text-base font-bold leading-snug">
          “{current.text}”<span className="block text-sm font-normal text-muted-foreground">Heard: {describePrepLine(current)}</span>
        </p>
      )}
    </section>
  )
}
