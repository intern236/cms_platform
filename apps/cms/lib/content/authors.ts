import 'server-only'
import { newId, scoped, type AuthorRow, type StoredImage, type Tx } from '@/lib/db'

/**
 * Authors: a byline with a face, a bio and a profile page. A post stores an
 * author id; everything a reader sees about the person is resolved from here.
 * An author gets a public profile once they have at least one live post.
 */

export interface Author {
  id: string
  slug: string
  name: string
  role: string | null
  bio: string | null
  avatar: StoredImage | null
  avatarAlt: string | null
  linkedinUrl: string | null
  xUrl: string | null
  websiteUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export const AUTHOR_LIMITS = { name: 80, slug: 96, role: 80, bio: 600, avatarAlt: 125, url: 300 } as const

function toAuthor(row: AuthorRow): Author {
  const avatar = row.avatar && row.avatar.publicId ? row.avatar : null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    bio: row.bio,
    avatar,
    avatarAlt: avatar?.altText ?? null,
    linkedinUrl: row.linkedinUrl,
    xUrl: row.xUrl,
    websiteUrl: row.websiteUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listAuthors(tx: Tx, workspaceId: string): Promise<Author[]> {
  return (await scoped(tx, workspaceId).authors.list()).map(toAuthor)
}

export async function getAuthor(tx: Tx, workspaceId: string, id: string): Promise<Author | null> {
  const row = await scoped(tx, workspaceId).authors.get(id)
  return row ? toAuthor(row) : null
}

export async function getAuthorBySlug(tx: Tx, workspaceId: string, slug: string): Promise<Author | null> {
  const row = await scoped(tx, workspaceId).authors.bySlug(slug)
  return row ? toAuthor(row) : null
}

export async function authorsByIds(tx: Tx, workspaceId: string, ids: string[]): Promise<Map<string, Author>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const rows = await scoped(tx, workspaceId).authors.byIds(unique)
  return new Map(rows.map((r) => [r.id, toAuthor(r)]))
}

export function authorSlugTaken(tx: Tx, workspaceId: string, slug: string, excludeId?: string): Promise<boolean> {
  return scoped(tx, workspaceId).authors.slugTaken(slug, excludeId)
}

export type AuthorRecord = Omit<Author, 'id' | 'avatarAlt' | 'createdAt'>

export async function insertAuthor(tx: Tx, workspaceId: string, record: AuthorRecord): Promise<string> {
  const id = newId()
  await scoped(tx, workspaceId).authors.insert(id, record)
  return id
}

export async function updateAuthor(tx: Tx, workspaceId: string, id: string, record: AuthorRecord): Promise<void> {
  await scoped(tx, workspaceId).authors.update(id, record)
}

/** Deletes the author and unassigns their posts. Returns how many posts were unassigned. */
export async function deleteAuthor(tx: Tx, workspaceId: string, id: string): Promise<number> {
  const scope = scoped(tx, workspaceId)
  const unassigned = await scope.posts.unassignAuthor(id)
  await scope.authors.delete(id)
  return unassigned
}

export function authorLinks(author: Pick<Author, 'linkedinUrl' | 'xUrl' | 'websiteUrl'>) {
  const out: { kind: 'linkedin' | 'x' | 'website'; url: string; label: string }[] = []
  if (author.linkedinUrl) out.push({ kind: 'linkedin', url: author.linkedinUrl, label: 'LinkedIn' })
  if (author.xUrl) out.push({ kind: 'x', url: author.xUrl, label: 'X' })
  if (author.websiteUrl) out.push({ kind: 'website', url: author.websiteUrl, label: 'Website' })
  return out
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  )
}
