import 'server-only'
import { randomBytes } from 'node:crypto'
import { newId, sys } from '@/lib/db'
import { safeEqual, sha256 } from '@/lib/security'

/**
 * SITE KEYS let a client's website read its own published content.
 *
 * Format: `cms_<10-char prefix>_<43-char secret>`. The prefix finds the row; the
 * whole key is compared by sha256 in constant time. Shown once at creation, never
 * again. Read-only, one workspace, revocable. Keep it server-side on the site
 * (an env var) — it must never reach a browser.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

function prefix(): string {
  const bytes = randomBytes(10)
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export async function createSiteKey(workspaceId: string, label: string, createdBy: string): Promise<{ id: string; key: string }> {
  const p = prefix()
  const key = `cms_${p}_${randomBytes(32).toString('base64url')}`
  const id = newId()
  await (await sys()).siteKeys.insert({ id, workspaceId, label: label.slice(0, 60) || 'Website', prefix: p, keyHash: sha256(key), createdBy })
  return { id, key }
}

export async function listSiteKeys(workspaceId: string) {
  const rows = await (await sys()).siteKeys.list(workspaceId)
  /* Never the hash: only what the settings screen shows. */
  return rows.map((k) => ({ id: k.id, label: k.label, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt }))
}

export async function revokeSiteKey(workspaceId: string, id: string): Promise<boolean> {
  return (await sys()).siteKeys.revoke(workspaceId, id, new Date())
}

export type KeyedWorkspace = {
  workspaceId: string
  slug: string
  keyId: string
}

const KEY_PATTERN = /^cms_([a-z0-9]{10})_[A-Za-z0-9_-]{43}$/

/** The workspace a request's `Authorization: Bearer cms_…` belongs to, or null. */
export async function verifySiteKey(authorization: string | null): Promise<KeyedWorkspace | null> {
  const key = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
  const m = key?.match(KEY_PATTERN)
  if (!key || !m) return null
  const db = await sys()
  const found = await db.siteKeys.findActiveByPrefix(m[1])
  if (!found || found.workspace.archivedAt || !safeEqual(sha256(key), found.key.keyHash)) return null
  const row = found.key
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 10 * 60_000) {
    await db.siteKeys.touch(row.id, new Date())
  }
  return { workspaceId: row.workspaceId, slug: found.workspace.slug, keyId: row.id }
}
