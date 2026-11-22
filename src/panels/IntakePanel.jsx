import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { regionLabel } from '@/regions'
import { toTen } from '@/scene/intensity'
import { PAIN_STYLES } from '@/lib/visitDisplay'
import { cn } from '@/lib/utils'

const COPY = {
  paint: {
    title: 'Before your visit',
    hint: 'Tap where it hurts on the body, then say what it feels like and how bad it is.',
  },
  visit: { title: 'What you marked', hint: 'Each part lights up when someone talks about it.' },
  ended: { title: 'What you marked', hint: 'Amber means nobody talked about it.' },
}

// Left panel: the patient's goal and every place they marked.
export default function IntakePanel({ visit, mode, missed, onStart, onEnd, onRestart }) {
  const copy = COPY[mode]
  const missedSet = new Set(missed.map((p) => p.region))

  return (
    <aside className="flex min-h-0 flex-col gap-5 border-r border-border p-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold">{copy.title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.hint}</p>
      </div>

      <section className="rounded-xl bg-secondary/60 p-4" aria-label="Your goal">
        <p className="text-sm text-muted-foreground">What you want to do again</p>
        {visit.goal?.text ? (
          <p className="mt-1 text-base font-bold leading-snug">{visit.goal.text}</p>
        ) : (
          <p className="mt-1 text-sm italic text-muted-foreground">
            Say it out loud, like “Put plates on the top shelf.”
          </p>
        )}
      </section>

      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        {visit.painted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nothing marked yet. Tap the body to start.
          </p>
        ) : (
          <ul className="space-y-2">
            {visit.painted.map((p) => {
              const style = PAIN_STYLES[p.type] ?? PAIN_STYLES.aching
              const isMissed = missedSet.has(p.region)
              return (
                <li
                  key={p.region}
                  className={cn(
                    'flex items-stretch gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10',
                    isMissed && 'ring-2 ring-flag',
                  )}
                >
                  <span className={cn('w-1 shrink-0 rounded-full', isMissed ? 'bg-flag' : style.bar)} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{regionLabel(p.region)}</p>
                    <p className={cn('text-sm', style.text)}>{style.label}</p>
                    {p.note && <p className="mt-1 text-sm italic text-muted-foreground">“{p.note}”</p>}
                  </div>
                  <p className="self-center text-2xl font-bold tabular-nums">
                    {toTen(p.intensity)}
                    <span className="text-sm font-normal text-muted-foreground">/10</span>
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>

      {mode === 'paint' && (
        <Button size="lg" className="h-11 text-base font-bold" onClick={onStart}>
          Start visit
        </Button>
      )}
      {mode === 'visit' && (
        <Button size="lg" variant="secondary" className="h-11 text-base font-bold" onClick={onEnd}>
          End visit
        </Button>
      )}
      {mode === 'ended' && (
        <Button size="lg" variant="outline" className="h-11 text-base" onClick={onRestart}>
          Back to marking
        </Button>
      )}
    </aside>
  )
}
