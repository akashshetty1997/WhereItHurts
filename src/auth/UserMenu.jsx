// Who's logged in (name + role) and Log out, for the app header.
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUser } from './userContext'

export default function UserMenu() {
  const { user, logout, testMode } = useUser()
  if (!user) return null
  const isPt = user.role === 'pt'
  return (
    <div className="flex items-center gap-2 border-l border-border pl-4 whitespace-nowrap">
      <span className="flex items-center gap-1.5 text-sm">
        {user.name}
        <span className={cn('rounded-full px-2 py-0.5 text-sm', isPt ? 'bg-sky-400/15 text-sky-300' : 'bg-amber-400/15 text-amber-300')}>
          {isPt ? 'PT' : 'Patient'}
        </span>
        {testMode && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-sm text-muted-foreground">Test Mode</span>
        )}
      </span>
      <Button variant="ghost" size="sm" onClick={logout}>
        Log Out
      </Button>
    </div>
  )
}
