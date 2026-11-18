import { useEffect, useMemo, useRef, useState } from 'react'
import { MapView, type MapMarker } from '../components/MapView'
import { Badge, Plate } from '../components/Bits'
import { MapIcon } from '../components/icons'
import { TripForm, type Place } from '../components/TripForm'
import { Sheet, SNAP_FRACTION, type Snap } from '../components/Sheet'
import { routes } from '../lib/routes'
import { legFare, fareTable, type Passenger, type Vehicle } from '../lib/fare'
import { routesServing, transferTrips, WALK_RADIUS_M, type Landmark, type Serving, type Transfer } from '../lib/trips'
import { useSimJeeps } from '../lib/useSimJeeps'
import { segment } from '../lib/geo'
import { useLive } from '../lib/useLive'
import { put, remove } from '../lib/channel'
import { ASSUMED_MPS, etaMinutes, fmtEta, pickSpeed } from '../lib/eta'
import { JEEP_MAX_AGE_MS, type Jeep, type Waiting } from '../lib/live'
import landmarkData from '../data/landmarks.json'

const landmarks = landmarkData.landmarks as Landmark[]
const COMMON = [
  'mindanao-state-university-iligan-institute-of-technology',
  'gaisano-iligan',
  'iligan-city-hall',
  'iligan-city-central-market',
  'pala-o-market',
  'iligan-city-integrated-bus-and-jeepney-terminal',
].map((id) => landmarks.find((l) => l.id === id)).filter((l): l is Landmark => !!l)

const WHO: [Passenger, string][] = [['regular', 'Regular'], ['student', 'Student'], ['senior', 'Senior'], ['pwd', 'PWD']]
const peso = (n: number) => `₱${n.toFixed(2)}`
const HEARTBEAT_MS = 60_000

/** Minutes until the nearest approaching jeep (same travel direction, still before the pickup) reaches the pickup. */
function nextJeep(s: Serving, jeeps: Jeep[]): { min: number; assumed: boolean; simulated: boolean } | null {
  if (!s.board || !s.dir) return null
  let best: { d: number; j: Jeep } | null = null
  for (const j of jeeps) {
    if (j.routeId !== s.route.id || j.dir !== s.dir) continue
    const d = s.dir === 'out' ? s.board.along - j.along : j.along - s.board.along
    if (d >= -30 && (!best || d < best.d)) best = { d, j }
  }
  if (!best) return null
  const sp = pickSpeed(best.j.speed)
  return { min: etaMinutes(Math.max(0, best.d), sp.mps), assumed: sp.assumed, simulated: best.j.simulated }
}

/** Pixels of map hidden by the phone sheet, so fitting keeps the route in the visible part. */
function sheetInset(snap: Snap): number {
  return Math.round(window.innerHeight * 0.9 * SNAP_FRACTION[snap])
}

