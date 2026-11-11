import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { AGENCY, PASSWORD, signIn, startSite, stopSite } from './helpers'

/**
 * Attacks, run against the real production servers after the journey has made
 * a client (bakery) with a team. Login lockout runs last: it locks this IP.
 */
test.describe.configure({ mode: 'serial' })

const SITE = 'http://localhost:3400'
const state = JSON.parse(readFileSync(path.join(tmpdir(), 'cms-e2e-state.json'), 'utf8')) as Record<string, string>

async function as(browser: Browser, email: string, password = PASSWORD): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await signIn(page, email, password)
  await page.waitForURL((u) => !u.pathname.endsWith('/login'))
  return page
}

let agency: Page
let owner: Page

test.afterAll(() => stopSite())

test('a second client is invisible to the first client’s people', async ({ browser }) => {
  agency = await as(browser, AGENCY.email, AGENCY.password)
  await agency.goto('/agency/new')
  await agency.getByLabel('Client name').fill('Rival Co')
  await agency.getByLabel('Workspace address').fill('rival')
  await agency.getByRole('button', { name: /Create workspace/ }).click()
  await expect(agency.getByText(/created|Rival Co/).first()).toBeVisible()

  // A rival post, made by the agency.
  await agency.goto('/rival/posts/new')
  await agency.getByLabel('Title').fill('Rival secret roadmap')
  await agency.getByRole('button', { name: 'More publish options' }).click()
  await agency.getByRole('menuitem', { name: 'Save draft' }).click()
  await agency.waitForURL(/\/rival\/posts\/[0-9a-f]{24}$/)
  const rivalPost = new URL(agency.url()).pathname.split('/').pop()!

  owner = await as(browser, 'owner@bakery.test')
  for (const url of ['/rival', '/rival/posts', `/rival/posts/${rivalPost}`, '/rival/settings', '/rival/inbox', '/rival/inbox/export', '/agency', '/agency/outbox', '/agency/team']) {
    const res = await owner.goto(url)
    expect(res!.status(), url).toBe(404)
    await expect(owner.getByText('Rival secret roadmap')).toHaveCount(0)
  }
  // The rival post id under the owner's own workspace is also a 404.
  expect((await owner.goto(`/bakery/posts/${rivalPost}`))!.status()).toBe(404)
  // The workspace switcher does not list it.
  await owner.goto('/bakery')
  await expect(owner.getByText('Rival Co')).toHaveCount(0)
})

test('the admin sends strict security headers and a per-request CSP nonce', async ({ request }) => {
  const a = await request.get('/login')
  const b = await request.get('/login')
  const csp = a.headers()['content-security-policy']
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("object-src 'none'")
  expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/)
  expect(csp).not.toContain("'unsafe-eval'")
  expect(csp.match(/nonce-([^']+)/)![1]).not.toBe(b.headers()['content-security-policy'].match(/nonce-([^']+)/)![1])
  expect(a.headers()['x-frame-options']).toBe('DENY')
  expect(a.headers()['x-content-type-options']).toBe('nosniff')
  expect(a.headers()['cache-control']).toContain('no-store')
  expect(a.headers()['x-robots-tag']).toContain('noindex')
  expect(a.headers()['x-powered-by']).toBeUndefined()
})

test('session cookies are HttpOnly and SameSite; signing out kills the session server-side', async ({ browser }) => {
  const page = await as(browser, 'editor@bakery.test')
  const cookies = await page.context().cookies()
  const session = cookies.find((c) => c.name === 'cms_session')!
  expect(session.httpOnly).toBe(true)
  expect(session.sameSite).toBe('Lax')
  // Replay the cookie after sign-out: it must not work.
  const stolen = session.value
  await page.goto('/bakery')
  await page.getByRole('button', { name: /Editor Person/ }).click()
  await page.getByRole('menuitem', { name: /Sign out/ }).click()
  await page.waitForURL(/\/login/)
  const thief = await browser.newContext()
  await thief.addCookies([{ ...session, value: stolen }])
  const p = await thief.newPage()
  await p.goto('/bakery')
  await expect(p).toHaveURL(/\/login/)
})

