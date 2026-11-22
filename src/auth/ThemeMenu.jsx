// System / Light / Dark. Default is System (Apple: respect the systemwide appearance); the
// override exists for the demo, where the room or projector may call for one or the other.
import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { followSystem, readTheme, setTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { id: 'system', label: 'Match system appearance', icon: <Monitor className="size-4" aria-hidden /> },
  { id: 'light', label: 'Light appearance', icon: <Sun className="size-4" aria-hidden /> },
  { id: 'dark', label: 'Dark appearance', icon: <Moon className="size-4" aria-hidden /> },
]

export default function ThemeMenu({ className }) {
  const [theme, setThemeState] = useState(readTheme)
  useEffect(followSystem, [])

  return (
    <div role="radiogroup" aria-label="Appearance" className={cn('flex rounded-lg border border-border p-0.5', className)}>
      {OPTIONS.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={theme === id}
          aria-label={label}
          title={label}
          onClick={() => {
            setTheme(id)
            setThemeState(id)
          }}
          className={cn(
            'grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
            theme === id && 'bg-secondary text-foreground',
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}
