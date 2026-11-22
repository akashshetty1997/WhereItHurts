// Shows the login/register screen until someone is logged in, then the app.
// Anywhere inside, useUser() from ./userContext gives { user, logout }.
import { useEffect, useState } from 'react'
import AuthScreen from './AuthScreen'
import { currentUser, logout as endSession } from './authApi'
import { UserContext } from './userContext'
import './auth.css'

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined) // undefined: still checking the saved session

  useEffect(() => {
    currentUser().then(setUser)
  }, [])

  async function logout() {
    await endSession()
    setUser(null)
  }

  if (user === undefined) return null
  if (!user) return <AuthScreen onLoggedIn={setUser} />

  return (
    <UserContext.Provider value={{ user, logout }}>{children}</UserContext.Provider>
  )
}
