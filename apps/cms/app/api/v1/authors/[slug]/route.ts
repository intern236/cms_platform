import type { NextRequest } from 'next/server'
import { notFound, withSite } from '@/lib/api/handler'
import { author } from '@/lib/api/serialize'
import { getAuthorBySlug } from '@/lib/content/authors'
import { livePosts } from '@/lib/content/posts'

export const dynamic = 'force-dynamic'

/** One author with at least one published post. 404 otherwise. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return withSite(req, async ({ ws, tx }) => {
    if (!ws.settings.blog.authors || !/^[a-z0-9-]{1,96}$/.test(slug)) return notFound()
    const a = await getAuthorBySlug(tx, ws.id, slug)
    if (!a) return notFound()
    const { total } = await livePosts(tx, ws.id, { limit: 1, offset: 0, authorId: a.id })
    return total > 0 ? author(a, total) : notFound()
  })
}
