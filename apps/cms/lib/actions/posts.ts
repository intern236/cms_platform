'use server'

import { actionAccess } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { mediaRoot } from '@/lib/cloudinary/config'
import { destroyAsset } from '@/lib/cloudinary/delete'
import { MAX_UPLOAD_BYTES, type CloudinaryImage } from '@/lib/cloudinary/types'
import { publicIdsInHtml } from '@/lib/cloudinary/url'
import { getAuthor } from '@/lib/content/authors'
import { decodeHtmlEntities } from '@/lib/content/html-entities'
import { htmlPostDocument } from '@/lib/content/post-page-html'
import {
  POST_LIMITS,
  RESERVED_POST_SLUGS,
  getPost,
  hasGoneLive,
  insertPost,
  slugTaken,
  tagSlug,
  updatePost,
  deletePostRow,
  type PostRecord,
} from '@/lib/content/posts'
import { asPostFormat, countImageTags, readingMinutes, sanitizeForFormat } from '@/lib/content/sanitize'
import { inWorkspace, isDuplicate, isId } from '@/lib/db'
import type { PostStatus } from '@/lib/db/types'
import { notifySite } from '@/lib/integrations/webhooks'
import { createPreviewToken } from '@/lib/integrations/preview'
import { can, type Permission } from '@/lib/permissions'
import { slugify } from '@/lib/slug'
import { canEditPost } from '@/lib/content/post-access'

/**
 * Writing posts. Every action re-checks the session, the workspace and the role
 * itself — an action is an HTTP endpoint, so nothing the UI hides is a control.
 * Every value from the browser is coerced, capped and (for HTML) sanitised before
 * it is stored.
 */

export type Intent = 'save' | 'publish' | 'schedule' | 'unpublish' | 'review' | 'withdraw'

export type PostPayload = {
  id?: string
  title: unknown
  slug: unknown
  description: unknown
  excerpt: unknown
  tags: unknown
  faqs: unknown
  category: unknown
  format: unknown
  contentHtml: unknown
  authorId: unknown
  coverImage: unknown
  coverAlt: unknown
  coverCaption: unknown
  seoTitle: unknown
  focusKeyword: unknown
  intent: Intent
  publishAt?: unknown
}

export type SaveResult =
  | { ok: true; id: string; slug: string; status: PostStatus; publishedAt: string | null; warning?: string }
  | { ok: false; errors: Record<string, string> }

function asString(value: unknown): string {
  return typeof value === 'string' ? decodeHtmlEntities(value).trim() : ''
}

function asImage(value: unknown): CloudinaryImage | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const publicId = asString(raw.publicId)
  if (!publicId) return null
  return {
    url: asString(raw.url),
    secureUrl: asString(raw.secureUrl),
    publicId,
    width: Number(raw.width) || 0,
    height: Number(raw.height) || 0,
    format: asString(raw.format),
    bytes: Number(raw.bytes) || 0,
  }
}

function asFaqs(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const raw = entry as Record<string, unknown>
      const question = asString(raw.question)
      const answer = asString(raw.answer)
      return question && answer ? [{ question, answer }] : []
    })
    .slice(0, POST_LIMITS.faqCount)
}

function asTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value.map(asString) : asString(value).split(',')
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const tag = raw.trim()
    const key = tagSlug(tag)
    if (!tag || !key || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out.slice(0, POST_LIMITS.tagCount)
}

const NEEDS: Partial<Record<Intent, Permission>> = { publish: 'posts.publish', schedule: 'posts.publish', unpublish: 'posts.publish' }

