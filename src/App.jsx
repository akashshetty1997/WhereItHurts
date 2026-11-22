import { useState } from 'react'
import BodyScene from './scene/BodyScene'
import AppHeader from './panels/AppHeader'
import IntakePanel from './panels/IntakePanel'
import ConversationPanel from './panels/ConversationPanel'
import { useVisit, unmentioned } from './visitStore'
import { DEFAULT_PATIENT } from './scene/patientRegions'

export default function App() {
  const visit = useVisit()
  const [mode, setMode] = useState('paint') // paint | visit | ended
  const [selected, setSelected] = useState(null)
  const [patient, setPatient] = useState(DEFAULT_PATIENT) // which body is shown: male | female
  const missed = mode === 'ended' ? unmentioned(visit) : []

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-background">
      <AppHeader mode={mode} />
      <div className="grid min-h-0 grid-cols-[300px_1fr_340px]">
        <IntakePanel
          visit={visit}
          mode={mode}
          missed={missed}
          patient={patient}
          onPatientChange={setPatient}
          onStart={() => setMode('visit')}
          onEnd={() => setMode('ended')}
          onRestart={() => setMode('paint')}
        />
        <main className="relative min-h-0 bg-navy-deep">
          <BodyScene key={patient} patient={patient} onRegionClick={setSelected} mode={mode} />
        </main>
        <ConversationPanel visit={visit} mode={mode} selected={selected} missed={missed} />
      </div>
    </div>
  )
}
