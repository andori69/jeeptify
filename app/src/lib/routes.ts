import geo from '../data/routes.geojson.json'
import names from '../data/route-names.json'
import { lineLength, type LonLat } from './geo'

export type Direction = 'out' | 'in'

export interface Route {
  id: string
  name: string
  color: string
  line: LonLat[]
  meters: number
}

const nameById = new Map(names.map((n) => [n.routeId, n]))

/** Route colour codes. Hues follow BetterIliganCity's route colours, tamed for a grey map and made unique. NOT verified as Iligan's official code. */
export const ROUTE_COLORS: Record<string, string> = {
  '1N': '#2e9e5b', '1B': '#2f80ed', '5A': '#3a3fb5', '6B': '#14a3a3', '6C': '#d43ba8', '7A': '#7a4fe0', '7C': '#e5498a',
  '7G': '#e4572e', '7H': '#b24bd1', '8F': '#5b4b9a', '8H': '#f2994a', '9B-9C': '#d8403a', '9F': '#9b2f5c',
}

export const routes: Route[] = geo.features.map((f) => {
  const id = f.properties.routeId
  const n = nameById.get(id)
  const line = f.geometry.coordinates as LonLat[]
  return { id, name: n?.routeName ?? id, color: ROUTE_COLORS[id] ?? '#536771', line, meters: lineLength(line) }
})

/** Stored geometry is one direction only; "in" is the same line reversed (placeholder until re-traced). */
export function directed(route: Route, dir: Direction): LonLat[] {
  return dir === 'out' ? route.line : [...route.line].reverse()
}
