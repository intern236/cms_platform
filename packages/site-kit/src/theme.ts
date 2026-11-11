import { createClient, skipPrerender, type CmsOptions } from './client'
import type { ApiAuthor, ApiPostBody, ApiPostDetail, ApiPostSummary, ApiSite, SocialPlatform } from './types'

/**
 * THE THEME CONTRACT.
 *
 * Everything a theme renders, as plain props with every URL already built and
 * every date already formatted for the client's locale. A theme never calls the
 * API itself and never builds a link by hand.
 */

export type Site = ApiSite & {
  /** The public URL this site is served from (SITE_URL, else the URL set in the CMS). */
  url: string
  social: { platform: SocialPlatform; url: string }[]
}

export interface TagRef {
  label: string
  slug: string
  url: string
}

export interface AuthorRef {
  id: string
  name: string
  slug: string
  /** The profile page, or null when author pages are switched off. */
  url: string | null
  role: string | null
  bio: string | null
  avatar: { src: string; srcSet: string | null; alt: string } | null
  links: ApiAuthor['links']
  postCount: number
}

export interface CoverRef {
  src: string
  srcSet?: string
  alt: string
  caption: string | null
  width: number
  height: number
  ogSrc: string
}

export interface PostSummary {
  id: string
  slug: string
  url: string
  title: string
  /** The reader-facing line under the title. Null renders nothing. */
  excerpt: string | null
  category: string | null
  tags: TagRef[]
  publishedAt: Date
  updatedAt: Date
  /** "21 Aug 2026", in the client's locale. */
  dateLabel: string
  readingMinutes: number
  cover: CoverRef | null
  author: AuthorRef | null
}

export type PostBody = ApiPostBody

export interface PostDetail extends PostSummary {
  description: string
  seoTitle: string | null
  body: PostBody
  faqs: { question: string; answer: string }[]
  bodyFaqs: { question: string; answer: string }[]
  emitSchema: boolean
}

export interface Paged<T> {
  items: T[]
  page: number
  totalPages: number
  total: number
  prevUrl: string | null
  nextUrl: string | null
  pages: { number: number; url: string; current: boolean }[]
}

export type SiteKitOptions = CmsOptions & {
  /** The site's own public URL, e.g. https://acme.com. Defaults to the one set in the CMS. */
  siteUrl?: string
  /** Where author profiles live on this site. Default /authors. */
  authorsPath?: string
}

