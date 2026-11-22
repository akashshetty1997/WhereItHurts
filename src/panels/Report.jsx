// Printed reports (Summary step): the browser's print dialog saves them as PDF, no extra library.
//   PT Report          for the PT's records: everything marked, said, checked and shown.
//   Take-Home Summary  for the patient: the same visit in plain words and large type.
// The report renders into its own element outside the app (the app shell is a fixed-height
// screen that doesn't print), shown only in print (src/index.css → .print-report).
// A communication record, never a diagnosis: it repeats what was said and done, nothing more.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { REGIONS, regionLabel } from '@/regions'
import { toTen } from '@/scene/intensity'
import { goalDiscussed } from '@/visitStore'
import { ANATOMY_PURPOSE, groupAnatomyNotes } from '@/lib/visitDisplay'
import { describePainArc } from '@/scene/movements'

const CREDIT = 'Anatomy: BodyParts3D, © DBCLS, CC BY 4.0 (reference illustrations, not scans).'
const lower = (region) => REGIONS[region]?.toLowerCase() ?? 'symptom'

function formatDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Opens the print dialog once the report is in the page; onDone when the dialog closes.
export default function Report({ kind, visit, missed, maps, user, onDone }) {
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const done = () => doneRef.current()
    window.addEventListener('afterprint', done)
    // Let the images decode before the dialog takes its snapshot of the page.
    const id = setTimeout(() => window.print(), 150)
    return () => {
      clearTimeout(id)
      window.removeEventListener('afterprint', done)
    }
  }, [])

  const Body = kind === 'pt' ? PtReport : TakeHome
  return createPortal(
    <div className="print-report">
      <Body visit={visit} missed={missed} maps={maps} user={user} />
    </div>,
    document.body,
  )
}

