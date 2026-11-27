import { useState } from 'react'
import { CircleAlert, CircleCheck, FileText, Printer, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { snapshot } from '@/scene/bodyApi'
import { useUser } from '@/auth/userContext'
import Report from './Report'
import { goalDiscussed } from '@/visitStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { regionLabel, REGIONS } from '@/regions'
import { toTen } from '@/scene/intensity'
import { SPEAKER_NAMES, SPEAKER_TEXT } from '@/lib/visitDisplay'
import { cn } from '@/lib/utils'
import LiveSpeech from './LiveSpeech'
import MovementCheck from './MovementCheck'
import { ConfirmChecks, CoverageReview, PtSummary } from './VisitWrapUp'
import { evidenceLines } from '@/lib/coverage'

// Right panel: the conversation, what was said about a tapped region, and the end-of-visit check.
export default function ConversationPanel({ visit, mode, selected, missed }) {
  const { user, testMode } = useUser()
  const canReview = user?.role === 'pt' || testMode
  const mentions = selected ? visit.segments.filter((s) => s.regions.includes(selected)) : []

  return (
    <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-border p-5">
      {(mode === 'paint' || mode === 'visit') && <LiveSpeech mode={mode} />}
      {mode === 'visit' && <MovementCheck visit={visit} />}

      {mode === 'ended' && (
        <section className="space-y-2" aria-label="End of visit check">
          <h2 className="text-xl font-bold">Did Everything Come Up?</h2>
          {visit.goal?.text && (
            <p
              className={cn(
                'flex gap-3 rounded-xl p-4 text-base leading-snug ring-1',
                goalDiscussed(visit) ? 'bg-clear/10 ring-clear/40' : 'bg-flag/10 ring-flag/60',
              )}
            >
              <Target className={cn('mt-0.5 size-5 shrink-0', goalDiscussed(visit) ? 'text-clear' : 'text-flag')} aria-hidden />
              <span>
                Your goal, “{visit.goal.text}”,{' '}
                {goalDiscussed(visit) ? 'came up in the visit.' : 'didn’t come up. Ask about it before you leave.'}
              </span>
            </p>
          )}
          {missed.length === 0 ? (
            <p className="flex gap-3 rounded-xl bg-clear/10 p-4 text-base text-clear ring-1 ring-clear/40">
              <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
              Everything you marked came up in the visit.
            </p>
          ) : (
            missed.map((p) => (
              <p key={p.region} className="flex gap-3 rounded-xl bg-flag/10 p-4 text-base leading-snug ring-1 ring-flag/60">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-flag" aria-hidden />
                <span>
                  You marked your <b className="text-flag">{REGIONS[p.region].toLowerCase()}</b> ({p.type},{' '}
                  {toTen(p.intensity)}/10),{' '}
                  {p.coverage === 'pt_asked' ? (
                    <>
                      and the PT asked about it, but it didn’t get an answer.
                      {evidenceLines(visit, p.evidence)[0] && (
                        <span className="mt-1 block text-sm text-muted-foreground">
                          PT: “{evidenceLines(visit, p.evidence)[0].text}”
                        </span>
                      )}
                    </>
                  ) : (
                    'but nobody talked about it.'
                  )}
                </span>
              </p>
            ))
          )}
        </section>
      )}

      {mode === 'ended' && <ConfirmChecks visit={visit} />}
      {mode === 'ended' && canReview && <CoverageReview visit={visit} />}
      {mode === 'ended' && <ReportButtons visit={visit} missed={missed} />}
      {mode === 'ended' && <PtSummary visit={visit} missed={missed} />}

      {selected && mode !== 'paint' && (
        <section className="space-y-2 rounded-xl bg-secondary/60 p-4" aria-label="Mentions of the selected region">
          <h2 className="font-bold">What was said about the {regionLabel(selected).toLowerCase()}</h2>
          {mentions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has talked about this yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {mentions.map((s) => (
                <li key={s.id} className="text-sm leading-snug">
                  <span className={cn('font-bold', SPEAKER_TEXT[s.speaker])}>{SPEAKER_NAMES[s.speaker]}: </span>
                  {s.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <h2 className="text-xl font-bold">Conversation</h2>
      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        {visit.segments.length === 0 ? (
          <p className="text-sm leading-snug text-muted-foreground">
            {mode === 'paint'
              ? 'After you click Start Visit, everything the PT and patient say appears here.'
              : 'Click Record the Visit above, then just talk. Each line appears here.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {visit.segments.map((s) => (
              <li key={s.id} className="leading-snug">
                <span className={cn('block text-sm font-bold', SPEAKER_TEXT[s.speaker])}>
                  {SPEAKER_NAMES[s.speaker] ?? s.speaker}
                </span>
                <span className="text-base">{s.text}</span>
              </li>
            ))}
          </ol>
        )}
      </ScrollArea>
    </aside>
  )
}

// PT Report (PT or Testing mode) and Take-Home Summary (everyone): print, or Save as PDF.
function ReportButtons({ visit, missed }) {
  const { user, testMode } = useUser()
  const [report, setReport] = useState(null) // { kind, maps }
  const open = (kind) => setReport({ kind, maps: { front: snapshot('front'), back: snapshot('back') } })
  return (
    <section className="space-y-2" aria-label="Reports">
      <h2 className="text-xl font-bold">Reports</h2>
      <p className="text-sm text-muted-foreground">Opens the print dialog. Choose “Save as PDF” to keep a copy.</p>
      <div className="grid gap-2">
        {(user?.role === 'pt' || testMode) && (
          <Button className="gap-2 font-bold" onClick={() => open('pt')}>
            <FileText className="size-4" aria-hidden />
            PT Report
          </Button>
        )}
        <Button variant="secondary" className="gap-2 font-bold" onClick={() => open('patient')}>
          <Printer className="size-4" aria-hidden />
          Take-Home Summary
        </Button>
      </div>
      {report && (
        <Report kind={report.kind} visit={visit} missed={missed} maps={report.maps} user={user} onDone={() => setReport(null)} />
      )}
    </section>
  )
}