export function createCms(options: SiteKitOptions) {
  const api = createClient(options)
  const authorsPath = options.authorsPath ?? '/authors'

  /**
   * The client's settings. Deliberately NOT memoised here: Next already dedupes
   * identical fetches within a render, and every page must make the fetch itself
   * so it is tagged 'cms' — a page that reused an in-memory copy would carry no
   * tag, and the CMS webhook could never refresh it.
   */
  async function site(): Promise<Site> {
    let raw: ApiSite | null = null
    try {
      raw = await api.site()
    } catch (error) {
      if (process.env.NEXT_PHASE !== 'phase-production-build') throw error
      await skipPrerender()
      console.warn('[site-kit] CMS unreachable during build; using placeholder site settings.')
    }
    const fallback: ApiSite = {
      name: 'Website',
      url: '',
      description: '',
      language: 'en',
      dateLocale: 'en-GB',
      legalName: '',
      logoUrl: null,
      accent: '#18181b',
      social: [],
      blog: { title: 'Blog', description: '', basePath: '/blog', postsPerPage: 12, authors: true, faqs: true, htmlPages: true, midPostCta: true },
      cta: null,
      contact: { enabled: true, topics: [] },
    }
    const s = raw ?? fallback
    return { ...s, url: (options.siteUrl || s.url || 'http://localhost:3000').replace(/\/+$/, '') }
  }

  function blogPath(s: Site, ...segments: string[]) {
    return [s.blog.basePath, ...segments.map(encodeURIComponent)].join('/')
  }

  function dateLabel(s: Site, iso: string) {
    try {
      return new Date(iso).toLocaleDateString(s.dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return new Date(iso).toDateString()
    }
  }

  function author(s: Site, a: ApiAuthor): AuthorRef {
    return { ...a, url: s.blog.authors ? `${authorsPath}/${encodeURIComponent(a.slug)}` : null }
  }

  function summary(s: Site, p: ApiPostSummary): PostSummary {
    return {
      id: p.id,
      slug: p.slug,
      url: blogPath(s, p.slug),
      title: p.title,
      excerpt: p.excerpt,
      category: p.category,
      tags: p.tags.map((t) => ({ ...t, url: blogPath(s, 'tag', t.slug) })),
      publishedAt: new Date(p.publishedAt),
      updatedAt: new Date(p.updatedAt),
      dateLabel: dateLabel(s, p.publishedAt),
      readingMinutes: p.readingMinutes,
      cover: p.cover ? { ...p.cover, srcSet: p.cover.srcSet ?? undefined } : null,
      author: p.author ? author(s, p.author) : null,
    }
  }

  function detail(s: Site, p: ApiPostDetail): PostDetail {
    return {
      ...summary(s, p),
      description: p.description,
      seoTitle: p.seoTitle,
      body: p.body,
      faqs: p.faqs,
      bodyFaqs: p.bodyFaqs,
      emitSchema: p.emitSchema,
    }
  }

  function paged<T>(items: T[], page: number, totalPages: number, total: number, base: string): Paged<T> {
    const url = (n: number) => (n <= 1 ? base : `${base}/page/${n}`)
    return {
      items,
      page,
      total,
      totalPages: Math.max(1, totalPages),
      prevUrl: page > 1 ? url(page - 1) : null,
      nextUrl: page < totalPages ? url(page + 1) : null,
      pages: Array.from({ length: Math.max(1, totalPages) }, (_, i) => ({ number: i + 1, url: url(i + 1), current: i + 1 === page })),
    }
  }

  const validPage = (n: number) => Number.isInteger(n) && n >= 1 && n <= 10_000

  return {
    api,
    site,
    blogPath: async (...segments: string[]) => blogPath(await site(), ...segments),

    /** The newest posts, for a home page. */
    async latest(limit = 3): Promise<PostSummary[]> {
      const s = await site()
      const res = await api.posts({ page: 1, perPage: limit })
      return res.items.map((p) => summary(s, p))
    },

    /** /blog and /blog/page/N. Null for a page number past the end (→ 404). */
    async blogIndex(page = 1) {
      if (!validPage(page)) return null
      const s = await site()
      const res = await api.posts({ page, perPage: s.blog.postsPerPage })
      if (page > 1 && page > res.totalPages) return null
      const tags = await api.tags()
      return {
        site: s,
        posts: paged(res.items.map((p) => summary(s, p)), page, res.totalPages, res.total, s.blog.basePath),
        tags: tags.items.map((t) => ({ ...t, url: blogPath(s, 'tag', t.slug) })),
      }
    },

    /** /blog/tag/[tag]. Null when no live post carries the tag. */
    async tag(slug: string, page = 1) {
      if (!validPage(page)) return null
      const s = await site()
      const res = await api.posts({ page, perPage: s.blog.postsPerPage, tag: slug })
      if (res.total === 0 || page > res.totalPages) return null
      const first = res.items[0]?.tags.find((t) => t.slug === slug)
      const label = first?.label ?? slug
      return {
        site: s,
        tag: { label, slug, url: blogPath(s, 'tag', slug) },
        posts: paged(res.items.map((p) => summary(s, p)), page, res.totalPages, res.total, blogPath(s, 'tag', slug)),
      }
    },

    /** /blog/[slug]. Null for drafts, scheduled posts and unknown slugs. */
    async post(slug: string) {
      if (!/^[a-z0-9-]{1,96}$/.test(slug)) return null
      const s = await site()
      const p = await api.post(slug)
      if (!p) return null
      return { site: s, post: detail(s, p), related: p.related.map((r) => summary(s, r)) }
    },

    /** The /preview page. Never cached. */
    async preview(token: string) {
      if (!token || token.length > 1000) return null
      const s = await site()
      const p = await api.preview(token)
      return p ? { site: s, post: detail(s, p), related: [] as PostSummary[] } : null
    },

    async authors(): Promise<AuthorRef[]> {
      const s = await site()
      if (!s.blog.authors) return []
      return (await api.authors()).items.map((a) => author(s, a))
    },

    async author(slug: string, page = 1) {
      if (!validPage(page) || !/^[a-z0-9-]{1,96}$/.test(slug)) return null
      const s = await site()
      if (!s.blog.authors) return null
      const a = await api.author(slug)
      if (!a) return null
      const res = await api.posts({ page, perPage: s.blog.postsPerPage, author: slug })
      return {
        site: s,
        author: author(s, a),
        posts: paged(res.items.map((p) => summary(s, p)), page, res.totalPages, res.total, `${authorsPath}/${slug}`),
      }
    },
  }
}

export type Cms = ReturnType<typeof createCms>
