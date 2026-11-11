/**
 * THE CONTENT API CONTRACT.
 *
 * What GET /api/v1/* returns (dates as ISO strings), shared by the CMS that
 * produces it and the site kit that consumes it. The site kit then adds URLs and
 * date labels and turns this into the theme-facing shapes in ./theme.ts.
 *
 * Bump API_VERSION on any breaking change.
 */

export const API_VERSION = 1

export type SocialPlatform = 'linkedin' | 'x' | 'instagram' | 'facebook' | 'youtube' | 'github' | 'tiktok'

export interface ApiSite {
  name: string
  url: string
  description: string
  language: string
  dateLocale: string
  legalName: string
  /** Absolute URL of the logo the client uploaded in the CMS, or null. */
  logoUrl: string | null
  accent: string
  social: { platform: SocialPlatform; url: string }[]
  blog: {
    title: string
    description: string
    basePath: string
    postsPerPage: number
    authors: boolean
    faqs: boolean
    htmlPages: boolean
    midPostCta: boolean
  }
  cta: { heading: string; body: string; label: string; href: string } | null
  contact: { enabled: boolean; topics: string[] }
}

export interface ApiImage {
  src: string
  srcSet: string | null
  alt: string
  caption: string | null
  width: number
  height: number
  /** 1200×630 JPEG for Open Graph. */
  ogSrc: string
}

export interface ApiAuthor {
  id: string
  slug: string
  name: string
  role: string | null
  bio: string | null
  avatar: { src: string; srcSet: string | null; alt: string } | null
  links: { kind: 'linkedin' | 'x' | 'website'; url: string; label: string }[]
  postCount: number
}

export interface ApiTag {
  label: string
  slug: string
}

export interface ApiPostSummary {
  id: string
  slug: string
  title: string
  excerpt: string | null
  category: string | null
  tags: ApiTag[]
  publishedAt: string
  updatedAt: string
  readingMinutes: number
  cover: ApiImage | null
  author: ApiAuthor | null
}

export type ApiPostBody =
  | { kind: 'editor'; html: string; split: { before: string; after: string } | null }
  | { kind: 'page'; head: string; html: string }

export interface ApiPostDetail extends ApiPostSummary {
  description: string
  seoTitle: string | null
  body: ApiPostBody
  faqs: { question: string; answer: string }[]
  /** FAQs found in the body text, for schema only (when the FAQ panel is empty). */
  bodyFaqs: { question: string; answer: string }[]
  /** False when a pasted HTML page brought its own JSON-LD. */
  emitSchema: boolean
  related: ApiPostSummary[]
}

export interface ApiPage<T> {
  items: T[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface ApiTagWithCount extends ApiTag {
  count: number
}

export interface ApiIndexEntry {
  slug: string
  publishedAt: string
  updatedAt: string
}

export type ApiContactResult =
  | { ok: true }
  | { ok: false; errors?: Record<string, string>; error?: string }

/** The body the CMS POSTs to your site's revalidate route. */
export interface WebhookPayload {
  event: 'post.published' | 'post.updated' | 'post.unpublished' | 'post.deleted' | 'author.updated' | 'settings.updated' | 'ping'
  workspace: string
  at: string
  slugs?: string[]
  tags?: string[]
  authors?: string[]
}
