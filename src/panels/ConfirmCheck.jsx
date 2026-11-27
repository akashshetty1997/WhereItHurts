// One movement check on the Summary step (Does This Match?), with patient corrections
// (src/lib/corrections.js):
//   patient  That's Right, or Not Quite → say what's wrong (numbers, body part, words)
//   PT       sees both versions side by side → Accept Patient's Version, or Keep Original + a note
import { useState } from 'react'
import { Check, CircleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { REGIONS } from '@/regions'
import { visitStore } from '@/visitStore'
import {
  CORRECTION_BADGE,
  acceptCorrection,
  correctionState,
  describeVersion,
  keepOriginal,
  recordedVersion,
  requestCorrection,
} from '@/lib/corrections'
import { cn } from '@/lib/utils'

const lower = (region) => (region ? REGIONS[region].toLowerCase() : 'symptom')
const RATINGS = Array.from({ length: 11 }, (_, i) => i)
const OTHER = '__other__'
const selectClass = 'h-10 w-full rounded-lg bg-background px-2 text-base ring-1 ring-border'

export default function ConfirmCheck({ o, canResolve }) {
  const state = correctionState(o)
  const readOnly = visitStore.isViewingPast()
  const [correcting, setCorrecting] = useState(false)

  return (
    <div className={cn('space-y-3 rounded-xl p-4', state === 'requested' ? 'bg-flag/10 ring-1 ring-flag/60' : 'bg-secondary/60')}>
      <p className="text-base leading-snug">
        During <b>{o.movement ? `“${o.movement}”` : 'the movement'}</b>, you said your {lower(o.symptomRegion)} went from{' '}
        <b>{o.before}/10</b> to <b>{o.after}/10</b>. Does that match what you felt?
      </p>

      {state === 'requested' && <Requested o={o} canResolve={canResolve && !readOnly} />}
      {state === 'accepted' && (
        <p className="text-sm font-bold text-clear">
          Corrected by the patient, accepted by the PT. Recorded before: {describeVersion({
            region: o.correction.original.symptomRegion,
            before: o.correction.original.before,
            after: o.correction.original.after,
          })}
          .
        </p>
      )}
      {state === 'kept_original' && (
        <p className="text-sm leading-snug">
          <b>The PT kept the original.</b> The patient remembered {describeVersion(o.correction.patientVersion, o)}. PT note: “
          {o.correction.ptNote}”
        </p>
      )}

      {state === 'none' &&
        (correcting ? (
          <CorrectionForm o={o} onDone={() => setCorrecting(false)} />
        ) : o.confirmed == null && readOnly ? (
          <p className="text-sm font-bold text-muted-foreground">Not confirmed.</p>
        ) : o.confirmed == null ? (
          <div className="grid grid-cols-2 gap-2">
            <Button className="gap-2 font-bold" onClick={() => visitStore.updateObservation(o.id, { confirmed: true })}>
              <Check className="size-4" aria-hidden /> That’s Right
            </Button>
            <Button variant="secondary" className="gap-2 font-bold" onClick={() => setCorrecting(true)}>
              <X className="size-4" aria-hidden /> Not Quite
            </Button>
          </div>
        ) : (
          <p className={cn('text-sm font-bold', o.confirmed ? 'text-clear' : 'text-flag')}>
            {o.confirmed ? 'Confirmed by the patient.' : 'The patient says it doesn’t match. Talk it through with the PT.'}
          </p>
        ))}
    </div>
  )
}

// Not Quite: what's wrong? Any of the three; at least one.
function CorrectionForm({ o, onDone }) {
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [region, setRegion] = useState('')
  const [regionText, setRegionText] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState(null)

  function send(e) {
    e.preventDefault()
    try {
      const version = { before, after, text, ...(region === OTHER ? { regionText } : { region }) }
      visitStore.updateObservation(o.id, requestCorrection(o, version))
      onDone()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={send} className="space-y-3" aria-label="What doesn’t match">
      <p className="text-sm font-bold">What doesn’t match? Fill in what you remember.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm text-muted-foreground">
          Before (0–10)
          <select value={before} onChange={(e) => setBefore(e.target.value)} className={selectClass}>
            <option value="">Same as recorded</option>
            {RATINGS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          After (0–10)
          <select value={after} onChange={(e) => setAfter(e.target.value)} className={selectClass}>
            <option value="">Same as recorded</option>
            {RATINGS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm text-muted-foreground">
        Where it was
        <select value={region} onChange={(e) => setRegion(e.target.value)} className={selectClass}>
          <option value="">Same as recorded</option>
          {Object.entries(REGIONS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
          <option value={OTHER}>Not on the list</option>
        </select>
      </label>
      {region === OTHER && (
        <Input value={regionText} onChange={(e) => setRegionText(e.target.value)} placeholder="Where, in your words" aria-label="Where, in your words" />
      )}
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything else, in your words" aria-label="Anything else, in your words" />
      {error && (
        <p className="text-sm font-bold text-flag" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" className="font-bold">
          Send to PT
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Waiting for the PT: both versions side by side.
function Requested({ o, canResolve }) {
  const [keeping, setKeeping] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const c = o.correction
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-bold text-flag">
        <CircleAlert className="size-4" aria-hidden /> {CORRECTION_BADGE}
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-background p-2 ring-1 ring-border">
          <p className="font-bold text-muted-foreground">Recorded</p>
          <p className="text-base">{describeVersion(recordedVersion(o))}</p>
        </div>
        <div className="rounded-lg bg-background p-2 ring-1 ring-flag/60">
          <p className="font-bold text-patient">Patient remembers</p>
          <p className="text-base">{describeVersion(c.patientVersion, o)}</p>
        </div>
      </div>
      {canResolve &&
        (keeping ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              try {
                visitStore.updateObservation(o.id, keepOriginal(o, note))
              } catch (err) {
                setError(err.message)
              }
            }}
          >
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the original stays (required)" aria-label="Why the original stays" />
            {error && (
              <p className="text-sm font-bold text-flag" role="alert">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button type="submit" className="font-bold">
                Save Note
              </Button>
              <Button type="button" variant="ghost" onClick={() => setKeeping(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-2">
            <Button className="font-bold" onClick={() => visitStore.updateObservation(o.id, acceptCorrection(o))}>
              Accept Patient’s Version
            </Button>
            <Button variant="secondary" className="font-bold" onClick={() => setKeeping(true)}>
              Keep Original
            </Button>
          </div>
        ))}
    </div>
  )
}
