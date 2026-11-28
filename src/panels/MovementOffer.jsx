// The PT asked for a movement without a side ("raise your arm"): the app doesn't guess which arm.
// One tap plays the side we have, e.g. "Play Reach Up (right shoulder)" (src/lib/sides.js, A3).
import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MOVEMENTS } from '@/scene/movements'
import { REGIONS } from '@/regions'

export default function MovementOffer({ offer, onPlay, onDismiss }) {
  const title = MOVEMENTS[offer.region]?.title ?? 'the movement'
  return (
    <div
      role="status"
      className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-card/95 p-2 pl-4 shadow-lg ring-1 ring-border backdrop-blur"
    >
      <span className="text-sm">
        <span className="text-muted-foreground">No side said · </span>“{offer.text}”
      </span>
      <Button className="gap-2 font-bold" onClick={onPlay}>
        <Play className="size-4" aria-hidden />
        Play {title} ({REGIONS[offer.region]?.toLowerCase()})
      </Button>
      <Button variant="ghost" size="icon" onClick={onDismiss} aria-label="Don’t play it">
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
