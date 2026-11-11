import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { sys, type Role, type WorkspaceRow } from '@/lib/db'
import { can, type Permission } from '@/lib/permissions'
import { currentSession, type SessionUser } from '@/lib/auth/session'
import { readSettings, type WorkspaceSettings } from '@/lib/workspaces/settings'

/**
 * EVERY PAGE, ACTION AND ROUTE STARTS HERE.
 *
 * `requireWorkspace(slug, permission)` answers three questions in order:
 * signed in? → member of this workspace (or agency)? → allowed to do this?
 * It returns the context the rest of the request uses — notably `workspace.id`,
 * which is the ONLY workspace id content code is ever given. Nothing downstream
 * takes a workspace id from the request.
 *
 * Not a member and no such workspace look identical (404), so nobody can probe
 * which clients exist.
 */

export type WorkspaceRef = {
  id: string
  slug: string
  name: string
  accent: string
  hasLogo: boolean
  siteUrl: string
  webhookUrl: string
  settings: WorkspaceSettings
  archived: boolean
  updatedAt: Date
}

export type Access = {
  user: SessionUser
  workspace: WorkspaceRef
  /** Effective role. Agency users act as owners everywhere. */
  role: Role
  isAgency: boolean
}

export const getWorkspaceBySlug = cache(async (slug: string): Promise<WorkspaceRef | null> => {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) return null
  const row = await (await sys()).workspaces.bySlug(slug)
  return row ? toRef(row) : null
})

export function toRef(row: WorkspaceRow): WorkspaceRef {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    accent: row.accent,
    hasLogo: row.hasLogo,
    siteUrl: row.siteUrl,
    webhookUrl: row.webhookUrl,
    settings: readSettings(row.settings),
    archived: Boolean(row.archivedAt),
    updatedAt: row.updatedAt,
  }
}

export const getAccess = cache(async (slug: string): Promise<Access | null> => {
  const user = await currentSession()
  if (!user) return null
  const workspace = await getWorkspaceBySlug(slug)
  if (!workspace) return null
  if (user.isAgency) return { user, workspace, role: 'owner', isAgency: true }
  if (workspace.archived) return null
  const m = await (await sys()).members.get(workspace.id, user.id)
  return m ? { user, workspace, role: m.role, isAgency: false } : null
})

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await currentSession()
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  return user
}

export async function requireAgency(): Promise<SessionUser> {
  const user = await requireUser('/agency')
  if (!user.isAgency) notFound()
  return user
}

/** For pages. Redirects to sign-in, 404s for strangers, bounces a missing permission to the dashboard. */
export async function requireWorkspace(slug: string, permission?: Permission): Promise<Access> {
  const user = await currentSession()
  if (!user) redirect(`/${slug}/login`)
  const access = await getAccess(slug)
  if (!access) notFound()
  if (permission && !can(access.role, permission)) redirect(`/${slug}?denied=1`)
  return access
}

export type ActionDenied = { ok: false; error: string }

/** For server actions and route handlers: never redirects, returns a refusal instead. */
export async function actionAccess(
  slug: unknown,
  permission?: Permission
): Promise<{ ok: true; access: Access } | ActionDenied> {
  if (typeof slug !== 'string') return { ok: false, error: 'Unknown workspace.' }
  const user = await currentSession()
  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' }
  const access = await getAccess(slug)
  if (!access) return { ok: false, error: 'Unknown workspace.' }
  if (permission && !can(access.role, permission)) {
    return { ok: false, error: 'Your role does not allow that. Ask an owner.' }
  }
  return { ok: true, access }
}

export type WorkspaceListItem = { id: string; slug: string; name: string; accent: string; hasLogo: boolean; role: Role }

/** The workspaces a user can switch between. */
export const listMyWorkspaces = cache(async (): Promise<WorkspaceListItem[]> => {
  const user = await currentSession()
  if (!user) return []
  const db = await sys()
  const rows = user.isAgency
    ? (await db.workspaces.list()).map((w) => ({ ...w, role: 'owner' as Role }))
    : await db.members.workspacesOf(user.id)
  return rows.map((w) => ({ id: w.id, slug: w.slug, name: w.name, accent: w.accent, hasLogo: w.hasLogo, role: w.role }))
})
