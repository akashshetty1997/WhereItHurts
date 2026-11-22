// Show Anatomy's panels over the 3D view: what this is (a reference illustration, not a scan),
// layer toggles with a legend, and the card for the structure the PT picked, with Explain to
// Patient (large text on the shared screen) and Add to Report.
import { useState } from 'react'
import { ArrowLeft, Check, Circle, MessageSquareText, NotebookPen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { REGIONS } from '../regions'
import { visitStore, useVisit } from '../visitStore'
import { KIND_STYLES } from './anatomy'
import { PAIN_STYLES } from '@/lib/visitDisplay'
import { toTen } from './intensity'

const CREDIT = 'Anatomy: BodyParts3D, © The Database Center for Life Science, CC BY 4.0'

const SKIN_SWATCH = '#d9a483'
const LAYERS = [
  { id: 'skin', label: 'Skin', swatch: SKIN_SWATCH, on: 'See-through', off: 'Hidden' },
  { id: 'muscle', label: 'Muscles', swatch: KIND_STYLES.muscle.color, on: 'Shown', off: 'Hidden' },
  { id: 'bone', label: 'Bones', swatch: KIND_STYLES.bone.color, on: 'Shown', off: 'Hidden' },
  { id: 'mark', label: 'Pain Mark', on: 'Shown', off: 'Hidden' },
]

const PURPOSES = [
  { id: 'discussed', label: 'Discussed with patient' },
  { id: 'examined', label: 'Examined' },
]

export default function AnatomyOverlay({ region, ready, structure, hoverLabel, layers, onLayer, onClose, onCloseStructure }) {
  const [explaining, setExplaining] = useState(false)
  const stop = (e) => e.stopPropagation()

  return (
    <>
      <section
        aria-label="3D reference anatomy"
        className="absolute left-4 top-4 w-80 space-y-3 rounded-2xl bg-card/95 p-4 shadow-2xl ring-1 ring-foreground/10 backdrop-blur animate-in fade-in"
        onPointerDown={stop}
      >
        <div>
          <h2 className="text-base font-bold leading-tight">3D Reference Anatomy · {REGIONS[region]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Illustration, not this patient’s scan.</p>
        </div>
        <Button variant="outline" className="w-full gap-2" onClick={onClose} title="Back to the skin (Esc)">
          <ArrowLeft className="size-4" aria-hidden />
          Back to Skin <kbd className="ml-auto text-xs text-muted-foreground">Esc</kbd>
        </Button>
        <LayerToggles region={region} layers={layers} onLayer={onLayer} />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {!ready ? 'Loading the anatomy…' : hoverLabel ? hoverLabel : 'Click a bone, a muscle or a teal joint dot to learn about it.'}
        </p>
      </section>

      <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">{CREDIT}</p>

      {structure && !explaining && (
        <StructureCard
          key={structure.fma ?? structure.joint}
          region={region}
          structure={structure}
          onExplain={() => setExplaining(true)}
          onClose={onCloseStructure}
        />
      )}

      {structure && explaining && (
        <div
          role="dialog"
          aria-label={`Explaining: ${structure.label}`}
          className="absolute inset-x-8 bottom-8 mx-auto max-w-3xl space-y-4 rounded-3xl bg-card/95 p-8 text-center shadow-2xl ring-1 ring-foreground/10 backdrop-blur animate-in fade-in slide-in-from-bottom-2"
          onPointerDown={stop}
        >
          <p className="text-4xl font-bold leading-tight">{structure.label}</p>
          <p className="text-2xl leading-snug">{structure.sentence}</p>
          <p className="text-base text-muted-foreground">
            {structure.anatomical} · a reference illustration, not your scan
          </p>
          <Button size="lg" className="h-12 px-8 text-base font-bold" onClick={() => setExplaining(false)} autoFocus>
            Done
          </Button>
        </div>
      )}
    </>
  )
}

// Layer switches: on is a filled pill with a check, off an outlined, dimmed pill with an empty
// circle, and the state is also written out ("See-through", "Hidden"), so it never depends on color.
function LayerToggles({ region, layers, onLayer }) {
  const visit = useVisit()
  const mark = visit.painted.find((p) => p.region === region)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Layers">
        {LAYERS.map((layer) => {
          const noMark = layer.id === 'mark' && !mark
          const on = layers[layer.id] && !noMark
          const swatch = layer.id === 'mark' ? mark && `var(--${mark.type})` : layer.swatch
          return (
            <button
              key={layer.id}
              type="button"
              aria-pressed={on}
              disabled={noMark}
              onClick={() => onLayer(layer.id, !layers[layer.id])}
              className={cn(
                'flex h-12 items-center gap-2 rounded-xl px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground ring-1 ring-border ring-inset hover:bg-secondary/60',
                noMark && 'cursor-not-allowed opacity-60 hover:bg-transparent',
              )}
            >
              {on ? <Check className="size-4 shrink-0" aria-hidden /> : <Circle className="size-4 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm font-bold">{layer.label}</span>
                <span className={cn('block text-xs', on ? 'opacity-80' : '')}>
                  {noMark ? 'Not marked here' : on ? layer.on : layer.off}
                </span>
              </span>
              {swatch && (
                <span className="size-3.5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: swatch }} aria-hidden />
              )}
            </button>
          )
        })}
      </div>
      {mark && (
        <p className="text-sm text-muted-foreground">
          Patient’s mark: <span className={PAIN_STYLES[mark.type]?.text}>{PAIN_STYLES[mark.type]?.label}</span>,{' '}
          {toTen(mark.intensity)}/10
        </p>
      )}
    </div>
  )
}

function StructureCard({ region, structure, onExplain, onClose }) {
  const visit = useVisit()
  const [adding, setAdding] = useState(false)
  const [purpose, setPurpose] = useState('discussed')
  const [note, setNote] = useState('')
  // Bones and muscles have an FMA id; joints (points between bones) have a joint id instead.
  const idOf = (s) => s.fma ?? s.joint
  const saved = (visit.anatomyNotes ?? []).filter(
    (n) => n.complaintRegion === region && idOf(n.structure) === idOf(structure),
  )

  function add(e) {
    e.preventDefault()
    visitStore.addAnatomyNote({
      complaintRegion: region,
      structure: {
        fma: structure.fma,
        joint: structure.joint,
        label: structure.label,
        anatomical: structure.anatomical,
        region: structure.region,
        kind: structure.kind,
        sentence: structure.sentence, // the Take-Home Summary explains it in these words
      },
      purpose,
      note: note.trim(),
    })
    setAdding(false)
    setNote('')
  }

  return (
    <section
      aria-label={structure.label}
      className="absolute left-4 bottom-10 w-80 space-y-3 rounded-2xl bg-card/95 p-4 shadow-2xl ring-1 ring-foreground/10 backdrop-blur animate-in fade-in slide-in-from-bottom-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-bold leading-tight">{structure.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {structure.anatomical} · {KIND_STYLES[structure.kind]?.label ?? structure.kind}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      <p className="text-sm leading-snug">{structure.sentence}</p>

      {saved.length > 0 && (
        <ul className="space-y-1 text-sm">
          {saved.map((n) => (
            <li key={n.id} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-clear" aria-hidden />
              <span className="min-w-0 flex-1">
                In the report: {PURPOSES.find((p) => p.id === n.purpose)?.label}
                {n.note && <span className="text-muted-foreground"> · “{n.note}”</span>}
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => visitStore.removeAnatomyNote(n.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form className="space-y-2" onSubmit={add}>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Why it goes in the report">
            {PURPOSES.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="ghost"
                size="sm"
                role="radio"
                aria-checked={purpose === p.id}
                onClick={() => setPurpose(p.id)}
                className="h-auto whitespace-normal py-1.5 ring-1 ring-border aria-checked:bg-secondary aria-checked:font-bold"
              >
                {p.label}
              </Button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Your words for the report (optional)"
            className="w-full resize-none rounded-lg bg-background px-3 py-2 text-sm ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Note for the report"
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Add to Report
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2">
          <Button className="gap-2" onClick={onExplain}>
            <MessageSquareText className="size-4" aria-hidden />
            Explain to Patient
          </Button>
          <Button variant="secondary" className="gap-2" onClick={() => setAdding(true)}>
            <NotebookPen className="size-4" aria-hidden />
            Add to Report
          </Button>
        </div>
      )}
    </section>
  )
}
