// Live listening: the mic streams to the backend (WebSocket /api/live), which works out who is
// speaking (after a one-sentence enrollment each) and sends back each sentence as a segment.
//
// The audio is captured at 16 kHz (the browser resamples the mic) and sent as 16-bit PCM in
// 100 ms chunks, the format backend/app/api/routes/live.py expects.

export const LIVE_SAMPLE_RATE = 16000
const CHUNK_SAMPLES = 1600 // 100 ms
export const FLUSH_WAIT_MS = 1500 // on stop, how long to wait for the last sentence

const WORKLET = `
class PcmSender extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(${CHUNK_SAMPLES}); this.n = 0; this.sum = 0 }
  process(inputs) {
    const ch = inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]))
      this.sum += s * s
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.n === this.buf.length) {
        this.port.postMessage({ pcm: this.buf.buffer, level: Math.sqrt(this.sum / this.n) }, [this.buf.buffer])
        this.buf = new Int16Array(${CHUNK_SAMPLES}); this.n = 0; this.sum = 0
      }
    }
    return true
  }
}
registerProcessor('pcm-sender', PcmSender)
`

function liveUrl(mode) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/api/live${mode === 'prep' ? '?mode=prep' : ''}`
}

/**
 * Open the mic and the live connection. Returns { enroll(speaker), setRegion(region), stop() }.
 * handlers.mode            'visit' (default: enroll both voices) or 'prep' (patient only)
 * handlers.onEvent(event)  every message from the server (ready, enrolling, enrolled,
 *                          enroll_retry, segment, error); see routes/live.py
 * handlers.onLevel(0..1)   mic loudness, ~10 times a second
 * handlers.onClose()       the connection ended (server gone, or after stop())
 * Throws if the mic can't be opened (permission denied, no mic).
 */
export async function startLive(handlers) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const context = new AudioContext({ sampleRate: LIVE_SAMPLE_RATE })
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
  await context.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)
  const source = context.createMediaStreamSource(stream)
  const sender = new AudioWorkletNode(context, 'pcm-sender')
  source.connect(sender)

  const ws = new WebSocket(liveUrl(handlers.mode))
  ws.binaryType = 'arraybuffer'
  let waitingForLast = null

  sender.port.onmessage = ({ data }) => {
    handlers.onLevel?.(Math.min(1, data.level * 6))
    if (ws.readyState === WebSocket.OPEN) ws.send(data.pcm)
  }
  ws.onmessage = ({ data }) => {
    const event = JSON.parse(data)
    handlers.onEvent(event)
    if (event.type === 'segment') waitingForLast?.()
  }
  ws.onclose = () => {
    release()
    handlers.onClose?.()
  }

  let released = false
  function release() {
    if (released) return
    released = true
    sender.port.onmessage = null
    source.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    context.close()
  }

  return {
    enroll(speaker) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'enroll', speaker }))
    },
    /** Prep: the region the patient tapped (null to clear); a sentence naming none describes it. */
    setRegion(region) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'region', region }))
    },
    /** Finish the sentence being spoken, wait briefly for it, then close everything. */
    async stop() {
      release()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'flush' }))
        await new Promise((resolve) => {
          waitingForLast = resolve
          setTimeout(resolve, FLUSH_WAIT_MS)
        })
      }
      ws.close()
    },
  }
}
