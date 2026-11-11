import type { NextRequest } from 'next/server'
import { withSite } from '@/lib/api/handler'
import { authorsByIds } from '@/lib/content/authors'
import { livePosts } from '@/lib/content/posts'

export const dynamic = 'force-dynamic'

/** The 30 newest posts with what an RSS item needs. */
export function GET(req: NextRequest) {
  return withSite(req, async ({ ws, tx }) => {
    const { posts } = await livePosts(tx, ws.id, { limit: 30, offset: 0 })
    const authors = await authorsByIds(tx, ws.id, posts.map((p) => p.authorId ?? '').filter(Boolean))
    return {
      items: posts.map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.excerpt || p.description,
        category: p.category,
        publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        author: (ws.settings.blog.authors && p.authorId && authors.get(p.authorId)?.name) || null,
      })),
    }
  })
}
