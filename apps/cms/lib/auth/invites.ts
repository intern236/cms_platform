import 'server-only'
import { newId, sys, type Role } from '@/lib/db'
import { cmsUrl } from '@/lib/env'
import { agencyBrand, sendMail, workspaceBrand, type MailResult } from '@/lib/mail'
import { inviteEmail } from '@/lib/mail/templates'
import { ROLE_LABEL } from '@/lib/permissions'
import { isEmail, normaliseEmail, randomToken, sha256 } from '@/lib/security'
import { toRef } from '@/lib/auth/access'

/**
 * INVITES are how anyone gets an account. There is no public sign-up.
 *
 * The emailed link carries 256 random bits; only the hash is stored. Clicking it
 * proves the person controls that inbox, which is what lets an invite create an
 * account. It works once, for 7 days, and a newer invite to the same address and
 * workspace replaces the older one.
 */

export const INVITE_DAYS = 7

export type InviteRole = Role | 'agency'

export async function createInvite(input: {
  workspaceId: string | null
  email: string
  role: InviteRole
  inviter: { id: string; name: string }
}): Promise<{ ok: true; url: string; mail: MailResult } | { ok: false; error: string }> {
  const email = normaliseEmail(input.email)
  if (!isEmail(email)) return { ok: false, error: 'That email address does not look right.' }
  if ((input.role === 'agency') !== (input.workspaceId === null)) return { ok: false, error: 'Invalid invite.' }

  const db = await sys()
  const existing = await db.users.byEmail(email)
  if (existing && input.workspaceId) {
    if (await db.members.get(input.workspaceId, existing.id)) return { ok: false, error: `${email} is already in this workspace.` }
  }
  if (existing?.isAgency && input.role === 'agency') return { ok: false, error: `${email} is already on the agency team.` }

  /* One live invite per address per workspace. */
  await db.invites.revokeOpen(email, input.workspaceId, new Date())

  const token = randomToken()
  await db.invites.insert({
    id: newId(),
    workspaceId: input.workspaceId,
    email,
    role: input.role,
    tokenHash: sha256(token),
    invitedBy: input.inviter.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  })

  const url = `${cmsUrl()}/invite/${token}`
  let brand = agencyBrand()
  let workspaceName: string | null = null
  if (input.workspaceId) {
    const ws = await db.workspaces.byId(input.workspaceId)
    if (ws) {
      brand = workspaceBrand(ws)
      workspaceName = ws.name
    }
  }
  const mail = await sendMail({
    to: email,
    fromName: brand.name,
    email: inviteEmail({
      brand,
      inviterName: input.inviter.name,
      workspaceName,
      roleLabel: input.role === 'agency' ? 'agency admin' : ROLE_LABEL[input.role].toLowerCase(),
      url,
      expiresInDays: INVITE_DAYS,
    }),
  })
  return { ok: true, url, mail }
}

export type OpenInvite = {
  id: string
  email: string
  role: InviteRole
  workspace: ReturnType<typeof toRef> | null
  existingUserId: string | null
}

/** The invite behind a link, if it is still usable. */
export async function findInvite(token: unknown): Promise<OpenInvite | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null
  const db = await sys()
  const row = await db.invites.findOpen(sha256(token), new Date())
  if (!row) return null
  let workspace = null
  if (row.workspaceId) {
    const ws = await db.workspaces.byId(row.workspaceId)
    if (!ws || ws.archivedAt) return null
    workspace = toRef(ws)
  }
  const user = await db.users.byEmail(row.email)
  return { id: row.id, email: row.email, role: row.role, workspace, existingUserId: user?.id ?? null }
}

/**
 * Marks the invite used and grants what it promised to `userId`.
 * One atomic step in the database: marking it accepted only succeeds while it is
 * still unaccepted, so a double click or a replay is a no-op.
 */
export async function consumeInvite(invite: OpenInvite, userId: string): Promise<boolean> {
  return (await sys()).invites.accept({ id: invite.id, role: invite.role, workspaceId: invite.workspace?.id ?? null }, userId, new Date())
}

export async function revokeInvite(workspaceId: string | null, inviteId: string) {
  await (await sys()).invites.revoke(workspaceId, inviteId, new Date())
}
