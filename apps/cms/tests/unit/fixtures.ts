import bcrypt from 'bcryptjs'
import { inWorkspace, newId, sys, type PostRow, type Role } from '@/lib/db'
import { createSession, SESSION_COOKIE } from '@/lib/auth/session'
import { createWorkspace } from '@/lib/workspaces'
import { addMember } from '@/lib/workspaces/members'
import { createSiteKey } from '@/lib/integrations/site-keys'
import { jar, requestHeaders, resetRequest } from './next-mocks'

export const PASSWORD = 'correct-horse-battery-staple'
const HASH = bcrypt.hashSync(PASSWORD, 4)

let counter = 0

export async function makeUser(opts: { email?: string; name?: string; isAgency?: boolean; twoFactor?: boolean } = {}) {
  const db = await sys()
  const id = newId()
  counter++
  const email = opts.email ?? `user${counter}-${id.slice(0, 6)}@example.com`
  await db.users.insert({ id, email, name: opts.name ?? `User ${counter}`, passwordHash: HASH, isAgency: opts.isAgency ?? false })
  if (opts.twoFactor) await db.users.update(id, { twoFactor: true })
  return { id, email, name: opts.name ?? `User ${counter}` }
}

export async function makeWorkspace(slug: string, settings: Record<string, unknown> = {}) {
  const r = await createWorkspace({ name: slug.toUpperCase(), slug, siteUrl: `https://${slug}.example`, accent: '#123456', settings })
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.workspace
}

export async function member(workspaceId: string, role: Role) {
  const u = await makeUser()
  await addMember(workspaceId, u.id, role)
  return u
}

/** Make the next calls run as this user (fresh request, their session cookie). */
export async function signInAs(user: { id: string }, ip = '203.0.113.10') {
  resetRequest()
  requestHeaders.set('x-forwarded-for', ip)
  requestHeaders.set('user-agent', 'vitest')
  await createSession(user.id)
  const token = jar.get(SESSION_COOKIE)!
  resetRequest()
  requestHeaders.set('x-forwarded-for', ip)
  jar.set(SESSION_COOKIE, token)
  return token
}

export function signOut(ip = '203.0.113.10') {
  resetRequest()
  requestHeaders.set('x-forwarded-for', ip)
}

export async function siteKeyFor(workspaceId: string) {
  const u = await makeUser()
  return (await createSiteKey(workspaceId, 'test', u.id)).key
}

/** Changes fields of a stored post directly, to set up a state the UI would not allow. */
export async function patchPost(workspaceId: string, id: string, patch: Partial<PostRow>) {
  await inWorkspace(workspaceId, async (scope) => {
    const row = await scope.posts.get(id)
    if (!row) throw new Error('no such post')
    const merged = { ...row, ...patch }
    await scope.posts.update(id, {
      slug: merged.slug,
      title: merged.title,
      description: merged.description,
      excerpt: merged.excerpt,
      format: merged.format,
      contentHtml: merged.contentHtml,
      coverImage: merged.coverImage,
      category: merged.category,
      tags: merged.tags,
      tagSlugs: merged.tagSlugs,
      faqs: merged.faqs,
      authorId: merged.authorId,
      seoTitle: merged.seoTitle,
      focusKeyword: merged.focusKeyword,
      status: merged.status,
      publishedAt: merged.publishedAt,
      readingMinutes: merged.readingMinutes,
      updatedBy: merged.updatedBy,
      updatedAt: merged.updatedAt,
    })
  })
}

export function post(over: Record<string, unknown> = {}) {
  return {
    title: 'A post',
    slug: '',
    description: 'A description long enough to be useful in a search result snippet.',
    excerpt: '',
    tags: ['News'],
    faqs: [],
    category: '',
    format: 'editor',
    contentHtml: '<p>Hello world</p>',
    authorId: '',
    coverImage: null,
    coverAlt: '',
    coverCaption: '',
    seoTitle: '',
    focusKeyword: '',
    intent: 'save' as const,
    ...over,
  }
}
