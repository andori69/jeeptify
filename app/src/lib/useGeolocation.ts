import { useEffect, useState } from 'react'
import { haversine, type LonLat } from './geo'

export interface Fix { at: LonLat; accuracy: number; time: number; speed: number | null }

const MIN_MOVE_M = 10
const QUIET_MS = 30_000

/**
 * Driver position watch. Runs only while `watching`. While stationary, fixes within MIN_MOVE_M are dropped
 * (no re-render, no downstream work) except one heartbeat every QUIET_MS.
 */
export function useGeolocation(watching: boolean) {
  const [fix, setFix] = useState<Fix | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!watching) { setFix(null); setError(null); return }
    if (!('geolocation' in navigator)) { setError('Location not supported on this device.'); return }
    let last: Fix | null = null
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const at: LonLat = [p.coords.longitude, p.coords.latitude]
        const time = p.timestamp
        if (last && haversine(last.at, at) < MIN_MOVE_M && time - last.time < QUIET_MS) return
        let speed = p.coords.speed
        if ((speed == null || Number.isNaN(speed)) && last && time - last.time >= 3000) {
          speed = haversine(last.at, at) / ((time - last.time) / 1000)
        }
        last = { at, accuracy: p.coords.accuracy, time, speed: speed ?? null }
        setError(null)
        setFix(last)
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'Location permission denied.' : 'Cannot get location.'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [watching])

  return { fix, error }
}

export type OnceResult = { ok: true; at: LonLat; accuracy: number } | { ok: false; reason: 'denied' | 'unavailable' }

/** One-shot location for commuters: no continuous watch, so no ongoing battery use. */
export function locateOnce(): Promise<OnceResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({ ok: false, reason: 'unavailable' })
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, at: [p.coords.longitude, p.coords.latitude], accuracy: p.coords.accuracy }),
      (e) => resolve({ ok: false, reason: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    )
  })
}
