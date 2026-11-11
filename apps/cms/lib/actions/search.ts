'use server'

import { actionAccess } from '@/lib/auth/access'
import { displayStatus, listPosts } from '@/lib/content/posts'
import { inWorkspace } from '@/lib/db'
import { can } from '@/lib/permissions'

/** Posts matching a query, for the command palette. Writers only see their own. */
export async function searchPosts(workspace: string, q: string) {
  const gate = await actionAccess(workspace, 'posts.create')
  if (!gate.ok) return []
  const { access } = gate
  const query = typeof q === 'string' ? q.slice(0, 100) : ''
  const posts = await inWorkspace(access.workspace.id, (tx) =>
    listPosts(tx, access.workspace.id, {
      q: query,
      createdBy: can(access.role, 'posts.editAny') ? undefined : access.user.id,
    })
  )
  return posts.slice(0, 8).map((p) => ({ id: p.id, title: p.title, status: displayStatus(p) }))
}
