import { useState } from 'react'
import BodyScene from './scene/BodyScene'
import { selectRegion } from './scene/bodyApi'
import AppHeader from './panels/AppHeader'
import IntakePanel from './panels/IntakePanel'
import ConversationPanel from './panels/ConversationPanel'
import { useVisit, unmentioned } from './visitStore'

const NEXT_MODE = { paint: 'visit', visit: 'ended', ended: 'paint' }

export default function App() {
  const visit = useVisit()
  const [mode, setMode] = useState('paint') // paint | visit | ended
  const [selected, setSelected] = useState(null)
  const missed = mode === 'ended' ? unmentioned(visit) : []

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-background">
      <AppHeader mode={mode} onAction={() => setMode(NEXT_MODE[mode])} />
      <div className="grid min-h-0 grid-cols-[320px_1fr_360px]">
        {/* The list and the body share one selection: picking either one selects both. */}
        <IntakePanel visit={visit} mode={mode} missed={missed} selected={selected} onSelectRegion={selectRegion} />
        <main className="relative min-h-0 bg-navy-deep">
          <BodyScene onRegionClick={setSelected} mode={mode} />
        </main>
        <ConversationPanel visit={visit} mode={mode} selected={selected} missed={missed} />
      </div>
    </div>
  )
}
