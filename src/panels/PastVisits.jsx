// Past Visits (PT and Testing mode): finished visits kept in this browser (src/lib/history.js),
// newest first, filtered by patient. Opening one shows it read-only: body marks, summary, reports.
import { useEffect, useRef, useState } from 'react'
import { CircleAlert, History, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { REGIONS } from '@/regions'
import { unmentioned } from '@/visitStore'
import { deleteVisit, listVisits } from '@/lib/history'
import { formatVisitDate } from '@/lib/visitDisplay'
import { cn } from '@/lib/utils'

const ALL = '__all__'

export default function PastVisits({ ownerId, onOpen, onClose }) {
  const [visits, setVisits] = useState(() => listVisits(ownerId))
  const patients = [...new Set(visits.map((r) => r.patientKey).filter(Boolean))].sort()
  const [patient, setPatient] = useState(ALL)
  const shown = patient === ALL ? visits : visits.filter((r) => r.patientKey === patient)
  const dialog = useRef(null)

  useEffect(() => {
    dialog.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function remove(record) {
    if (!window.confirm(`Delete the visit from ${formatVisitDate(record.endedAt)}? This can’t be undone.`)) return
    deleteVisit(record.id)
    setVisits(listVisits(ownerId))
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="past-visits-title"
        className="flex max-h-[85dvh] w-full max-w-xl flex-col gap-4 rounded-2xl bg-card p-5 shadow-xl ring-1 ring-border focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="past-visits-title" className="flex items-center gap-2 text-xl font-bold">
            <History className="size-5" aria-hidden /> Past Visits
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-5" aria-hidden />
          </Button>
        </div>

        {patients.length > 0 && (
          <label className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
            Patient
            <select
              value={patient}
              onChange={(e) => setPatient(e.target.value)}
              className="h-9 rounded-lg bg-secondary px-2 text-base font-normal text-foreground"
            >
              <option value={ALL}>All patients</option>
              {patients.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}

        {shown.length === 0 ? (
          <p className="text-base text-muted-foreground">
            No past visits yet. When a visit ends and you start a new one, it’s kept here on this computer.
          </p>
        ) : (
          <ul className="-mx-1 min-h-0 space-y-2 overflow-y-auto px-1">
            {shown.map((record) => {
              const v = record.visit
              const missed = unmentioned(v)
              return (
                <li key={record.id} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(record)}
                    className="min-w-0 flex-1 rounded-xl bg-secondary/60 p-3 text-left ring-1 ring-transparent hover:ring-border focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-bold">{formatVisitDate(record.endedAt ?? v.startedAt)}</span>
                      {record.patientKey && <span className="text-sm text-muted-foreground">Patient: {record.patientKey}</span>}
                    </span>
                    <span className="block text-sm leading-snug">
                      {v.painted?.length ? v.painted.map((p) => REGIONS[p.region] ?? p.region).join(', ') : 'Nothing marked'}
                      {v.goal?.text && <span className="text-muted-foreground"> · Goal: “{v.goal.text}”</span>}
                    </span>
                    {missed.length > 0 && (
                      <span className={cn('mt-1 flex items-center gap-1.5 text-sm font-bold text-flag')}>
                        <CircleAlert className="size-4" aria-hidden />
                        Missed: {missed.map((p) => REGIONS[p.region] ?? p.region).join(', ')}
                      </span>
                    )}
                  </button>
                  <Button variant="ghost" size="icon" className="h-auto" onClick={() => remove(record)} aria-label="Delete this visit">
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
