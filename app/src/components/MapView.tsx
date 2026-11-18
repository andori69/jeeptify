import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { bearing, lineLength, pointAt, type LonLat } from '../lib/geo'
import { ILIGAN_BBOX, ILIGAN_RING } from '../lib/bounds'
import { routes } from '../lib/routes'
import { ICON_BOX, iconSvg } from './icons'

export interface MapLine { id: string; line: LonLat[]; color: string; active: boolean; arrows?: boolean }
export type MarkerKind = 'jeep' | 'me' | 'sim' | 'dest' | 'stop' | 'from' | 'wait' | 'lm'
export interface MapMarker { id: string; at: LonLat; label: string; kind: MarkerKind; /** route code and colour shown on a jeep marker */ code?: string; color?: string }

const ll = (p: LonLat): L.LatLngTuple => [p[1], p[0]]
const CITY = L.latLngBounds([ILIGAN_BBOX[1], ILIGAN_BBOX[0]], [ILIGAN_BBOX[3], ILIGAN_BBOX[2]])
// Max zoom-out and pan limit: the mapped jeepney routes (plus a margin), not the whole city outline.
const COVERAGE = L.latLngBounds(routes.flatMap((r) => r.line.map(ll)))
const LIMIT = COVERAGE.pad(0.1)

// Tile URL kept in one place so it can be swapped (OSM policy: attribution required, no prefetch).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ARROW_EVERY_M = 450
// Moving markers glide to each new position. Simulated jeeps tick every 2 s, so a 2 s linear glide reads as constant speed.
const GLIDE_MS: Partial<Record<MarkerKind, number>> = { sim: 2000, jeep: 1200, me: 600 }

const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function icon(kind: MarkerKind, code?: string, color?: string) {
  const [w, h, ax, ay] = ICON_BOX[kind]
  const svg = kind === 'stop' || kind === 'lm' ? '' : iconSvg(kind, { code, color })
  return L.divIcon({ className: '', html: `<span class="pin pin-${kind}">${svg}</span>`, iconSize: [w, h], iconAnchor: [ax, ay] })
}

