import 'server-only'
import { sys } from '@/lib/db'
import { cmsUrl } from '@/lib/env'
import { agencyBrand, sendMail, workspaceBrand } from '@/lib/mail'
import { resetEmail } from '@/lib/mail/templates'
import { normaliseEmail, randomToken, sha256 } from '@/lib/security'
import { hashPassword } from './password'
import { revokeSessions } from './session'

/**
 * PASSWORD RESET.
 *
 * The request always answers the same way whether or not the address has an
 * account, so it cannot be used to find out who is a user. The link works once,
 * for 30 minutes; using it signs the account out everywhere.
 */

export const RESET_MINUTES = 30

export async function requestReset(rawEmail: string, brandFor?: { name: string; accent: string; hasLogo: boolean; slug: string }) {
  const email = normaliseEmail(rawEmail)
  const db = await sys()
  const user = await db.users.byEmail(email)
  if (!user || user.disabledAt) return
  await db.resets.deleteExpired(new Date())
  const token = randomToken()
  await db.resets.insert({
    tokenHash: sha256(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
  })
  const brand = brandFor ? workspaceBrand(brandFor) : agencyBrand()
  await sendMail({
    to: { name: user.name, address: user.email },
    fromName: brand.name,
    email: resetEmail({ brand, name: user.name, url: `${cmsUrl()}/reset/${token}`, minutes: RESET_MINUTES }),
  })
}

export async function findReset(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null
  return (await sys()).resets.findActive(sha256(token), new Date())
}

/** Sets the new password if the token is still good. Returns the user id, or null. */
export async function completeReset(token: string, password: string): Promise<string | null> {
  const found = await findReset(token)
  if (!found) return null
  const db = await sys()
  /* Marking it used only succeeds once, so a double submit or a replay does nothing. */
  if (!(await db.resets.markUsed(sha256(token), new Date()))) return null
  await db.users.update(found.userId, { passwordHash: await hashPassword(password) })
  await db.resets.deleteForUser(found.userId)
  await revokeSessions(found.userId)
  return found.userId
}
