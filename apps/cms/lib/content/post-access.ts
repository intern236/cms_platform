import type { Access } from '@/lib/auth/access'
import { can } from '@/lib/permissions'
import type { Post } from './posts'

/**
 * May this person change this existing post at all?
 * Editors and owners: any post. Writers: only their own, and only until it has
 * been published.
 */
export function canEditPost(access: Pick<Access, 'role' | 'user'>, post: Pick<Post, 'createdBy' | 'status' | 'publishedAt'>): boolean {
  if (can(access.role, 'posts.editAny')) return true
  return post.createdBy === access.user.id && post.status !== 'published' && !post.publishedAt
}
