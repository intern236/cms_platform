'use server'

import { redirect } from 'next/navigation'
import { newId, sys } from '@/lib/db'
import { hashPassword, passwordProblem } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { userCount } from '@/lib/setup-state'
import { throttle } from '@/lib/auth/rate-limit'
import { clientIp, ipKey, isEmail, isPlainName, normaliseEmail, safeEqual } from '@/lib/security'

/**
 * FIRST RUN. While the database has no users at all, /setup creates the first
 * agency admin. In production it also requires CMS_SETUP_TOKEN, so nobody who
 * finds a fresh deploy before you do can claim it.
 */

export type SetupState = { error?: string; errors?: Record<string, string> }

export async function completeSetup(_prev: SetupState, form: FormData): Promise<SetupState> {
  if (!(await throttle(`setup:${ipKey(await clientIp())}`, 10))) return { error: 'Too many attempts. Wait 15 minutes.' }
  if ((await userCount()) > 0) return { error: 'This CMS is already set up. Sign in instead.' }

  const required = process.env.CMS_SETUP_TOKEN?.trim()
  if (process.env.NODE_ENV === 'production') {
    if (!required) return { error: 'Set CMS_SETUP_TOKEN on the server, then enter it here.' }
    const given = String(form.get('token') ?? '')
    if (!safeEqual(given, required)) return { errors: { token: 'That setup token is not right.' } }
  }

  const name = String(form.get('name') ?? '').trim()
  const email = normaliseEmail(form.get('email'))
  const password = String(form.get('password') ?? '')
  const errors: Record<string, string> = {}
  if (!name || name.length > 80 || !isPlainName(name)) errors.name = 'Enter your name.'
  if (!isEmail(email)) errors.email = 'Enter a valid email.'
  const weak = passwordProblem(password, { email, name })
  if (weak) errors.password = weak
  if (Object.keys(errors).length) return { errors }

  const id = newId()
  await (await sys()).users.insert({ id, email, name, passwordHash: await hashPassword(password), isAgency: true })
  await createSession(id)

  if (form.get('demo') === 'on' && process.env.NODE_ENV !== 'production') {
    const { seedDemo } = await import('@/lib/demo')
    await seedDemo(id)
    redirect('/agency?welcome=demo')
  }
  redirect('/agency?welcome=1')
}
