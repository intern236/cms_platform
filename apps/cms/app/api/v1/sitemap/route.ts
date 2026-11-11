import type { NextRequest } from 'next/server'
import { withSite } from '@/lib/api/handler'
import { authorsByIds } from '@/lib/content/authors'
import { liveAuthorIds, liveIndex, liveTags } from '@/lib/content/posts'

export const dynamic = 'force-dynamic'

/** Everything public, for the site's sitemap.xml. */
export function GET(req: NextRequest) {
  return withSite(req, async ({ ws, tx }) => {
    const posts = await liveIndex(tx, ws.id)
    const tags = await liveTags(tx, ws.id)
    const authors = ws.settings.blog.authors ? [...(await authorsByIds(tx, ws.id, await liveAuthorIds(tx, ws.id))).values()] : []
    return {
      posts: posts.map((p) => ({ slug: p.slug, publishedAt: p.publishedAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
      tags: tags.map((t) => t.slug),
      authors: authors.map((a) => a.slug),
    }
  })
}
