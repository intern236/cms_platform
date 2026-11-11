import type { NextRequest } from 'next/server'
import { intParam, json, withSite } from '@/lib/api/handler'
import { summaries } from '@/lib/api/serialize'
import { getAuthorBySlug } from '@/lib/content/authors'
import { livePosts } from '@/lib/content/posts'
import { slugify } from '@/lib/slug'

export const dynamic = 'force-dynamic'

/**
 * Published posts, newest first.
 * ?page=1&perPage=12&tag=<tag slug>&author=<author slug>
 */
export function GET(req: NextRequest) {
  return withSite(req, async ({ ws, tx }) => {
    const sp = req.nextUrl.searchParams
    const page = intParam(sp.get('page'), 1, 1, 10_000)
    const perPage = intParam(sp.get('perPage'), ws.settings.blog.postsPerPage, 1, 100)
    if (page === null || perPage === null) return json({ error: 'Invalid page' }, 400)
    const tagParam = sp.get('tag')
    const tag = tagParam ? slugify(tagParam) : undefined
    let authorId: string | undefined
    const authorSlug = sp.get('author')
    if (authorSlug) {
      const a = await getAuthorBySlug(tx, ws.id, slugify(authorSlug))
      if (!a) return { items: [], page, perPage, total: 0, totalPages: 0 }
      authorId = a.id
    }
    const { posts, total } = await livePosts(tx, ws.id, { limit: perPage, offset: (page - 1) * perPage, tagSlug: tag, authorId })
    return { items: await summaries(tx, ws, posts), page, perPage, total, totalPages: Math.ceil(total / perPage) }
  })
}
