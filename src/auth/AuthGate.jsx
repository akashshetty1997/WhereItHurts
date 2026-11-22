// Shows the login/register screen until someone is logged in, then the app.
// Anywhere inside, useUser() from ./userContext gives { user, logout, testMode, setTestMode }.
import { useEffect, useState } from 'react'
import AuthScreen from './AuthScreen'
import { currentUser, logout as endSession } from './authApi'
import { clearSavedVisit, visitStore } from '@/visitStore'
import { resetMovementCheck } from '@/panels/movementLog'
import { readTestMode, saveTestMode } from './testMode'
import { UserContext } from './userContext'
import './auth.css'

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined) // undefined: still checking the saved session
  const [testMode, setTestModeState] = useState(readTestMode)

  function setTestMode(on) {
    setTestModeState(on)
    saveTestMode(on)
  }

  useEffect(() => {
    currentUser().then(setUser)
  }, [])

  async function logout() {
    // The next person to log in starts with an empty visit, not this one.
    clearSavedVisit()
    visitStore.reset()
    resetMovementCheck()
    await endSession()
    setUser(null)
  }

  if (user === undefined) return null
  if (!user) return <AuthScreen onLoggedIn={setUser} testMode={testMode} onTestModeChange={setTestMode} />

  return (
    <UserContext.Provider value={{ user, logout, testMode, setTestMode }}>{children}</UserContext.Provider>
  )
}
