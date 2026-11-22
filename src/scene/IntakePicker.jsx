import { visitStore } from '../visitStore'
import { regionLabel, PAIN_TYPES } from '../regions'
import { toTen } from './intensity'

// Shown under the body when a region is tapped during intake. Voice fills the same entry;
// these buttons are the fallback when speech fails or the patient prefers to tap.
export default function IntakePicker({ region, entry, listening, onClose }) {
  const intensity = entry ? toTen(entry.intensity) : 5

  const save = (patch) => {
    const painted = visitStore.get().painted.filter((p) => p.region !== region)
    const next = { region, type: entry?.type ?? 'aching', intensity, ...entry, ...patch }
    next.intensity = toTen(next.intensity)
    visitStore.setPainted([...painted, next])
  }

  const remove = () => {
    visitStore.setPainted(visitStore.get().painted.filter((p) => p.region !== region))
    onClose()
  }

  return (
    <div className="intake-picker" onPointerDown={(e) => e.stopPropagation()}>
      <div className="intake-head">
        <b>{regionLabel(region)}</b>
        <button className="intake-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className={`intake-status ${listening ? 'on' : ''}`}>
        {listening ? 'Listening… describe the pain' : 'Speak to describe it, or pick below'}
      </p>
      <div className="intake-types">
        {PAIN_TYPES.map((t) => (
          <button
            key={t}
            className={`legend ${t} ${entry?.type === t ? 'active' : ''}`}
            onClick={() => save({ type: t })}
          >
            {t}
          </button>
        ))}
      </div>
      <label className="intake-rating">
        <span>{entry ? `${intensity}/10` : 'Rate 0–10'}</span>
        <input
          type="range"
          min="0"
          max="10"
          step="1"
          value={intensity}
          onChange={(e) => save({ intensity: Number(e.target.value) })}
        />
      </label>
      {entry?.note && <p className="intake-note">“{entry.note}”</p>}
      {entry && (
        <button className="intake-remove" onClick={remove}>
          Remove
        </button>
      )}
    </div>
  )
}

