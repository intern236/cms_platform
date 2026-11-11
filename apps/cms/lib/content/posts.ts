import 'server-only'
import { newId, scoped, type PostFormat, type PostRow, type PostStatus, type StoredImage, type Tx } from '@/lib/db'
import { decodeHtmlEntities } from '@/lib/content/html-entities'
import { slugify } from '@/lib/slug'

/**
 * Posts: every read and write, and the rules around them. Each function takes the
 * workspace scope handed out by inWorkspace() (lib/db), which can only ever reach
 * that one workspace's posts, plus the workspace id it expects, as a cross-check.
 *
 * SCHEDULING is not a stored status: a scheduled post is `published` with a future
 * `publishedAt`. Every public query asks for `publishedAt <= now`, so it starts
 * matching on its own when the time comes. No cron job.
 */

export type DisplayStatus = 'draft' | 'review' | 'scheduled' | 'published'

export interface Post {
  id: string
  workspaceId: string
  slug: string
  title: string
  description: string
  excerpt: string | null
  format: PostFormat
  contentHtml: string
  coverImage: StoredImage | null
  coverAlt: string | null
  coverCaption: string | null
  category: string | null
  tags: string[]
  faqs: { question: string; answer: string }[]
  authorId: string | null
  seoTitle: string | null
  focusKeyword: string | null
  status: PostStatus
  publishedAt: Date | null
  readingMinutes: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export const POST_LIMITS = {
  title: 160,
  slug: 96,
  description: 320,
  excerpt: 400,
  category: 60,
  tag: 40,
  tagCount: 12,
  faqQuestion: 200,
  faqAnswer: 900,
  faqCount: 12,
  seoTitle: 80,
  focusKeyword: 60,
  coverAlt: 125,
  coverCaption: 125,
  contentHtml: 400_000,
} as const

/** Slugs the blog's own routes own: /blog/tag/…, /blog/page/2. */
export const RESERVED_POST_SLUGS = new Set(['tag', 'page', 'feed', 'rss', 'preview'])

export function displayStatus(post: Pick<Post, 'status' | 'publishedAt'>, now = new Date()): DisplayStatus {
  if (post.status === 'published' && post.publishedAt && post.publishedAt > now) return 'scheduled'
  return post.status
}

/** True once the post has been visible to the public at some point. */
export function hasGoneLive(post: Pick<Post, 'publishedAt'>, now = new Date()): boolean {
  return Boolean(post.publishedAt && post.publishedAt <= now)
}

export function tagSlug(tag: string): string {
  return slugify(tag)
}

type Row = PostRow

function toFaqs(value: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const raw = entry as Record<string, unknown>
    const question = typeof raw.question === 'string' ? decodeHtmlEntities(raw.question).trim() : ''
    const answer = typeof raw.answer === 'string' ? decodeHtmlEntities(raw.answer).trim() : ''
    return question && answer ? [{ question, answer }] : []
  })
}

export function toPost(row: Row): Post {
  const cover = row.coverImage && typeof row.coverImage.publicId === 'string' && row.coverImage.publicId ? row.coverImage : null
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    slug: row.slug,
    title: decodeHtmlEntities(row.title),
    description: decodeHtmlEntities(row.description),
    excerpt: row.excerpt ? decodeHtmlEntities(row.excerpt) : null,
    format: row.format === 'html' ? 'html' : 'editor',
    contentHtml: row.contentHtml,
    coverImage: cover,
    coverAlt: cover?.altText ? decodeHtmlEntities(cover.altText) : null,
    coverCaption: cover?.caption ? decodeHtmlEntities(cover.caption) : null,
    category: row.category ? decodeHtmlEntities(row.category) : null,
    tags: Array.isArray(row.tags) ? row.tags.map((t) => decodeHtmlEntities(String(t))) : [],
    faqs: toFaqs(row.faqs),
    authorId: row.authorId,
    seoTitle: row.seoTitle ? decodeHtmlEntities(row.seoTitle) : null,
    focusKeyword: row.focusKeyword,
    status: row.status === 'published' || row.status === 'review' ? row.status : 'draft',
    publishedAt: row.publishedAt,
    readingMinutes: row.readingMinutes,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export type PostListFilter = {
  status?: DisplayStatus | 'all'
  q?: string
  /** Restrict to one creator — how writers see only their own posts. */
  createdBy?: string
}

export async function listPosts(tx: Tx, workspaceId: string, filter: PostListFilter = {}): Promise<Post[]> {
  const rows = await scoped(tx, workspaceId).posts.list({ ...filter, now: new Date(), limit: 500 })
  return rows.map(toPost)
}

export async function getPost(tx: Tx, workspaceId: string, id: string): Promise<Post | null> {
  const row = await scoped(tx, workspaceId).posts.get(id)
  return row ? toPost(row) : null
}

export function slugTaken(tx: Tx, workspaceId: string, slug: string, excludeId?: string): Promise<boolean> {
  return scoped(tx, workspaceId).posts.slugTaken(slug, excludeId)
}

export async function usedCategories(tx: Tx, workspaceId: string): Promise<string[]> {
  const values = await scoped(tx, workspaceId).posts.categories()
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

export async function usedTags(tx: Tx, workspaceId: string): Promise<string[]> {
  const values = await scoped(tx, workspaceId).posts.tags()
  return [...new Set(values.filter((t) => typeof t === 'string' && t.trim()))].sort((a, b) => a.localeCompare(b))
}

export function countPostsByAuthor(tx: Tx, workspaceId: string, authorId: string): Promise<number> {
  return scoped(tx, workspaceId).posts.countByAuthor(authorId)
}

export type DashboardStats = {
  drafts: number
  review: number
  scheduled: number
  published: number
  nextScheduled: { id: string; title: string; publishedAt: Date } | null
  /** Posts that went live per day, oldest first, for the last `days` days. */
  daily: { day: string; count: number }[]
  recent: Post[]
}

export async function dashboardStats(tx: Tx, workspaceId: string, days = 30): Promise<DashboardStats> {
  const now = new Date()
  const p = scoped(tx, workspaceId).posts
  const counts = await p.counts(now)
  const next = await p.nextScheduled(now)
  const since = new Date(now.getTime() - days * 86_400_000)
  const dates = await p.liveDatesSince(now, since)
  const buckets = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10), 0)
  }
  for (const at of dates) {
    const key = at.toISOString().slice(0, 10)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  const recent = await p.recent(6)
  return {
    ...counts,
    nextScheduled: next ? { id: next.id, title: decodeHtmlEntities(next.title), publishedAt: next.publishedAt! } : null,
    daily: [...buckets].map(([day, n]) => ({ day, count: n })),
    recent: recent.map(toPost),
  }
}

