'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionAccess } from '@/lib/auth/access'
import { createInvite, revokeInvite } from '@/lib/auth/invites'
import { audit } from '@/lib/audit'
import { inWorkspace, isId } from '@/lib/db'
import { createSiteKey, revokeSiteKey } from '@/lib/integrations/site-keys'
import { checkOutboundUrl } from '@/lib/integrations/net'
import { deliver, notifySite } from '@/lib/integrations/webhooks'
import { canGrant, isRole, ROLE_LABEL } from '@/lib/permissions'
import {
  LOGO_MAX_BYTES,
  normaliseSiteUrl,
  removeLogo as removeLogoRow,
  rotateWebhookSecret,
  setLogo,
  sniffLogo,
  updateBranding,
  updateIntegration,
  updateSettings,
} from '@/lib/workspaces'
import { changeRole, removeMember as removeMemberRow } from '@/lib/workspaces/members'
import { SOCIAL_PLATFORMS, isHexColour } from '@/lib/workspaces/settings'
import type { Access } from '@/lib/auth/access'

/**
 * Workspace administration: site settings, branding, people, site keys and the
 * website connection. Owners (and the agency) only, except where noted.
 */

export type Result = { ok: true; message?: string } | { ok: false; error?: string; errors?: Record<string, string> }

async function log(access: Access, action: Parameters<typeof audit>[1]['action'], summary: string, targetId?: string) {
  await inWorkspace(access.workspace.id, (tx) =>
    audit(tx, { workspaceId: access.workspace.id, actor: { id: access.user.id, name: access.user.name }, action, summary, targetId })
  )
}

function refresh(slug: string) {
  revalidatePath(`/${slug}`, 'layout')
}

// ---- Site settings -------------------------------------------------------------

const href = z
  .string()
  .trim()
  .max(300)
  .refine((v) => (v.startsWith('/') ? !v.startsWith('//') : /^(https?:|mailto:|tel:)/i.test(v)), 'Use a path like /contact or a full https:// address.')

const settingsInput = z.object({
  description: z.string().trim().max(300, 'Keep it under 300 characters.'),
  language: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'Use a language code like en or en-GB.'),
  dateLocale: z
    .string()
    .trim()
    .refine((v) => {
      try {
        return Intl.DateTimeFormat.supportedLocalesOf(v).length > 0
      } catch {
        return false
      }
    }, 'Use a locale like en-GB or en-US.'),
  legalName: z.string().trim().max(120),
  social: z
    .array(
      z.object({
        platform: z.enum(SOCIAL_PLATFORMS),
        url: z.string().trim().max(300).regex(/^https?:\/\/\S+$/i, 'Enter a full address, starting https://'),
      })
    )
    .max(8),
  blog: z.object({
    title: z.string().trim().min(1, 'Give the blog a title.').max(60),
    description: z.string().trim().max(300),
    basePath: z.string().regex(/^\/[a-z0-9-]{1,40}$/, 'Use a path like /blog'),
    postsPerPage: z.coerce.number().int().min(3).max(48),
    authors: z.boolean(),
    faqs: z.boolean(),
    htmlPages: z.boolean(),
    midPostCta: z.boolean(),
  }),
  cta: z.object({
    enabled: z.boolean(),
    heading: z.string().trim().max(100),
    body: z.string().trim().max(300),
    label: z.string().trim().max(40),
    href,
  }),
  contact: z.object({
    enabled: z.boolean(),
    notifyEmails: z.array(z.string().trim().toLowerCase().email('One of the notification emails does not look right.').max(254)).max(5),
    confirmation: z.boolean(),
    confirmationSubject: z.string().trim().max(120),
    topics: z.array(z.string().trim().min(1).max(60)).max(12),
  }),
})

function zodErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (!out[key]) out[key] = issue.message
  }
  return out
}

export async function saveSiteSettings(workspace: string, input: unknown): Promise<Result> {
  const gate = await actionAccess(workspace, 'settings.edit')
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = settingsInput.safeParse(input)
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) }
  await updateSettings(gate.access.workspace.id, parsed.data)
  await log(gate.access, 'settings.updated', 'updated site settings')
  notifySite(gate.access.workspace.id, 'settings.updated')
  refresh(gate.access.workspace.slug)
  return { ok: true, message: 'Settings saved.' }
}

