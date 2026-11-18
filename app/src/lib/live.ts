import type { LonLat } from './geo'

/** A driver phone's published position. `along` is metres along the STORED route line; dir is the travel direction. */
export interface Jeep {
  id: string
  routeId: string
  dir: 'out' | 'in'
  at: LonLat
  along: number
  speed: number | null
  ts: number
  simulated: boolean
}

/** An opted-in waiting commuter. No device id, no raw GPS: pickup/destination are points snapped onto the route. */
export interface Waiting {
  id: string // random per session, not linked to a person
  routeId: string
  pickupAt: LonLat
  pickupLabel: string
  destAt: LonLat
  destLabel: string
  ts: number
}

export const JEEP_MAX_AGE_MS = 60_000
export const WAIT_MAX_AGE_MS = 180_000

/** Publish only after real movement, or as a slow heartbeat while stationary. */
export function shouldPublish(
  prev: { at: LonLat; ts: number } | null,
  at: LonLat,
  now: number,
  dist: (a: LonLat, b: LonLat) => number,
  moveM = 25,
  quietMs = 30_000,
): boolean {
  if (!prev) return true
  return dist(prev.at, at) >= moveM || now - prev.ts >= quietMs
}
