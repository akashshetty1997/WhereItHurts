import { Play, Square, RotateCcw } from 'lucide-react'
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

// Toolbar: app name, the three visit steps in order (current one lit), the next action, account.
export default function AppHeader({ mode, onAction }) {
  const current = STEPS.findIndex((s) => s.mode === mode)
  const action = ACTIONS[mode]
  const Icon = action.icon
  return (
    <header className="flex items-center justify-between gap-6 border-b border-border px-6 py-3 whitespace-nowrap">
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-bold tracking-tight">WhereItHurts</span>
        <span className="hidden text-sm text-muted-foreground 2xl:inline">Show where it hurts. Say what it feels like.</span>
      </div>
      <div className="flex items-center gap-5">
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
                {step.label}
              </span>
            </li>
          ))}
        </ol>
        <Button variant={action.variant} size="lg" className="h-10 gap-2 px-4 text-base font-bold" onClick={onAction}>
          <Icon className="size-4" aria-hidden />
          {action.label}
        </Button>
        <UserMenu />
      </div>
    </header>
  )
}
