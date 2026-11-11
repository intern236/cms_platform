import 'server-only'
import { isDuplicate, newId, sys } from '@/lib/db'
import { randomToken } from '@/lib/security'
import { toRef, type WorkspaceRef } from '@/lib/auth/access'
import { isHexColour, settingsSchema, workspaceSlugProblem, type WorkspaceSettings } from './settings'

/**
 * Workspaces (one per client): create, brand, configure. System-level — callers
 * have already checked the user may do this (lib/auth/access.ts).
 */

export async function createWorkspace(input: {
  name: string
  slug: string
  siteUrl: string
  accent: string
  settings?: Partial<WorkspaceSettings>
}): Promise<{ ok: true; workspace: WorkspaceRef } | { ok: false; errors: Record<string, string> }> {
  const errors: Record<string, string> = {}
  const name = input.name.trim()
  const slug = input.slug.trim().toLowerCase()
  if (!name || name.length > 80) errors.name = 'Give the client a name (up to 80 characters).'
  const slugProblem = workspaceSlugProblem(slug)
  if (slugProblem) errors.slug = slugProblem
  const siteUrl = normaliseSiteUrl(input.siteUrl)
  if (input.siteUrl.trim() && !siteUrl) errors.siteUrl = 'Enter the full address, like https://acme.com'
  if (!isHexColour(input.accent)) errors.accent = 'Pick a colour.'
  if (Object.keys(errors).length) return { ok: false, errors }

  const db = await sys()
  const taken = { ok: false as const, errors: { slug: 'Another client already uses that address.' } }
  if (await db.workspaces.bySlug(slug)) return taken

  const settings = settingsSchema.parse({ ...(input.settings ?? {}) })
  try {
    const row = await db.workspaces.insert({
      id: newId(),
      slug,
      name,
      siteUrl: siteUrl ?? '',
      accent: input.accent.toLowerCase(),
      settings,
      webhookSecret: randomToken(32),
    })
    return { ok: true, workspace: toRef(row) }
  } catch (error) {
    if (await isDuplicate(error)) return taken
    throw error
  }
}

/** https://acme.com/ → https://acme.com. Null if it is not an http(s) URL. */
export function normaliseSiteUrl(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

export async function updateSettings(workspaceId: string, settings: WorkspaceSettings) {
  await (await sys()).workspaces.update(workspaceId, { settings, updatedAt: new Date() })
}

export async function updateBranding(workspaceId: string, input: { name: string; accent: string }) {
  await (await sys()).workspaces.update(workspaceId, { name: input.name, accent: input.accent.toLowerCase(), updatedAt: new Date() })
}

export async function updateIntegration(workspaceId: string, input: { siteUrl: string; webhookUrl: string }) {
  await (await sys()).workspaces.update(workspaceId, { siteUrl: input.siteUrl, webhookUrl: input.webhookUrl, updatedAt: new Date() })
}

export async function rotateWebhookSecret(workspaceId: string): Promise<string> {
  const secret = randomToken(32)
  await (await sys()).workspaces.update(workspaceId, { webhookSecret: secret, updatedAt: new Date() })
  return secret
}

export async function getWebhookConfig(workspaceId: string) {
  const ws = await (await sys()).workspaces.byId(workspaceId)
  return ws ? { url: ws.webhookUrl, secret: ws.webhookSecret, slug: ws.slug } : null
}

export async function setArchived(workspaceId: string, archived: boolean) {
  const now = new Date()
  await (await sys()).workspaces.update(workspaceId, { archivedAt: archived ? now : null, updatedAt: now })
}

// ---- Logo -------------------------------------------------------------------

export const LOGO_MAX_BYTES = 256 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const

/** Checks the bytes, not just the declared type. */
export function sniffLogo(data: Buffer): (typeof LOGO_TYPES)[number] | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  const head = data.subarray(0, 512).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml'
  return null
}

export async function setLogo(workspaceId: string, data: Buffer, contentType: string) {
  await (await sys()).workspaces.setLogo(workspaceId, data, contentType)
}

export async function removeLogo(workspaceId: string) {
  await (await sys()).workspaces.removeLogo(workspaceId)
}

export async function getLogo(slug: string) {
  return (await sys()).workspaces.logoBySlug(slug)
}

// ---- Agency overview ---------------------------------------------------------

export type WorkspaceOverview = WorkspaceRef & {
  members: number
  published: number
  drafts: number
  review: number
  unread: number
  lastPublishedAt: Date | null
  keys: number
  lastWebhook: { ok: boolean; at: Date } | null
}

/** Every client with the numbers the agency dashboard shows. Agency-only. */
export async function agencyOverview(includeArchived = false): Promise<WorkspaceOverview[]> {
  const db = await sys()
  const now = new Date()
  const result: WorkspaceOverview[] = []
  for (const row of await db.workspaces.list({ includeArchived })) {
    result.push({ ...toRef(row), ...(await db.overview.workspaceStats(row.id, now)) })
  }
  return result
}

/** Posts that went live across every client in the last N days — for the agency chart. */
export async function agencyPublishing(days = 30): Promise<{ day: string; count: number }[]> {
  const now = new Date()
  const since = new Date(now.getTime() - days * 86_400_000)
  const map = new Map<string, number>()
  for (const at of await (await sys()).overview.publishedBetween(since, now)) {
    const key = at.toISOString().slice(0, 10)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  const out: { day: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    out.push({ day: key, count: map.get(key) ?? 0 })
  }
  return out
}
