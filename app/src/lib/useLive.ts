import { useEffect, useState } from 'react'
import { readAll, subscribe } from './channel'

/** Live items of one kind. Does nothing (no listener, no timer) while `enabled` is false. */
export function useLive<T extends { ts: number }>(kind: string, maxAgeMs: number, enabled: boolean): T[] {
  const [items, setItems] = useState<T[]>([])
  useEffect(() => {
    if (!enabled) { setItems([]); return }
    const refresh = () => setItems(readAll<T>(kind, maxAgeMs))
    refresh()
    const off = subscribe(refresh)
    const prune = setInterval(refresh, 15_000) // drop stale items even if no event arrives
    return () => { off(); clearInterval(prune) }
  }, [kind, maxAgeMs, enabled])
  return items
}