function BodyMaps({ maps, large = false }) {
  if (!maps?.front && !maps?.back) return null
  return (
    <div className="report-maps">
      {['front', 'back'].map((side) =>
        maps[side] ? (
          <figure key={side} className={large ? 'report-map large' : 'report-map'}>
            <img src={maps[side].url} alt={`The body from the ${side}, with the marked pain`} />
            <figcaption>{side === 'front' ? 'Front' : 'Back'}</figcaption>
          </figure>
        ) : null,
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="report-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function PtReport({ visit, missed, maps, user }) {
  const checks = visit.observations ?? []
  const notes = visit.anatomyNotes ?? []
  return (
    <article>
      <header className="report-header">
        <h1>Visit Report</h1>
        <p>
          {formatDate()}
          {user?.role === 'pt' ? ` · PT: ${user.name}` : user?.name ? ` · Patient: ${user.name}` : ''}
        </p>
      </header>

      <Section title="Goal">
        {visit.goal?.text ? (
          <p>
            “{visit.goal.text}” · {goalDiscussed(visit) ? 'came up in the visit' : 'did not come up in the visit'}
          </p>
        ) : (
          <p>Not set.</p>
        )}
      </Section>

      <BodyMaps maps={maps} />

      <Section title="Marked Pain (Before the Visit)">
        {visit.painted.length ? (
          <table>
            <thead>
              <tr>
                <th>Where</th>
                <th>Feels</th>
                <th>Rating</th>
                <th>Patient’s words</th>
              </tr>
            </thead>
            <tbody>
              {visit.painted.map((p) => (
                <tr key={p.region}>
                  <td>{regionLabel(p.region)}</td>
                  <td>{p.type}</td>
                  <td>{toTen(p.intensity)}/10</td>
                  <td>{p.note ? `“${p.note}”` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Nothing marked.</p>
        )}
        {Object.entries(visit.painArcs ?? {}).map(([region, arc]) => (
          <p key={region}>{describePainArc(region, arc)} (marked in the movement simulation).</p>
        ))}
      </Section>

      <Section title="Movement Checks">
        {checks.length ? (
          <table>
            <thead>
              <tr>
                <th>Movement</th>
                <th>Area tested</th>
                <th>Symptom</th>
                <th>Before → after</th>
                <th>Patient confirmed</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((o) => (
                <tr key={o.id}>
                  <td>{o.movement || '—'}</td>
                  <td>{REGIONS[o.assessedRegion] ?? '—'}</td>
                  <td>{REGIONS[o.symptomRegion] ?? '—'}</td>
                  <td>
                    {o.before ?? '–'} → {o.after ?? '–'}
                    {o.response ? ` (${o.response})` : ''}
                  </td>
                  <td>{o.confirmed === true ? 'Yes' : o.confirmed === false ? 'No, disagrees' : 'Not asked'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>None recorded.</p>
        )}
      </Section>

      {notes.length > 0 && (
        <Section title="Anatomy Shown">
          {groupAnatomyNotes(notes).map(([region, items]) => (
            <div key={region} className="report-group">
              <h3>For the {lower(region)}</h3>
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <b>{n.structure.label}</b> ({n.structure.anatomical}), {ANATOMY_PURPOSE[n.purpose] ?? n.purpose}
                    {n.note && <>: “{n.note}”</>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      <Section title="Not Discussed">
        {missed.length ? (
          <p className="report-flag">
            Marked but never talked about: {missed.map((p) => `${REGIONS[p.region]} (${p.type}, ${toTen(p.intensity)}/10)`).join('; ')}
          </p>
        ) : (
          <p>Everything marked came up.</p>
        )}
      </Section>

      <Section title="Follow-Ups">
        {visit.followUps.length ? (
          <ul>
            {visit.followUps.map((f) => (
              <li key={f.id ?? f.text}>{f.text}</li>
            ))}
          </ul>
        ) : (
          <p>None.</p>
        )}
      </Section>

      <footer className="report-footer">
        <p>A record of what the patient marked and said and what the PT chose to check. Not a diagnosis.</p>
        {notes.length > 0 && <p>{CREDIT}</p>}
      </footer>
    </article>
  )
}

function TakeHome({ visit, missed, maps }) {
  const checks = (visit.observations ?? []).filter((o) => o.before != null && o.after != null)
  const notes = visit.anatomyNotes ?? []
  return (
    <article className="take-home">
      <header className="report-header">
        <h1>Your Visit</h1>
        <p>{formatDate()}</p>
      </header>

      {visit.goal?.text && (
        <Section title="What You Want to Do Again">
          <p>“{visit.goal.text}”</p>
        </Section>
      )}

      <Section title="Where It Hurt">
        {visit.painted.length ? (
          <ul>
            {visit.painted.map((p) => (
              <li key={p.region}>
                <b>{REGIONS[p.region]}</b>: {p.type}, {toTen(p.intensity)} out of 10
                {p.note && <> · you said “{p.note}”</>}
              </li>
            ))}
          </ul>
        ) : (
          <p>You didn’t mark anything.</p>
        )}
      </Section>

      <BodyMaps maps={maps} large />

      {checks.length > 0 && (
        <Section title="What Changed">
          <ul>
            {checks.map((o) => (
              <li key={o.id}>
                {o.movement ? `When you did “${o.movement}”, your` : 'Your'} {lower(o.symptomRegion)} went from {o.before} to{' '}
                {o.after} out of 10.
              </li>
            ))}
          </ul>
        </Section>
      )}

      {notes.length > 0 && (
        <Section title="What Your PT Showed You">
          <ul>
            {notes.map((n) => (
              <li key={n.id}>
                <b>{n.structure.label}</b>
                {n.structure.sentence ? `: ${n.structure.sentence}` : ` (${n.structure.anatomical})`}
                {n.note && <> Your PT noted: “{n.note}”</>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {missed.length > 0 && (
        <Section title="Bring This Up Next Time">
          <p className="report-flag">
            You marked your {missed.map((p) => lower(p.region)).join(' and ')}, but it didn’t come up in this visit.
          </p>
        </Section>
      )}

      {visit.followUps.length > 0 && (
        <Section title="Next Steps">
          <ul>
            {visit.followUps.map((f) => (
              <li key={f.id ?? f.text}>{f.text}</li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="report-footer">
        <p>This is a record of what you and your PT said. It is not a diagnosis.</p>
        {notes.length > 0 && <p>{CREDIT}</p>}
      </footer>
    </article>
  )
}
