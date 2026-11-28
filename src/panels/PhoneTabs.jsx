// Phone and tablet (below the laptop layout): a tab bar at the bottom switches between the body,
// the marks list and the conversation / summary, one at a time (tab-bars.md: tabs navigate,
// they don't act). Hidden from lg up, where all three columns show.
import { ListChecks, MessagesSquare, PersonStanding } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function PhoneTabs({ tab, onTab, mode, briefOpen }) {
  const tabs = [
    { id: 'body', label: 'Body', Icon: PersonStanding },
    { id: 'marks', label: mode === 'paint' ? 'Mark Pain' : 'Marks', Icon: ListChecks },
    { id: 'talk', label: briefOpen ? 'Brief' : mode === 'ended' ? 'Summary' : mode === 'paint' ? 'Prep' : 'Visit', Icon: MessagesSquare },
  ]
  return (
    <nav
      aria-label="Panels"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-3 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {tabs.map((t) => {
        const Icon = t.Icon
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-ring',
              tab === t.id ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-6" aria-hidden />
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
