import { cn } from '@/lib/utils'

const STEPS = [
  { mode: 'paint', label: 'Mark your pain' },
  { mode: 'visit', label: 'Visit' },
  { mode: 'ended', label: 'Summary' },
]

// The three steps of a visit, in order. The current one is lit.
export default function AppHeader({ mode }) {
  const current = STEPS.findIndex((s) => s.mode === mode)
  return (
    <header className="flex items-center justify-between gap-6 border-b border-border px-6 py-3">
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-bold tracking-tight">WhereItHurts</span>
        <span className="hidden text-sm text-muted-foreground lg:inline">
          Show where it hurts. Say what it feels like.
        </span>
      </div>
      <ol className="flex items-center gap-2" aria-label="Visit steps">
        {STEPS.map((step, i) => (
          <li key={step.mode} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-border" aria-hidden />}
            <span
              aria-current={i === current ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors',
                i === current && 'bg-primary/15 text-primary',
                i < current && 'text-foreground',
                i > current && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full text-xs font-bold',
                  i === current ? 'bg-primary text-primary-foreground' : 'bg-secondary',
                )}
              >
                {i + 1}
              </span>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </header>
  )
}
