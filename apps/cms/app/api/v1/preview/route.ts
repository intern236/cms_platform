import type { NextRequest } from 'next/server'
import { notFound, withSite } from '@/lib/api/handler'
import { detail } from '@/lib/api/serialize'
import { getPost } from '@/lib/content/posts'
import { readPreviewToken } from '@/lib/integrations/preview'

export const dynamic = 'force-dynamic'

/**
 * A draft, for the site's /preview page. Needs BOTH the site key and a preview
 * token minted for this workspace in the last 15 minutes.
 */
export function GET(req: NextRequest) {
  return withSite(req, async ({ ws, tx }) => {
    const postId = await readPreviewToken(req.nextUrl.searchParams.get('token') ?? '', ws.id)
    if (!postId) return notFound()
    const post = await getPost(tx, ws.id, postId)
    return post ? detail(tx, ws, post, false) : notFound()
  })
}
