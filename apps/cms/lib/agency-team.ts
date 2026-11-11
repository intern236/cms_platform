import 'server-only'
import { sys } from '@/lib/db'

export async function agencyTeam() {
  const db = await sys()
  const members = (await db.users.agency()).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    lastLoginAt: u.lastLoginAt,
    twoFactor: u.twoFactor,
    disabledAt: u.disabledAt,
  }))
  const pending = (await db.invites.pending(null, new Date())).map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt }))
  return { members, pending }
}
