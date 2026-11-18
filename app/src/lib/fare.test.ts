import { describe, expect, it } from 'vitest'
import { legFare } from './fare'

// Hand-computed from data/fares.json (2026-09-28), NOT from a printed LTFRB matrix. Replace with the matrix when available.
// traditional: 14 + 2.00/km after 4 km. modern: 17 + 2.40/km after 4 km. discount 20%, rounded to nearest 0.25.
const cases: [string, number, 'traditional' | 'modern', 'regular' | 'student' | 'senior' | 'pwd', number][] = [
  ['trad 0 m regular', 0, 'traditional', 'regular', 14],
  ['trad exactly 4 km regular', 4000, 'traditional', 'regular', 14],
  ['trad 5 km regular', 5000, 'traditional', 'regular', 16],
  ['trad 4.5 km regular', 4500, 'traditional', 'regular', 15],
  ['trad 4 km student (11.2 -> 11.25)', 4000, 'traditional', 'student', 11.25],
  ['trad 6.5 km senior (15.2 -> 15.25)', 6500, 'traditional', 'senior', 15.25],
  ['trad 5 km pwd (12.8 -> 12.75)', 5000, 'traditional', 'pwd', 12.75],
  ['modern 4 km regular', 4000, 'modern', 'regular', 17],
  ['modern 10 km regular (31.4 -> 31.5)', 10000, 'modern', 'regular', 31.5],
  ['modern 4 km student (13.6 -> 13.5)', 4000, 'modern', 'student', 13.5],
  ['modern 10 km senior (25.12 -> 25)', 10000, 'modern', 'senior', 25],
]

describe('legFare', () => {
  it.each(cases)('%s', (_n, m, v, who, want) => {
    expect(legFare(m, v, who)).toBe(want)
  })
})
