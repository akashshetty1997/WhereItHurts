import { useState } from 'react'
import { CircleAlert, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { visitStore } from '@/visitStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PATIENTS } from '@/scene/patientRegions'
import FacePhotoControl from '@/scene/FacePhotoControl'
import { FACE_PHOTO_ENABLED } from '@/scene/facePhoto'
import { REGIONS, CLINICAL_TERMS } from '@/regions'
import { toTen } from '@/scene/intensity'
import { PAIN_STYLES, PAIN_ICONS } from '@/lib/visitDisplay'
import { cn } from '@/lib/utils'

// Head to toe, so the list reads in the same order as the body.
const BODY_ORDER = ['head', 'neck', 'right_shoulder', 'upper_back', 'lower_back', 'left_leg', 'left_knee']

const COPY = {
  paint: {
    title: 'Before Your Visit',
    hint: 'Click where it hurts, on the body or in this list, then say what it feels like.',
  },
  visit: { title: 'What You Marked', hint: 'Each part lights up when someone talks about it.' },
  ended: { title: 'What You Marked', hint: 'Amber means nobody talked about it.' },
}

// Left sidebar: the goal, then every body part as one grouped list. The list is also the
// keyboard way to select a part (accessibility.md › Mobility: offer alternatives to gestures).
export default function IntakePanel({ visit, mode, missed, selected, onSelectRegion, patient, onPatientChange, canNamePatient, className }) {
  const copy = COPY[mode]
  const painted = new Map(visit.painted.map((p) => [p.region, p]))
  const missedSet = new Set(missed.map((p) => p.region))
  const missedStatus = new Map(missed.map((p) => [p.region, p.coverage]))

  return (
    <aside className={cn('flex min-h-0 flex-col gap-5 border-r border-border p-5', className)}>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold">{copy.title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.hint}</p>
      </div>

      {canNamePatient && mode === 'paint' && <PatientKeyField value={visit.patientKey} />}

      {onPatientChange && mode === 'paint' && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-muted-foreground">Body</span>
          <ToggleGroup
            type="single"
            value={patient}
            onValueChange={(v) => v && onPatientChange(v)}
            className="gap-1 rounded-lg bg-secondary p-1"
            aria-label="Which body to show"
          >
            {Object.entries(PATIENTS).map(([id, p]) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className="h-8 rounded-md px-3 text-sm font-bold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {FACE_PHOTO_ENABLED && onPatientChange && mode === 'paint' && <FacePhotoControl />}

      <GoalSection goal={visit.goal} editable={mode === 'paint'} />

      <section aria-label="Body parts" className="flex min-h-0 flex-1 flex-col gap-2">
        <h3 className="text-sm font-bold text-muted-foreground">Body Parts</h3>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {BODY_ORDER.map((region, i) => {
              const p = painted.get(region)
              const isMissed = missedSet.has(region)
              const isSelected = selected === region
              const Icon = p ? PAIN_ICONS[p.type] : null
              const style = p ? PAIN_STYLES[p.type] : null
              return (
                <li key={region} className={cn(i > 0 && 'border-t border-border')}>
                  <button
                    type="button"
                    onClick={() => onSelectRegion(region)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none',
                      isSelected && 'bg-secondary',
                      isMissed && 'bg-flag/10',
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center" aria-hidden>
                      {isMissed ? (
                        <CircleAlert className="size-5 text-flag" />
                      ) : Icon ? (
                        <Icon className={cn('size-5', style.text)} />
                      ) : (
                        <Plus className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-tight">{REGIONS[region]}</span>
                      <span className="block text-sm text-muted-foreground">
                        {p ? (
                          <>
                            <span className={style.text}>{style.label}</span>
                            {isMissed && (
                              <span className="text-flag">
                                {missedStatus.get(region) === 'pt_asked' ? ' · Asked, no answer' : ' · Not discussed'}
                              </span>
                            )}
                          </>
                        ) : (
                          `${CLINICAL_TERMS[region] ? `${CLINICAL_TERMS[region]} · ` : ''}Not marked`
                        )}
                      </span>
                    </span>
                    {p && (
                      <span className="text-2xl font-bold tabular-nums">
                        {toTen(p.intensity)}
                        <span className="text-sm font-normal text-muted-foreground">/10</span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      </section>
    </aside>
  )
}

// The patient's goal: what they want to be able to do again. Said while recording the prep (right
// panel, src/panels/PrepListen.jsx) or typed here; pinned for the whole visit.
function GoalSection({ goal, editable }) {
  const [editing, setEditing] = useState(false)
  const typing = editable && (!goal?.text || editing)
  return (
    <section aria-label="What you want to do again" className="space-y-2">
      <h3 className="text-sm font-bold text-muted-foreground">Your Goal</h3>
      {goal?.text && !editing ? (
        <p className="text-lg font-bold leading-snug">“{goal.text}”</p>
      ) : (
        <p className="text-sm leading-snug text-muted-foreground">
          What would you like to be able to do again? Say it while recording your prep, or type it.
        </p>
      )}
      {typing && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const value = e.currentTarget.elements.goal.value
            if (value.trim()) visitStore.setGoal(value)
            setEditing(false)
          }}
        >
          <Input
            name="goal"
            defaultValue={editing ? goal?.text : ''}
            placeholder="Type it, then press Return"
            aria-label="Type your goal"
            autoFocus={editing}
          />
        </form>
      )}
      {editable && goal?.text && !editing && (
        <Button variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden />
          Change Goal
        </Button>
      )}
    </section>
  )
}

// Which patient this visit is for: initials or a nickname only (never real patient data), so Past
// Visits can show one patient's visits.
function PatientKeyField({ value }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold text-muted-foreground">Patient</span>
      <Input
        value={value ?? ''}
        onChange={(e) => visitStore.setPatientKey(e.target.value)}
        placeholder="Initials or nickname"
        maxLength={24}
        className="h-9 w-44 text-base"
        aria-label="Patient initials or nickname"
      />
    </label>
  )
}
