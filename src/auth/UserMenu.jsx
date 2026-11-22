// Who's logged in (name + role) and Log out, for the app header.
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUser } from './userContext'

export default function UserMenu() {
  const { user, logout } = useUser()
  if (!user) return null
  const isPt = user.role === 'pt'
  return (
    <div className="flex items-center gap-2 border-l border-border pl-4">
      <span className="text-sm">
        {user.name}
        <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs', isPt ? 'bg-sky-400/15 text-sky-300' : 'bg-amber-400/15 text-amber-300')}>
          {isPt ? 'PT' : 'Patient'}
        </span>
      </span>
      <Button variant="ghost" size="sm" onClick={logout}>
        Log out
      </Button>
    </div>
  )
}