// ---------------------------------------------------------------------------
// Public reads (the content API)
// ---------------------------------------------------------------------------

export async function livePosts(
  tx: Tx,
  workspaceId: string,
  opts: { limit: number; offset: number; tagSlug?: string; authorId?: string }
): Promise<{ posts: Post[]; total: number }> {
  const { rows, total } = await scoped(tx, workspaceId).posts.live({ ...opts, now: new Date() })
  return { posts: rows.map(toPost), total }
}

export async function livePostBySlug(tx: Tx, workspaceId: string, slug: string): Promise<Post | null> {
  const row = await scoped(tx, workspaceId).posts.liveBySlug(slug, new Date())
  return row ? toPost(row) : null
}

/** Up to `limit` other live posts sharing a tag (falls back to the newest). */
export async function relatedPosts(tx: Tx, workspaceId: string, post: Post, limit = 3): Promise<Post[]> {
  const now = new Date()
  const p = scoped(tx, workspaceId).posts
  const slugs = [...new Set(post.tags.map(tagSlug).filter(Boolean))]
  const tagged = slugs.length ? await p.liveRelated(now, [post.id], slugs, limit) : []
  if (tagged.length >= limit) return tagged.map(toPost)
  const fill = await p.liveRelated(now, [post.id, ...tagged.map((r) => r.id)], null, limit - tagged.length)
  return [...tagged, ...fill].map(toPost)
}

export async function liveTags(tx: Tx, workspaceId: string): Promise<{ label: string; slug: string; count: number }[]> {
  const lists = await scoped(tx, workspaceId).posts.liveTagLists(new Date())
  const bySlug = new Map<string, { label: string; slug: string; count: number }>()
  for (const tags of lists) {
    for (const raw of tags ?? []) {
      const label = decodeHtmlEntities(String(raw))
      const slug = tagSlug(label)
      if (!slug) continue
      const hit = bySlug.get(slug)
      if (hit) hit.count += 1
      else bySlug.set(slug, { label, slug, count: 1 })
    }
  }
  return [...bySlug.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function liveIndex(tx: Tx, workspaceId: string): Promise<{ slug: string; updatedAt: Date; publishedAt: Date }[]> {
  return scoped(tx, workspaceId).posts.liveIndex(new Date())
}

export function liveAuthorIds(tx: Tx, workspaceId: string): Promise<string[]> {
  return scoped(tx, workspaceId).posts.liveAuthorIds(new Date())
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type PostRecord = Omit<Post, 'id' | 'workspaceId' | 'coverAlt' | 'coverCaption' | 'createdAt' | 'createdBy'>

function toFields(record: PostRecord) {
  return {
    slug: record.slug,
    title: record.title,
    description: record.description,
    excerpt: record.excerpt,
    format: record.format,
    contentHtml: record.contentHtml,
    coverImage: record.coverImage,
    category: record.category,
    tags: record.tags,
    tagSlugs: [...new Set(record.tags.map(tagSlug).filter(Boolean))],
    faqs: record.faqs,
    authorId: record.authorId,
    seoTitle: record.seoTitle,
    focusKeyword: record.focusKeyword,
    status: record.status,
    publishedAt: record.publishedAt,
    readingMinutes: record.readingMinutes,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
  }
}

export async function insertPost(tx: Tx, workspaceId: string, createdBy: string, record: PostRecord): Promise<string> {
  const id = newId()
  await scoped(tx, workspaceId).posts.insert(id, createdBy, toFields(record))
  return id
}

export async function updatePost(tx: Tx, workspaceId: string, id: string, record: PostRecord): Promise<void> {
  await scoped(tx, workspaceId).posts.update(id, toFields(record))
}

export async function deletePostRow(tx: Tx, workspaceId: string, id: string): Promise<void> {
  await scoped(tx, workspaceId).posts.delete(id)
}

export async function postsByIds(tx: Tx, workspaceId: string, ids: string[]): Promise<Post[]> {
  if (!ids.length) return []
  return (await scoped(tx, workspaceId).posts.byIds(ids)).map(toPost)
}
