import type { NextRequest } from 'next/server'
import { withSite } from '@/lib/api/handler'
import { author } from '@/lib/api/serialize'
import { authorsByIds } from '@/lib/content/authors'
import { liveAuthorIds, livePosts } from '@/lib/content/posts'

export const dynamic = 'force-dynamic'

/** Authors with at least one published post. */
export function GET(req: NextRequest) {
  return withSite(req, async ({ ws, tx }) => {
    if (!ws.settings.blog.authors) return { items: [] }
    const found = await authorsByIds(tx, ws.id, await liveAuthorIds(tx, ws.id))
    const items = []
    for (const a of [...found.values()].sort((x, y) => x.name.localeCompare(y.name))) {
      const { total } = await livePosts(tx, ws.id, { limit: 1, offset: 0, authorId: a.id })
      items.push(author(a, total))
    }
    return { items }
  })
}
