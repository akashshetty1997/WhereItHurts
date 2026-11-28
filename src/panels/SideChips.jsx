// "Which side?" on a transcript line that named a two-sided body part with no side ("my
// shoulder"). Picking the side we have a region for adds it to the line (it glows); the other
// side is kept as a text-only note. Nothing is guessed (src/lib/sides.js).
import { glow } from '@/scene/bodyApi'
import { visitStore } from '@/visitStore'
import { partName, resolveSide, sideChoices } from '@/lib/sides'
import { cn } from '@/lib/utils'

export default function SideChips({ segment, editable }) {
  const unsided = segment.unsided ?? []
  if (!unsided.length) return null
  return (
    <div className="mt-1.5 space-y-1.5">
      {unsided.map((region) => {
        const part = partName(region)
        const picked = segment.sides?.[region]
        const choices = sideChoices(region)
        function pick(side) {
          const patch = resolveSide(visitStore.get().segments.find((s) => s.id === segment.id) ?? segment, region, side)
          visitStore.updateSegment(segment.id, patch)
          const choice = choices.find((c) => c.side === side)
          if (choice?.region) glow(choice.region, visitStore.get().speakers?.[segment.speaker === 'patient' ? 'patient' : 'doctor']?.color)
        }
        return (
          <div key={region} className="flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label={`Which ${part}?`}>
            <span className={cn('font-bold', picked ? 'text-muted-foreground' : 'text-flag')}>
              {picked ? `${part[0].toUpperCase()}${part.slice(1)}:` : `Which ${part}?`}
            </span>
            {choices.map((c) => (
              <button
                key={c.side}
                type="button"
                disabled={!editable}
                aria-pressed={picked === c.side}
                onClick={() => pick(c.side)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 font-bold ring-1 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default',
                  picked === c.side ? 'bg-primary text-primary-foreground ring-primary' : 'ring-border hover:bg-secondary',
                )}
              >
                {c.label}
              </button>
            ))}
            {picked && !choices.find((c) => c.side === picked)?.region && (
              <span className="text-muted-foreground">(not shown on the body yet)</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
