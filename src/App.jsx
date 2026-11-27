import { useEffect, useRef, useState } from 'react'
import BodyScene from './scene/BodyScene'
import { selectRegion, playMovement, focus, showStructure, home, bodyState, onManualView } from './scene/bodyApi'
import { createAutoFollow } from './scene/autoFollow'
import { autoFollowState } from './scene/autoFollowState'
import { spokenMovement } from './lib/spokenMovement'
import AppHeader from './panels/AppHeader'
import IntakePanel from './panels/IntakePanel'
import ConversationPanel from './panels/ConversationPanel'
import { visitStore, useVisit, unmentioned, loadSession, saveSession } from './visitStore'
import { onLine, onLineUpdate, resetMovementCheck } from './panels/movementLog'
import { useUser } from './auth/userContext'
import { PATIENTS, DEFAULT_PATIENT } from './scene/patientRegions'

const NEXT_MODE = { paint: 'visit', visit: 'ended', ended: 'paint' }
const MODES = Object.keys(NEXT_MODE)

export default function App() {
  const visit = useVisit()
  // A refresh comes back to the same step and body (src/visitStore.js keeps the visit itself).
  const [saved] = useState(loadSession)
  const [mode, setMode] = useState(MODES.includes(saved.mode) ? saved.mode : 'paint') // paint | visit | ended
  const [selected, setSelected] = useState(null)
  const { user, testMode } = useUser()
  // The 3D patient matches the gender the account registered with. A PT (or Testing mode) can
  // switch, since they may be looking at someone else's body.
  const [patient, setPatient] = useState(
    PATIENTS[saved.patient] ? saved.patient : PATIENTS[user?.gender] ? user.gender : DEFAULT_PATIENT,
  )
  const canSwitchBody = user?.role === 'pt' || testMode
  // Show Anatomy is a PT tool (Testing mode shows it to anyone).
  const canShowAnatomy = user?.role === 'pt' || testMode
  useEffect(() => saveSession({ mode, patient }), [mode, patient])
  // Every conversation line feeds the movement check (PT names a movement, patient rates it), and
  // so does what Claude adds to a line afterwards (src/panels/smartPass.js).
  useEffect(() => visitStore.onSegment(onLine), [])
  useEffect(() => visitStore.onSegmentUpdate(onLineUpdate), [])
  // During the visit, a movement the PT asks for ("Raise your right arm", "Turn your head to the
  // left", "Bend your knee") plays on the body, once per line (the smart pass may add the movement
  // to a line a few seconds later).
  const modeRef = useRef(mode)
  modeRef.current = mode
  useEffect(() => {
    const played = new Set()
    const check = (segment) => {
      if (modeRef.current !== 'visit' || played.has(segment.id)) return
      const asked = spokenMovement(segment)
      if (!asked) return
      played.add(segment.id)
      playMovement(asked.region, `PT asked: “${segment.text}”`, asked.direction)
    }
    const offNew = visitStore.onSegment(check)
    const offUpdate = visitStore.onSegmentUpdate(check)
    return () => {
      offNew()
      offUpdate()
    }
  }, [])
  // Auto-follow: while the PT explains, the camera goes to the body part (or, for a PT, the
  // anatomy structure) being talked about (src/scene/autoFollow.js). Lines that start a movement
  // simulation are left to the effect above.
  const canAnatomyRef = useRef(canShowAnatomy)
  canAnatomyRef.current = canShowAnatomy
  useEffect(() => {
    const director = createAutoFollow(
      { focus, showStructure, home, state: bodyState },
      {
        isVisit: () => modeRef.current === 'visit',
        isOn: () => autoFollowState.get().on,
        canAnatomy: () => canAnatomyRef.current,
        onStatus: (target) => autoFollowState.set({ status: target?.label ?? null }),
      },
    )
    const line = (segment) => !spokenMovement(segment) && director.line(segment)
    const offs = [visitStore.onSegment(line), visitStore.onSegmentUpdate(line), onManualView(() => director.manual())]
    return () => {
      offs.forEach((off) => off())
      director.stop()
    }
  }, [])
  useEffect(() => {
    if (mode !== 'visit') autoFollowState.set({ status: null })
  }, [mode])
  const missed = mode === 'ended' ? unmentioned(visit) : []

  function newVisit() {
    visitStore.reset()
    resetMovementCheck()
    setSelected(null)
    setMode('paint')
  }

  return (
    <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] overflow-hidden bg-background">
      <AppHeader mode={mode} onAction={() => setMode(NEXT_MODE[mode])} onNewVisit={newVisit} />
      <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)_360px]">
        {/* The list and the body share one selection: picking either one selects both. */}
        <IntakePanel
          visit={visit}
          mode={mode}
          missed={missed}
          selected={selected}
          onSelectRegion={selectRegion}
          patient={patient}
          onPatientChange={canSwitchBody ? setPatient : null}
        />
        <main className="relative min-h-0 min-w-0 overflow-hidden bg-stage text-foreground">
          <BodyScene
            key={patient}
            patient={patient}
            onRegionClick={setSelected}
            mode={mode}
            canShowAnatomy={canShowAnatomy}
          />
        </main>
        <ConversationPanel visit={visit} mode={mode} selected={selected} missed={missed} />
      </div>
    </div>
  )
}
