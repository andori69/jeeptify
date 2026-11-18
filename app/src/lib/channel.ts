/**
 * DEMO transport: localStorage + storage events, so two frames/tabs of one browser see each other.
 * Production replaces this file with Supabase Realtime; callers only use put/remove/readAll/subscribe.
 */
const P = 'jt:'

export function put(kind: string, id: string, value: unknown) {
  try { localStorage.setItem(`${P}${kind}:${id}`, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

export function remove(kind: string, id: string) {
  try { localStorage.removeItem(`${P}${kind}:${id}`) } catch { /* storage unavailable */ }
}

export function readAll<T extends { ts: number }>(kind: string, maxAgeMs: number, now = Date.now()): T[] {
  const out: T[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(`${P}${kind}:`)) continue
      const v = JSON.parse(localStorage.getItem(k) ?? 'null') as T | null
      if (v && now - v.ts <= maxAgeMs) out.push(v)
    }
  } catch { /* storage unavailable or corrupt */ }
  return out
}

export function subscribe(cb: () => void): () => void {
  const on = (e: StorageEvent) => { if (e.key?.startsWith(P)) cb() }
  window.addEventListener('storage', on)
  return () => window.removeEventListener('storage', on)
}
