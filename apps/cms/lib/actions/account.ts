'use server'

import { revalidatePath } from 'next/cache'
import { sys } from '@/lib/db'
import { checkPassword, hashPassword, passwordProblem } from '@/lib/auth/password'
import { attemptsAllowed, clearFailures, recordFailure } from '@/lib/auth/rate-limit'
import { currentSession, revokeSessions } from '@/lib/auth/session'
import { clientIp, ipKey, isPlainName } from '@/lib/security'

/** Your own account: name, password, 2FA, sessions. */

type Result = { ok: true; message?: string } | { ok: false; error?: string; errors?: Record<string, string> }

export async function updateProfile(name: unknown): Promise<Result> {
  const user = await currentSession()
  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' }
  const value = typeof name === 'string' ? name.trim() : ''
  if (!value || value.length > 80 || !isPlainName(value)) return { ok: false, errors: { name: 'Enter your name.' } }
  await (await sys()).users.update(user.id, { name: value })
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Saved.' }
}

async function confirmPassword(userId: string, email: string, password: string): Promise<string | null> {
  const ipk = ipKey(await clientIp())
  if (!(await attemptsAllowed(ipk, email))) return 'Too many attempts. Wait 15 minutes.'
  const row = await (await sys()).users.byId(userId)
  if (!(await checkPassword(password, row?.passwordHash))) {
    await recordFailure(ipk, email)
    return 'Your current password is not right.'
  }
  await clearFailures(ipk, email)
  return null
}

export async function changePassword(input: { current: unknown; next: unknown; confirm: unknown }): Promise<Result> {
  const user = await currentSession()
  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' }
  const current = typeof input.current === 'string' ? input.current : ''
  const next = typeof input.next === 'string' ? input.next : ''
  const problem = await confirmPassword(user.id, user.email, current)
  if (problem) return { ok: false, errors: { current: problem } }
  const weak = passwordProblem(next, { email: user.email, name: user.name })
  if (weak) return { ok: false, errors: { next: weak } }
  if (next !== input.confirm) return { ok: false, errors: { confirm: 'The two passwords do not match.' } }
  await (await sys()).users.update(user.id, { passwordHash: await hashPassword(next) })
  await revokeSessions(user.id, user.sessionId)
  return { ok: true, message: 'Password changed. You were signed out everywhere else.' }
}

export async function setTwoFactor(input: { enabled: unknown; password: unknown }): Promise<Result> {
  const user = await currentSession()
  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' }
  const problem = await confirmPassword(user.id, user.email, typeof input.password === 'string' ? input.password : '')
  if (problem) return { ok: false, errors: { password: problem } }
  await (await sys()).users.update(user.id, { twoFactor: input.enabled === true })
  revalidatePath('/account')
  return { ok: true, message: input.enabled === true ? 'Sign-in codes are on.' : 'Sign-in codes are off.' }
}

export async function signOutEverywhere(): Promise<Result> {
  const user = await currentSession()
  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' }
  await revokeSessions(user.id, user.sessionId)
  revalidatePath('/account')
  return { ok: true, message: 'Signed out of every other device.' }
}
