import { useState } from 'react'
import BodyScene from './scene/BodyScene'
import AppHeader from './panels/AppHeader'
import IntakePanel from './panels/IntakePanel'
import ConversationPanel from './panels/ConversationPanel'
import { useVisit, unmentioned } from './visitStore'

export default function App() {
  const visit = useVisit()
  const [mode, setMode] = useState('paint') // paint | visit | ended
  const [selected, setSelected] = useState(null)
  const missed = mode === 'ended' ? unmentioned(visit) : []

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-background">
      <AppHeader mode={mode} />
      <div className="grid min-h-0 grid-cols-[300px_1fr_340px]">
        <IntakePanel
          visit={visit}
          mode={mode}
          missed={missed}
          onStart={() => setMode('visit')}
          onEnd={() => setMode('ended')}
          onRestart={() => setMode('paint')}
        />
        <main className="relative min-h-0 bg-navy-deep">
          <BodyScene onRegionClick={setSelected} mode={mode} />
        </main>
        <ConversationPanel visit={visit} mode={mode} selected={selected} missed={missed} />
      </div>
    </div>
  )
}
