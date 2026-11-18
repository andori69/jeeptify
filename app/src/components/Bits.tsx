import type { ReactNode } from 'react'

export type Tone = 'ok' | 'idle' | 'warn' | 'bad' | 'sim'

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

/** Route code styled like the signboard on a jeepney's windshield: the thing commuters actually look for. */
export function Plate({ code }: { code: string }) {
  return <span className="plate">{code}</span>
}
