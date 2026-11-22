// Hold-to-speak for one sentence outside the visit (intake: a body part, the goal).
// start() on press, stop() on release; onText(text) gets everything said during the hold.
// Uses the same Chrome speech recognition as LiveSpeech (./speech.js).
import { useCallback, useEffect, useRef, useState } from 'react'
import { SPEECH_SUPPORTED, listen } from './speech'

const ERRORS = {
  'not-allowed': 'Microphone is blocked. Allow it in the address bar, then try again.',
  'audio-capture': 'No microphone found.',
  network: 'Speech recognition needs an internet connection.',
}

export function useHoldToSpeak(onText) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)
  const stopRef = useRef(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const start = useCallback(() => {
    if (stopRef.current || !SPEECH_SUPPORTED) return
    setError(null)
    setListening(true)
    const parts = []
    const stop = listen({
      onInterim: (words) => setInterim([...parts, words].join(' ').trim()),
      onSentence: (text) => {
        parts.push(text)
        setInterim(parts.join(' '))
      },
      onEnd: () => {
        setInterim('')
        setListening(false)
        if (stopRef.current === stop) stopRef.current = null
        if (parts.length) onTextRef.current(parts.join(' '))
      },
      onError: (code) => setError(ERRORS[code] ?? `Speech error: ${code}`),
    })
    stopRef.current = stop
  }, [])

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
  }, [])

  useEffect(() => () => stopRef.current?.(), [])

  return { listening, interim, error, start, stop, supported: SPEECH_SUPPORTED }
}
