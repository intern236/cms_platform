'use server'

import { redirect } from 'next/navigation'
import { newId, sys } from '@/lib/db'
import { getWorkspaceBySlug } from '@/lib/auth/access'
import { consumeInvite, findInvite } from '@/lib/auth/invites'
import { checkPassword, hashPassword, passwordProblem } from '@/lib/auth/password'
import { attemptsAllowed, clearFailures, recordFailure, throttle } from '@/lib/auth/rate-limit'
import { completeReset, findReset, requestReset } from '@/lib/auth/reset'
import { createSession, currentSession, destroyCurrentSession } from '@/lib/auth/session'
import { maskEmail, startChallenge, verifyChallenge } from '@/lib/auth/two-factor'
import { agencyBrand, workspaceBrand } from '@/lib/mail'
import { clientIp, ipKey, isPlainName, normaliseEmail } from '@/lib/security'

/**
 * Sign-in, 2FA, sign-out, password reset and invite acceptance.
 *
 * Every failure message is generic ("That did not work") so the forms cannot be
 * used to learn which emails have accounts. Every step is rate-limited by IP and
 * by account.
 */

export type LoginState =
  | { step: 'password'; error?: string; email?: string }
  | { step: 'code'; maskedEmail: string; error?: string; outbox?: boolean }

const GENERIC = 'That did not work. Check your email and password.'
const TOO_MANY = 'Too many attempts. Wait 15 minutes and try again.'

/** Only same-site paths survive as a post-login destination. */
function safeNext(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.length > 300) return null
  return value
}

function str(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = normaliseEmail(str(form, 'email'))
  const password = str(form, 'password')
  const workspaceSlug = str(form, 'workspace')
  const ipk = ipKey(await clientIp())

  if (!(await attemptsAllowed(ipk, email || undefined))) return { step: 'password', error: TOO_MANY, email }

  const user = email ? await (await sys()).users.byEmail(email) : null
  const ok = await checkPassword(password, user?.passwordHash)
  if (!ok || !user || user.disabledAt) {
    await recordFailure(ipk, email || undefined)
    return { step: 'password', error: GENERIC, email }
  }
  await clearFailures(ipk, email)

  if (user.twoFactor) {
    const ws = workspaceSlug ? await getWorkspaceBySlug(workspaceSlug) : null
    const brand = ws ? workspaceBrand(ws) : agencyBrand()
    const mail = await startChallenge(user.id, user.email, brand)
    if (!mail.sent && !mail.outbox) return { step: 'password', error: 'Could not send your sign-in code. Try again shortly.', email }
    return { step: 'code', maskedEmail: maskEmail(user.email), outbox: mail.outbox }
  }

  await createSession(user.id)
  redirect(safeNext(str(form, 'next')) ?? (workspaceSlug ? `/${workspaceSlug}` : '/'))
}

export async function verifyCode(prev: LoginState, form: FormData): Promise<LoginState> {
  const masked = prev.step === 'code' ? prev.maskedEmail : ''
  const ipk = ipKey(await clientIp())
  if (!(await attemptsAllowed(ipk))) return { step: 'code', maskedEmail: masked, error: TOO_MANY }
  const result = await verifyChallenge(str(form, 'code'))
  if (result.status === 'ok') {
    await clearFailures(ipk)
    await createSession(result.userId)
    const workspaceSlug = str(form, 'workspace')
    redirect(safeNext(str(form, 'next')) ?? (workspaceSlug ? `/${workspaceSlug}` : '/'))
  }
  await recordFailure(ipk)
  if (result.status === 'wrong') return { step: 'code', maskedEmail: masked, error: 'That code is not right. Check the latest email.' }
  return { step: 'password', error: result.status === 'locked' ? 'Too many wrong codes. Sign in again.' : 'That code has expired. Sign in again.' }
}

export async function logout(form?: FormData): Promise<void> {
  await destroyCurrentSession()
  const slug = form ? str(form, 'workspace') : ''
  redirect(slug && /^[a-z0-9-]+$/.test(slug) ? `/${slug}/login` : '/login')
}

// ---- Password reset ----------------------------------------------------------

export type ForgotState = { sent?: boolean; error?: string }

export async function forgotPassword(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  const ipk = ipKey(await clientIp())
  /* At most 5 reset emails per machine per 15 minutes. */
  if (!(await throttle(`reset:${ipk}`, 5))) return { error: TOO_MANY }
  const slug = str(form, 'workspace')
  const ws = slug ? await getWorkspaceBySlug(slug) : null
  await requestReset(str(form, 'email'), ws ?? undefined)
  return { sent: true }
}

export type ResetState = { error?: string }

export async function resetPassword(_prev: ResetState, form: FormData): Promise<ResetState> {
  const token = str(form, 'token')
  const password = str(form, 'password')
  const ipk = ipKey(await clientIp())
  if (!(await attemptsAllowed(ipk))) return { error: TOO_MANY }
  const found = await findReset(token)
  if (!found) {
    await recordFailure(ipk)
    return { error: 'This link has expired or was already used. Ask for a new one.' }
  }
  const problem = passwordProblem(password, { email: found.email })
  if (problem) return { error: problem }
  if (password !== str(form, 'confirm')) return { error: 'The two passwords do not match.' }
  const userId = await completeReset(token, password)
  if (!userId) return { error: 'This link has expired or was already used. Ask for a new one.' }
  await createSession(userId)
  redirect('/')
}

// ---- Invites -----------------------------------------------------------------

export type InviteState = { error?: string; fieldErrors?: Record<string, string> }

export async function acceptInvite(_prev: InviteState, form: FormData): Promise<InviteState> {
  const token = str(form, 'token')
  const ipk = ipKey(await clientIp())
  if (!(await attemptsAllowed(ipk))) return { error: TOO_MANY }
  const invite = await findInvite(token)
  if (!invite) {
    await recordFailure(ipk)
    return { error: 'This invite has expired, was revoked, or was already used.' }
  }
  const destination = invite.workspace ? `/${invite.workspace.slug}` : '/agency'
  const session = await currentSession()

  if (invite.existingUserId) {
    /* An existing account joins by being signed in as that account. */
    if (!session || session.id !== invite.existingUserId) {
      return { error: `Sign in as ${invite.email} to accept this invite.` }
    }
    await consumeInvite(invite, session.id)
    redirect(destination)
  }

  if (session) {
    return { error: `This invite is for ${invite.email}. Sign out first, then open the link again.` }
  }

  const name = str(form, 'name').trim()
  const password = str(form, 'password')
  const fieldErrors: Record<string, string> = {}
  if (!name || name.length > 80 || !isPlainName(name)) fieldErrors.name = 'Enter your name.'
  const problem = passwordProblem(password, { email: invite.email, name })
  if (problem) fieldErrors.password = problem
  if (Object.keys(fieldErrors).length) return { fieldErrors }

  const db = await sys()
  const userId = newId()
  try {
    await db.users.insert({ id: userId, email: invite.email, name, passwordHash: await hashPassword(password) })
  } catch {
    return { error: 'An account with this email was just created. Sign in instead.' }
  }
  if (!(await consumeInvite(invite, userId))) {
    await db.users.delete(userId)
    return { error: 'This invite was already used.' }
  }
  await createSession(userId)
  redirect(destination)
}
