import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { getWorkspaceBySlug, type WorkspaceRef } from '@/lib/auth/access'
import { inWorkspace, type Tx } from '@/lib/db'
import { verifySiteKey } from '@/lib/integrations/site-keys'

/**
 * Wraps every /api/v1 route: authenticates the site key, resolves the workspace,
 * opens a workspace-pinned transaction, and turns the result into JSON.
 *
 * - No key, a wrong key or a revoked key → 401, identical for all three.
 * - Responses are `private, no-store`: the client site caches them (Next's fetch
 *   cache / ISR); a shared proxy in between must not.
 * - No CORS headers. The API is server-to-server only, so a browser on another
 *   origin cannot read it even if a key leaked into one.
 * - A simple per-key limit (600 requests a minute, per server process) stops a
 *   runaway build loop from hammering the database.
 */

export type ApiContext = { ws: WorkspaceRef; tx: Tx; req: NextRequest }

const WINDOW_MS = 60_000
const PER_KEY = 600
const buckets = new Map<string, { start: number; n: number }>()

function limited(keyId: string): boolean {
  const now = Date.now()
  const b = buckets.get(keyId)
  if (!b || now - b.start > WINDOW_MS) {
    buckets.set(keyId, { start: now, n: 1 })
    if (buckets.size > 10_000) buckets.clear()
    return false
  }
  b.n += 1
  return b.n > PER_KEY
}

const HEADERS = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS })
}

export async function withSite(
  req: NextRequest,
  fn: (ctx: ApiContext) => Promise<Response | unknown>
): Promise<Response> {
  const keyed = await verifySiteKey(req.headers.get('authorization'))
  if (!keyed) return json({ error: 'Unauthorized' }, 401)
  if (limited(keyed.keyId)) return json({ error: 'Too many requests' }, 429)
  const ws = await getWorkspaceBySlug(keyed.slug)
  if (!ws || ws.archived) return json({ error: 'Unauthorized' }, 401)
  try {
    const result = await inWorkspace(ws.id, (tx) => fn({ ws, tx, req }))
    return result instanceof Response ? result : json(result)
  } catch (error) {
    console.error('[api]', req.nextUrl.pathname, error)
    return json({ error: 'Server error' }, 500)
  }
}

export function intParam(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null || value === '') return fallback
  if (!/^\d{1,6}$/.test(value)) return null
  const n = Number(value)
  return n < min || n > max ? null : n
}

export const notFound = () => json({ error: 'Not found' }, 404)
