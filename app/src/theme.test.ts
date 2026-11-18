import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const tok: Record<string, string> = {}
for (const m of css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)) tok[m[1]] = m[2]

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(tok[a]), lum(tok[b])].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground, background]: every text pairing the CSS uses.
const PAIRS: [string, string][] = [
  ['white', 'harbor'], ['white', 'ok'], ['white', 'bad'], ['white', 'idle'], ['white', 'warn'], ['white', 'sim'],
  ['ink', 'ground'], ['ink', 'panel'], ['ink', 'lamp'], ['ink', 'harbor-tint'], ['muted', 'panel'], ['muted', 'white'],
  ['muted', 'ground'], ['muted', 'harbor-tint'], ['harbor', 'white'], ['warn', 'warn-tint'], ['white', 'ink'], ['lamp-ink', 'lamp'], ['harbor', 'harbor-tint'], ['harbor', 'panel'], ['white', 'harbor-deep'],
]

describe('brand colour contrast (WCAG AA, 4.5:1)', () => {
  it('parses the tokens', () => expect(Object.keys(tok).length).toBeGreaterThan(10))
  for (const [f, b] of PAIRS) {
    it(`${f} on ${b}`, () => expect(ratio(f, b)).toBeGreaterThanOrEqual(4.5))
  }
})
