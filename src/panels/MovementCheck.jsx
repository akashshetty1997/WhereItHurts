// Movement Check card (visit): what the PT tested and how the patient's symptom changed.
// Filled from the conversation by ./movementCheck.js; every field can be set by hand.
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { REGIONS } from '@/regions'
import { showRatings } from '@/scene/bodyApi'
import { cn } from '@/lib/utils'
import { startCheck, updateCheck } from './movementLog'

const RESPONSES = [
  { id: 'better', label: 'Better' },
  { id: 'same', label: 'Same' },
  { id: 'worse', label: 'Worse' },
  { id: 'moved', label: 'Moved' },
  { id: 'unsure', label: 'Unsure' },
]
const RATINGS = Array.from({ length: 11 }, (_, i) => i)

export default function MovementCheck({ visit }) {
  const checks = visit.observations ?? []
  const check = checks[checks.length - 1]
  const [view, setView] = useState(null) // 'before' | 'after' | null: what the body shows

  // The symptom's glow on the body follows the Before / After toggle.
  useEffect(() => {
    if (!check || !view || check[view] == null) showRatings(null, null)
    else showRatings(check.symptomRegion, check[view])
  }, [check, view])
  useEffect(() => () => showRatings(null, null), [])

  const set = (patch) => updateCheck(check.id, patch)

  return (
    <section aria-label="Movement check" className="space-y-3 rounded-xl bg-secondary/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Movement Check</h2>
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => startCheck()}>
          <Plus className="size-4" aria-hidden /> New Check
        </Button>
      </div>

      {!check ? (
        <p className="text-sm leading-snug text-muted-foreground">
          When the PT tests a movement, it’s logged here. Say it (“Turn your head to the left”), or start one by hand.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Movement:</span>
            <Input value={check.movement} onChange={(e) => set({ movement: e.target.value })} placeholder="Turn head to the left" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <RegionSelect label="Area assessed:" value={check.assessedRegion} onChange={(v) => set({ assessedRegion: v })} />
            <RegionSelect label="Symptom:" value={check.symptomRegion} onChange={(v) => set({ symptomRegion: v })} />
            <RatingSelect label="Before:" value={check.before} onChange={(v) => set({ before: v })} />
            <RatingSelect label="After:" value={check.after} onChange={(v) => set({ after: v })} />
          </div>
          <ToggleGroup
            type="single"
            value={check.response ?? ''}
            onValueChange={(v) => v && set({ response: v })}
            className="grid w-full grid-cols-5 gap-1"
            aria-label="How the symptom responded"
          >
            {RESPONSES.map((r) => (
              <ToggleGroupItem key={r.id} value={r.id} className="h-8 rounded-md bg-background/60 px-1 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {check.before != null && check.after != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Show on body:</span>
              <ToggleGroup type="single" value={view ?? ''} onValueChange={(v) => setView(v || null)} className="gap-1 rounded-lg bg-background/60 p-1" aria-label="Show the symptom before or after the movement">
                <ToggleGroupItem value="before" className="h-8 px-3 text-sm font-bold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  Before {check.before}/10
                </ToggleGroupItem>
                <ToggleGroupItem value="after" className="h-8 px-3 text-sm font-bold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  After {check.after}/10
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          {checks.length > 1 && <p className="text-sm text-muted-foreground">{checks.length} checks in this visit.</p>}
        </div>
      )}
    </section>
  )
}

const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground'

function RegionSelect({ label, value, onChange }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <select className={selectClass} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Choose…</option>
        {Object.entries(REGIONS).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

function RatingSelect({ label, value, onChange }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <select
        className={cn(selectClass, 'tabular-nums')}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">–</option>
        {RATINGS.map((n) => (
          <option key={n} value={n}>
            {n}/10
          </option>
        ))}
      </select>
    </label>
  )
}
