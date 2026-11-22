import { ScrollArea } from '@/components/ui/scroll-area'
import { regionLabel, REGIONS } from '@/regions'
import { toTen } from '@/scene/intensity'
import { SPEAKER_NAMES, SPEAKER_TEXT } from '@/lib/visitDisplay'
import { cn } from '@/lib/utils'
import LiveSpeech from './LiveSpeech'

// Right panel: the conversation, what was said about a tapped region, and the end-of-visit check.
export default function ConversationPanel({ visit, mode, selected, missed }) {
  const mentions = selected ? visit.segments.filter((s) => s.regions.includes(selected)) : []

  return (
    <aside className="flex min-h-0 flex-col gap-5 border-l border-border p-5">
      {mode === 'visit' && <LiveSpeech />}

      {mode === 'ended' && (
        <section className="space-y-2" aria-label="End of visit check">
          <h2 className="text-lg font-bold">Did everything come up?</h2>
          {missed.length === 0 ? (
            <p className="rounded-xl bg-clear/10 p-4 text-base text-clear ring-1 ring-clear/40">
              Everything you marked came up in the visit.
            </p>
          ) : (
            missed.map((p) => (
              <p key={p.region} className="rounded-xl bg-flag/10 p-4 text-base leading-snug ring-1 ring-flag/60">
                You marked your <b className="text-flag">{REGIONS[p.region].toLowerCase()}</b> ({p.type},{' '}
                {toTen(p.intensity)}/10), but nobody talked about it.
              </p>
            ))
          )}
        </section>
      )}

      {selected && (
        <section className="space-y-2 rounded-xl bg-secondary/60 p-4" aria-label="Mentions of the selected region">
          <h2 className="font-bold">{regionLabel(selected)}</h2>
          {mentions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has talked about this yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {mentions.map((s) => (
                <li key={s.id} className="text-sm leading-snug">
                  <span className={cn('font-bold', SPEAKER_TEXT[s.speaker])}>{SPEAKER_NAMES[s.speaker]}: </span>
                  {s.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <h2 className="text-lg font-bold">Conversation</h2>
      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        {visit.segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lines appear here as the PT and patient talk.</p>
        ) : (
          <ol className="space-y-3">
            {visit.segments.map((s) => (
              <li key={s.id} className="leading-snug">
                <span className={cn('block text-sm font-bold', SPEAKER_TEXT[s.speaker])}>
                  {SPEAKER_NAMES[s.speaker] ?? s.speaker}
                </span>
                <span className="text-base">{s.text}</span>
              </li>
            ))}
          </ol>
        )}
      </ScrollArea>
    </aside>
  )
}
