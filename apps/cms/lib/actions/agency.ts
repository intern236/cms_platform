'use server'

import { revalidatePath } from 'next/cache'
import { currentSession } from '@/lib/auth/session'
import { createInvite, revokeInvite } from '@/lib/auth/invites'
import { revokeSessions } from '@/lib/auth/session'
import { sys, isId } from '@/lib/db'
import { createWorkspace, setArchived } from '@/lib/workspaces'
import { getWorkspaceBySlug } from '@/lib/auth/access'

/**
 * The agency area: create clients, invite their first owner, manage your own
 * team. Agency users only — checked in every action.
 */

type Result = { ok: true; message?: string; slug?: string; url?: string } | { ok: false; error?: string; errors?: Record<string, string> }

async function agencyUser() {
  const user = await currentSession()
  return user?.isAgency ? user : null
}

export async function createClient(input: {
  name: unknown
  slug: unknown
  siteUrl: unknown
  accent: unknown
  ownerEmail: unknown
}): Promise<Result> {
  const user = await agencyUser()
  if (!user) return { ok: false, error: 'Only your agency team can add clients.' }
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const created = await createWorkspace({
    name: str(input.name),
    slug: str(input.slug),
    siteUrl: str(input.siteUrl),
    accent: str(input.accent) || '#18181b',
  })
  if (!created.ok) return { ok: false, errors: created.errors }
  let url: string | undefined
  let message = 'Client created.'
  const ownerEmail = str(input.ownerEmail).trim()
  if (ownerEmail) {
    const invite = await createInvite({
      workspaceId: created.workspace.id,
      email: ownerEmail,
      role: 'owner',
      inviter: { id: user.id, name: user.name },
    })
    if (!invite.ok) return { ok: true, slug: created.workspace.slug, message: `Client created, but the invite failed: ${invite.error}` }
    url = invite.url
    if (invite.mail.sent) {
      message = 'Client created and invitation email sent to owner.'
    } else if (invite.mail.outbox) {
      message = 'Client created. Email is not set up, so copy the link below.'
    } else {
      message = `Client created, but email could not be sent (${invite.mail.error || 'SMTP delivery failed'}). Copy the link below:`
    }
  }
  revalidatePath('/agency')
  return { ok: true, slug: created.workspace.slug, url, message }
}

export async function archiveClient(slug: unknown, archived: boolean): Promise<Result> {
  const user = await agencyUser()
  if (!user) return { ok: false, error: 'Only your agency team can do that.' }
  const ws = typeof slug === 'string' ? await getWorkspaceBySlug(slug) : null
  if (!ws) return { ok: false, error: 'Unknown client.' }
  await setArchived(ws.id, Boolean(archived))
  revalidatePath('/agency')
  return { ok: true }
}

export async function inviteAgencyMember(email: unknown): Promise<Result> {
  const user = await agencyUser()
  if (!user) return { ok: false, error: 'Only your agency team can do that.' }
  const invite = await createInvite({
    workspaceId: null,
    email: typeof email === 'string' ? email : '',
    role: 'agency',
    inviter: { id: user.id, name: user.name },
  })
  if (!invite.ok) return { ok: false, errors: { email: invite.error } }
  revalidatePath('/agency/team')
  let message = 'Invite sent.'
  if (invite.mail.outbox) {
    message = 'Invite created. Email is not set up, so copy the link below.'
  } else if (!invite.mail.sent) {
    message = `Invite created, but email could not be sent (${invite.mail.error || 'SMTP delivery failed'}). Copy the link below:`
  }

  return {
    ok: true,
    message,
    url: invite.url,
  }
}

export async function cancelAgencyInvite(inviteId: unknown): Promise<Result> {
  const user = await agencyUser()
  if (!user) return { ok: false, error: 'Only your agency team can do that.' }
  if (!isId(inviteId)) return { ok: false, error: 'Invalid request.' }
  await revokeInvite(null, inviteId)
  revalidatePath('/agency/team')
  return { ok: true }
}

/** Takes agency access away. Their client memberships (if any) stay. */
export async function removeAgencyMember(userId: unknown): Promise<Result> {
  const user = await agencyUser()
  if (!user) return { ok: false, error: 'Only your agency team can do that.' }
  if (!isId(userId)) return { ok: false, error: 'Invalid request.' }
  if (userId === user.id) return { ok: false, error: 'You cannot remove yourself.' }
  const db = await sys()
  if ((await db.users.countActiveAgency(userId)) < 1) return { ok: false, error: 'The agency needs at least one admin.' }
  await db.users.update(userId, { isAgency: false })
  await revokeSessions(userId)
  revalidatePath('/agency/team')
  return { ok: true }
}

/** Blocks sign-in everywhere and ends every session. Reversible. */
export async function setUserDisabled(userId: unknown, disabled: boolean): Promise<Result> {
  const user = await agencyUser()
  if (!user) return { ok: false, error: 'Only your agency team can do that.' }
  if (!isId(userId)) return { ok: false, error: 'Invalid request.' }
  if (userId === user.id) return { ok: false, error: 'You cannot disable yourself.' }
  await (await sys()).users.update(userId, { disabledAt: disabled ? new Date() : null })
  if (disabled) await revokeSessions(userId)
  revalidatePath('/agency/team')
  return { ok: true }
}
