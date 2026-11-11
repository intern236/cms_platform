import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { sys } from '@/lib/db'
import { randomToken, sha256 } from '@/lib/security'

/**
 * SESSIONS LIVE IN THE DATABASE.
 *
 * The cookie holds 256 random bits; the table holds only their sha256. So:
 * - signing out, "sign out everywhere", disabling a user or removing them all take
 *   effect on the very next request;
 * - a stolen database dump contains no usable cookies.
 *
 * A session lasts 30 days at most and ends after 7 idle days.
 */

export const SESSION_COOKIE = 'cms_session'
const ABSOLUTE_DAYS = 30
const IDLE_DAYS = 7
const TOUCH_EVERY_MS = 5 * 60_000

const DAY = 86_400_000

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken()
  const now = new Date()
  const ua = ((await headers()).get('user-agent') ?? '').slice(0, 300)
  const db = await sys()
  await db.sessions.insert({
    id: sha256(token),
    userId,
    userAgent: ua,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + ABSOLUTE_DAYS * DAY),
  })
  await db.users.update(userId, { lastLoginAt: now })
  ;(await cookies()).set(SESSION_COOKIE, token, cookieOptions(ABSOLUTE_DAYS * 86_400))
  /* Opportunistic cleanup, so the store never grows without bound. */
  await db.sessions.deleteExpired(now)
}

export type SessionUser = {
  sessionId: string
  id: string
  email: string
  name: string
  isAgency: boolean
  twoFactor: boolean
}

/** The signed-in user for this request, or null. Memoised per request. */
export const currentSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > 100) return null
  const id = sha256(token)
  const db = await sys()
  const now = new Date()
  const found = await db.sessions.findActive(id, now)
  if (!found || found.user.disabledAt) return null
  const { session, user } = found
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_DAYS * DAY) {
    await db.sessions.delete(id)
    return null
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.sessions.touch(id, now)
  }
  return {
    sessionId: session.id,
    id: user.id,
    email: user.email,
    name: user.name,
    isAgency: user.isAgency,
    twoFactor: user.twoFactor,
  }
})

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await (await sys()).sessions.delete(sha256(token))
  }
  jar.set(SESSION_COOKIE, '', cookieOptions(0))
}

/** Ends every session a user has, optionally keeping one (the one doing the asking). */
export async function revokeSessions(userId: string, keepSessionId?: string): Promise<void> {
  await (await sys()).sessions.deleteForUser(userId, keepSessionId)
}

export async function listSessions(userId: string) {
  const rows = await (await sys()).sessions.listForUser(userId, new Date())
  return rows.map((s) => ({ id: s.id, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt }))
}
