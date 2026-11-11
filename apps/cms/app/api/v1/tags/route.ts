import type { NextRequest } from 'next/server'
import { withSite } from '@/lib/api/handler'
import { liveTags } from '@/lib/content/posts'

export const dynamic = 'force-dynamic'

/** Every tag on a published post, with counts. */
export function GET(req: NextRequest) {
  return withSite(req, async ({ ws, tx }) => ({ items: await liveTags(tx, ws.id) }))
}
