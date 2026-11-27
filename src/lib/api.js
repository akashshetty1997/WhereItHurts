// Calls to the backend's extraction (backend/app/api/routes/extract.py), through the Vite proxy.
//   extract(text, speaker)                    instant: keywords + PT vocabulary
//   extractSmart(text, speaker, context)      a few seconds: Claude, merged on top of keywords
// Both return { regions, path, rating, movement, pain_type, follow_up, corrected_text, goal, source }.

async function post(path, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${path} ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export const EXTRACT_TIMEOUT_MS = 2500
export const SMART_TIMEOUT_MS = 20000 // Claude Code takes ~3–6 s; give it room

/** `region`: during prep, the body part the patient tapped (a sentence naming none describes it). */
export function extract(text, speaker, region = null) {
  return post('/api/extract', { text, speaker, ...(region ? { region } : {}) }, EXTRACT_TIMEOUT_MS)
}

/** `context`: the line said just before (so "About a five." can be read), or an intake hint. */
export function extractSmart(text, speaker, context) {
  return post('/api/extract/smart', { text, speaker, context: context || null }, SMART_TIMEOUT_MS)
}
