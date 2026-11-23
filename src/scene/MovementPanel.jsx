// A movement simulation's controls (Reach Up, Turn Head, Bend Knee; bottom-left of the stage): the
// question, the angle slider, Play, the rule in one sentence, and marking the range where the
// movement hurts. Typical movement, for illustration: it never says why it hurts.
import { useState, useSyncExternalStore } from 'react'
import { ArrowLeft, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { visitStore } from '../visitStore'
import { describePainArc } from './movements'

const noSubscribe = () => () => {}

export default function MovementPanel({ region, sim, label, arc, onClose }) {
  const snap = useSyncExternalStore(sim?.subscribe ?? noSubscribe, sim?.snapshot ?? (() => null))
  const [pendingFrom, setPendingFrom] = useState(null)
  const [shown, play] = snap ? snap.split(':') : [null, '0']
  const angle = shown == null || shown === 'null' ? null : Number(shown)
  const playing = play === '1'
  const movement = sim?.movement
  const stop = (e) => e.stopPropagation()

  function markTo() {
    let from = pendingFrom ?? arc?.from ?? 0
    // The neck: a range from the right side to the left would include facing forward. Keep it on the
    // side being marked now, starting from facing forward.
    if (movement.oneSided && Math.sign(from) * Math.sign(angle) < 0) from = 0
    visitStore.setPainArc(region, { from: Math.min(from, angle), to: Math.max(from, angle) })
    setPendingFrom(null)
  }

  return (
    <section
      aria-label={`${movement?.title ?? 'Movement'} simulation`}
      className="absolute left-4 bottom-10 w-88 space-y-3 rounded-2xl bg-card/95 p-4 shadow-2xl ring-1 ring-foreground/10 backdrop-blur animate-in fade-in slide-in-from-bottom-2"
      onPointerDown={stop}
    >
      <div>
        <h2 className="text-base font-bold leading-tight">{movement?.title ?? 'Loading…'}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Typical movement, for illustration. Not your scan.</p>
        {label && <p className="mt-1 text-sm font-bold text-pt">{label}</p>}
      </div>

      {angle == null ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Loading…
        </p>
      ) : (
        <>
          <p className="text-sm leading-snug">{movement.question}</p>
          <div aria-live="off">
            <p className="text-2xl font-bold tabular-nums">{movement.readout(angle)[0]}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{movement.readout(angle)[1]}</p>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              value={[movement.mirrorSlider ? -angle : angle]}
              min={movement.min}
              max={movement.max}
              step={1}
              onValueChange={([value]) => sim.setAngle(movement.mirrorSlider ? -value : value)}
              aria-label={movement.sliderLabel}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => (playing ? sim.stop() : sim.play(null, 1, arc))}
              aria-label={playing ? 'Pause' : arc ? 'Play the range where it hurts' : 'Play the whole movement'}
              title={playing ? 'Pause' : arc ? 'Play the range where it hurts' : 'Play the whole movement'}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
          </div>
          <p className="text-sm leading-snug text-muted-foreground">
            The rule: {movement.rule} Orange muscles are doing more of the work.
          </p>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-bold">
              {arc ? `${describePainArc(region, arc)}.` : pendingFrom != null ? `Hurts from ${pendingFrom}°…` : 'Where does it hurt?'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => setPendingFrom(angle)}>
                Hurts From Here
              </Button>
              <Button variant="outline" size="sm" onClick={markTo} disabled={pendingFrom == null && !arc}>
                To Here
              </Button>
            </div>
            {arc && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => sim.play()}
                >
                  Play Whole Movement
                </button>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => visitStore.setPainArc(region, null)}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <Button variant="outline" className="w-full gap-2" onClick={onClose} title="Back to the skin (Esc)">
        <ArrowLeft className="size-4" aria-hidden />
        Back to Skin <kbd className="ml-auto text-xs text-muted-foreground">Esc</kbd>
      </Button>
    </section>
  )
}
