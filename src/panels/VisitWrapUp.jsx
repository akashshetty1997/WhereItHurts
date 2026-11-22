// Summary: the patient confirms each movement check, then the one-screen PT summary.
import { Check, CircleAlert, Target, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { REGIONS, regionLabel } from '@/regions'
import { toTen } from '@/scene/intensity'
import { visitStore, goalDiscussed } from '@/visitStore'
import { PAIN_STYLES, ANATOMY_PURPOSE, groupAnatomyNotes } from '@/lib/visitDisplay'
import { cn } from '@/lib/utils'

const lower = (region) => (region ? REGIONS[region].toLowerCase() : 'symptom')

export function ConfirmChecks({ visit }) {
  const checks = (visit.observations ?? []).filter((o) => o.before != null && o.after != null)
  if (!checks.length) return null
  return (
    <section className="space-y-2" aria-label="Confirm what changed">
      <h2 className="text-xl font-bold">Does This Match?</h2>
      {checks.map((o) => (
        <div key={o.id} className="space-y-3 rounded-xl bg-secondary/60 p-4">
          <p className="text-base leading-snug">
            During <b>{o.movement ? `“${o.movement}”` : 'the movement'}</b>, you said your {lower(o.symptomRegion)} went from{' '}
            <b>{o.before}/10</b> to <b>{o.after}/10</b>. Does that match what you felt?
          </p>
          {o.confirmed == null ? (
            <div className="grid grid-cols-2 gap-2">
              <Button className="gap-2 font-bold" onClick={() => visitStore.updateObservation(o.id, { confirmed: true })}>
                <Check className="size-4" aria-hidden /> That’s Right
              </Button>
              <Button variant="secondary" className="gap-2 font-bold" onClick={() => visitStore.updateObservation(o.id, { confirmed: false })}>
                <X className="size-4" aria-hidden /> Not Quite
              </Button>
            </div>
          ) : (
            <p className={cn('text-sm font-bold', o.confirmed ? 'text-clear' : 'text-flag')}>
              {o.confirmed ? 'Confirmed by the patient.' : 'The patient says it doesn’t match. Talk it through with the PT.'}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}

export function PtSummary({ visit, missed }) {
  const checks = visit.observations ?? []
  return (
    <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10" aria-label="PT summary">
      <h2 className="text-xl font-bold">PT Summary</h2>
      <Row title="Goal">
        {visit.goal?.text ? (
          <span className="flex items-start gap-2">
            <Target className={cn('mt-0.5 size-4 shrink-0', goalDiscussed(visit) ? 'text-clear' : 'text-flag')} aria-hidden />
            “{visit.goal.text}” · {goalDiscussed(visit) ? 'discussed' : 'not discussed'}
          </span>
        ) : (
          'Not set'
        )}
      </Row>
      <Row title="Marked pain">
        {visit.painted.length ? (
          <ul className="space-y-0.5">
            {visit.painted.map((p) => (
              <li key={p.region}>
                {regionLabel(p.region)}: <span className={PAIN_STYLES[p.type]?.text}>{p.type}</span>, {toTen(p.intensity)}/10
              </li>
            ))}
          </ul>
        ) : (
          'Nothing marked'
        )}
      </Row>
      <Row title="Movement checks">
        {checks.length ? (
          <ul className="space-y-0.5">
            {checks.map((o) => (
              <li key={o.id}>
                {o.movement || 'Movement'} ({REGIONS[o.assessedRegion] ?? 'area not set'}): {lower(o.symptomRegion)}{' '}
                {o.before ?? '–'} → {o.after ?? '–'}
                {o.response && ` · ${o.response}`}
                {o.confirmed === true && ' · confirmed'}
                {o.confirmed === false && ' · patient disagrees'}
              </li>
            ))}
          </ul>
        ) : (
          'None'
        )}
      </Row>
      <Row title="Not discussed">
        {missed.length ? (
          <span className="flex items-start gap-2 text-flag">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {missed.map((p) => REGIONS[p.region]).join(', ')}
          </span>
        ) : (
          'Everything marked came up'
        )}
      </Row>
      <Row title="Follow-ups">
        {visit.followUps.length ? visit.followUps.map((f) => f.text).join('; ') : 'None'}
      </Row>
      <AnatomyNotesRow notes={visit.anatomyNotes ?? []} />
    </section>
  )
}

// Show Anatomy → Add to Report, grouped by the complaint they were shown for.
function AnatomyNotesRow({ notes }) {
  if (!notes.length) return null
  return (
    <Row title="Anatomy notes">
      <ul className="space-y-1">
        {groupAnatomyNotes(notes).map(([region, items]) => (
          <li key={region}>
            <span className="font-bold">For {REGIONS[region]?.toLowerCase() ?? region}:</span>{' '}
            {items
              .map((n) => `${n.structure.label} (${n.structure.anatomical}), ${ANATOMY_PURPOSE[n.purpose] ?? n.purpose}${n.note ? `: “${n.note}”` : ''}`)
              .join('; ')}
          </li>
        ))}
      </ul>
    </Row>
  )
}

function Row({ title, children }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 border-t border-border pt-2 text-sm leading-snug">
      <span className="font-bold text-muted-foreground">{title}</span>
      <div>{children}</div>
    </div>
  )
}
