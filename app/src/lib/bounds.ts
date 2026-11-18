import boundary from '../data/iligan-boundary.json'
import { haversine, type LonLat } from './geo'

/** Iligan City's administrative outline (lon, lat). The map never shows or pans beyond it. */
export const ILIGAN_RING = boundary.ring as LonLat[]

const lons = ILIGAN_RING.map((p) => p[0]), lats = ILIGAN_RING.map((p) => p[1])
/** [west, south, east, north] */
export const ILIGAN_BBOX: [number, number, number, number] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]

const TOLERANCE_M = 1500 // the outline is generalised (370 points), so real roads near the edge can sit just outside it

/** In Iligan City: inside the outline, or within TOLERANCE_M of it. */
export function insideIligan(p: LonLat): boolean {
  const [x, y] = p
  let inside = false
  for (let i = 0, j = ILIGAN_RING.length - 1; i < ILIGAN_RING.length; j = i++) {
    const [xi, yi] = ILIGAN_RING[i], [xj, yj] = ILIGAN_RING[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  if (inside) return true
  return ILIGAN_RING.some((q) => haversine(p, q) <= TOLERANCE_M)
}
