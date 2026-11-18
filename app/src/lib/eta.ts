/** Speed assumed when no reported speed is usable: 15 km/h, a slow city jeepney. */
export const ASSUMED_MPS = 15 / 3.6
const MIN_USABLE_MPS = 1.5

export interface Speed { mps: number; assumed: boolean }

export function pickSpeed(reported: number | null | undefined): Speed {
  return reported != null && reported >= MIN_USABLE_MPS ? { mps: reported, assumed: false } : { mps: ASSUMED_MPS, assumed: true }
}

export function etaMinutes(distM: number, mps: number): number {
  if (distM <= 0) return 0
  return Math.max(1, Math.round(distM / mps / 60))
}

export function fmtEta(min: number): string {
  if (min < 1) return 'arriving'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}
