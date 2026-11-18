export type LonLat = [number, number]

const R = 6371008.8

export function haversine(a: LonLat, b: LonLat): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function lineLength(line: LonLat[]): number {
  let m = 0
  for (let i = 1; i < line.length; i++) m += haversine(line[i - 1], line[i])
  return m
}

/** Point `along` metres from the line start, clamped to the line. */
export function pointAt(line: LonLat[], along: number): LonLat {
  if (along <= 0) return line[0]
  let left = along
  for (let i = 1; i < line.length; i++) {
    const seg = haversine(line[i - 1], line[i])
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg
      return [
        line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t,
        line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t,
      ]
    }
    left -= seg
  }
  return line[line.length - 1]
}

export interface Nearest { dist: number; along: number; at: LonLat }

/** Closest point on a line to `p`: distance and distance-along, in metres. Local flat approximation (fine at city scale). */
export function nearestOnLine(line: LonLat[], p: LonLat): Nearest {
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180)
  const ky = 110574
  let best: Nearest = { dist: Infinity, along: 0, at: line[0] }
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p[0]) * kx, ay = (line[i - 1][1] - p[1]) * ky
    const bx = (line[i][0] - p[0]) * kx, by = (line[i][1] - p[1]) * ky
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    const dist = Math.hypot(ax + t * dx, ay + t * dy)
    const seg = haversine(line[i - 1], line[i])
    if (dist < best.dist) {
      best = {
        dist,
        along: acc + seg * t,
        at: [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t],
      }
    }
    acc += seg
  }
  return best
}

/** Compass bearing in degrees clockwise from north, a to b. */
export function bearing(a: LonLat, b: LonLat): number {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180)
  const dy = b[1] - a[1]
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

/** The part of a line between two along-distances (metres), in the order given. */
export function segment(line: LonLat[], from: number, to: number): LonLat[] {
  const [lo, hi] = from <= to ? [from, to] : [to, from]
  const pts: LonLat[] = [pointAt(line, lo)]
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    acc += haversine(line[i - 1], line[i])
    if (acc > lo && acc < hi) pts.push(line[i])
  }
  pts.push(pointAt(line, hi))
  return from <= to ? pts : pts.reverse()
}
