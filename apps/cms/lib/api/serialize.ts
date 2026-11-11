import 'server-only'
import type { ApiAuthor, ApiImage, ApiPostDetail, ApiPostSummary, ApiSite } from '@cms/site-kit/types'
import type { WorkspaceRef } from '@/lib/auth/access'
import { avatarSrcSet, avatarUrl, coverSrcSet, coverUrl, ogUrl } from '@/lib/cloudinary/url'
import { authorLinks, authorsByIds, type Author } from '@/lib/content/authors'
import { extractBodyFaqs } from '@/lib/content/faq-extract'
import { htmlPostDocument } from '@/lib/content/post-page-html'
import { pageHasFaqSchema } from '@/lib/content/post-page-meta'
import { livePosts, relatedPosts, tagSlug, type Post } from '@/lib/content/posts'
import { renderablePostHtml, splitForMidCta } from '@/lib/content/sanitize'
import type { Tx } from '@/lib/db'
import { cmsUrl } from '@/lib/env'

/**
 * Database rows → the public API shapes in @cms/site-kit/types.
 *
 * ONLY public fields leave through here. Drafts, focus keywords, who wrote what in
 * the admin, internal ids of users — none of it is in these shapes, so none of it
 * can leak through the API by accident.
 */

export function siteInfo(ws: WorkspaceRef): ApiSite {
  const s = ws.settings
  return {
    name: ws.name,
    url: ws.siteUrl,
    description: s.description,
    language: s.language,
    dateLocale: s.dateLocale,
    legalName: s.legalName || ws.name,
    logoUrl: ws.hasLogo ? `${cmsUrl()}/brand/${ws.slug}/logo?v=${ws.updatedAt.getTime()}` : null,
    accent: ws.accent,
    social: s.social,
    blog: s.blog,
    cta: s.cta.enabled && s.cta.heading ? { heading: s.cta.heading, body: s.cta.body, label: s.cta.label, href: s.cta.href } : null,
    contact: { enabled: s.contact.enabled, topics: s.contact.topics },
  }
}

function cover(post: Post): ApiImage | null {
  if (!post.coverImage) return null
  const id = post.coverImage.publicId
  return {
    src: coverUrl(id),
    srcSet: coverSrcSet(id),
    alt: post.coverAlt || post.title,
    caption: post.coverCaption,
    width: post.coverImage.width,
    height: post.coverImage.height,
    ogSrc: ogUrl(id),
  }
}

export function author(a: Author, postCount: number): ApiAuthor {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    role: a.role,
    bio: a.bio,
    avatar: a.avatar ? { src: avatarUrl(a.avatar.publicId), srcSet: avatarSrcSet(a.avatar.publicId), alt: a.avatarAlt || a.name } : null,
    links: authorLinks(a),
    postCount,
  }
}

export function summary(post: Post, authors: Map<string, ApiAuthor>, ws: WorkspaceRef): ApiPostSummary {
  const by = ws.settings.blog.authors && post.authorId ? authors.get(post.authorId) : undefined
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt?.trim() || null,
    category: post.category,
    tags: post.tags.map((label) => ({ label, slug: tagSlug(label) })).filter((t) => t.slug),
    publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    readingMinutes: post.readingMinutes,
    cover: cover(post),
    author: by ?? null,
  }
}

/** Resolves each post's author once, with their live post count. */
export async function authorMap(tx: Tx, ws: WorkspaceRef, posts: Post[]): Promise<Map<string, ApiAuthor>> {
  if (!ws.settings.blog.authors) return new Map()
  const ids = [...new Set(posts.map((p) => p.authorId).filter((id): id is string => Boolean(id)))]
  const found = await authorsByIds(tx, ws.id, ids)
  const out = new Map<string, ApiAuthor>()
  for (const [id, a] of found) {
    const { total } = await livePosts(tx, ws.id, { limit: 1, offset: 0, authorId: id })
    out.set(id, author(a, total))
  }
  return out
}

export async function summaries(tx: Tx, ws: WorkspaceRef, posts: Post[]): Promise<ApiPostSummary[]> {
  const authors = await authorMap(tx, ws, posts)
  return posts.map((p) => summary(p, authors, ws))
}

export async function detail(tx: Tx, ws: WorkspaceRef, post: Post, withRelated = true): Promise<ApiPostDetail> {
  const authors = await authorMap(tx, ws, [post])
  const base = summary(post, authors, ws)
  const faqsOn = ws.settings.blog.faqs
  if (post.format === 'html') {
    const doc = htmlPostDocument(post.contentHtml)
    return {
      ...base,
      title: doc.title || post.title,
      description: doc.description || post.description,
      seoTitle: post.seoTitle,
      body: { kind: 'page', head: doc.head, html: doc.body },
      faqs: faqsOn && !pageHasFaqSchema(doc.head) ? post.faqs : [],
      bodyFaqs: [],
      emitSchema: !doc.hasStructuredData,
      related: withRelated ? await summaries(tx, ws, await relatedPosts(tx, ws.id, post)) : [],
    }
  }
  const html = renderablePostHtml(post.contentHtml)
  const cta = siteInfo(ws).cta
  return {
    ...base,
    description: post.description,
    seoTitle: post.seoTitle,
    body: { kind: 'editor', html, split: ws.settings.blog.midPostCta && cta ? splitForMidCta(html) : null },
    faqs: faqsOn ? post.faqs : [],
    bodyFaqs: faqsOn && post.faqs.length === 0 ? extractBodyFaqs(post.contentHtml) : [],
    emitSchema: true,
    related: withRelated ? await summaries(tx, ws, await relatedPosts(tx, ws.id, post)) : [],
  }
}
