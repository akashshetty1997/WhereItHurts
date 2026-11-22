import { useState } from 'react'
import BodyScene from './scene/BodyScene'
import { REGIONS, PAIN_TYPES } from './regions'
import { useVisit, unmentioned } from './visitStore'

export default function App() {
  const visit = useVisit()
  const [mode, setMode] = useState('paint') // paint | visit | ended
  const [selected, setSelected] = useState(null)
  const [painType, setPainType] = useState('aching')

  const mentions = selected ? visit.segments.filter((s) => s.regions.includes(selected)) : []
  const missed = mode === 'ended' ? unmentioned(visit) : []

  return (
    <div className="app">
      <aside className="panel">
        <h1>WhereItHurts</h1>
        <h2>Pain type</h2>
        {[...PAIN_TYPES, 'eraser'].map((t) => (
          <button
            key={t}
            className={`legend ${t} ${painType === t ? 'active' : ''}`}
            disabled={mode !== 'paint'}
            onClick={() => setPainType(t)}
          >
            {t}
          </button>
        ))}
        <p className="hint">Left-click: paint / select · Right-drag: rotate · Scroll: zoom</p>
        <div className="actions">
          {mode === 'paint' && <button onClick={() => setMode('visit')}>Start visit</button>}
          {mode === 'visit' && <button onClick={() => setMode('ended')}>End visit</button>}
          {mode === 'ended' && <button onClick={() => setMode('paint')}>Back to paint</button>}
        </div>
      </aside>

      <main className="stage">
        <BodyScene onRegionClick={setSelected} mode={mode} />
        <div className="mode-tag">{mode} mode</div>
      </main>

      <aside className="panel">
        <h2>Transcript</h2>
        {visit.segments.map((s) => (
          <p key={s.id} style={{ color: visit.speakers[s.speaker].color }}>
            <b>{s.speaker}:</b> {s.text}
          </p>
        ))}

        {selected && (
          <>
            <h2>{REGIONS[selected]} · {mentions.length} mention(s)</h2>
            {mentions.map((s) => <p key={s.id} className="mention">“{s.text}”</p>)}
          </>
        )}

        {mode === 'ended' && (
          <>
            <h2>Catch</h2>
            {missed.length === 0 ? (
              <div className="card ok">Everything you marked came up in the visit.</div>
            ) : (
              missed.map((p) => (
                <div key={p.region} className="card warn">
                  You marked your {REGIONS[p.region].toLowerCase()} ({p.type}), but nobody talked about it.
                </div>
              ))
            )}
          </>
        )}
      </aside>
    </div>
  )
}
