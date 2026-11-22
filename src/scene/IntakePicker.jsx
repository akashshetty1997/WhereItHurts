import { useEffect, useState } from 'react'
import { Mic, X } from 'lucide-react'
import { visitStore } from '../visitStore'
import { regionLabel, PAIN_TYPES } from '../regions'
import { toTen } from './intensity'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PAIN_STYLES } from '@/lib/visitDisplay'
import { cn } from '@/lib/utils'
import { useHoldToSpeak } from '@/panels/useHoldToSpeak'
import { extract } from '@/panels/speech'
import { setListening } from './bodyApi'

// Shown in the stage's bottom-right corner (clear of the body) when a region is tapped during intake. Voice fills the same entry;
// these controls are the fallback when speech fails or the patient prefers to tap.
export default function IntakePicker({ region, entry, listening, onClose }) {
  const intensity = entry ? toTen(entry.intensity) : 5
  const [heard, setHeard] = useState(null) // what the last spoken description changed

  // Voice: hold the button (or P) and describe it. The backend picks out the type and rating;
  // the patient's own words are kept as the note.
  const speech = useHoldToSpeak(async (text) => {
    setHeard('…')
    let found = {}
    try {
      found = await extract(text, 'patient')
    } catch {
      // Backend unreachable: keep the words, leave type and rating as they were.
    }
    save({
      note: text,
      ...(found.pain_type ? { type: found.pain_type } : {}),
      ...(found.rating != null ? { intensity: found.rating } : {}),
    })
    setHeard(
      found.pain_type || found.rating != null
        ? `Heard: ${[found.pain_type, found.rating != null && `${found.rating}/10`].filter(Boolean).join(', ')}`
        : 'Saved your words. Choose the type and rating below.',
    )
  })
  // The ring on the body pulses while the mic is open.
  useEffect(() => {
    setListening(speech.listening ? region : null)
  }, [speech.listening, region])
  // Hold P to speak (the talk buttons only exist during the visit, so P is free here).
  useEffect(() => {
    const typing = (e) => e.target.closest?.('input, textarea, [contenteditable="true"]')
    const down = (e) => e.key.toLowerCase() === 'p' && !e.repeat && !typing(e) && speech.start()
    const up = (e) => e.key.toLowerCase() === 'p' && speech.stop()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [speech.start, speech.stop]) // eslint-disable-line react-hooks/exhaustive-deps -- stable callbacks
  const isListening = listening || speech.listening

  const save = (patch) => {
    const painted = visitStore.get().painted.filter((p) => p.region !== region)
    const next = { region, type: entry?.type ?? 'aching', intensity, ...entry, ...patch }
    next.intensity = toTen(next.intensity)
    visitStore.setPainted([...painted, next])
  }

  const remove = () => {
    visitStore.setPainted(visitStore.get().painted.filter((p) => p.region !== region))
    onClose()
  }

  return (
    <div
      className="absolute right-4 bottom-4 w-80 space-y-4 rounded-2xl bg-card/95 p-4 shadow-2xl ring-1 ring-foreground/10 backdrop-blur animate-in fade-in slide-in-from-bottom-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-bold leading-tight">{regionLabel(region)}</p>
          <p
            className={cn('mt-1 text-sm', isListening ? 'animate-pulse text-patient' : 'text-muted-foreground')}
            aria-live="polite"
          >
            {isListening
              ? speech.interim || 'Listening… describe the pain'
              : heard ?? 'Hold to speak, or choose below.'}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      {speech.supported && (
        <Button
          variant="secondary"
          className={cn('h-11 w-full touch-none gap-2 text-base font-bold select-none', speech.listening && 'bg-patient text-background')}
          onPointerDown={speech.start}
          onPointerUp={speech.stop}
          onPointerLeave={() => speech.listening && speech.stop()}
          onKeyDown={(e) => e.key === ' ' && !e.repeat && speech.start()}
          onKeyUp={(e) => e.key === ' ' && speech.stop()}
          aria-pressed={speech.listening}
        >
          <Mic className="size-4" aria-hidden />
          {speech.listening ? 'Listening… release when done' : 'Hold to Speak'}
          <kbd className="ml-auto rounded border border-current px-1.5 text-sm opacity-70">P</kbd>
        </Button>
      )}
      {speech.error && <p className="text-sm text-flag">{speech.error}</p>}

      <ToggleGroup
        type="single"
        value={entry?.type ?? ''}
        onValueChange={(type) => type && save({ type })}
        className="grid w-full grid-cols-3 gap-1.5"
        aria-label="Pain type"
      >
        {PAIN_TYPES.map((t) => (
          <ToggleGroupItem
            key={t}
            value={t}
            className={cn(
              'h-10 rounded-lg bg-secondary text-base font-bold data-[state=on]:bg-secondary data-[state=on]:ring-2',
              PAIN_STYLES[t].text,
              PAIN_STYLES[t].ring,
            )}
          >
            {PAIN_STYLES[t].label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">How bad is it:</span>
          <span className="text-2xl font-bold tabular-nums">{entry ? intensity : '–'}</span>
        </div>
        <Slider
          min={0}
          max={10}
          step={1}
          value={[intensity]}
          onValueChange={([v]) => save({ intensity: v })}
          aria-label="Pain rating, 0 to 10"
        />
        <div className="flex justify-between text-sm text-muted-foreground" aria-hidden>
          <span>0 · None</span>
          <span>10 · Worst</span>
        </div>
      </div>

      {entry?.note && <p className="text-sm italic leading-snug text-muted-foreground">“{entry.note}”</p>}

      {entry && (
        <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}>
          Remove Mark
        </Button>
      )}
    </div>
  )
}
