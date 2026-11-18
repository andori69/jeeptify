import { describe, expect, it } from 'vitest'
import { lineLength, pointAt, segment, type LonLat } from './geo'
import { legFare } from './fare'

const line: LonLat[] = [
  [124.0, 8.0],
  [124.0, 8.01],
  [124.01, 8.01],
]

describe('geo', () => {
  it('measures line length in metres', () => {
    expect(lineLength(line)).toBeGreaterThan(2100)
    expect(lineLength(line)).toBeLessThan(2300)
  })
  it('clamps pointAt to ends', () => {
    expect(pointAt(line, -5)).toEqual(line[0])
    expect(pointAt(line, 1e9)).toEqual(line[2])
  })
  it('pointAt hits the first vertex at first segment length', () => {
    const p = pointAt(line, lineLength(line.slice(0, 2)))
    expect(p[1]).toBeCloseTo(8.01, 5)
  })
})

describe('fare (fixture, rounding rule UNVERIFIED)', () => {
  it('charges base fare within 4 km', () => {
    expect(legFare(3000, 'traditional', 'regular')).toBe(14)
    expect(legFare(3000, 'modern', 'regular')).toBe(17)
  })
  it('adds per-km after 4 km', () => {
    expect(legFare(6000, 'traditional', 'regular')).toBe(18)
  })
  it('applies 20% discount, rounded to 0.25', () => {
    expect(legFare(3000, 'traditional', 'student')).toBe(11.25)
    expect(legFare(3000, 'traditional', 'senior')).toBe(11.25)
    expect(legFare(3000, 'traditional', 'pwd')).toBe(11.25)
  })
})

describe('segment', () => {
  it('returns just the stretch between two positions', () => {
    const s = segment(line, 500, 1500)
    expect(lineLength(s)).toBeGreaterThan(990)
    expect(lineLength(s)).toBeLessThan(1010)
  })
  it('keeps the requested order and includes inner vertices', () => {
    const total = lineLength(line)
    const fwd = segment(line, 100, total - 100)
    expect(fwd.length).toBeGreaterThan(2)
    const back = segment(line, total - 100, 100)
    expect(back[0]).toEqual(fwd[fwd.length - 1])
  })
})
