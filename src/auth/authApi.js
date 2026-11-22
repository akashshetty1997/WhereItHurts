// Calls to the backend's /api/auth routes. The session token is kept in localStorage so a
// reload stays logged in; it's sent as `Authorization: Bearer <token>`.

const TOKEN_KEY = 'whereithurts.token'

export const ROLES = [
  { id: 'patient', label: 'Patient' },
  { id: 'pt', label: 'Physical therapist' },
]
export const PASSWORD_MIN_CHARS = 8 // backend/app/constants.py PASSWORD_MIN_CHARS

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private window or blocked storage: the session just won't survive a reload.
  }
}

const UNREACHABLE = 'Server not reachable. Is the backend running?'

async function call(path, { body, token } = {}) {
  let res
  try {
    res = await fetch(`/api/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error(UNREACHABLE)
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errorMessage(res.status, data))
  return data
}

// FastAPI sends `detail` as a string, or as a list of field errors (422).
function errorMessage(status, data) {
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail) && data.detail.length) {
    const first = data.detail[0]
    const field = first.loc?.at(-1)
    return field ? `${field}: ${first.msg.replace(/^Value error, /, '')}` : first.msg
  }
  return status >= 500 ? UNREACHABLE : `Error ${status}`
}

export async function register(fields) {
  const session = await call('register', { body: fields })
  writeToken(session.token)
  return session.user
}

export async function login(email, password) {
  const session = await call('login', { body: { email, password } })
  writeToken(session.token)
  return session.user
}

/** The logged-in user for the saved token, or null. */
export async function currentUser() {
  const token = readToken()
  if (!token) return null
  try {
    return await call('me', { token })
  } catch {
    writeToken(null)
    return null
  }
}

export async function logout() {
  const token = readToken()
  writeToken(null)
  if (token) await call('logout', { body: {}, token }).catch(() => {})
}
