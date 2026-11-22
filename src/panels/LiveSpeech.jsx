// Speech, recorded with one click (no holding):
//   prep  (mode 'paint'): PrepListen, Record Your Prep: the patient talks to mark pain and set the goal
//   visit (mode 'visit'): LiveListen, Record the Visit: both voices learned, then every line labelled
// If the mic or the server isn't available, it says so and offers to try again.
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import LiveListen from './LiveListen'
import PrepListen from './PrepListen'

export default function LiveSpeech({ mode = 'visit' }) {
  const [failure, setFailure] = useState(null)
  const [attempt, setAttempt] = useState(0) // remounts the recorder on "Try Again"
  const prep = mode === 'paint'

  if (failure) {
    return (
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
    )
  }
  return prep ? (
    <PrepListen key={`prep-${attempt}`} onFail={setFailure} />
  ) : (
    <LiveListen key={`visit-${attempt}`} onFail={setFailure} />
  )
}
