// Log in / Register. Accounts live in the backend (POST /api/auth/register and /login).
import { useState } from 'react'
import { PASSWORD_MIN_CHARS, ROLES, login, register } from './authApi'

export default function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login') // login | register
  const [fields, setFields] = useState({ name: '', email: '', password: '', role: 'patient' })
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
      <form className="auth-card" onSubmit={submit}>
        <h1>WhereItHurts</h1>
        <p className="auth-tagline">Show where it hurts. Leave with nothing unsaid.</p>

        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchTo('login')}>
            Log in
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

        {error && <div className="card warn">{error}</div>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}
        </button>
        <p className="auth-note">Demo accounts only. Never enter real health information.</p>
      </form>
    </main>
  )
}
