import type { Role } from '@/lib/db/types'

/**
 * WHO MAY DO WHAT. The one table every check in the app reads from.
 *
 * Agency users (your team) are treated as owners in every workspace and may also
 * do the agency-only things (integration settings, creating workspaces).
 */

export type Permission =
  | 'posts.create'
  | 'posts.editAny'
  | 'posts.publish'
  | 'posts.delete'
  | 'authors.manage'
  | 'inbox.read'
  | 'settings.edit'
  | 'members.manage'
  | 'keys.manage'
  | 'activity.read'

const MATRIX: Record<Role, Permission[]> = {
  owner: [
    'posts.create',
    'posts.editAny',
    'posts.publish',
    'posts.delete',
    'authors.manage',
    'inbox.read',
    'settings.edit',
    'members.manage',
    'keys.manage',
    'activity.read',
  ],
  editor: ['posts.create', 'posts.editAny', 'posts.publish', 'posts.delete', 'authors.manage', 'inbox.read', 'activity.read'],
  /* Writers draft and send for review. They see and edit their OWN unpublished
     posts only — enforced in lib/content/posts.ts, canEditPost(). */
  writer: ['posts.create'],
}

export const ROLE_RANK: Record<Role, number> = { writer: 1, editor: 2, owner: 3 }

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Editor', writer: 'Writer' }

export const ROLE_BLURB: Record<Role, string> = {
  owner: 'Everything, including people, settings and site keys.',
  editor: 'Writes, edits and publishes. Reads the inbox.',
  writer: 'Writes drafts and sends them for review. Cannot publish.',
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission)
}

export function isRole(value: unknown): value is Role {
  return value === 'owner' || value === 'editor' || value === 'writer'
}

/** You can hand out your own role or anything below it, never above. */
export function canGrant(actor: Role, target: Role): boolean {
  return ROLE_RANK[target] <= ROLE_RANK[actor]
}
