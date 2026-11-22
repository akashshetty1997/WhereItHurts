import { useEffect, useState } from 'react'
import BodyScene from './scene/BodyScene'
import { selectRegion } from './scene/bodyApi'
import AppHeader from './panels/AppHeader'
import IntakePanel from './panels/IntakePanel'
import ConversationPanel from './panels/ConversationPanel'
import { visitStore, useVisit, unmentioned } from './visitStore'
import { onLine } from './panels/movementLog'
import { useUser } from './auth/userContext'
import { PATIENTS, DEFAULT_PATIENT } from './scene/patientRegions'

const NEXT_MODE = { paint: 'visit', visit: 'ended', ended: 'paint' }

export default function App() {
  const visit = useVisit()
  const [mode, setMode] = useState('paint') // paint | visit | ended
  const [selected, setSelected] = useState(null)
  const { user, testMode } = useUser()
  // The 3D patient matches the gender the account registered with. A PT (or Testing mode) can
  // switch, since they may be looking at someone else's body.
  const [patient, setPatient] = useState(PATIENTS[user?.gender] ? user.gender : DEFAULT_PATIENT)
  const canSwitchBody = user?.role === 'pt' || testMode
  // Every conversation line feeds the movement check (PT names a movement, patient rates it).
  useEffect(() => visitStore.onSegment(onLine), [])
  const missed = mode === 'ended' ? unmentioned(visit) : []

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-background">
      <AppHeader mode={mode} onAction={() => setMode(NEXT_MODE[mode])} />
      <div className="grid min-h-0 grid-cols-[320px_1fr_360px]">
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
        <main className="dark relative min-h-0 bg-stage">
          <BodyScene key={patient} patient={patient} onRegionClick={setSelected} mode={mode} />
        </main>
        <ConversationPanel visit={visit} mode={mode} selected={selected} missed={missed} />
      </div>
    </div>
  )
}
