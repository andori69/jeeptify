import { describe, expect, it } from 'vitest'
import { landmarksAlong, matchWaiting, type Landmark } from './trips'
import { bearing, type LonLat } from './geo'
import { etaMinutes, fmtEta, pickSpeed } from './eta'
import { shouldPublish } from './live'
import { haversine } from './geo'

const LINE: LonLat[] = [[124.0, 8.0], [124.0, 8.02]] // runs north
const REV = [...LINE].reverse()
const w = { pickupAt: [124.0, 8.004] as LonLat, destAt: [124.0, 8.016] as LonLat }

describe('matchWaiting (direction and route segment)', () => {
  it('matches the driver heading the same way', () => {
    const m = matchWaiting(LINE, w)
    expect(m).not.toBeNull()
    expect(m!.pickupAlong).toBeLessThan(m!.destAlong)
  })
  it('rejects the driver heading the opposite way', () => {
    expect(matchWaiting(REV, w)).toBeNull()
  })
  it('rejects a journey that is not on the line', () => {
    expect(matchWaiting(LINE, { pickupAt: [124.01, 8.004], destAt: [124.01, 8.016] })).toBeNull()
  })
  it('rejects a trivially short segment', () => {
    expect(matchWaiting(LINE, { pickupAt: [124.0, 8.004], destAt: [124.0, 8.0045] })).toBeNull()
  })
})

describe('landmarksAlong', () => {
  const lms: Landmark[] = [
    { id: 'b', name: 'B', type: 'x', lat: 8.012, lon: 124.0003, aliases: [] },
    { id: 'a', name: 'A', type: 'x', lat: 8.004, lon: 124.0, aliases: [] },
    { id: 'far', name: 'Far', type: 'x', lat: 8.01, lon: 124.01, aliases: [] },
  ]
  it('keeps only near landmarks, ordered along the line', () => {
    expect(landmarksAlong(LINE, lms).map((x) => x.lm.id)).toEqual(['a', 'b'])
  })
  it('reverses order for the reversed line', () => {
    expect(landmarksAlong(REV, lms).map((x) => x.lm.id)).toEqual(['b', 'a'])
  })
})

describe('eta', () => {
  it('uses a reported speed when usable, else assumes and flags it', () => {
    expect(pickSpeed(6)).toEqual({ mps: 6, assumed: false })
    expect(pickSpeed(0.2).assumed).toBe(true)
    expect(pickSpeed(null).assumed).toBe(true)
  })
  it('rounds to whole minutes, minimum 1 for a positive distance', () => {
    expect(etaMinutes(600, 5)).toBe(2)
    expect(etaMinutes(10, 5)).toBe(1)
    expect(etaMinutes(0, 5)).toBe(0)
  })
  it('formats', () => {
    expect(fmtEta(0)).toBe('arriving')
    expect(fmtEta(7)).toBe('7 min')
    expect(fmtEta(75)).toBe('1 h 15 min')
  })
})

describe('shouldPublish (battery/data throttle)', () => {
  const t0 = 1_000_000
  const prev = { at: [124.0, 8.0] as LonLat, ts: t0 }
  it('publishes the first fix', () => expect(shouldPublish(null, prev.at, t0, haversine)).toBe(true))
  it('skips a stationary jitter', () => expect(shouldPublish(prev, [124.00005, 8.0], t0 + 5000, haversine)).toBe(false))
  it('publishes after real movement', () => expect(shouldPublish(prev, [124.0005, 8.0], t0 + 5000, haversine)).toBe(true))
  it('publishes a heartbeat after the quiet period', () => expect(shouldPublish(prev, prev.at, t0 + 31_000, haversine)).toBe(true))
})

describe('bearing', () => {
  it('north, east, south', () => {
    expect(Math.round(bearing([124, 8], [124, 8.01]))).toBe(0)
    expect(Math.round(bearing([124, 8], [124.01, 8]))).toBe(90)
    expect(Math.round(bearing([124, 8.01], [124, 8]))).toBe(180)
  })
})
