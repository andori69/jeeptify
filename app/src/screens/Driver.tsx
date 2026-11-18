import { useEffect, useMemo, useRef, useState } from 'react'
import { MapView, type MapMarker } from '../components/MapView'
import { Plate } from '../components/Bits'
import { routes, directed, type Direction } from '../lib/routes'
import { haversine, lineLength, nearestOnLine } from '../lib/geo'
import { useGeolocation } from '../lib/useGeolocation'
import { useLive } from '../lib/useLive'
import { put, remove } from '../lib/channel'
import { etaMinutes, fmtEta, pickSpeed } from '../lib/eta'
import { shouldPublish, WAIT_MAX_AGE_MS, type Jeep, type Waiting } from '../lib/live'
import { landmarksAlong, matchWaiting, type Landmark } from '../lib/trips'
import landmarkData from '../data/landmarks.json'

const landmarks = landmarkData.landmarks as Landmark[]
const OFF_ROUTE_M = 150
const STALE_MS = 45_000
const MAX_ACC_M = 100

/**
 * Driver screen. Route awareness only: no requests, no actions on commuters, no trip counters.
 * While offline it holds no GPS watch, no listener and no timers.
 */
export function Driver() {
  const [routeId, setRouteId] = useState(routes[0].id)
  const [dir, setDir] = useState<Direction>('out')
  const [online, setOnline] = useState(false)
  const [, tick] = useState(0)
  const me = useRef(`drv-${Math.random().toString(36).slice(2, 10)}`)
  const lastPub = useRef<{ at: [number, number]; ts: number } | null>(null)
  const { fix, error } = useGeolocation(online)
  const waiting = useLive<Waiting>('wait', WAIT_MAX_AGE_MS, online)

  const route = routes.find((r) => r.id === routeId)!
  const line = useMemo(() => directed(route, dir), [route, dir])
  const total = useMemo(() => lineLength(line), [line])
  const stops = useMemo(() => landmarksAlong(line, landmarks), [line])
  const near = useMemo(() => (fix ? nearestOnLine(line, fix.at) : null), [fix, line])

  // Re-evaluate "is the fix stale?" without polling the GPS: one cheap tick, online only.
  useEffect(() => {
    if (!online) return
    const id = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(id)
  }, [online])

  // Publish own position: only after real movement, or a slow heartbeat. Removed when offline.
  useEffect(() => {
    if (!online) { remove('jeep', me.current); lastPub.current = null; return }
    if (!fix || !near) return
    const now = Date.now()
    if (!shouldPublish(lastPub.current, fix.at, now, haversine)) return
    lastPub.current = { at: fix.at, ts: now }
    const along = dir === 'out' ? near.along : total - near.along
    put('jeep', me.current, {
      id: me.current, routeId, dir, at: fix.at, along, speed: fix.speed, ts: now, simulated: false,
    } satisfies Jeep)
  }, [online, fix, near, routeId, dir, total])
  useEffect(() => {
    const id = me.current
    const off = () => remove('jeep', id)
    window.addEventListener('pagehide', off)
    return () => { window.removeEventListener('pagehide', off); off() }
  }, [])

  const age = fix ? Date.now() - fix.time : Infinity
  const onRoute = !!near && near.dist <= OFF_ROUTE_M
  const reliable = !!fix && !!near && age <= STALE_MS && fix.accuracy <= MAX_ACC_M && onRoute
  const why = !fix ? 'waiting for GPS' : age > STALE_MS ? 'GPS signal is old' : fix.accuracy > MAX_ACC_M ? 'GPS is not accurate enough' : !onRoute ? 'you are off the route' : ''
  const sp = pickSpeed(fix?.speed)
  const eta = (distM: number) => (reliable ? fmtEta(etaMinutes(distM, sp.mps)) : null)

  const ahead = near ? stops.filter((s) => s.along > near.along + 20) : stops
  const nextStops = ahead.slice(0, 3)

  const mine = useMemo(() => waiting
    .filter((w) => w.routeId === routeId)
    .map((w) => ({ w, m: matchWaiting(line, w) }))
    .filter((x): x is { w: Waiting; m: { pickupAlong: number; destAlong: number } } => x.m !== null)
    .filter((x) => !near || x.m.pickupAlong >= near.along - 30)
    .sort((a, b) => a.m.pickupAlong - b.m.pickupAlong), [waiting, routeId, line, near])

  const markers: MapMarker[] = [
    ...nextStops.map((s) => ({ id: `lm-${s.lm.id}`, at: [s.lm.lon, s.lm.lat] as [number, number], label: s.lm.name, kind: 'lm' as const })),
    ...mine.map(({ w }) => ({ id: `w-${w.id}`, at: w.pickupAt, label: `Waiting: ${w.pickupLabel} → ${w.destLabel}`, kind: 'wait' as const })),
    ...(fix ? [{ id: 'me', at: fix.at, label: 'You', kind: 'me' as const }] : []),
  ]

  const state = !online ? { cls: 'state-off', big: 'Offline', sub: 'Not sharing your position' }
    : error ? { cls: 'state-err', big: 'No location', sub: error }
    : fix ? { cls: 'state-on', big: 'Online', sub: `GPS ±${Math.round(fix.accuracy)} m` }
    : { cls: 'state-wait', big: 'Online', sub: 'Waiting for GPS…' }

  return (
    <div className="screen stacked">
      <aside className="panel">
        <div className={`state ${state.cls}`} aria-live="polite">{state.big}<small>{state.sub}</small></div>

        {online ? (
          <div className="routebox">
            <span className="swatch" style={{ background: route.color }} aria-hidden /><Plate code={route.id} /> <span>{route.name}</span>
            <div className="note">{dir === 'out' ? 'Outbound' : 'Inbound'} · arrows on the map show your direction</div>
          </div>
        ) : (
          <>
            <label>Route
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.name}</option>)}
              </select>
            </label>
            <label>Direction
              <select value={dir} onChange={(e) => setDir(e.target.value as Direction)}>
                <option value="out">Outbound</option>
                <option value="in">Inbound (stored line reversed)</option>
              </select>
            </label>
          </>
        )}

        <button className={online ? 'go stop' : 'go start'} onClick={() => setOnline(!online)}>
          {online ? 'Go offline' : 'Go online'}
        </button>

        {online && near && !onRoute && (
          <div className="offroute" role="alert">Off route · {Math.round(near.dist)} m from {route.id}</div>
        )}

        {online && (
          <section aria-label="Next landmarks">
            <h3>Next landmarks</h3>
            {nextStops.length === 0
              ? <p className="note">{near ? 'No more landmarks before the end of this route.' : 'No landmark data near this route.'}</p>
              : (
                <ul className="list">
                  {nextStops.map((s) => {
                    const d = near ? s.along - near.along : null
                    const e = d != null ? eta(d) : null
                    return (
                      <li key={s.lm.id} className="line">
                        <span>{s.lm.aliases[0] ?? s.lm.name}</span>
                        <b>{d == null ? '' : e ?? '—'}</b>
                        {d != null && <small>{(d / 1000).toFixed(1)} km</small>}
                      </li>
                    )
                  })}
                </ul>
              )}
            <p className="note">
              {reliable
                ? `ETA uses ${sp.assumed ? 'an assumed 15 km/h' : 'your current speed'}; no live traffic data.`
                : `ETA unavailable: ${why}.`}
              {' '}Landmarks stand in for stops (no official stop data).
            </p>
          </section>
        )}

        {online && (
          <section aria-label="Waiting on your route">
            <h3>Waiting ahead on {route.id} <span className="count">{mine.length}</span></h3>
            {mine.length === 0
              ? <p className="note">No one has said they are waiting for your route and direction.</p>
              : (
                <ul className="list">
                  {mine.slice(0, 5).map(({ w, m }) => {
                    const d = near ? m.pickupAlong - near.along : null
                    const e = d != null ? eta(Math.max(0, d)) : null
                    return (
                      <li key={w.id} className="wait">
                        <span className="waitico" aria-hidden />
                        <span className="grow">
                          <b>{w.pickupLabel}</b>
                          <small>to {w.destLabel} · waiting</small>
                        </span>
                        <span className="right">{d == null ? '' : `${Math.max(0, d / 1000).toFixed(1)} km`}<small>{e ?? ''}</small></span>
                      </li>
                    )
                  })}
                </ul>
              )}
            <p className="note">Only people heading your way, ahead of you. For awareness; nothing to tap or accept.</p>
          </section>
        )}

        {!online && (
          <p className="note">
            Going online shares your position with commuters on this route. It sends only after you move about 25 m
            (or every 30 s when stopped). Offline, the app uses no GPS and no network for tracking.
          </p>
        )}
      </aside>
      <MapView lines={[{ id: route.id, line, color: route.color, active: true, arrows: true }]} markers={markers} fitKey={`${route.id}:${dir}`} />
    </div>
  )
}