// ---- Branding ------------------------------------------------------------------

export async function saveBranding(workspace: string, input: { name: unknown; accent: unknown }): Promise<Result> {
  const gate = await actionAccess(workspace, 'settings.edit')
  if (!gate.ok) return { ok: false, error: gate.error }
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const accent = typeof input.accent === 'string' ? input.accent.trim().toLowerCase() : ''
  const errors: Record<string, string> = {}
  if (!name || name.length > 80) errors.name = 'Enter a name (up to 80 characters).'
  if (!isHexColour(accent)) errors.accent = 'Pick a colour.'
  if (Object.keys(errors).length) return { ok: false, errors }
  await updateBranding(gate.access.workspace.id, { name, accent })
  await log(gate.access, 'branding.updated', 'updated branding')
  refresh(gate.access.workspace.slug)
  return { ok: true, message: 'Branding saved.' }
}

export async function uploadLogo(workspace: string, form: FormData): Promise<Result> {
  const gate = await actionAccess(workspace, 'settings.edit')
  if (!gate.ok) return { ok: false, error: gate.error }
  const file = form.get('logo')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose an image.' }
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: 'Use a logo under 256 KB.' }
  const data = Buffer.from(await file.arrayBuffer())
  const type = sniffLogo(data)
  if (!type) return { ok: false, error: 'Use a PNG, JPG, WebP or SVG.' }
  await setLogo(gate.access.workspace.id, data, type)
  await log(gate.access, 'branding.updated', 'uploaded a new logo')
  refresh(gate.access.workspace.slug)
  return { ok: true, message: 'Logo updated.' }
}

export async function removeLogo(workspace: string): Promise<Result> {
  const gate = await actionAccess(workspace, 'settings.edit')
  if (!gate.ok) return { ok: false, error: gate.error }
  await removeLogoRow(gate.access.workspace.id)
  await log(gate.access, 'branding.updated', 'removed the logo')
  refresh(gate.access.workspace.slug)
  return { ok: true }
}

// ---- Website connection (agency only) -------------------------------------------

