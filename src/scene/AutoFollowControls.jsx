// Auto-follow's controls on the body (src/scene/autoFollow.js): the toggle in the view controls
// and the chip that says why the camera moved ("Following: Neck").
import { Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { autoFollowState, useAutoFollow } from './autoFollowState'

export function AutoFollowToggle() {
  const { on } = useAutoFollow()
  return (
    <Button
      variant="ghost"
      className={cn('h-9 gap-2', on && 'bg-secondary')}
      aria-pressed={on}
      onClick={() => autoFollowState.set({ on: !on })}
      title="Move the body to what the PT is talking about"
    >
      <Crosshair className="size-4" aria-hidden />
      Auto-Follow {on ? 'On' : 'Off'}
    </Button>
  )
}

export function AutoFollowChip({ visible }) {
  const { on, status } = useAutoFollow()
  return (
    <p
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-card/90 px-4 py-2 text-base font-bold ring-1 ring-border backdrop-blur',
        !(visible && on && status) && 'sr-only',
      )}
    >
      {visible && on && status ? (
        <>
          <Crosshair className="mr-2 inline size-4 align-[-2px] text-pt" aria-hidden />
          Following: {status}
        </>
      ) : null}
    </p>
  )
}
