import 'server-only'
import { sys, type Role } from '@/lib/db'

/** People in a workspace, and the rules that keep a workspace from losing its last owner. */

export type Member = {
  userId: string
  name: string
  email: string
  role: Role
  joinedAt: Date
  lastLoginAt: Date | null
  twoFactor: boolean
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  return (await sys()).members.list(workspaceId)
}

export async function pendingInvites(workspaceId: string) {
  const rows = await (await sys()).invites.pending(workspaceId, new Date())
  return rows.map((r) => ({ id: r.id, email: r.email, role: r.role, expiresAt: r.expiresAt, createdAt: r.createdAt }))
}

export async function getMembership(workspaceId: string, userId: string) {
  return (await sys()).members.get(workspaceId, userId)
}

export async function changeRole(workspaceId: string, userId: string, role: Role): Promise<string | null> {
  const db = await sys()
  const current = await db.members.get(workspaceId, userId)
  if (!current) return 'That person is not in this workspace.'
  if (current.role === 'owner' && role !== 'owner' && (await db.members.ownerCount(workspaceId)) <= 1) {
    return 'A workspace needs at least one owner. Make someone else an owner first.'
  }
  await db.members.setRole(workspaceId, userId, role)
  return null
}

export async function removeMember(workspaceId: string, userId: string): Promise<string | null> {
  const db = await sys()
  const current = await db.members.get(workspaceId, userId)
  if (!current) return 'That person is not in this workspace.'
  if (current.role === 'owner' && (await db.members.ownerCount(workspaceId)) <= 1) {
    return 'You cannot remove the last owner. Make someone else an owner first.'
  }
  await db.members.remove(workspaceId, userId)
  return null
}

export async function addMember(workspaceId: string, userId: string, role: Role) {
  await (await sys()).members.upsert(workspaceId, userId, role)
}