export async function saveIntegration(workspace: string, input: { siteUrl: unknown; webhookUrl: unknown }): Promise<Result> {
  const gate = await actionAccess(workspace, 'keys.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!gate.access.isAgency) return { ok: false, error: 'Only your agency can change the website connection.' }
  const siteRaw = typeof input.siteUrl === 'string' ? input.siteUrl : ''
  const hookRaw = typeof input.webhookUrl === 'string' ? input.webhookUrl.trim() : ''
  const errors: Record<string, string> = {}
  const siteUrl = normaliseSiteUrl(siteRaw)
  if (siteRaw.trim() && !siteUrl) errors.siteUrl = 'Enter the full address, like https://acme.com'
  if (hookRaw) {
    const check = await checkOutboundUrl(hookRaw)
    if (!check.ok) errors.webhookUrl = check.reason
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  await updateIntegration(gate.access.workspace.id, { siteUrl: siteUrl ?? '', webhookUrl: hookRaw })
  await log(gate.access, 'settings.updated', 'updated the website connection')
  refresh(gate.access.workspace.slug)
  return { ok: true, message: 'Connection saved.' }
}

export async function rotateSecret(workspace: string): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  const gate = await actionAccess(workspace, 'keys.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!gate.access.isAgency) return { ok: false, error: 'Only your agency can do that.' }
  const secret = await rotateWebhookSecret(gate.access.workspace.id)
  await log(gate.access, 'key.created', 'rotated the webhook secret')
  return { ok: true, secret }
}

export async function testWebhook(workspace: string): Promise<Result> {
  const gate = await actionAccess(workspace, 'keys.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  const outcome = await deliver(gate.access.workspace.id, 'ping')
  refresh(gate.access.workspace.slug)
  return outcome.ok ? { ok: true, message: `The site answered ${outcome.status}.` } : { ok: false, error: outcome.error ?? 'No answer.' }
}

// ---- Site keys --------------------------------------------------------------------

export async function createKey(workspace: string, label: unknown): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const gate = await actionAccess(workspace, 'keys.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  const name = typeof label === 'string' ? label.trim().slice(0, 60) : ''
  const { key, id } = await createSiteKey(gate.access.workspace.id, name || 'Website', gate.access.user.id)
  await log(gate.access, 'key.created', `created site key “${name || 'Website'}”`, id)
  refresh(gate.access.workspace.slug)
  return { ok: true, key }
}

export async function revokeKey(workspace: string, id: unknown): Promise<Result> {
  const gate = await actionAccess(workspace, 'keys.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!isId(id)) return { ok: false, error: 'Unknown key.' }
  const done = await revokeSiteKey(gate.access.workspace.id, id)
  if (done) await log(gate.access, 'key.revoked', 'revoked a site key', id)
  refresh(gate.access.workspace.slug)
  return done ? { ok: true } : { ok: false, error: 'That key was already revoked.' }
}

// ---- People -------------------------------------------------------------------------

export async function inviteMember(workspace: string, input: { email: unknown; role: unknown }): Promise<Result & { url?: string }> {
  const gate = await actionAccess(workspace, 'members.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  const role = input.role
  if (!isRole(role)) return { ok: false, errors: { role: 'Choose a role.' } }
  if (!canGrant(gate.access.role, role)) return { ok: false, errors: { role: 'You cannot give a role above your own.' } }
  const result = await createInvite({
    workspaceId: gate.access.workspace.id,
    email: typeof input.email === 'string' ? input.email : '',
    role,
    inviter: { id: gate.access.user.id, name: gate.access.user.name },
  })
  if (!result.ok) return { ok: false, errors: { email: result.error } }
  await log(gate.access, 'member.invited', `invited ${String(input.email).trim().toLowerCase()} as ${ROLE_LABEL[role].toLowerCase()}`)
  refresh(gate.access.workspace.slug)
  return {
    ok: true,
    message: result.mail.outbox ? 'Invite created. Email is not set up, so copy the link below.' : 'Invite sent.',
    url: result.mail.outbox ? result.url : undefined,
  }
}

export async function setMemberRole(workspace: string, userId: unknown, role: unknown): Promise<Result> {
  const gate = await actionAccess(workspace, 'members.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!isId(userId) || !isRole(role)) return { ok: false, error: 'Invalid request.' }
  if (!canGrant(gate.access.role, role)) return { ok: false, error: 'You cannot give a role above your own.' }
  const problem = await changeRole(gate.access.workspace.id, userId, role)
  if (problem) return { ok: false, error: problem }
  await log(gate.access, 'member.role', `changed a role to ${ROLE_LABEL[role].toLowerCase()}`, userId)
  refresh(gate.access.workspace.slug)
  return { ok: true }
}

export async function removeMember(workspace: string, userId: unknown): Promise<Result> {
  const gate = await actionAccess(workspace, 'members.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!isId(userId)) return { ok: false, error: 'Invalid request.' }
  const problem = await removeMemberRow(gate.access.workspace.id, userId)
  if (problem) return { ok: false, error: problem }
  await log(gate.access, 'member.removed', 'removed someone from the workspace', userId)
  refresh(gate.access.workspace.slug)
  return { ok: true }
}

export async function cancelInvite(workspace: string, inviteId: unknown): Promise<Result> {
  const gate = await actionAccess(workspace, 'members.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!isId(inviteId)) return { ok: false, error: 'Invalid request.' }
  await revokeInvite(gate.access.workspace.id, inviteId)
  refresh(gate.access.workspace.slug)
  return { ok: true }
}

export async function revealWebhookSecret(workspace: string): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  const gate = await actionAccess(workspace, 'keys.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  const { getWebhookConfig } = await import('@/lib/workspaces')
  const config = await getWebhookConfig(gate.access.workspace.id)
  return config ? { ok: true, secret: config.secret } : { ok: false, error: 'Unknown workspace.' }
}
