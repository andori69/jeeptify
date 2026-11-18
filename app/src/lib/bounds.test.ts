import { describe, expect, it } from 'vitest'
import { ILIGAN_BBOX, insideIligan } from './bounds'
import { routes } from './routes'
import landmarkData from '../data/landmarks.json'

describe('Iligan city bounds', () => {
  it('has a sensible bounding box', () => {
    const [w, s, e, n] = ILIGAN_BBOX
    expect(w).toBeGreaterThan(124.1); expect(e).toBeLessThan(124.7); expect(s).toBeGreaterThan(7.9); expect(n).toBeLessThan(8.4)
  })
  it('accepts places in the city and rejects outside ones', () => {
    expect(insideIligan([124.2408, 8.2401])).toBe(true) // Tibanga
    expect(insideIligan([124.2418, 8.2418])).toBe(true) // terminal area
    expect(insideIligan([124.64, 8.48])).toBe(false) // Cagayan de Oro
    expect(insideIligan([124.0, 8.2])).toBe(false) // open water west
  })
  it('keeps every mapped route and landmark inside the city', () => {
    for (const r of routes) for (const p of r.line) expect(insideIligan(p), `${r.id} ${p}`).toBe(true)
    for (const l of landmarkData.landmarks) expect(insideIligan([l.lon, l.lat]), l.name).toBe(true)
  })
})

describe('route colour codes', () => {
  it('every mapped route has its own colour', async () => {
    const { ROUTE_COLORS } = await import('./routes')
    const ids = routes.map((r) => r.id)
    const colors = ids.map((id) => ROUTE_COLORS[id])
    expect(colors.every(Boolean)).toBe(true)
    expect(new Set(colors).size).toBe(ids.length)
  })
})
