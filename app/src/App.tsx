import { useState } from 'react'
import { Commuter } from './screens/Commuter'
import { Driver } from './screens/Driver'

type Mode = 'commuter' | 'driver'

function Single({ locked }: { locked: Mode | null }) {
  const [mode, setMode] = useState<Mode>(locked ?? 'commuter')
  return (
    <div className="app">
      <header className="top">
        <h1><img className="logo" src="/brand/full-color-dark.svg" alt="Jeeptify" /></h1>
        {locked ? <span className="mode">{mode === 'driver' ? 'Driver' : 'Commuter'}</span> : (
          <nav className="seg" aria-label="Mode">
            <button aria-pressed={mode === 'commuter'} className={mode === 'commuter' ? 'on' : ''} onClick={() => setMode('commuter')}>Commuter</button>
            <button aria-pressed={mode === 'driver'} className={mode === 'driver' ? 'on' : ''} onClick={() => setMode('driver')}>Driver</button>
          </nav>
        )}
      </header>
      {mode === 'commuter' ? <Commuter /> : <Driver />}
      <footer className="foot">
        Routes: BetterIliganCity (MIT), untraced · Places: © OpenStreetMap contributors · Fares dated 2026-09-28 · Prototype
      </footer>
    </div>
  )
}

export default function App() {
  const mode = new URLSearchParams(location.search).get('mode')
  if (mode === 'driver' || mode === 'commuter') return <Single locked={mode} />
  return <Single locked={null} />
}
