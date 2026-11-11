import 'server-only'
import { newId, scoped, type Tx } from '@/lib/db'

/**
 * Who did what, per workspace. Written inside the same transaction as the change
 * it describes, so the log can never claim something that was rolled back.
 * Kept for a year.
 */

export type AuditAction =
  | 'post.created'
  | 'post.updated'
  | 'post.published'
  | 'post.scheduled'
  | 'post.unpublished'
  | 'post.review'
  | 'post.deleted'
  | 'author.created'
  | 'author.updated'
  | 'author.deleted'
  | 'member.invited'
  | 'member.joined'
  | 'member.role'
  | 'member.removed'
  | 'settings.updated'
  | 'branding.updated'
  | 'key.created'
  | 'key.revoked'
  | 'message.deleted'

export async function audit(
  tx: Tx,
  input: {
    workspaceId: string
    actor: { id: string; name: string } | null
    action: AuditAction
    targetType?: string
    targetId?: string
    summary: string
  }
): Promise<void> {
  await scoped(tx, input.workspaceId).audit.insert({
    id: newId(),
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? 'System',
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    summary: input.summary.slice(0, 300),
  })
}

export function recentActivity(tx: Tx, workspaceId: string, limit = 20) {
  return scoped(tx, workspaceId).audit.recent(limit, new Date(Date.now() - 365 * 86_400_000))
}
