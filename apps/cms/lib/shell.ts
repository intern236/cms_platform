import 'server-only'
import type { ShellProps, NavItem } from '@/components/shell/types'
import { listMyWorkspaces, type Access } from '@/lib/auth/access'
import type { SessionUser } from '@/lib/auth/session'
import { countUnread } from '@/lib/content/contact'
import { inWorkspace } from '@/lib/db'
import { agencyName, outboxVisible } from '@/lib/env'
import { can } from '@/lib/permissions'

/** Everything the sidebar needs, for a workspace page or an agency/account page. */
export async function shellProps(user: SessionUser, access: Access | null): Promise<ShellProps> {
  const workspaces = await listMyWorkspaces()
  let nav: NavItem[]
  if (access) {
    const { workspace, role } = access
    const base = `/${workspace.slug}`
    const unread =
      can(role, 'inbox.read') && workspace.settings.contact.enabled
        ? await inWorkspace(workspace.id, (tx) => countUnread(tx, workspace.id))
        : 0
    nav = [
      { key: 'dashboard', label: 'Dashboard', href: base, exact: true },
      { key: 'posts', label: 'Posts', href: `${base}/posts` },
      ...(workspace.settings.blog.authors && can(role, 'authors.manage') ? [{ key: 'authors' as const, label: 'Authors', href: `${base}/authors` }] : []),
      ...(can(role, 'inbox.read') && workspace.settings.contact.enabled
        ? [{ key: 'inbox' as const, label: 'Inbox', href: `${base}/inbox`, badge: unread }]
        : []),
      ...(can(role, 'settings.edit') ? [{ key: 'settings' as const, label: 'Settings', href: `${base}/settings` }] : []),
    ]
  } else {
    nav = user.isAgency
      ? [
          { key: 'clients', label: 'Clients', href: '/agency', exact: true },
          { key: 'team', label: 'Team', href: '/agency/team' },
          ...(outboxVisible() ? [{ key: 'outbox' as const, label: 'Email outbox', href: '/agency/outbox' }] : []),
        ]
      : [{ key: 'account', label: 'Account', href: '/account' }]
  }
  return {
    user: { name: user.name, email: user.email, isAgency: user.isAgency },
    workspace: access
      ? {
          slug: access.workspace.slug,
          name: access.workspace.name,
          accent: access.workspace.accent,
          hasLogo: access.workspace.hasLogo,
          siteUrl: access.workspace.siteUrl,
          logoVersion: access.workspace.updatedAt.getTime(),
          role: access.role,
        }
      : null,
    workspaces,
    nav,
    agencyName: agencyName(),
    canCreatePost: Boolean(access && can(access.role, 'posts.create')),
  }
}
