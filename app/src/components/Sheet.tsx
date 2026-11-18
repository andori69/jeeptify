import { useRef, useState, type ReactNode } from 'react'

export type Snap = 'peek' | 'half' | 'full'
const ORDER: Snap[] = ['peek', 'half', 'full']
const DECEL = 0.998 // Apple's scroll deceleration rate, used to project where a flick would come to rest

/** Visible height of the sheet at each snap, as a fraction of the container (peek is fixed px, see css). */
export const SNAP_FRACTION: Record<Snap, number> = { peek: 0.26, half: 0.5, full: 0.88 }

/**
 * Phone bottom sheet. The handle is a real button (click or Enter cycles snaps) and also drags:
 * the sheet follows the finger 1:1, then a release velocity is projected forward to choose the snap point.
 * Only transform is animated.
 */
export function Sheet({ children, onSnap, label }: { children: ReactNode; onSnap?: (s: Snap) => void; label: string }) {
  const [snap, setSnap] = useState<Snap>('half')
  const panel = useRef<HTMLElement>(null)
  const drag = useRef<{ y0: number; base: number; hist: { y: number; t: number }[]; moved: boolean } | null>(null)

  const apply = (s: Snap) => { setSnap(s); onSnap?.(s) }
  // translateY needed to show `frac` of the container, given the panel is 88% tall
  const offsetFor = (s: Snap, H: number) => (SNAP_FRACTION.full - SNAP_FRACTION[s]) * H

  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = panel.current
    if (!p || !p.parentElement) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const H = p.parentElement.clientHeight
    // start from where the sheet is on screen right now (it may be mid-animation), not from its target snap
    const base = p.getBoundingClientRect().top - p.parentElement.getBoundingClientRect().top - (H - p.offsetHeight)
    drag.current = { y0: e.clientY, base: Math.max(0, base), hist: [{ y: e.clientY, t: e.timeStamp }], moved: false }
    p.style.transition = 'none'
  }
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current, p = panel.current
    if (!d || !p || !p.parentElement) return
    const H = p.parentElement.clientHeight
    const max = offsetFor('peek', H)
    const o = Math.max(0, Math.min(max, d.base + (e.clientY - d.y0)))
    if (Math.abs(e.clientY - d.y0) > 4) d.moved = true
    d.hist.push({ y: e.clientY, t: e.timeStamp }); if (d.hist.length > 5) d.hist.shift()
    p.style.transform = `translateY(${o}px)`
  }
  const up = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current, p = panel.current
    drag.current = null
    if (!d || !p || !p.parentElement) return
    const H = p.parentElement.clientHeight
    p.style.transition = ''
    if (!d.moved) { p.style.transform = ''; return } // a tap: the click handler cycles
    const a = d.hist[0], b = d.hist[d.hist.length - 1]
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0 // px/s, + is downward
    const current = Math.max(0, Math.min(offsetFor('peek', H), d.base + (e.clientY - d.y0)))
    const projected = current + (v / 1000) * DECEL / (1 - DECEL)
    let best: Snap = 'half', bd = Infinity
    for (const s of ORDER) { const dd = Math.abs(offsetFor(s, H) - projected); if (dd < bd) { bd = dd; best = s } }
    p.style.transform = ''
    apply(best)
    d.moved = false
    ;(e.target as HTMLElement).dataset.dragged = '1'
  }
  const click = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.dataset.dragged) { delete e.currentTarget.dataset.dragged; return }
    const next: Snap = snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek'
    const p = panel.current
    if (e.detail === 0 && p) { // keyboard activation: no animation
      p.style.transition = 'none'
      apply(next)
      requestAnimationFrame(() => requestAnimationFrame(() => { p.style.transition = '' }))
      return
    }
    apply(next)
  }

  return (
    <aside ref={panel} className={`panel sheet sheet-${snap}`} aria-label={label}>
      <button
        className="grip" aria-label={`Route details panel, ${snap === 'full' ? 'fully open' : snap === 'half' ? 'half open' : 'collapsed'}. Activate to resize.`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}
      ><span className="grip-bar" /></button>
      {children}
    </aside>
  )
}
