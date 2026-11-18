import type { MarkerKind } from './MapView'

const INK = '#17262e', LAMP = '#f2b31b', WHITE = '#ffffff', WAITING = '#a63d57'

const PERSON = '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/>'

/** Person on a round badge: you, your start, or (maroon) someone waiting. */
const person = (fill: string, ring: string) =>
  `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="${fill}" stroke="${ring}" stroke-width="2.5"/><g transform="translate(4 4)" fill="${WHITE}">${PERSON}</g></svg>`

/** Destination: a map pin with a yellow centre. */
const pin = (size = 1) =>
  `<svg viewBox="0 0 28 36" width="${28 * size}" height="${36 * size}" aria-hidden="true"><path d="M14 1.5C7.3 1.5 2.5 6.6 2.5 12.9 2.5 21 14 34.5 14 34.5S25.5 21 25.5 12.9C25.5 6.6 20.7 1.5 14 1.5z" fill="${INK}" stroke="${WHITE}" stroke-width="2"/><circle cx="14" cy="13" r="5.5" fill="${LAMP}"/></svg>`

/** Jeepney, side view, painted in the route's colour, with its code on a signboard above. */
const jeep = (color: string, code: string) =>
  `<span class="jcode">${code}</span><svg viewBox="0 0 50 28" width="50" height="28" aria-hidden="true"><rect x="3" y="4" width="35" height="16" rx="3" fill="${color}" stroke="${INK}" stroke-width="1.8"/><rect x="37" y="11" width="10" height="9" rx="2.5" fill="${color}" stroke="${INK}" stroke-width="1.8"/><rect x="7" y="7.5" width="7" height="6" rx="1" fill="${WHITE}"/><rect x="16" y="7.5" width="7" height="6" rx="1" fill="${WHITE}"/><rect x="25" y="7.5" width="7" height="6" rx="1" fill="${WHITE}"/><circle cx="45" cy="14.5" r="1.6" fill="${LAMP}" stroke="${INK}" stroke-width=".8"/><circle cx="12" cy="21.5" r="4.2" fill="${INK}"/><circle cx="12" cy="21.5" r="1.6" fill="${WHITE}"/><circle cx="35" cy="21.5" r="4.2" fill="${INK}"/><circle cx="35" cy="21.5" r="1.6" fill="${WHITE}"/></svg>`

export function iconSvg(kind: MarkerKind, opt: { code?: string; color?: string } = {}): string {
  switch (kind) {
    case 'me': return person(INK, WHITE)
    case 'from': return person(INK, LAMP)
    case 'wait': return person(WAITING, WHITE)
    case 'dest': return pin()
    case 'jeep': case 'sim': return jeep(opt.color ?? LAMP, opt.code ?? '')
    default: return ''
  }
}

/** [width, height, anchorX, anchorY] for the map marker of each kind. */
export const ICON_BOX: Record<MarkerKind, [number, number, number, number]> = {
  me: [32, 32, 16, 16], from: [32, 32, 16, 16], wait: [32, 32, 16, 16],
  dest: [28, 36, 14, 35], jeep: [50, 44, 25, 30], sim: [50, 44, 25, 30],
  stop: [14, 14, 7, 7], lm: [10, 10, 5, 5],
}

/** The same drawings in the interface (legend, form, trip summary). */
export function MapIcon({ kind, code, color, size = 1 }: { kind: MarkerKind; code?: string; color?: string; size?: number }) {
  const html = kind === 'dest' ? pin(size) : iconSvg(kind, { code, color })
  return <span className={`pin pin-${kind} ico`} dangerouslySetInnerHTML={{ __html: html }} />
}