function arrowIcon(deg: number) {
  return L.divIcon({ className: '', html: `<span class="arrow" style="transform:rotate(${deg}deg)"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] })
}

interface Entry { m: L.Marker; kind: MarkerKind; label: string; raf: number }

export function MapView({ lines, markers, onPickLine, fitKey, insetBottom = 0 }: {
  lines: MapLine[]
  markers: MapMarker[]
  onPickLine?: (id: string) => void
  fitKey?: string
  /** Pixels at the bottom covered by UI (a sheet); fitting keeps the route clear of it. */
  insetBottom?: number
  /** Pixels at the left covered by the floating panel on wide screens. */
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const lineLayer = useRef<L.LayerGroup | null>(null)
  const markerLayer = useRef<L.LayerGroup | null>(null)
  const entries = useRef(new Map<string, Entry>())
  const fitted = useRef('')
  const bounds = useRef<L.LatLngBounds | null>(null)
  const inset = useRef(insetBottom)
  const touched = useRef(false)
  const tileErrors = useRef(0)
  const [slow, setSlow] = useState(false)
  inset.current = insetBottom

  const applyLimit = useRef<() => void>(() => {})

  const pad = () => ({ paddingTopLeft: L.point(30, 30), paddingBottomRight: L.point(30, 30 + inset.current), maxZoom: 16 })

  useEffect(() => {
    const m = L.map(el.current!, { center: COVERAGE.getCenter(), zoom: 11, maxBoundsViscosity: 1, maxZoom: 18 })
    // Min zoom fits the route area into the part of the map NOT covered by the sheet; the pan limit is extended
    // downward by the sheet height so the route area can sit centred in that visible part.
    applyLimit.current = () => {
      if (!m.getSize().y) return
      const z = m.getBoundsZoom(LIMIT, false, L.point(0, inset.current))
      m.setMinZoom(z)
      const sw = m.project(LIMIT.getSouthWest(), z).add([0, inset.current])
      m.setMaxBounds(L.latLngBounds(m.unproject(sw, z), LIMIT.getNorthEast()))
    }
    applyLimit.current()
    m.fitBounds(COVERAGE, { ...pad(), animate: false })
    L.tileLayer(TILES, {
      maxZoom: 19,
      keepBuffer: 1,
      updateWhenIdle: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => { if (++tileErrors.current >= 3) setSlow(true) })
      .on('tileload', () => { tileErrors.current = 0; setSlow(false) })
      .addTo(m)
    // Everything outside the city outline is washed out, and the outline itself is drawn.
    m.createPane('mask').style.zIndex = '250'
    const hole = ILIGAN_RING.map(ll)
    const world = CITY.pad(4)
    L.polygon([[world.getSouthWest(), world.getNorthWest(), world.getNorthEast(), world.getSouthEast()], hole], {
      renderer: L.svg({ pane: 'mask' }), stroke: false, fillColor: token('--ground', '#f1f3f4'), fillOpacity: 0.72, interactive: false,
    }).addTo(m)
    L.polyline([...hole, hole[0]], { renderer: L.svg({ pane: 'mask' }), color: token('--harbor', '#17262e'), weight: 1.5, opacity: 0.55, dashArray: '6 5', interactive: false }).addTo(m)
    lineLayer.current = L.layerGroup().addTo(m)
    markerLayer.current = L.layerGroup().addTo(m)
    map.current = m
    const box = el.current!
    const grab = () => { touched.current = true }
    for (const ev of ['mousedown', 'wheel', 'touchstart']) box.addEventListener(ev, grab, { passive: true })
    // The map can be created while hidden or resized by layout; re-fit until the user moves the map themselves.
    const ro = new ResizeObserver(() => {
      m.invalidateSize()
      applyLimit.current()
      if (!touched.current && bounds.current) m.fitBounds(bounds.current, { ...pad(), animate: false })
    })
    ro.observe(box)
    const live = entries.current
    return () => {
      ro.disconnect()
      for (const ev of ['mousedown', 'wheel', 'touchstart']) box.removeEventListener(ev, grab)
      for (const e of live.values()) cancelAnimationFrame(e.raf)
      live.clear()
      m.remove(); map.current = null
    }
  }, [])

  useEffect(() => { applyLimit.current() }, [insetBottom])

  // Routes: rebuilt only when the lines themselves change, not on every marker move.
  useEffect(() => {
    const g = lineLayer.current
    if (!g) return
    g.clearLayers()
    const ink = token('--harbor', '#17262e')
    for (const l of lines) {
      if (l.active) L.polyline(l.line.map(ll), { color: ink, weight: 8, opacity: 1, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(g)
      const pl = L.polyline(l.line.map(ll), l.active
        ? { color: l.color, weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' }
        : { color: l.color, weight: 3.5, opacity: 0.7, lineCap: 'round', lineJoin: 'round' })
      if (onPickLine) pl.on('click', () => onPickLine(l.id))
      pl.addTo(g)
      if (l.arrows) {
        const len = lineLength(l.line)
        for (let d = ARROW_EVERY_M / 2; d < len - 30; d += ARROW_EVERY_M) {
          const a = pointAt(l.line, d), b = pointAt(l.line, d + 25)
          L.marker(ll(a), { icon: arrowIcon(bearing(a, b)), interactive: false, keyboard: false }).addTo(g)
        }
      }
    }
  }, [lines, onPickLine])

  // Markers: kept as live objects and moved, so a jeep glides instead of vanishing and reappearing.
  useEffect(() => {
    const g = markerLayer.current
    if (!g) return
    const seen = new Set<string>()
    for (const k of markers) {
      seen.add(k.id)
      const to = L.latLng(ll(k.at))
      const e = entries.current.get(k.id)
      if (!e) {
        const m = L.marker(to, { icon: icon(k.kind, k.code, k.color), title: k.label, keyboard: false, zIndexOffset: k.kind === 'lm' ? -100 : 0 })
          .bindTooltip(k.label, { direction: 'top' }).on('click', (ev) => ev.target.openTooltip()).addTo(g)
        entries.current.set(k.id, { m, kind: k.kind, label: k.label, raf: 0 })
        continue
      }
      if (e.kind !== k.kind) { e.m.setIcon(icon(k.kind, k.code, k.color)); e.kind = k.kind }
      if (e.label !== k.label) { e.m.setTooltipContent(k.label); e.m.getElement()?.setAttribute('title', k.label); e.label = k.label }
      const from = e.m.getLatLng()
      if (from.lat === to.lat && from.lng === to.lng) continue
      cancelAnimationFrame(e.raf)
      const ms = GLIDE_MS[k.kind]
      if (!ms || reducedMotion()) { e.m.setLatLng(to); continue }
      const t0 = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms)
        const f = k.kind === 'sim' ? t : 1 - (1 - t) ** 3 // constant speed for jeeps; ease-out for you
        e.m.setLatLng([from.lat + (to.lat - from.lat) * f, from.lng + (to.lng - from.lng) * f])
        if (t < 1) e.raf = requestAnimationFrame(step)
      }
      e.raf = requestAnimationFrame(step)
    }
    for (const [id, e] of entries.current) {
      if (seen.has(id)) continue
      cancelAnimationFrame(e.raf); g.removeLayer(e.m); entries.current.delete(id)
    }
  }, [markers])

  // Fit once per fitKey (route/trip change).
  useEffect(() => {
    const m = map.current
    if (!m) return
    const active = lines.find((l) => l.active)
    const key = fitKey ?? active?.id ?? ''
    if (!key || fitted.current === key) return
    // A trip: fit the trip itself (start, destination, board/exit points), not the whole length of every route.
    // No trip markers (driver): fit the active route.
    const extra = markers.filter((k) => k.kind === 'dest' || k.kind === 'stop' || k.kind === 'from').map((k) => k.at)
    const all = extra.length ? extra : (active ? active.line : lines.flatMap((l) => l.line))
    if (all.length) {
      bounds.current = L.latLngBounds(all.map(ll))
      m.fitBounds(bounds.current, pad())
    }
    touched.current = false
    fitted.current = key
  }, [lines, markers, fitKey])

  return (
    <div className="mapwrap">
      <div ref={el} className="map" role="application" aria-label="Map of Iligan jeepney routes" />
      {slow && <div className="maptoast" role="status">Map background is slow or offline. Routes and markers still work.</div>}
    </div>
  )
}
