import { useState } from 'react'
import { Badge } from './Bits'
import { MapIcon } from './icons'
import { locateOnce } from '../lib/useGeolocation'
import { haversine, type LonLat } from '../lib/geo'
import { searchLandmarks, type Landmark } from '../lib/trips'
import { insideIligan } from '../lib/bounds'

export interface Place { at: LonLat; label: string; source: 'gps' | 'place' }
type Which = 'from' | 'to'

const short = (l: Landmark) => l.aliases[0] ?? l.name

function nearestLandmark(all: Landmark[], at: LonLat): Landmark | null {
  let best: Landmark | null = null, bd = 400
  for (const l of all) {
    const d = haversine(at, [l.lon, l.lat])
    if (d < bd) { best = l; bd = d }
  }
  return best
}

/** One screen, two fields: where you are and where you're going. No map until both are set and confirmed. */
export function TripForm({ landmarks, common, origin, dest, onOrigin, onDest, onGo }: {
  landmarks: Landmark[]
  common: Landmark[]
  origin: Place | null
  dest: Place | null
  onOrigin: (p: Place | null) => void
  onDest: (p: Place | null) => void
  onGo: () => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ badge: string; text: string } | null>(null)
  const [focus, setFocus] = useState<Which | null>(null)
  // the field you are typing in; otherwise the first one still empty
  const active: Which = focus === 'from' && !origin ? 'from' : focus === 'to' && !dest ? 'to' : origin ? 'to' : 'from'
  const set = (which: Which, p: Place | null) => { (which === 'from' ? onOrigin : onDest)(p); setQuery('') }
  const choose = (which: Which, l: Landmark) => set(which, { at: [l.lon, l.lat], label: l.name, source: 'place' })

  const useGps = async () => {
    setBusy(true); setProblem(null)
    const r = await locateOnce()
    setBusy(false)
    if (!r.ok) {
      setProblem({ badge: 'GPS unavailable', text: r.reason === 'denied' ? 'Location permission is off. Search for a nearby place instead.' : 'Cannot get your location right now. Search for a nearby place instead.' })
      return
    }
    if (!insideIligan(r.at)) {
      setProblem({ badge: 'Outside Iligan', text: 'Jeeptify covers Iligan City only. Search for a place in Iligan instead.' })
      return
    }
    const near = nearestLandmark(landmarks, r.at)
    set('from', { at: r.at, label: near ? `Your location, near ${short(near)}` : 'Your location', source: 'gps' })
  }

  const field = (which: Which, place: Place | null, label: string, hint: string) => place ? (
    <div className={`field set ${which}`}>
      <span className="fico" aria-hidden><MapIcon kind={which === 'from' ? 'me' : 'dest'} size={0.6} /></span>
      <span className="grow"><small>{label}</small><b>{place.label}</b></span>
      <button className="link" onClick={() => set(which, null)} aria-label={`Change ${label.toLowerCase()}`}>Change</button>
    </div>
  ) : (
    <label className={`field ${which}`}>
      <span className="fico" aria-hidden><MapIcon kind={which === 'from' ? 'me' : 'dest'} size={0.6} /></span>
      <span className="grow">
        <small>{label}</small>
        <input
          type="search" aria-label={label} placeholder={hint} autoComplete="off"
          value={which === active ? query : ''} onFocus={() => setFocus(which)} onChange={(e) => setQuery(e.target.value)} autoFocus={which === 'to' && !!origin}
        />
      </span>
    </label>
  )

  const suggestions = searchLandmarks(landmarks, query)
  return (
    <div className="plan">
      <h2>Where to?</h2>
      <p className="ceb">Asa ka paingon?</p>
      <div className="fields">
        {field('from', origin, 'From', 'Where are you now?')}
        {field('to', dest, 'To', 'Where are you going?')}
      </div>

      {!origin && (
        <button className="btn-secondary" onClick={useGps} disabled={busy} aria-busy={busy}>
          {busy ? 'Finding you…' : 'Use my current location'}
        </button>
      )}
      {problem && <p className="note" role="status"><Badge tone="warn">{problem.badge}</Badge> {problem.text}</p>}

      {query && (
        <ul className="list" aria-label="Suggestions">
          {suggestions.length === 0 && <li className="note pad">No place found. Try another name.</li>}
          {suggestions.map((l) => (
            <li key={l.id}><button className="row" onClick={() => choose(active, l)}>{l.name}<small>{l.type}</small></button></li>
          ))}
        </ul>
      )}
      {!query && !(origin && dest) && (
        <div>
          <p className="note">Common places</p>
          <div className="chips">
            {common.map((l) => <button key={l.id} className="chip" onClick={() => choose(active, l)}>{short(l)}</button>)}
          </div>
        </div>
      )}

      <button className="btn-primary" disabled={!origin || !dest} onClick={onGo}>Show jeepneys</button>
    </div>
  )
}
