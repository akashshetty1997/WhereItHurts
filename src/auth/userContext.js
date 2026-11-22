// The logged-in user, from AuthGate. useUser() gives { user, logout };
// user.role is 'patient' or 'pt'.
import { createContext, useContext } from 'react'

export const UserContext = createContext({ user: null, logout: () => {} })

export function useUser() {
  return useContext(UserContext)
}