test('the content API refuses missing, wrong and cross-site keys', async ({ request }) => {
  expect((await request.get('/api/v1/site')).status()).toBe(401)
  expect((await request.get('/api/v1/site', { headers: { authorization: 'Bearer cms_aaaaaaaaaa_' + 'b'.repeat(43) } })).status()).toBe(401)
  const ok = await request.get('/api/v1/posts', { headers: { authorization: `Bearer ${state.key}`, origin: 'https://evil.example' } })
  expect(ok.status()).toBe(200)
  expect(ok.headers()['access-control-allow-origin']).toBeUndefined()
  const body = await ok.json()
  expect(JSON.stringify(body)).not.toContain('Rival')
  expect(JSON.stringify(body)).not.toContain('Secret croissant')
})

test('a hostile HTML-page post cannot run script on the client site', async ({ browser }) => {
  const editor = await as(browser, 'editor@bakery.test')
  await editor.goto('/bakery/posts/new')
  await editor.getByRole('tab', { name: 'HTML page' }).click()
  const hostile = `<!DOCTYPE html><html><head><title>Hostile page</title><meta name="description" content="A page that tries every trick in the book."><script>alert('head')</script></head>
<body><h1>Hostile page</h1>
<img src="x" onerror="alert('img')">
<script>alert('body')</script>
<a id="js" href="javascript:alert('href')">click me</a>
<svg onload="alert('svg')"><circle r="4"/></svg>
<iframe src="javascript:alert('iframe')"></iframe>
<div style="background:url(javascript:alert('css'))">styled</div>
<p>Survivor text</p></body></html>`
  await editor.locator('textarea').last().fill(hostile)
  await editor.getByRole('button', { name: /^Publish$/ }).click()
  await expect(editor.getByText('Published').first()).toBeVisible()

  await startSite(state.key, state.secret)
  const visitor = await (await browser.newContext()).newPage()
  const dialogs: string[] = []
  visitor.on('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  const res = await visitor.goto(`${SITE}/blog/hostile-page`)
  expect(res!.status()).toBe(200)
  await expect(visitor.getByText('Survivor text')).toBeVisible()
  const html = await visitor.content()
  expect(html).not.toMatch(/onerror|onload=|javascript:alert/i)
  expect(html).not.toContain("alert('body')")
  if (await visitor.locator('#js').count()) await visitor.locator('#js').click()
  await visitor.waitForTimeout(500)
  expect(dialogs).toEqual([])
})

test('the client site sends its own security headers and refuses forged webhooks', async ({ request }) => {
  const res = await request.get(`${SITE}/`)
  expect(res.status()).toBe(200)
  expect(res.headers()['x-content-type-options']).toBe('nosniff')
  const forged = await request.post(`${SITE}/api/cms/revalidate`, {
    headers: { 'content-type': 'application/json', 'x-cms-signature': 't=1,v1=deadbeef' },
    data: { event: 'post.deleted', slugs: ['x'] },
  })
  expect(forged.status()).toBe(401)
  const crossSite = await request.post(`${SITE}/api/contact`, {
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    data: { name: 'x', email: 'x@example.com', message: 'spam' },
  })
  expect(crossSite.status()).toBe(403)
})

test('ten wrong passwords lock the account, even for the right password', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage()
  for (let i = 0; i < 10; i++) {
    await signIn(page, 'writer@bakery.test', `wrong-password-${i}`)
    await expect(page.getByText(/That did not work|Too many attempts/)).toBeVisible()
  }
  await signIn(page, 'writer@bakery.test', PASSWORD)
  await expect(page.getByText('Too many attempts. Wait 15 minutes and try again.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
