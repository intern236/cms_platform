import { beforeEach, describe, expect, it } from 'vitest'
import { sys } from '@/lib/db'
import { acceptInvite, forgotPassword, login, logout, resetPassword, verifyCode, type LoginState } from '@/lib/actions/auth'
import { changePassword, setTwoFactor, signOutEverywhere } from '@/lib/actions/account'
import { removeAgencyMember, setUserDisabled } from '@/lib/actions/agency'
import { currentSession, SESSION_COOKIE } from '@/lib/auth/session'
import { PENDING_COOKIE } from '@/lib/auth/two-factor'
import { createInvite, findInvite } from '@/lib/auth/invites'
import { passwordProblem } from '@/lib/auth/password'
import { getAccess } from '@/lib/auth/access'
import { jar, RedirectError, requestHeaders, resetRequest } from './next-mocks'
import { makeUser, makeWorkspace, member, PASSWORD, signInAs } from './fixtures'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

async function run<T>(fn: () => Promise<T>): Promise<T | { redirectedTo: string }> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof RedirectError) return { redirectedTo: e.url }
    throw e
  }
}

const fresh = (ip = '203.0.113.10') => {
  resetRequest()
  requestHeaders.set('x-forwarded-for', ip)
}

const doLogin = (email: string, password: string, extra: Record<string, string> = {}) =>
  run(() => login({ step: 'password' }, form({ email, password, ...extra })))

async function latestMail(to: string) {
  const rows = (await (await sys()).outbox.latest(1000)).filter((r) => r.to === to)
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
}

beforeEach(async () => {
  fresh()
  /* Clear every rate-limit counter. */
  await (await sys()).attempts.deleteBefore(new Date(Date.now() + 86_400_000))
})

describe('passwords', () => {
  it('needs 12+ characters and refuses obvious ones', () => {
    expect(passwordProblem('short')).toMatch(/12/)
    expect(passwordProblem('aaaaaaaaaaaaaaaa')).toBeTruthy()
    expect(passwordProblem('password1234')).toBeTruthy()
    expect(passwordProblem('priya-is-great-2026', { email: 'priya@x.com' })).toMatch(/email/)
    expect(passwordProblem('long enough and odd 7!')).toBeNull()
  })
})

describe('sign in', () => {
  it('signs in with the right password and lands on the right page', async () => {
    const u = await makeUser()
    expect(await doLogin(u.email, PASSWORD)).toEqual({ redirectedTo: '/' })
    expect(jar.has(SESSION_COOKIE)).toBe(true)
    expect((await currentSession())?.id).toBe(u.id)
  })

  it('is case-insensitive on email', async () => {
    const u = await makeUser()
    expect(await doLogin(u.email.toUpperCase(), PASSWORD)).toEqual({ redirectedTo: '/' })
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const u = await makeUser()
    const wrong = (await doLogin(u.email, 'not-the-password')) as LoginState
    const unknown = (await doLogin('nobody@example.com', PASSWORD)) as LoginState
    expect(wrong.error).toBe(unknown.error)
    expect(jar.has(SESSION_COOKIE)).toBe(false)
  })

  it('only follows same-site "next" paths', async () => {
    const u = await makeUser()
    expect(await doLogin(u.email, PASSWORD, { next: '/acme/posts' })).toEqual({ redirectedTo: '/acme/posts' })
    fresh()
    expect(await doLogin(u.email, PASSWORD, { next: '//evil.example' })).toEqual({ redirectedTo: '/' })
    fresh()
    expect(await doLogin(u.email, PASSWORD, { next: 'https://evil.example' })).toEqual({ redirectedTo: '/' })
    fresh()
    expect(await doLogin(u.email, PASSWORD, { next: '/\\evil.example' })).toEqual({ redirectedTo: '/' })
  })

  it('refuses a disabled account with the generic message', async () => {
    const u = await makeUser()
    await (await sys()).users.update(u.id, { disabledAt: new Date() })
    expect(((await doLogin(u.email, PASSWORD)) as LoginState).error).toMatch(/did not work/)
  })
})

