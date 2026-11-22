// Log in / Register. Accounts live in the backend (POST /api/auth/register and /login).
import { useState } from 'react'
import ThemeMenu from './ThemeMenu'
import { DEMO_GUEST, UNREACHABLE, PASSWORD_MIN_CHARS, ROLES, login, register } from './authApi'

// Which 3D patient the app shows for this account (backend: constants.GENDERS).
const GENDERS = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
]

export default function AuthScreen({ onLoggedIn, testMode, onTestModeChange }) {
  const [mode, setMode] = useState('login') // login | register
  const [fields, setFields] = useState({ name: '', email: '', password: '', role: 'patient', gender: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user =
        mode === 'register' ? await register(fields) : await login(fields.email, fields.password)
      onLoggedIn(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function switchTo(next) {
    setMode(next)
    setError(null)
  }

  return (
    <main className="auth">
      <ThemeMenu className="auth-theme" />
      <form className="auth-card" onSubmit={submit}>
        <h1>WhereItHurts</h1>
        <p className="auth-tagline">Show where it hurts. Say what it feels like.</p>

        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchTo('login')}>
            Log In
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchTo('register')}>
            Register
          </button>
        </div>

        {mode === 'register' && (
          <>
            <fieldset className="auth-roles">
              <legend>I am a</legend>
              {ROLES.map((r) => (
                <label key={r.id} className={fields.role === r.id ? 'on' : ''}>
                  <input type="radio" name="role" value={r.id} checked={fields.role === r.id} onChange={set('role')} />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <fieldset className="auth-roles">
              <legend>{fields.role === 'pt' ? 'Patient body to show' : 'My body in 3D'}</legend>
              {GENDERS.map((g) => (
                <label key={g.id} className={fields.gender === g.id ? 'on' : ''}>
                  <input
                    type="radio"
                    name="gender"
                    value={g.id}
                    checked={fields.gender === g.id}
                    onChange={set('gender')}
                    required
                  />
                  {g.label}
                </label>
              ))}
            </fieldset>
            <label>
              Name
              <input value={fields.name} onChange={set('name')} autoComplete="name" required />
            </label>
          </>
        )}

        <label>
          Email
          <input type="email" value={fields.email} onChange={set('email')} autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={fields.password}
            onChange={set('password')}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={mode === 'register' ? PASSWORD_MIN_CHARS : undefined}
            required
          />
          {mode === 'register' && <small>At least {PASSWORD_MIN_CHARS} characters</small>}
        </label>

        <label className="auth-test-mode">
          <input type="checkbox" checked={testMode} onChange={(e) => onTestModeChange(e.target.checked)} />
          <span>
            Testing mode
            <small>Act as both the patient and the PT (both talk buttons)</small>
          </span>
        </label>

        {error && (
          <p role="alert" className="auth-error">
            {error === UNREACHABLE
              ? 'The WhereItHurts server isn’t running here. Live listening and accounts run on the demo laptop.'
              : error}
          </p>
        )}
        {error === UNREACHABLE && (
          <button type="button" className="auth-submit auth-demo" onClick={() => onLoggedIn(DEMO_GUEST)}>
            Try the Demo
          </button>
        )}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'register' ? 'Create Account' : 'Log In'}
        </button>
        <p className="auth-note">Demo accounts only. Never enter real health information.</p>
      </form>
    </main>
  )
}
