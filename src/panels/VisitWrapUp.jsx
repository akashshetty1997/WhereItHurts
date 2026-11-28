// Summary: the patient confirms each movement check, then the one-screen PT summary.
import { Check, CircleAlert, CircleCheck, MessageCircle, MessageCircleQuestion, Target, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { REGIONS, regionLabel } from '@/regions'
import { toTen } from '@/scene/intensity'
import { visitStore, goalDiscussed } from '@/visitStore'
import { describePainArc } from '@/scene/movements'
import { PAIN_STYLES, ANATOMY_PURPOSE, SPEAKER_NAMES, SPEAKER_TEXT, groupAnatomyNotes } from '@/lib/visitDisplay'
import { COVERAGE_LABELS, FLAGGED, coverage, evidenceLines, goalCoverage } from '@/lib/coverage'
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
          {o.confirmed == null && visitStore.isViewingPast() ? (
            <p className="text-sm font-bold text-muted-foreground">Not confirmed.</p>
          ) : o.confirmed == null ? (
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
  const reviewed = Object.entries(coverage(visit))
    .filter(([, c]) => c.status === 'reviewed')
    .map(([region]) => REGIONS[region])
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
        {Object.entries(visit.painArcs ?? {}).map(([region, arc]) => (
          <p key={region} className="mt-1">
            {describePainArc(region, arc)}
          </p>
        ))}
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
          <ul className="space-y-0.5 text-flag">
            {missed.map((p) => (
              <li key={p.region} className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {REGIONS[p.region]}: {COVERAGE_LABELS[p.coverage] ?? COVERAGE_LABELS.not_discussed}
              </li>
            ))}
          </ul>
        ) : (
          'Everything marked came up'
        )}
        {reviewed.length > 0 && <p className="mt-1">Reviewed by PT: {reviewed.join(', ')}</p>}
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

// Summary step, PT side: did each marked pain and the goal really come up? One row each, with the
// suggested status, the sentences behind it, and the PT's call (src/lib/coverage.js).
const STATUS_STYLE = {
  not_discussed: { Icon: CircleAlert, text: 'text-flag' },
  pt_asked: { Icon: MessageCircleQuestion, text: 'text-flag' },
  patient_responded: { Icon: MessageCircle, text: 'text-clear' },
  reviewed: { Icon: CircleCheck, text: 'text-clear' },
  discussed: { Icon: CircleCheck, text: 'text-clear' },
}
const GOAL_LABELS = { discussed: 'Came up in the visit', not_discussed: 'Didn’t come up' }

export function CoverageReview({ visit }) {
  const all = coverage(visit)
  const goal = goalCoverage(visit)
  if (!visit.painted.length && !goal) return null
  return (
    <section className="space-y-2" aria-label="Review what came up">
      <h2 className="text-xl font-bold">Review What Came Up</h2>
      <p className="text-sm text-muted-foreground">Suggested from the conversation. Your call is what goes in the reports.</p>
      {goal && (
        <ReviewRow
          title="Goal"
          status={goal.status}
          label={GOAL_LABELS[goal.status]}
          suggested={goal.review ? GOAL_LABELS[goal.suggested] : null}
          quotes={evidenceLines(visit, goal.evidence)}
          actions={
            goal.review ? (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => visitStore.setGoalReview(null)}>
                <Undo2 className="size-4" aria-hidden /> Use Suggestion
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 font-bold"
                onClick={() => visitStore.setGoalReview({ status: goal.status === 'discussed' ? 'not_discussed' : 'discussed' })}
              >
                {goal.status === 'discussed' ? 'Mark Not Discussed' : 'Mark Discussed'}
              </Button>
            )
          }
        />
      )}
      {visit.painted.map((p) => {
        const c = all[p.region]
        return (
          <ReviewRow
            key={p.region}
            title={regionLabel(p.region)}
            detail={`${p.type}, ${toTen(p.intensity)}/10`}
            status={c.status}
            label={COVERAGE_LABELS[c.status]}
            suggested={c.review ? COVERAGE_LABELS[c.suggested] : null}
            quotes={evidenceLines(visit, c.evidence)}
            actions={
              <>
                {c.status !== 'reviewed' && (
                  <Button size="sm" className="gap-1.5 font-bold" onClick={() => visitStore.setCoverageReview(p.region, { status: 'reviewed' })}>
                    <Check className="size-4" aria-hidden /> Mark Reviewed
                  </Button>
                )}
                {c.status === 'patient_responded' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="font-bold"
                    onClick={() => visitStore.setCoverageReview(p.region, { status: 'not_discussed' })}
                  >
                    Mark Not Discussed
                  </Button>
                )}
                {c.review && (
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => visitStore.setCoverageReview(p.region, null)}>
                    <Undo2 className="size-4" aria-hidden /> Use Suggestion
                  </Button>
                )}
              </>
            }
          />
        )
      })}
    </section>
  )
}

function ReviewRow({ title, detail, status, label, suggested, quotes, actions }) {
  const { Icon, text } = STATUS_STYLE[status] ?? STATUS_STYLE.not_discussed
  return (
    <div className={cn('space-y-2 rounded-xl p-4 ring-1', FLAGGED.has(status) ? 'bg-flag/10 ring-flag/60' : 'bg-secondary/60 ring-transparent')}>
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 size-5 shrink-0', text)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">
            {title}
            {detail && <span className="font-normal text-muted-foreground"> · {detail}</span>}
          </p>
          <p className={cn('text-sm font-bold', text)}>{label}</p>
          {suggested && <p className="text-xs text-muted-foreground">Suggested: {suggested}</p>}
        </div>
      </div>
      {quotes.length > 0 && (
        <ul className="space-y-1 border-l-2 border-border pl-3">
          {quotes.slice(0, 3).map((s) => (
            <li key={s.id} className="text-sm leading-snug">
              <span className={cn('font-bold', SPEAKER_TEXT[s.speaker])}>{SPEAKER_NAMES[s.speaker] ?? s.speaker}: </span>“
              {s.correctedText ?? s.text}”
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">{actions}</div>
    </div>
  )
}