describe('rate limits', () => {
  it('locks an IP after 5 failures, even with the right password next', async () => {
    const u = await makeUser()
    for (let i = 0; i < 5; i++) await doLogin(u.email, 'wrong-wrong-wrong')
    expect(((await doLogin(u.email, PASSWORD)) as LoginState).error).toMatch(/Too many/)
  })

  it('cannot be dodged by forging X-Real-IP or the left of X-Forwarded-For', async () => {
    const u = await makeUser()
    for (let i = 0; i < 5; i++) {
      fresh(`198.51.100.${i}, 203.0.113.10`)
      requestHeaders.set('x-real-ip', `198.51.100.${i}`)
      requestHeaders.set('cf-connecting-ip', `198.51.100.${i}`)
      await doLogin(u.email, 'wrong-wrong-wrong')
    }
    fresh()
    expect(((await doLogin(u.email, PASSWORD)) as LoginState).error).toMatch(/Too many/)
  })

  it('protects one account from many IPs (10 failures)', async () => {
    const u = await makeUser()
    for (let i = 0; i < 10; i++) {
      fresh(`192.0.2.${i}`)
      await doLogin(u.email, 'wrong-wrong-wrong')
    }
    fresh('192.0.2.200')
    expect(((await doLogin(u.email, PASSWORD)) as LoginState).error).toMatch(/Too many/)
  })

  it('caps failures globally (100) against spraying many accounts', async () => {
    const u = await makeUser()
    for (let i = 0; i < 100; i++) {
      fresh(`10.9.${Math.floor(i / 250)}.${i % 250}`)
      await doLogin(`spray${i}@example.com`, 'wrong-wrong-wrong')
    }
    fresh('10.20.30.40')
    expect(((await doLogin(u.email, PASSWORD)) as LoginState).error).toMatch(/Too many/)
  }, 60_000)
})

describe('two-factor codes', () => {
  async function startCode() {
    const u = await makeUser({ twoFactor: true })
    const step = (await doLogin(u.email, PASSWORD)) as LoginState
    expect(step.step).toBe('code')
    expect(jar.has(SESSION_COOKIE)).toBe(false)
    const mail = await latestMail(u.email)
    const code = mail.subject.slice(0, 6)
    return { u, step, code }
  }

  it('asks for the emailed code, and the code signs in once', async () => {
    const { u, step, code } = await startCode()
    const pending = jar.get(PENDING_COOKIE)!
    expect(await run(() => verifyCode(step, form({ code })))).toEqual({ redirectedTo: '/' })
    expect((await currentSession())?.id).toBe(u.id)
    jar.set(PENDING_COOKIE, pending)
    expect(((await run(() => verifyCode(step, form({ code })))) as LoginState).step).toBe('password')
  })

  it('five wrong codes burn the challenge', async () => {
    const { step, code } = await startCode()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 4; i++) expect(((await verifyCode(step, form({ code: wrong }))) as LoginState).error).toMatch(/not right/)
    expect(((await verifyCode(step, form({ code: wrong }))) as LoginState).error).toMatch(/Too many wrong/)
    const after = await run(() => verifyCode(step, form({ code })))
    expect(after).not.toHaveProperty('redirectedTo')
    expect(jar.has(SESSION_COOKIE)).toBe(false)
  })

  it('turning codes on or off needs the current password', async () => {
    const u = await makeUser()
    await signInAs(u)
    expect((await setTwoFactor({ enabled: true, password: 'nope' })).ok).toBe(false)
    expect((await setTwoFactor({ enabled: true, password: PASSWORD })).ok).toBe(true)
  })
})

describe('sessions end when they should', () => {
  it('logout kills the session server-side, so a copied cookie stops working', async () => {
    const u = await makeUser()
    const token = await signInAs(u)
    await run(() => logout())
    jar.set(SESSION_COOKIE, token)
    expect(await currentSession()).toBeNull()
  })

  it('changing the password signs out every other device', async () => {
    const u = await makeUser()
    const other = await signInAs(u, '203.0.113.20')
    const mine = await signInAs(u)
    expect((await changePassword({ current: PASSWORD, next: 'a brand new passphrase!', confirm: 'a brand new passphrase!' })).ok).toBe(true)
    expect((await currentSession())?.id).toBe(u.id)
    jar.set(SESSION_COOKIE, other)
    expect(await currentSession()).toBeNull()
    jar.set(SESSION_COOKIE, mine)
  })

  it('"sign out everywhere" keeps only this device', async () => {
    const u = await makeUser()
    const other = await signInAs(u, '203.0.113.21')
    await signInAs(u)
    await signOutEverywhere()
    expect(await currentSession()).not.toBeNull()
    jar.set(SESSION_COOKIE, other)
    expect(await currentSession()).toBeNull()
  })

  it('disabling a user (agency) ends their sessions at once', async () => {
    const admin = await makeUser({ isAgency: true })
    const victim = await makeUser()
    const theirs = await signInAs(victim)
    await signInAs(admin)
    expect((await setUserDisabled(victim.id, true)).ok).toBe(true)
    jar.set(SESSION_COOKIE, theirs)
    expect(await currentSession()).toBeNull()
  })

  it('a garbage or oversized cookie is just "signed out"', async () => {
    jar.set(SESSION_COOKIE, 'x'.repeat(5000))
    expect(await currentSession()).toBeNull()
    jar.set(SESSION_COOKIE, "' OR 1=1 --")
    expect(await currentSession()).toBeNull()
  })
})

