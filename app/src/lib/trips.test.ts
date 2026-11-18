import { describe, expect, it } from 'vitest'
import { routesServing, searchLandmarks, transferTrips, type Landmark } from './trips'
import { nearestOnLine, type LonLat } from './geo'
import type { Route } from './routes'

// ~2.2 km north-south line at lon 124.00, and a separate east-west line far away.
const NS: LonLat[] = [[124.0, 8.0], [124.0, 8.02]]
const EW: LonLat[] = [[124.1, 8.0], [124.12, 8.0]]
const mk = (id: string, line: LonLat[]): Route => ({ id, name: id, color: '#000', line, meters: 2200 })
const routes = [mk('NS', NS), mk('EW', EW)]

describe('nearestOnLine', () => {
  it('finds distance and along-position', () => {
    const n = nearestOnLine(NS, [124.0009, 8.01])
    expect(n.dist).toBeGreaterThan(90)
    expect(n.dist).toBeLessThan(110)
    expect(n.along).toBeGreaterThan(1050)
    expect(n.along).toBeLessThan(1150)
  })
})

describe('routesServing', () => {
  it('returns only routes whose geometry passes near the destination', () => {
    const r = routesServing(routes, [124.0005, 8.015], null)
    expect(r.map((x) => x.route.id)).toEqual(['NS'])
  })
  it('drops routes beyond the walk radius', () => {
    expect(routesServing(routes, [124.01, 8.01], null)).toEqual([])
  })
  it('with origin keeps direct trips and sets direction by along order', () => {
    const fwd = routesServing(routes, [124.0, 8.018], [124.0, 8.002])[0]
    expect(fwd.dir).toBe('out')
    const back = routesServing(routes, [124.0, 8.002], [124.0, 8.018])[0]
    expect(back.dir).toBe('in')
  })
  it('drops routes that miss the origin', () => {
    expect(routesServing(routes, [124.0, 8.018], [124.11, 8.0])).toEqual([])
  })
  it('handles a route passing the same area twice by using the nearest pass', () => {
    const loop: LonLat[] = [[124.0, 8.0], [124.0, 8.02], [124.0004, 8.02], [124.0004, 8.0]]
    const r = routesServing([mk('LOOP', loop)], [124.0002, 8.01], null)
    expect(r).toHaveLength(1)
  })
})

describe('searchLandmarks', () => {
  const lm: Landmark[] = [
    { id: 'a', name: 'Mindanao State University - IIT', type: 'university', lat: 0, lon: 0, aliases: ['MSU-IIT'] },
    { id: 'b', name: 'Gaisano Iligan', type: 'mall', lat: 0, lon: 0, aliases: [] },
  ]
  it('matches aliases and ignores punctuation', () => {
    expect(searchLandmarks(lm, 'msu iit').map((x) => x.id)).toEqual(['a'])
  })
  it('returns nothing for empty query', () => {
    expect(searchLandmarks(lm, '  ')).toEqual([])
  })
})

describe('transferTrips', () => {
  // A runs north (lon 124.0, lat 8.0 -> 8.02); B runs east along lat 8.01 and crosses A at ~1.1 km.
  const A = mk('A', NS), B = mk('B', [[124.0, 8.01], [124.02, 8.01]]), Brev = mk('Brev', [[124.02, 8.01], [124.0, 8.01]])
  const origin: LonLat = [124.0, 8.002], dest: LonLat = [124.019, 8.0102]
  it('finds A then B with the transfer at the crossing', () => {
    const [t] = transferTrips([A, B], origin, dest)
    expect(t.first.route.id).toBe('A'); expect(t.first.dir).toBe('out')
    expect(t.second.route.id).toBe('B'); expect(t.second.dir).toBe('out')
    expect(t.first.alightAlong).toBeGreaterThan(1000); expect(t.first.alightAlong).toBeLessThan(1250)
    expect(t.second.rideM).toBeGreaterThan(1900)
  })
  it('B stored reversed is ridden as direction in', () => {
    const [t] = transferTrips([A, Brev], origin, dest)
    expect(t.second.dir).toBe('in')
  })
  it('returns nothing when the routes never come within walking distance', () => {
    expect(transferTrips([A, mk('far', [[124.1, 8.01], [124.12, 8.01]])], origin, [124.119, 8.0102])).toEqual([])
  })
  it('never pairs a route with itself', () => {
    expect(transferTrips([A], origin, [124.0, 8.018])).toEqual([])
  })
})
