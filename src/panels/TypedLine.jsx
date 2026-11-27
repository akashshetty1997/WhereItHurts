// Type a line instead of saying it: for when the mic or the server isn't working, or the room is
// too loud. A typed line goes through the same path as a spoken one:
//   prep  (mode 'paint'): the patient's sentence marks pain and sets the goal (PrepListen's rules)
//   visit (mode 'visit'): PT or Patient line → /api/extract → transcript → smart pass
// If the server can't be reached, a visit line is still added (marked as typed) and the body
// parts can be tagged on the line by tapping (ConversationPanel → TagRegions).
import { useEffect, useRef, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { extract } from '@/lib/api'
import { onRegionClick } from '@/scene/bodyApi'
import { cn } from '@/lib/utils'
import { visitStore } from '../visitStore'
import { applyPrep, askClaude, unplaced } from './prepLine'
import { addFollowUpFrom, refineLine } from './smartPass'

const OFFLINE_VISIT = 'Added without the server. Tap Tag Body Part on the line to light it up.'
const OFFLINE_PREP = 'Can’t reach the server. Tap the body part on the body to mark it, and type your goal above.'

const SPEAKERS = [
  { id: 'pt', label: 'PT', on: 'bg-background text-pt shadow-sm' },
  { id: 'patient', label: 'Patient', on: 'bg-background text-patient shadow-sm' },
]

let typedCount = 0
const typedId = () => `typed-${Date.now().toString(36)}-${++typedCount}`

async function addVisitLine(text, speaker) {
  const previous = visitStore.get().segments.at(-1)?.text
  let found = null
  try {
    found = await extract(text, speaker)
  } catch {
    // Server unreachable: the line still goes in, with no body parts.
  }
  const segment = {
    id: typedId(),
    speaker,
    start: null,
    end: null,
    text,
    regions: found?.regions ?? [],
    path: found?.path ?? [],
    rating: found?.rating ?? null,
    movement: found?.movement ?? null,
    typed: true,
  }
  visitStore.addSegment(segment)
  if (!found) return OFFLINE_VISIT
  addFollowUpFrom(segment, found.follow_up)
  refineLine(segment, previous) // Claude improves the line in the background, as for speech
  return null
}

async function addPrepLine(text, tapped) {
  let found
  try {
    found = await extract(text, 'patient', tapped)
  } catch {
    return OFFLINE_PREP
  }
  const understood = applyPrep(found, found.regions ?? [], text)
  if (understood) return `Got it: ${understood}`
  try {
    const smart = await askClaude(text)
    const placed = applyPrep(smart, smart.regions ?? [], text)
    return placed ? `Got it: ${placed}` : unplaced(text)
  } catch {
    return unplaced(text)
  }
}

export default function TypedLine({ mode }) {
  const prep = mode === 'paint'
  const [text, setText] = useState('')
  const [speaker, setSpeaker] = useState('pt')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const tapped = useRef(null)
  const input = useRef(null)

  // Prep: a tapped body part is the one a sentence describes when it names none.
  useEffect(() => (prep ? onRegionClick((region) => (tapped.current = region)) : undefined), [prep])

  async function send(e) {
    e.preventDefault()
    const clean = text.trim()
    if (!clean || busy) return
    setBusy(true)
    setNote(null)
    setText('')
    try {
      setNote(prep ? await addPrepLine(clean, tapped.current) : await addVisitLine(clean, speaker))
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  return (
    <form onSubmit={send} className="space-y-2" aria-label={prep ? 'Type your prep' : 'Type a line'}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-muted-foreground">{prep ? 'Or type it' : 'Or type a line'}</span>
        {!prep && (
          <div role="radiogroup" aria-label="Who is speaking" className="flex rounded-lg bg-secondary p-0.5">
            {SPEAKERS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={speaker === s.id}
                onClick={() => setSpeaker(s.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  speaker === s.id ? s.on : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={prep ? 'My right shoulder aches, about a five.' : speaker === 'pt' ? 'How is the shoulder today?' : 'About a five.'}
          aria-label={prep ? 'Where it hurts, or your goal' : `What the ${speaker === 'pt' ? 'PT' : 'patient'} said`}
          maxLength={500}
          className="h-11 text-base"
        />
        <Button type="submit" className="h-11 gap-1.5 font-bold" disabled={busy || !text.trim()}>
          <SendHorizontal className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {note && (
        <p className="text-sm leading-snug text-muted-foreground" aria-live="polite">
          {note}
        </p>
      )}
    </form>
  )
}