describe('password reset', () => {
  it('answers the same for unknown emails and sends nothing', async () => {
    expect(await forgotPassword({}, form({ email: 'ghost@example.com' }))).toEqual({ sent: true })
    expect(await latestMail('ghost@example.com')).toBeUndefined()
  })

  it('the link works once, sets the password and signs out everywhere', async () => {
    const u = await makeUser()
    const old = await signInAs(u, '203.0.113.30')
    fresh()
    await forgotPassword({}, form({ email: u.email }))
    const mail = await latestMail(`${u.name} <${u.email}>`)
    const token = mail.text.match(/\/reset\/([A-Za-z0-9_-]+)/)![1]
    const res = await run(() => resetPassword({}, form({ token, password: 'fresh passphrase here', confirm: 'fresh passphrase here' })))
    expect(res).toEqual({ redirectedTo: '/' })
    fresh()
    expect(((await run(() => resetPassword({}, form({ token, password: 'another passphrase!', confirm: 'another passphrase!' })))) as { error?: string }).error).toMatch(/expired/)
    jar.set(SESSION_COOKIE, old)
    expect(await currentSession()).toBeNull()
    fresh()
    expect(await doLogin(u.email, 'fresh passphrase here')).toEqual({ redirectedTo: '/' })
  })

  it('throttles reset emails per machine', async () => {
    const u = await makeUser()
    for (let i = 0; i < 5; i++) await forgotPassword({}, form({ email: u.email }))
    expect((await forgotPassword({}, form({ email: u.email }))).error).toMatch(/Too many/)
  })
})

describe('invites', () => {
  it('creates an account, joins with the invited role, and works only once', async () => {
    const ws = await makeWorkspace('invite-a')
    const inviter = await makeUser()
    const r = await createInvite({ workspaceId: ws.id, email: 'New.Person@Example.com', role: 'editor', inviter })
    expect(r.ok).toBe(true)
    const token = (r as { url: string }).url.split('/invite/')[1]
    fresh()
    const res = await run(() => acceptInvite({}, form({ token, name: 'New Person', password: 'a perfectly fine pass' })))
    expect(res).toEqual({ redirectedTo: '/invite-a' })
    expect((await getAccess('invite-a'))?.role).toBe('editor')
    fresh()
    expect(((await run(() => acceptInvite({}, form({ token, name: 'X', password: 'a perfectly fine pass' })))) as { error?: string }).error).toMatch(/expired|used/)
  })

  it('an existing account must be signed in as itself to accept', async () => {
    const ws = await makeWorkspace('invite-b')
    const existing = await makeUser()
    const someoneElse = await makeUser()
    const r = (await createInvite({ workspaceId: ws.id, email: existing.email, role: 'writer', inviter: someoneElse })) as { url: string }
    const token = r.url.split('/invite/')[1]
    fresh()
    expect(((await acceptInvite({}, form({ token }))) as { error?: string }).error).toMatch(/Sign in/)
    await signInAs(someoneElse)
    expect(((await acceptInvite({}, form({ token }))) as { error?: string }).error).toMatch(/Sign in as/)
    await signInAs(existing)
    expect(await run(() => acceptInvite({}, form({ token })))).toEqual({ redirectedTo: '/invite-b' })
  })

  it('a newer invite replaces the older one; revoked and expired links are dead', async () => {
    const ws = await makeWorkspace('invite-c')
    const inviter = await makeUser()
    const first = (await createInvite({ workspaceId: ws.id, email: 'x@example.com', role: 'writer', inviter })) as { url: string }
    await createInvite({ workspaceId: ws.id, email: 'x@example.com', role: 'editor', inviter })
    expect(await findInvite(first.url.split('/invite/')[1])).toBeNull()
    expect(await findInvite('not-a-real-token-at-all-1234567890')).toBeNull()
  })

  it('refuses inviting someone already in the workspace', async () => {
    const ws = await makeWorkspace('invite-d')
    const m = await member(ws.id, 'writer')
    const inviter = await makeUser()
    const r = await createInvite({ workspaceId: ws.id, email: m.email, role: 'editor', inviter })
    expect(r.ok).toBe(false)
  })
})

describe('agency team', () => {
  it('cannot remove the last agency admin or yourself', async () => {
    const admin = await makeUser({ isAgency: true })
    await signInAs(admin)
    expect((await removeAgencyMember(admin.id)).ok).toBe(false)
  })

  it('removing agency access ends their sessions', async () => {
    const a = await makeUser({ isAgency: true })
    const b = await makeUser({ isAgency: true })
    const bToken = await signInAs(b)
    await signInAs(a)
    expect((await removeAgencyMember(b.id)).ok).toBe(true)
    jar.set(SESSION_COOKIE, bToken)
    expect(await currentSession()).toBeNull()
  })

  it('agency actions refuse non-agency users', async () => {
    const u = await makeUser()
    await signInAs(u)
    expect((await setUserDisabled(u.id, true)).ok).toBe(false)
  })
})
