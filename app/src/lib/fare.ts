import fares from '../data/fares.json'

export type Vehicle = 'traditional' | 'modern'
export type Passenger = 'regular' | 'student' | 'senior' | 'pwd'

export const fareTable = fares

const roundTo = (x: number, step: number) => Math.round(x / step) * step

/** Estimate for one leg. Distance is metres along the route line. */
export function legFare(meters: number, vehicle: Vehicle, who: Passenger): number {
  const t = fares[vehicle]
  const km = meters / 1000
  const regular = t.base + Math.max(0, km - t.base_km) * t.per_km
  const amount = who === 'regular' ? regular : regular * (1 - fares.discount)
  return roundTo(amount, fares.round_to)
}
