import { ClipboardList, FilePlus, History, Play, Square, RotateCcw, X } from 'lucide-react'
import { formatVisitDate } from '@/lib/visitDisplay'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import UserMenu from '@/auth/UserMenu'

const STEPS = [
  { mode: 'paint', label: 'Mark Pain' },
  { mode: 'visit', label: 'Visit' },
  { mode: 'ended', label: 'Summary' },
]

// The one action that moves the visit forward lives in the toolbar, not at the bottom of a
// sidebar (layout.md › Platform considerations: avoid controls at the bottom of a window).
const ACTIONS = {
  paint: { label: 'Start Visit', icon: Play, variant: 'default' },
  visit: { label: 'End Visit', icon: Square, variant: 'default' },
  ended: { label: 'Back to Marking', icon: RotateCcw, variant: 'secondary' },
}

// New Visit clears everything, so it asks first (alerts.md: warn before a destructive action).
const NEW_VISIT_QUESTION = 'Start a new visit? This clears the marks, goal, conversation and summary.'

// Toolbar: app name, the three visit steps in order (current one lit), the next action, account.
export default function AppHeader({ mode, onAction, onNewVisit, onPastVisits, onBrief, briefOpen, viewing, onClosePast }) {
  const current = STEPS.findIndex((s) => s.mode === mode)
  const action = ACTIONS[mode]
  const Icon = action.icon
  return (
    <header className="flex items-center justify-between gap-6 border-b border-border px-6 py-3 whitespace-nowrap">
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-bold tracking-tight">WhereItHurts</span>
        <span className="hidden text-sm text-muted-foreground 2xl:inline">Show where it hurts. Say what it feels like.</span>
      </div>
      {viewing ? (
        <div className="flex min-w-0 items-center gap-4">
          <p className="text-base" aria-live="polite">
            <span className="font-bold">Past visit</span> · {formatVisitDate(viewing.endedAt ?? viewing.visit.startedAt)}
            {viewing.patientKey && ` · Patient: ${viewing.patientKey}`}
            <span className="text-muted-foreground"> · read only</span>
          </p>
          <Button size="lg" className="h-10 gap-2 px-4 text-base font-bold" onClick={onClosePast}>
            <X className="size-4" aria-hidden />
            Close Past Visit
          </Button>
          <UserMenu />
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-4">
          <ol className="flex items-center gap-1.5" aria-label="Visit steps">
            {STEPS.map((step, i) => (
              <li key={step.mode} className="flex items-center gap-1.5">
                {i > 0 && <span className="h-px w-5 bg-border" aria-hidden />}
                <span
                  aria-current={i === current ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1 text-sm',
                    i === current ? 'bg-primary/15 font-bold text-primary' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 place-items-center rounded-full text-xs font-bold',
                      i === current ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  {/* Narrow windows: only the current step keeps its label, so the header fits. */}
                  <span className={cn(i !== current && 'sr-only xl:not-sr-only')}>{step.label}</span>
                </span>
              </li>
            ))}
          </ol>
          <Button variant={action.variant} size="lg" className="h-10 gap-2 px-4 text-base font-bold" onClick={onAction}>
            <Icon className="size-4" aria-hidden />
            {action.label}
          </Button>
          {mode === 'ended' && (
            <Button
              size="lg"
              className="h-10 gap-2 px-4 text-base font-bold"
              onClick={() => window.confirm(NEW_VISIT_QUESTION) && onNewVisit()}
            >
              <FilePlus className="size-4" aria-hidden />
              New Visit
            </Button>
          )}
          {onBrief && mode === 'paint' && (
            <Button variant="secondary" className="h-10 gap-2 font-bold" onClick={onBrief} aria-pressed={briefOpen}>
              <ClipboardList className="size-4" aria-hidden />
              Brief
            </Button>
          )}
          {onPastVisits && (
            <Button variant="ghost" className="h-10 gap-2" onClick={onPastVisits} title="Past Visits">
              <History className="size-4" aria-hidden />
              {/* Narrow windows: icon only (the label stays for screen readers), so the header fits. */}
              <span className="sr-only 2xl:not-sr-only">Past Visits</span>
            </Button>
          )}
          <UserMenu />
        </div>
      )}
    </header>
  )
}
