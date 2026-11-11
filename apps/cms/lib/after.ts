import 'server-only'
import { after } from 'next/server'

/** Run work after the response is sent; falls back to fire-and-forget outside a request (scripts, tests). */
export function runAfter(fn: () => Promise<unknown>) {
  const safe = () => fn().catch((e) => console.error('[after]', e))
  try {
    after(safe)
  } catch {
    void safe()
  }
}
