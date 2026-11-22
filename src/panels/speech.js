// Live speech, hold-to-talk (docs/PLAN.md → A1).
// While a speaker's button is held, Chrome's speech recognition listens. Each finished sentence
// goes to POST /api/extract and then into the visit store as a segment, which lights the body.

const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export const SPEECH_SUPPORTED = Boolean(SpeechRecognition)
export const SPEECH_LANG = 'en-US'
// Longest wait for /api/extract before the line is added with no regions.
export const EXTRACT_TIMEOUT_MS = 2500

export async function extract(text, speaker) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS)
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, speaker }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`extract ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Start listening for one speaker. Returns a stop function (call it on button release).
 * A fresh recognizer per press, so a quick second press never collides with the first one
 * still finishing its last sentence.
 *
 * handlers.onInterim(text)  words not yet final, while speaking
 * handlers.onSentence(text) each piece Chrome finalizes (it splits at pauses)
 * handlers.onEnd()          listening finished after release; every piece has arrived
 * handlers.onError(code)    'not-allowed' (mic blocked), 'network', ...
 */
export function listen(handlers) {
  const recognition = new SpeechRecognition()
  recognition.lang = SPEECH_LANG
  recognition.continuous = true
  recognition.interimResults = true

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const text = result[0].transcript.trim()
      if (result.isFinal) {
        if (text) handlers.onSentence(text)
      } else {
        interim += `${text} `
      }
    }
    handlers.onInterim(interim.trim())
  }
  recognition.onerror = (event) => {
    // 'no-speech' and 'aborted' are normal for a short press with nothing said.
    if (event.error !== 'no-speech' && event.error !== 'aborted') handlers.onError(event.error)
  }
  recognition.onend = () => handlers.onEnd()
  recognition.start()

  // stop() (not abort()) still delivers the last sentence after the button is released.
  return () => recognition.stop()
}
