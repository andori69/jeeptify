import { useEffect, useState } from 'react'
import { lineLength, pointAt } from './geo'
import type { Jeep } from './live'
import type { Route } from './routes'

export const SIM_MPS = 5.5 // about 20 km/h

/** SIMULATED jeeps bouncing along each route. Not real data; the UI must label it. Ticks every 2 s. */
export function useSimJeeps(routes: Route[], perRoute: number): Jeep[] {
  const [jeeps, setJeeps] = useState<Jeep[]>([])
  useEffect(() => {
    if (routes.length === 0) { setJeeps([]); return }
    const t0 = Date.now()
    const tick = () => {
      const now = Date.now()
      const s = ((now - t0) / 1000) * SIM_MPS
      const out: Jeep[] = []
      for (const r of routes) {
        const len = lineLength(r.line)
        for (let i = 0; i < perRoute; i++) {
          const d = (s + (2 * len / perRoute) * i) % (2 * len)
          const out_ = d <= len
          const along = out_ ? d : 2 * len - d
          out.push({
            id: `sim-${r.id}-${i}`, routeId: r.id, dir: out_ ? 'out' : 'in', at: pointAt(r.line, along),
            along, speed: SIM_MPS, ts: now, simulated: true,
          })
        }
      }
      setJeeps(out)
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [routes, perRoute])
  return jeeps
}