export async function savePost(workspace: string, payload: PostPayload): Promise<SaveResult> {
  const gate = await actionAccess(workspace, 'posts.create')
  if (!gate.ok) return { ok: false, errors: { form: gate.error } }
  const { access } = gate
  const intent: Intent = ['save', 'publish', 'schedule', 'unpublish', 'review', 'withdraw'].includes(payload.intent)
    ? payload.intent
    : 'save'
  const needed = NEEDS[intent]
  if (needed && !can(access.role, needed)) {
    return { ok: false, errors: { form: 'Your role cannot publish. Send it for review instead.' } }
  }

  const wsId = access.workspace.id
  const format = asPostFormat(payload.format)
  if (format === 'html' && !access.workspace.settings.blog.htmlPages) {
    return { ok: false, errors: { form: 'HTML-page posts are switched off for this site.' } }
  }
  const rawHtml = typeof payload.contentHtml === 'string' ? payload.contentHtml : ''
  const pageDoc = format === 'html' ? htmlPostDocument(rawHtml) : null
  const title = pageDoc ? (pageDoc.title ?? asString(payload.title)) : asString(payload.title)
  const description = pageDoc ? (pageDoc.description ?? asString(payload.description)) : asString(payload.description)
  const excerpt = asString(payload.excerpt)
  const faqs = access.workspace.settings.blog.faqs ? asFaqs(payload.faqs) : []
  const category = asString(payload.category)
  const coverAlt = asString(payload.coverAlt)
  const coverCaption = asString(payload.coverCaption)
  const seoTitle = asString(payload.seoTitle)
  const focusKeyword = asString(payload.focusKeyword)
  const coverImage = asImage(payload.coverImage)
  const slug = slugify(asString(payload.slug) || title)
  const tags = asTags(payload.tags)

  const errors: Record<string, string> = {}
  if (!title) errors.title = format === 'html' ? 'Your HTML has no <title>. Add one.' : 'Give the post a title.'
  else if (title.length > POST_LIMITS.title) errors.title = `Keep it under ${POST_LIMITS.title} characters.`
  if (!slug) errors.slug = 'The address is empty once tidied. Try different words.'
  else if (RESERVED_POST_SLUGS.has(slug)) errors.slug = `“${slug}” is reserved by the blog. Try different words.`
  /* Drafts may be rough: these two are only demanded once a post is going to be
     seen (review, publish, schedule, or saving something already live). */
  const required: Record<string, string> = {}
  if (!description) {
    required.description =
      format === 'html' ? 'Your HTML has no <meta name="description">. Add one.' : 'Write the one-sentence description search results show.'
  } else if (description.length > POST_LIMITS.description) errors.description = `Keep it under ${POST_LIMITS.description} characters.`
  if (excerpt.length > POST_LIMITS.excerpt) errors.excerpt = `Keep it under ${POST_LIMITS.excerpt} characters.`
  if (faqs.some((f) => f.question.length > POST_LIMITS.faqQuestion)) errors.faqs = `Keep each question under ${POST_LIMITS.faqQuestion} characters.`
  if (faqs.some((f) => f.answer.length > POST_LIMITS.faqAnswer)) errors.faqs = `Keep each answer under ${POST_LIMITS.faqAnswer} characters.`
  if (tags.some((t) => t.length > POST_LIMITS.tag)) errors.tags = `Keep each tag under ${POST_LIMITS.tag} characters.`
  if (category.length > POST_LIMITS.category) errors.category = `Keep the category under ${POST_LIMITS.category} characters.`
  if (coverAlt.length > POST_LIMITS.coverAlt) errors.coverAlt = `Keep the alt text under ${POST_LIMITS.coverAlt} characters.`
  if (coverCaption.length > POST_LIMITS.coverCaption) errors.coverCaption = `Keep the caption under ${POST_LIMITS.coverCaption} characters.`
  if (seoTitle.length > POST_LIMITS.seoTitle) errors.seoTitle = `Keep the SEO title under ${POST_LIMITS.seoTitle} characters.`
  if (focusKeyword.length > POST_LIMITS.focusKeyword) errors.focusKeyword = `Keep it under ${POST_LIMITS.focusKeyword} characters.`
  if (rawHtml.length > POST_LIMITS.contentHtml) errors.content = 'The post is over the size limit. Split it in two.'
  if (payload.coverImage && !coverImage) errors.cover = 'That cover image is not valid. Upload it again.'
  if (coverImage && !coverImage.publicId.startsWith(`${mediaRoot(wsId)}/`)) errors.cover = 'That cover image belongs to another site. Upload it again.'
  if (coverImage && coverImage.bytes > MAX_UPLOAD_BYTES) errors.cover = 'That image is over the size limit.'

  let scheduledFor: Date | null = null
  if (intent === 'schedule') {
    const parsed = new Date(asString(payload.publishAt))
    if (Number.isNaN(parsed.getTime())) errors.publishAt = 'Pick a date and time.'
    else if (parsed.getTime() <= Date.now()) errors.publishAt = 'Pick a time in the future.'
    else if (parsed.getTime() > Date.now() + 2 * 365 * 86_400_000) errors.publishAt = 'Pick a time within two years.'
    else scheduledFor = parsed
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const contentHtml = sanitizeForFormat(rawHtml, format, mediaRoot(wsId))
  const dropped = format === 'html' ? 0 : countImageTags(rawHtml) - countImageTags(contentHtml)
  const warning =
    dropped > 0
      ? `${dropped} ${dropped === 1 ? 'image was' : 'images were'} not saved — images have to be uploaded here rather than linked from another site.`
      : undefined
  const hasText = contentHtml.replace(/<[^>]*>/g, '').trim().length > 0
  if (!hasText && !contentHtml.includes('<img')) required.content = 'Write something first.'

  const payloadId = payload.id
  if (payloadId !== undefined && !isId(payloadId)) return { ok: false, errors: { form: 'That post no longer exists.' } }

  try {
    return await inWorkspace(wsId, async (tx): Promise<SaveResult> => {
      const existing = payloadId ? await getPost(tx, wsId, payloadId) : null
      if (payloadId && !existing) return { ok: false as const, errors: { form: 'That post no longer exists.' } }
      if (existing && !canEditPost(access, existing)) {
        return { ok: false as const, errors: { form: 'You can only edit your own drafts. Ask an editor.' } }
      }
      const everLive = Boolean(existing && hasGoneLive(existing))
      const finalSlug = everLive ? existing!.slug : slug
      if (existing && everLive && format !== existing.format) {
        return { ok: false as const, errors: { form: 'A published post keeps the editor it was published with. Create a new post instead.' } }
      }
      if (!everLive && (await slugTaken(tx, wsId, finalSlug, existing?.id))) {
        return { ok: false as const, errors: { slug: 'Another post already uses this address.' } }
      }
      if (intent === 'schedule' && existing && everLive && existing.status === 'published') {
        return { ok: false as const, errors: { publishAt: 'This post is already live. Unpublish it first to reschedule.' } }
      }
      if (intent === 'withdraw' && existing?.status !== 'review') {
        return { ok: false as const, errors: { form: 'This post is not waiting for review.' } }
      }
      if (intent === 'review' && existing?.status === 'published') {
        return { ok: false as const, errors: { form: 'This post is already published.' } }
      }

      const requestedAuthor = asString(payload.authorId)
      const authorId =
        access.workspace.settings.blog.authors && isId(requestedAuthor) && (await getAuthor(tx, wsId, requestedAuthor))
          ? requestedAuthor
          : null

      const now = new Date()
      let status: PostStatus
      switch (intent) {
        case 'publish':
        case 'schedule':
          status = 'published'
          break
        case 'unpublish':
        case 'withdraw':
          status = 'draft'
          break
        case 'review':
          status = 'review'
          break
        default:
          status = existing?.status ?? 'draft'
          /* A writer saving keeps their post out of "published" whatever they send. */
          if (status === 'published' && !can(access.role, 'posts.publish')) status = 'draft'
      }
      if (status !== 'draft' && Object.keys(required).length) return { ok: false, errors: required }
      let publishedAt: Date | null
      if (intent === 'schedule') publishedAt = scheduledFor
      else if (intent === 'publish') publishedAt = existing && everLive ? existing.publishedAt : now
      else if (intent === 'unpublish' || intent === 'withdraw' || intent === 'review') publishedAt = existing && everLive ? existing.publishedAt : null
      else publishedAt = existing?.publishedAt ?? null

      const record: PostRecord = {
        slug: finalSlug,
        title,
        description,
        excerpt: excerpt || null,
        faqs,
        format,
        contentHtml,
        coverImage: coverImage
          ? { ...coverImage, ...(coverAlt ? { altText: coverAlt } : {}), ...(coverCaption ? { caption: coverCaption } : {}) }
          : null,
        category: category || null,
        tags,
        authorId,
        seoTitle: seoTitle || null,
        focusKeyword: focusKeyword || null,
        status,
        publishedAt,
        readingMinutes: readingMinutes(contentHtml, format),
        updatedBy: access.user.id,
        updatedAt: now,
      }

      let id: string
      if (existing) {
        await updatePost(tx, wsId, existing.id, record)
        id = existing.id
      } else {
        id = await insertPost(tx, wsId, access.user.id, record)
      }

      const actor = { id: access.user.id, name: access.user.name }
      const action =
        intent === 'publish'
          ? 'post.published'
          : intent === 'schedule'
            ? 'post.scheduled'
            : intent === 'unpublish'
              ? 'post.unpublished'
              : intent === 'review'
                ? 'post.review'
                : existing
                  ? 'post.updated'
                  : 'post.created'
      const verb: Record<string, string> = {
        'post.published': 'published',
        'post.scheduled': `scheduled for ${scheduledFor?.toISOString() ?? ''}`,
        'post.unpublished': 'unpublished',
        'post.review': 'sent for review',
        'post.updated': 'edited',
        'post.created': 'started',
      }
      await audit(tx, { workspaceId: wsId, actor, action, targetType: 'post', targetId: id, summary: `${verb[action]} “${title}”` })

      /* Images no longer used by this post, now that it is saved without them. */
      const previousCover = existing?.coverImage?.publicId
      const orphaned = [
        ...(previousCover && previousCover !== coverImage?.publicId ? [previousCover] : []),
        ...publicIdsInHtml(existing?.contentHtml ?? '').filter((p) => !publicIdsInHtml(contentHtml).includes(p)),
      ]
      for (const publicId of orphaned) await destroyAsset(tx, wsId, publicId, { exceptPostId: id })

      const wasPublic = Boolean(existing && existing.status === 'published' && hasGoneLive(existing))
      const isPublic = status === 'published'
      if (wasPublic || isPublic) {
        notifySite(wsId, intent === 'unpublish' ? 'post.unpublished' : wasPublic ? 'post.updated' : 'post.published', {
          slugs: [...new Set([finalSlug, existing?.slug].filter(Boolean))],
          tags: [...new Set([...(existing?.tags ?? []), ...tags].map(tagSlug).filter(Boolean))],
        })
      }

      return { ok: true as const, id, slug: finalSlug, status, publishedAt: publishedAt ? publishedAt.toISOString() : null, warning }
    })
  } catch (error) {
    /* Two saves racing for the same address: the database's unique index decides. */
    if (await isDuplicate(error)) return { ok: false, errors: { slug: 'Another post already uses this address.' } }
    console.error('[posts] save failed', error)
    return { ok: false, errors: { form: 'Could not save. Try again.' } }
  }
}

export type DeleteResult = { ok: true } | { ok: false; error: string }

export async function deletePost(workspace: string, id: string): Promise<DeleteResult> {
  const gate = await actionAccess(workspace, 'posts.create')
  if (!gate.ok) return { ok: false, error: gate.error }
  const { access } = gate
  if (!isId(id)) return { ok: false, error: 'That post no longer exists.' }
  const wsId = access.workspace.id
  return inWorkspace(wsId, async (tx) => {
    const post = await getPost(tx, wsId, id)
    if (!post) return { ok: false as const, error: 'That post no longer exists.' }
    if (!can(access.role, 'posts.delete') && !canEditPost(access, post)) {
      return { ok: false as const, error: 'Your role cannot delete this post.' }
    }
    await deletePostRow(tx, wsId, post.id)
    await audit(tx, {
      workspaceId: wsId,
      actor: { id: access.user.id, name: access.user.name },
      action: 'post.deleted',
      targetType: 'post',
      targetId: post.id,
      summary: `deleted “${post.title}”`,
    })
    for (const publicId of [...(post.coverImage ? [post.coverImage.publicId] : []), ...publicIdsInHtml(post.contentHtml)]) {
      await destroyAsset(tx, wsId, publicId)
    }
    if (post.status === 'published') notifySite(wsId, 'post.deleted', { slugs: [post.slug], tags: post.tags.map(tagSlug) })
    return { ok: true as const }
  })
}

export type PreviewResult = { ok: true; url: string } | { ok: false; error: string }

/** A 15-minute link that shows this draft on the client's own site. */
export async function previewLink(workspace: string, id: string): Promise<PreviewResult> {
  const gate = await actionAccess(workspace, 'posts.create')
  if (!gate.ok) return { ok: false, error: gate.error }
  const { access } = gate
  if (!isId(id)) return { ok: false, error: 'Save the post first.' }
  if (!access.workspace.siteUrl) return { ok: false, error: 'This workspace has no website address yet. Ask your agency to add it.' }
  const post = await inWorkspace(access.workspace.id, (tx) => getPost(tx, access.workspace.id, id))
  if (!post || !canEditPost(access, post)) return { ok: false, error: 'That post no longer exists.' }
  const token = await createPreviewToken(access.workspace.id, post.id)
  return { ok: true, url: `${access.workspace.siteUrl}/preview?token=${encodeURIComponent(token)}` }
}