export function Commuter() {
  const [origin, setOrigin] = useState<Place | null>(null)
  const [dest, setDest] = useState<Place | null>(null)
  const [go, setGo] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [who, setWho] = useState<Passenger>('regular')
  const [vehicle, setVehicle] = useState<Vehicle>('traditional')
  const [share, setShare] = useState(false)
  const [snap, setSnap] = useState<Snap>('half')
  const me = useRef(Math.random().toString(36).slice(2, 10))

  const step = origin && dest && go ? 3 : 1
  const results = useMemo(
    () => (origin && dest ? routesServing(routes, dest.at, origin.at) : []),
    [origin, dest],
  )
  // Transfers are offered only when no direct jeepney exists.
  const transfers = useMemo(
    () => (origin && dest && results.length === 0 ? transferTrips(routes, origin.at, dest.at) : []),
    [origin, dest, results],
  )
  const tid = (t: Transfer) => `${t.first.route.id}+${t.second.route.id}`
  const tChosen = transfers.find((t) => tid(t) === pick) ?? transfers[0] ?? null
  const chosen = results.find((r) => r.route.id === pick) ?? results[0] ?? null
  const servingRoutes = useMemo(() => results.map((r) => r.route), [results])

  const realJeeps = useLive<Jeep>('jeep', JEEP_MAX_AGE_MS, step === 3)
  const simAll = useSimJeeps(servingRoutes, 2)
  // Live driver positions win; simulated jeeps fill in only for routes with no live driver.
  const jeeps = useMemo(() => {
    const live = new Set(realJeeps.map((j) => j.routeId))
    return [...realJeeps, ...simAll.filter((j) => !live.has(j.routeId))]
  }, [realJeeps, simAll])

  // Opt-in: tell drivers on this route that I am waiting. Snapped points only; removed when switched off or on change.
  const chosenId = chosen?.route.id
  const boardAt = chosen?.board?.at, alightAt = chosen?.alight.at
  useEffect(() => {
    if (!share || !chosenId || !boardAt || !alightAt || !origin || !dest) return
    const id = me.current
    const publish = () => put('wait', id, {
      id, routeId: chosenId, pickupAt: boardAt, pickupLabel: origin.label,
      destAt: alightAt, destLabel: dest.label, ts: Date.now(),
    } satisfies Waiting)
    publish()
    const hb = setInterval(publish, HEARTBEAT_MS)
    const off = () => remove('wait', id)
    window.addEventListener('pagehide', off)
    return () => { clearInterval(hb); window.removeEventListener('pagehide', off); off() }
  }, [share, chosenId, boardAt, alightAt, origin, dest])

  // Draw only the road the trip uses: from the nearest approaching jeep (if any) to the boarding point, then on to the exit point.
  // Other routes stay off the map; pick them from the list.
  const lines = useMemo(() => {
    if (tChosen) return [tChosen.first, tChosen.second].map((l) => ({ id: l.route.id, line: segment(l.route.line, l.boardAlong, l.alightAlong), color: l.route.color, active: true }))
    if (!chosen?.board || !chosen.dir) return []
    const b = chosen.board.along, out = chosen.dir === 'out'
    let start = b
    for (const j of jeeps) {
      if (j.routeId !== chosen.route.id || j.dir !== chosen.dir) continue
      const d = out ? b - j.along : j.along - b
      if (d > 0 && d < 3000) start = out ? Math.min(start, j.along) : Math.max(start, j.along)
    }
    return [{ id: chosen.route.id, line: segment(chosen.route.line, start, chosen.alight.along), color: chosen.route.color, active: true }]
  }, [chosen, tChosen, jeeps])
  // Only jeeps that serve the chosen route in the commuter's direction; the rest is noise.
  const shown = jeeps.filter((j) => j.routeId === chosen?.route.id && j.dir === chosen?.dir)
  const markers: MapMarker[] = [
    ...(origin ? [{ id: 'from', at: origin.at, label: `You: ${origin.label}`, kind: 'from' as const }] : []),
    ...(dest ? [{ id: 'dest', at: dest.at, label: dest.label, kind: 'dest' as const }] : []),
    ...(chosen?.board ? [{ id: 'board', at: chosen.board.at, label: 'Board here (nearest point on route)', kind: 'stop' as const }] : []),
    ...(tChosen ? [
      { id: 't-board', at: tChosen.first.board, label: `Board ${tChosen.first.route.id} here`, kind: 'stop' as const },
      { id: 't-swap', at: tChosen.first.alight, label: `Get off ${tChosen.first.route.id}, walk to ${tChosen.second.route.id}`, kind: 'stop' as const },
      { id: 't-board2', at: tChosen.second.board, label: `Board ${tChosen.second.route.id} here`, kind: 'stop' as const },
      { id: 't-alight', at: tChosen.second.alight, label: 'Get off here', kind: 'stop' as const },
    ] : []),
    ...(chosen ? [{ id: 'alight', at: chosen.alight.at, label: 'Get off here (nearest point on route)', kind: 'stop' as const }] : []),
    ...shown.map((j) => ({
      id: j.id, at: j.at, kind: (j.simulated ? 'sim' : 'jeep') as 'sim' | 'jeep',
      label: `${j.simulated ? 'Simulated jeep' : 'Jeep'} · ${j.routeId}`, code: j.routeId, color: routes.find((r) => r.id === j.routeId)?.color,
    })),
  ]

  if (step < 3) {
    return (
      <div className="welcome">
        <TripForm
          landmarks={landmarks} common={COMMON} origin={origin} dest={dest}
          onOrigin={(p) => { setOrigin(p); setGo(false) }} onDest={(p) => { setDest(p); setPick(null); setGo(false) }}
          onGo={() => setGo(true)}
        />
      </div>
    )
  }

  return (
    <div className="screen sheeted">
      <Sheet label="Trip and jeepney details" onSnap={setSnap}>
        <div className="route-sum">
          <div className="end from"><MapIcon kind="me" size={0.6} /><span><small>From</small><b>{origin!.label}</b></span></div>
          <div className="end to"><MapIcon kind="dest" size={0.6} /><span><small>To</small><b>{dest!.label}</b></span></div>
          <button className="link edit" onClick={() => setGo(false)}>Change trip</button>
        </div>

        <h3>{results.length === 0 ? (transfers.length ? `${transfers.length} trip${transfers.length > 1 ? 's' : ''} with one transfer` : 'No mapped jeepney found') : `${results.length} jeepney${results.length > 1 ? 's' : ''} for this trip`}</h3>
        {results.length === 0 && transfers.length === 0 && (
          <p className="note">
            None of the {routes.length} mapped routes passes within {WALK_RADIUS_M} m of both places, in the right order.
            Only {routes.length} of about 48 Iligan routes are mapped, so a route may exist that we cannot show yet.
          </p>
        )}
        {transfers.length > 0 && (
          <>
            <p className="note">No single jeepney goes there. These trips change jeepney once.</p>
            <ul className="list">
              {transfers.map((t) => {
                const sel = t === tChosen
                return (
                  <li key={tid(t)}>
                    <button className={sel ? 'card sel' : 'card'} onClick={() => setPick(tid(t))} aria-pressed={sel}>
                      <span className="grow">
                        {[t.first, t.second].map((l, i) => (
                          <span key={l.route.id} className="card-top">
                            <span className="swatch" style={{ background: l.route.color }} aria-hidden />{i === 0 ? 'Ride' : 'then'} <Plate code={l.route.id} />
                            <span className="rname">{(l.rideM / 1000).toFixed(1)} km</span>
                          </span>
                        ))}
                        <small>Walk {Math.round(t.walkM)} m between jeepneys · ride about <b>{fmtEta(etaMinutes(t.totalRideM, ASSUMED_MPS))}</b> in total</small>
                      </span>
                      <span className="side"><b className="fare">{peso(legFare(t.first.rideM, vehicle, who) + legFare(t.second.rideM, vehicle, who))}</b></span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        <ul className="list">
          {results.map((r) => {
            const sel = r.route.id === chosen?.route.id
            const nj = nextJeep(r, jeeps)
            return (
              <li key={r.route.id}>
                <button className={sel ? 'card sel' : 'card'} onClick={() => setPick(r.route.id)} aria-pressed={sel}>
                  <span className="grow">
                    <span className="card-top"><span className="swatch" style={{ background: r.route.color }} aria-hidden /><Plate code={r.route.id} /><span className="rname">{r.route.name}</span></span>
                    <small>Board {Math.round(r.board!.walk)} m away · get off {Math.round(r.alight.walk)} m from your destination</small>
                    <small>Ride about <b>{fmtEta(etaMinutes(r.rideM!, ASSUMED_MPS))}</b> · {(r.rideM! / 1000).toFixed(1)} km</small>
                  </span>
                  <span className="side">
                    <span className="eta">
                      {nj ? <><b className="eta-big">{fmtEta(nj.min)}</b><span className="eta-cap">Next jeep{nj.simulated ? ' · simulated' : ''}</span></>
                        : <span className="eta-cap">No jeep heading your way</span>}
                    </span>
                    <b className="fare">{peso(legFare(r.rideM!, vehicle, who))}</b>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {chosen && (
          <label className="share">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            <span>
              <b>Let {chosen.route.id} drivers see I'm waiting</b>
              <small>Shares only your boarding point on the route, your start and destination names. No name or phone ID. Turn off any time.</small>
            </span>
          </label>
        )}

        {(results.length > 0 || transfers.length > 0) && (
          <div className="opts">
            <label>Fare for
              <select value={who} onChange={(e) => setWho(e.target.value as Passenger)}>
                {WHO.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
              </select>
            </label>
            <label>Jeepney
              <select value={vehicle} onChange={(e) => setVehicle(e.target.value as Vehicle)}>
                <option value="traditional">Traditional</option>
                <option value="modern">Modern</option>
              </select>
            </label>
          </div>
        )}

        <p className="note"><Badge tone="sim">Estimates</Badge> No live traffic data. Times use the jeep's speed, or 15 km/h if unknown.</p>
        <details className="about">
          <summary>How to read this</summary>
          <ul className="legend" aria-label="Map symbols">
            <li><MapIcon kind="from" /> You, at your starting place</li>
            <li><MapIcon kind="dest" /> Your destination</li>
            <li><MapIcon kind="jeep" code="7C" color="#e5498a" /> A jeepney, in its route's colour (live)</li>
            <li><MapIcon kind="sim" code="7C" color="#e5498a" /> Simulated jeepney (demo)</li>
            <li><span className="pin pin-stop" aria-hidden /> Where to board and get off</li>
          </ul>
          <p className="note">
            Moving jeeps marked simulated are a demo; a live driver replaces them for that route. Boarding and exit points are the
            nearest point on the route line, not official stops. Transfers (one change) are shown only when no direct jeepney exists; each leg is charged its own fare. Fares dated {fareTable.effective_date},
            not yet verified.
          </p>
        </details>
      </Sheet>
      <MapView lines={lines} markers={markers} onPickLine={setPick} fitKey={`${origin!.label}>${dest!.label}:${chosen ? chosen.route.id : tChosen ? tid(tChosen) : ''}`} insetBottom={sheetInset(snap)} />
    </div>
  )
}
