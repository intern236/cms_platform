import type {
  ApiAuthor,
  ApiContactResult,
  ApiPage,
  ApiPostDetail,
  ApiPostSummary,
  ApiSite,
  ApiTagWithCount,
} from './types'

/**
 * The raw HTTP client for the CMS content API. Server-side only: it carries the
 * site key, which must never reach a browser.
 *
 * Every read is cached by Next for `revalidate` seconds (default 60) and tagged
 * `cms`, so the revalidate webhook can refresh everything at once. That 60s is
 * also how scheduled posts appear on time without anyone publishing them.
 */

export type CmsOptions = {
  /** Where the CMS lives, e.g. https://cms.youragency.com */
  url: string
  /** This site's key, from the CMS: Settings → Website & keys. */
  key: string
  /** Seconds to cache reads. Default 60. */
  revalidate?: number
}

export class CmsError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export const CACHE_TAG = 'cms'

const building = () => process.env.NEXT_PHASE === 'phase-production-build'

/**
 * The CMS could not be reached while `next build` prerendered a page. Rather than
 * bake placeholder content into a static page (which no webhook could refresh,
 * since it holds no 'cms'-tagged fetch), opt the page out of prerendering: it
 * renders on its first request instead. Outside a prerender this is a no-op and
 * the caller falls back to placeholder data.
 */
export async function skipPrerender(): Promise<void> {
  const { connection } = await import('next/server')
  await connection()
}

export function createClient(options: CmsOptions) {
  const base = (options.url || '').replace(/\/+$/, '')
  const revalidate = options.revalidate ?? 60
  if (typeof window !== 'undefined') throw new Error('@cms/site-kit: the CMS client is server-only.')

  async function get<T>(path: string, init?: { cache?: false }): Promise<T | null> {
    if (!base || !options.key) {
      throw new CmsError('CMS_URL and CMS_SITE_KEY must be set. See the site kit README.', 0)
    }
    const res = await fetch(`${base}/api/v1${path}`, {
      headers: { authorization: `Bearer ${options.key}`, accept: 'application/json' },
      ...(init?.cache === false ? { cache: 'no-store' as const } : { next: { revalidate, tags: [CACHE_TAG] } }),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new CmsError(`CMS answered ${res.status} for ${path}`, res.status)
    return (await res.json()) as T
  }

  /** Lists degrade to empty during `next build` if the CMS cannot be reached, so a deploy never fails on it. */
  async function list<T>(path: string, empty: T): Promise<T> {
    try {
      return (await get<T>(path)) ?? empty
    } catch (error) {
      if (!building()) throw error
      await skipPrerender()
      console.warn(`[site-kit] CMS unreachable during build (${path}); rendering empty, will fill at runtime.`)
      return empty
    }
  }

  const q = (params: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v))
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  const emptyPage = <T>(): ApiPage<T> => ({ items: [], page: 1, perPage: 0, total: 0, totalPages: 0 })

  return {
    site: () => get<ApiSite>('/site'),
    posts: (opts: { page?: number; perPage?: number; tag?: string; author?: string } = {}) =>
      list<ApiPage<ApiPostSummary>>(`/posts${q(opts)}`, emptyPage()),
    post: (slug: string) => get<ApiPostDetail>(`/posts/${encodeURIComponent(slug)}`),
    tags: () => list<{ items: ApiTagWithCount[] }>('/tags', { items: [] }),
    authors: () => list<{ items: ApiAuthor[] }>('/authors', { items: [] }),
    author: (slug: string) => get<ApiAuthor>(`/authors/${encodeURIComponent(slug)}`),
    sitemap: () => list<{ posts: { slug: string; publishedAt: string; updatedAt: string }[]; tags: string[]; authors: string[] }>('/sitemap', { posts: [], tags: [], authors: [] }),
    feed: () =>
      list<{ items: { slug: string; title: string; description: string; category: string | null; publishedAt: string; updatedAt: string; author: string | null }[] }>(
        '/feed',
        { items: [] }
      ),
    /** Never cached: a preview must show the latest draft. */
    preview: (token: string) => get<ApiPostDetail>(`/preview${q({ token })}`, { cache: false }),
    async contact(body: Record<string, unknown>, visitor: { ip: string; userAgent: string }): Promise<{ status: number; result: ApiContactResult }> {
      const res = await fetch(`${base}/api/v1/contact`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${options.key}`,
          'content-type': 'application/json',
          'x-cms-visitor-ip': visitor.ip,
          'x-cms-visitor-ua': visitor.userAgent.slice(0, 300),
        },
        body: JSON.stringify(body),
      })
      const result = (await res.json().catch(() => ({ ok: false, error: 'The CMS did not answer.' }))) as ApiContactResult
      return { status: res.status, result }
    },
  }
}

export type CmsClient = ReturnType<typeof createClient>
