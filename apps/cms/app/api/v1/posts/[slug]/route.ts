import type { NextRequest } from 'next/server'
import { notFound, withSite } from '@/lib/api/handler'
import { detail } from '@/lib/api/serialize'
import { livePostBySlug } from '@/lib/content/posts'

export const dynamic = 'force-dynamic'

/** One published post, with its body, FAQs and related posts. 404 for drafts and scheduled posts. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return withSite(req, async ({ ws, tx }) => {
    if (!/^[a-z0-9-]{1,96}$/.test(slug)) return notFound()
    const post = await livePostBySlug(tx, ws.id, slug)
    return post ? detail(tx, ws, post) : notFound()
  })
}
