// The logged-in user, from AuthGate. useUser() gives:
//   user          { id, name, email, role: 'patient' | 'pt' }
//   logout()
//   testMode      true: act as both patient and PT (both talk buttons), for testing alone
//   setTestMode(on)
import { createContext, useContext } from 'react'

export const UserContext = createContext({
  user: null,
  logout: () => {},
  testMode: false,
  setTestMode: () => {},
})

export function useUser() {
  return useContext(UserContext)
}
