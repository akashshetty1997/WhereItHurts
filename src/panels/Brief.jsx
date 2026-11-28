// Pre-Visit Brief (PT and Testing mode, Mark Pain step): one screen the PT reads in about 30 s
// before the patient walks in. Built by src/lib/brief.js from the last visit and today's prep.
// It takes the place of the right panel while open, so the body stays in view, and every item
// with a body part is a button that turns the body to it. Sections with nothing in
// them aren't shown; long lists show the first 3 with Show All.
import { useEffect, useRef, useState } from 'react'
import { ClipboardList, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { focus } from '@/scene/bodyApi'
import { describePainArc } from '@/scene/movements'
import { formatVisitDate } from '@/lib/visitDisplay'
import { cn } from '@/lib/utils'

const FIRST = 3

export default function Brief({ brief, patientKey, onClose }) {
  const panel = useRef(null)
  useEffect(() => {
    panel.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { since, goal } = brief
  const arcs = brief.painArcs.map(({ region, arc }) => ({ region, text: describePainArc(region, arc) })).filter((a) => a.text)
  const sections = [
    { title: 'Missed Last Time', items: brief.missed, flag: true },
    { title: 'Corrections Still Open', items: brief.corrections, flag: true },
    { title: 'Not Confirmed by the Patient', items: brief.notConfirmed },
    { title: 'Today vs Last Time', items: brief.today },
    { title: 'Movement Checks Last Time', items: brief.movementChecks },
    { title: 'Where Moving Hurt', items: arcs },
    { title: 'Anatomy Shown Last Time', items: brief.anatomy },
    { title: 'Follow-Ups', items: brief.followUps },
  ].filter((s) => s.items.length)

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-labelledby="brief-title"
      className="flex min-h-0 flex-col gap-3 border-l border-border p-5 focus:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="brief-title" className="flex items-center gap-2 text-xl font-bold">
            <ClipboardList className="size-5" aria-hidden /> Pre-Visit Brief
          </h2>
          {since && (
            <p className="text-sm text-muted-foreground">
              Last visit {formatVisitDate(since.date)}
              {since.daysAgo > 0 ? `, ${since.daysAgo} day${since.daysAgo === 1 ? '' : 's'} ago` : ', today'}
              {patientKey ? ` · Patient: ${patientKey}` : ''}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close the brief">
          <X className="size-5" aria-hidden />
        </Button>
      </div>

      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
        {goal && (
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-muted-foreground">Goal</h3>
            <p className={cn('text-base leading-snug', !goal.discussed && 'text-flag')}>
              “{goal.text}” · {goal.discussed ? 'came up last time' : 'didn’t come up last time'}
            </p>
          </div>
        )}
        {sections.map((s) => (
          <BriefSection key={s.title} {...s} />
        ))}
        {!goal && !sections.length && <p className="text-base text-muted-foreground">Nothing to flag from the last visit.</p>}
      </div>
      <p className="text-xs text-muted-foreground">What was marked, said and checked. Not a diagnosis.</p>
      <Button variant="secondary" className="h-11 font-bold" onClick={onClose}>
        Done
      </Button>
    </aside>
  )
}

function BriefSection({ title, items, flag = false }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, FIRST)
  return (
    <div className="space-y-1">
      <h3 className={cn('text-sm font-bold', flag ? 'text-flag' : 'text-muted-foreground')}>{title}</h3>
      <ul className="space-y-1">
        {shown.map((item, i) => (
          <li key={i}>
            {item.region ? (
              <button
                type="button"
                onClick={() => focus(item.region)}
                className="w-full rounded-lg px-2 py-1 text-left text-base leading-snug hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                title="Show on the body"
              >
                {item.text}
              </button>
            ) : (
              <p className="px-2 py-1 text-base leading-snug">{item.text}</p>
            )}
          </li>
        ))}
      </ul>
      {items.length > FIRST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="px-2 text-sm font-bold text-primary hover:underline">
          {all ? 'Show Less' : `Show All ${items.length}`}
        </button>
      )}
    </div>
  )
}
