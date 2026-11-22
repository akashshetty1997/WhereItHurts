// Speech, hands-free by default.
//   prep  (mode 'paint'): PrepListen, the patient talks to mark pain and set the goal
//   visit (mode 'visit'): LiveListen, both voices enrolled, then every sentence is labelled
// Testing mode, or hands-free failing (no mic, server off), falls back to holding a button:
// HoldToTalk during the visit, and the hold-to-speak buttons on the body parts during prep.
import { useState } from 'react'
import { useUser } from '@/auth/userContext'
import HoldToTalk from './HoldToTalk'
import LiveListen from './LiveListen'
import PrepListen from './PrepListen'

export default function LiveSpeech({ mode = 'visit' }) {
  const { testMode } = useUser()
  const [failure, setFailure] = useState(null)
  const prep = mode === 'paint'

  if (testMode || failure) {
    return (
      <div className="space-y-2">
        {failure && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive ring-1 ring-destructive/50">
            {failure} {prep ? 'Use hold to speak on each body part instead.' : 'Using hold-to-talk instead.'}
          </p>
        )}
        {!prep && <HoldToTalk />}
      </div>
    )
  }
  return prep ? <PrepListen key="prep" onFail={setFailure} /> : <LiveListen key="visit" onFail={setFailure} />
}
