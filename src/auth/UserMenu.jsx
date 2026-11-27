// Who's logged in (name + role), the appearance control, and Log out, for the app header.
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ThemeMenu from './ThemeMenu'
import { useUser } from './userContext'

export default function UserMenu() {
  const { user, logout, testMode } = useUser()
  if (!user) return null
  const isPt = user.role === 'pt'
  return (
    <div className="flex items-center gap-2 border-l border-border pl-4 whitespace-nowrap">
      <span className="flex items-center gap-1.5 text-sm">
        <span className="hidden max-w-40 truncate sm:inline" title={user.name}>
          {user.name}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-sm', isPt ? 'bg-pt/15 text-pt' : 'bg-patient/15 text-patient')}>
          {isPt ? 'PT' : 'Patient'}
        </span>
        {testMode && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-sm text-muted-foreground">Test Mode</span>
        )}
      </span>
      <ThemeMenu />
      <Button variant="ghost" size="sm" onClick={logout}>
        Log Out
      </Button>
    </div>
  )
}
