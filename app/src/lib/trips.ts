import { nearestOnLine, pointAt, type LonLat } from './geo'
import type { Route } from './routes'

export const WALK_RADIUS_M = 300

export interface Landmark { id: string; name: string; type: string; lat: number; lon: number; aliases: string[] }

export interface Serving {
  route: Route
  /** Nearest point on the route line to the destination, and the walk from it. */
  alight: { at: LonLat; along: number; walk: number }
  /** Set only when an origin is known and the route also passes near it. */
  board?: { at: LonLat; along: number; walk: number }
  /** Metres ridden along the route, when board is known. */
  rideM?: number
  /** Travel direction along the stored line, when board is known. */
  dir?: 'out' | 'in'
}

/**
 * Routes whose actual geometry passes within the walking radius of the destination.
 * With an origin, keeps only routes that also pass within the radius of it (direct trips, no transfers).
 */
export function routesServing(routes: Route[], dest: LonLat, origin: LonLat | null, radius = WALK_RADIUS_M): Serving[] {
  const out: Serving[] = []
  for (const route of routes) {
    const d = nearestOnLine(route.line, dest)
    if (d.dist > radius) continue
    const s: Serving = { route, alight: { at: d.at, along: d.along, walk: d.dist } }
    if (origin) {
      const o = nearestOnLine(route.line, origin)
      if (o.dist > radius) continue
      if (Math.abs(d.along - o.along) < 100) continue
      s.board = { at: o.at, along: o.along, walk: o.dist }
      s.rideM = Math.abs(d.along - o.along)
      s.dir = o.along < d.along ? 'out' : 'in'
    }
    out.push(s)
  }
  return out.sort((a, b) => (a.rideM ?? 0) - (b.rideM ?? 0) || a.alight.walk - b.alight.walk)
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

export function searchLandmarks(all: Landmark[], q: string, limit = 6): Landmark[] {
  const n = norm(q)
  if (!n) return []
  const hit = (l: Landmark) => [l.name, ...l.aliases].some((x) => norm(x).includes(n))
  const starts = (l: Landmark) => [l.name, ...l.aliases].some((x) => norm(x).startsWith(n))
  return all.filter(hit).sort((a, b) => Number(starts(b)) - Number(starts(a))).slice(0, limit)
}

export interface RouteLandmark { lm: Landmark; along: number }

/** Landmarks within `radius` of the line, ordered by position along it. These stand in for stops (no official stop data). */
export function landmarksAlong(line: LonLat[], all: Landmark[], radius = 100): RouteLandmark[] {
  const out: RouteLandmark[] = []
  for (const lm of all) {
    const n = nearestOnLine(line, [lm.lon, lm.lat])
    if (n.dist <= radius) out.push({ lm, along: n.along })
  }
  return out.sort((a, b) => a.along - b.along)
}

/**
 * Does a waiting commuter's journey run along this driver's DIRECTED line? Both snapped points must lie on the line
 * and the pickup must come before the destination in the driver's travel direction (so the opposite direction fails).
 */
export function matchWaiting(line: LonLat[], w: { pickupAt: LonLat; destAt: LonLat }, tolM = 60): { pickupAlong: number; destAlong: number } | null {
  const p = nearestOnLine(line, w.pickupAt)
  const d = nearestOnLine(line, w.destAt)
  if (p.dist > tolM || d.dist > tolM) return null
  if (d.along - p.along < 100) return null
  return { pickupAlong: p.along, destAlong: d.along }
}

export const TRANSFER_WALK_M = 150
const STEP_M = 25

export interface Leg { route: Route; dir: 'out' | 'in'; board: LonLat; boardAlong: number; alight: LonLat; alightAlong: number; rideM: number }
export interface Transfer { first: Leg; second: Leg; walkM: number; totalRideM: number }

/**
 * One-transfer trips: ride A from near the origin, walk up to TRANSFER_WALK_M to B, ride B to near the destination.
 * Scans A in its travel direction every 25 m for the cheapest valid transfer per route pair.
 * Ranked by ride + 2x transfer walk, top `limit`. (Not Pareto, not precomputed windows: fine for 13 routes.)
 */
export function transferTrips(routes: Route[], origin: LonLat, dest: LonLat, radius = WALK_RADIUS_M, limit = 3): Transfer[] {
  const near = (r: Route, p: LonLat) => nearestOnLine(r.line, p)
  const starts = routes.map((r) => ({ r, n: near(r, origin) })).filter((x) => x.n.dist <= radius)
  const ends = routes.map((r) => ({ r, n: near(r, dest) })).filter((x) => x.n.dist <= radius)
  const found: Transfer[] = []
  for (const a of starts) for (const b of ends) {
    if (a.r.id === b.r.id) continue
    let best: Transfer | null = null
    for (const dirA of ['out', 'in'] as const) {
      const sign = dirA === 'out' ? 1 : -1
      for (let d = 100; ; d += STEP_M) {
        const sA = a.n.along + sign * d
        if (sA < 0 || sA > a.r.meters) break
        const at = pointAt(a.r.line, sA)
        const x = near(b.r, at)
        if (x.dist > TRANSFER_WALK_M) continue
        for (const dirB of ['out', 'in'] as const) {
          const rideB = dirB === 'out' ? b.n.along - x.along : x.along - b.n.along
          if (rideB < 100) continue
          const total = d + rideB
          if (best && total + 2 * x.dist >= best.totalRideM + 2 * best.walkM) continue
          best = {
            first: { route: a.r, dir: dirA, board: a.n.at, boardAlong: a.n.along, alight: at, alightAlong: sA, rideM: d },
            second: { route: b.r, dir: dirB, board: x.at, boardAlong: x.along, alight: b.n.at, alightAlong: b.n.along, rideM: rideB },
            walkM: x.dist, totalRideM: total,
          }
        }
      }
    }
    if (best) found.push(best)
  }
  return found.sort((p, q) => p.totalRideM + 2 * p.walkM - (q.totalRideM + 2 * q.walkM)).slice(0, limit)
}
