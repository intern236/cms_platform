import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { AGENCY, acceptInvite, startSite, stopSite } from './helpers'

/**
 * The whole product, the way it is used: the agency sets up, adds a client, the
 * client's owner invites a team, a writer drafts, an editor publishes, the
 * client's website shows it — and changes reach the site within seconds.
 */
test.describe.configure({ mode: 'serial' })

const state: Record<string, string> = {}
const STATE_FILE = path.join(tmpdir(), 'cms-e2e-state.json')
const SITE = 'http://localhost:3400'

let agency: Page
let owner: Page
let editor: Page
let writer: Page

test.afterAll(() => {
  writeFileSync(STATE_FILE, JSON.stringify(state))
  stopSite()
})

async function writePost(page: Page, title: string, body: string, description = `${title} — a short summary for search results.`) {
  await page.goto('/bakery/posts/new')
  await page.locator('.tiptap-editing').waitFor()
  await page.getByLabel('Title').fill(title)
  await page.locator('.tiptap-editing').click()
  await page.keyboard.type(body)
  await page.getByRole('tab', { name: 'SEO' }).click()
  await page.getByLabel('Meta description').fill(description)
}

test('first run: the setup token is required in production', async ({ browser }) => {
  agency = await (await browser.newContext()).newPage()
  await agency.goto('/')
  await expect(agency).toHaveURL(/\/setup$/)
  await agency.locator('input[name=token]').fill('wrong-token')
  await agency.locator('input[name=name]').fill(AGENCY.name)
  await agency.locator('input[name=email]').fill(AGENCY.email)
  await agency.locator('input[name=password]').fill(AGENCY.password)
  await agency.locator('button[type=submit]').click()
  await expect(agency.getByText('That setup token is not right.')).toBeVisible()
  await agency.locator('input[name=token]').fill('e2e-setup-token')
  await agency.locator('button[type=submit]').click()
  await agency.waitForURL('**/agency?welcome=1')
  await expect(agency.getByRole('heading', { name: /You are set up/ })).toBeVisible()
  // Once set up, /setup is gone for good.
  await agency.goto('/setup')
  await expect(agency).toHaveURL(/\/login|\/agency/)
})

test('the agency adds a client and invites its owner', async ({ browser }) => {
  await agency.goto('/agency/new')
  await agency.getByLabel('Client name').fill('Northwind Bakery')
  await agency.getByLabel('Workspace address').fill('bakery')
  await agency.getByLabel('Their website').fill(SITE)
  await agency.getByLabel('Invite their owner').fill('owner@bakery.test')
  await agency.getByRole('button', { name: /Create workspace/ }).click()
  const link = (await agency.locator('code').first().textContent())!
  expect(link).toMatch(/\/invite\//)
  state.ownerInvite = link

  owner = await acceptInvite(browser, link, 'Olivia Owner')
  await owner.waitForURL('**/bakery')
  await expect(owner.getByRole('heading', { level: 1 })).toContainText('Olivia')
  // The invite cannot be used twice.
  const again = await (await browser.newContext()).newPage()
  await again.goto(link)
  await expect(again.getByRole('heading', { name: /expired/ })).toBeVisible()
})

test('the owner invites an editor and a writer', async ({ browser }) => {
  for (const [email, role] of [
    ['editor@bakery.test', 'Editor'],
    ['writer@bakery.test', 'Writer'],
  ] as const) {
    await owner.goto('/bakery/settings?tab=people')
    await owner.getByLabel('Email').fill(email)
    await owner.getByRole('radio', { name: new RegExp(role) }).click()
    await owner.getByRole('button', { name: 'Send invite' }).click()
    const url = (await owner.locator('code').first().textContent())!
    const page = await acceptInvite(browser, url, `${role} Person`)
    await page.waitForURL('**/bakery')
    if (role === 'Editor') editor = page
    else writer = page
  }
  await owner.goto('/bakery/settings?tab=people')
  await expect(owner.getByText('editor@bakery.test')).toBeVisible()
  await expect(owner.getByText('writer@bakery.test')).toBeVisible()
})

test('a writer drafts and sends for review, and cannot reach the inbox or settings', async () => {
  const nav = writer.locator('nav[aria-label=Main]')
  await expect(nav.getByText('Inbox')).toHaveCount(0)
  await expect(nav.getByText('Settings')).toHaveCount(0)
  await writer.goto('/bakery/settings')
  await expect(writer).toHaveURL(/\/bakery\?denied=1/)
  await writer.goto('/bakery/inbox')
  await expect(writer).toHaveURL(/\/bakery\?denied=1/)

  await writePost(writer, 'Sourdough for beginners', 'Start with a lively starter and a patient afternoon.')
  await writer.getByRole('button', { name: 'Send for review' }).click()
  await writer.waitForURL(/\/bakery\/posts\/[0-9a-f]{24}$/)
  await expect(writer.locator('header, div').getByText('In review').first()).toBeVisible()
  state.reviewUrl = writer.url()
})

test('an editor publishes it', async () => {
  await editor.goto('/bakery/posts?status=review')
  await editor.getByText('Sourdough for beginners').click()
  await editor.getByRole('button', { name: /^Publish$/ }).click()
  await expect(editor.getByText('Published').first()).toBeVisible()
})

test('the site gets a key and a webhook, then shows the post', async () => {
  await agency.goto('/bakery/settings?tab=website')
  await agency.getByLabel('Revalidate webhook').fill(`${SITE}/api/cms/revalidate`)
  await agency.getByRole('button', { name: 'Save connection' }).click()
  await expect(agency.getByText('Connection saved')).toBeVisible()

  await owner.goto('/bakery/settings?tab=website')
  await owner.getByPlaceholder(/Label/).fill('E2E site')
  await owner.getByRole('button', { name: 'New key' }).click()
  const key = (await owner.getByRole('dialog').locator('code').textContent())!
  expect(key).toMatch(/^cms_[a-z0-9]{10}_/)
  await owner.getByRole('button', { name: 'I have copied it' }).click()
  await owner.getByRole('button', { name: 'Reveal webhook secret' }).click()
  await expect(owner.locator('pre')).not.toContainText('•')
  const pre = (await owner.locator('pre').textContent())!
  const secret = pre.match(/CMS_WEBHOOK_SECRET=(\S+)/)![1]
  expect(secret).not.toContain('•')
  state.key = key
  state.secret = secret

  await startSite(key, secret)
  const res = await owner.request.get(`${SITE}/blog/sourdough-for-beginners`)
  expect(res.status()).toBe(200)
  expect(await res.text()).toContain('Sourdough for beginners')
})

test('an edit reaches the site within seconds (webhook), not a minute', async ({ browser }) => {
  const reader = await (await browser.newContext()).newPage()
  await reader.goto(`${SITE}/blog/sourdough-for-beginners`)
  await expect(reader.locator('h1')).toContainText('Sourdough for beginners')

  await editor.goto(state.reviewUrl)
  await editor.getByLabel('Title').fill('Sourdough for absolute beginners')
  await editor.getByRole('button', { name: /^Update$/ }).click()
  await expect(editor.getByText('Saved').first()).toBeVisible()

  await expect(async () => {
    await reader.reload()
    await expect(reader.locator('h1')).toContainText('absolute beginners', { timeout: 1000 })
  }).toPass({ timeout: 15_000 })

  await owner.goto('/bakery/settings?tab=website')
  await expect(owner.getByText('post.updated').first()).toBeVisible()
})

test('a visitor uses the contact form; it lands in the client inbox only', async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(`${SITE}/contact`)
  await visitor.fill('#name', 'Rahul Visitor')
  await visitor.fill('#email', 'rahul@example.com')
  await visitor.fill('#message', 'Can you build us a site?')
  await visitor.getByRole('button', { name: /Send message/ }).click()
  await expect(visitor.getByText('Message sent.')).toBeVisible()

  await owner.goto('/bakery/inbox')
  await owner.getByText('Rahul Visitor').click()
  await expect(owner.getByRole('article').getByText('Can you build us a site?')).toBeVisible()
  const csv = await owner.request.get('/bakery/inbox/export')
  expect(csv.status()).toBe(200)
  expect(await csv.text()).toContain('rahul@example.com')
})

test('preview opens the draft on the client site, and the public URL stays 404', async () => {
  await writePost(editor, 'Secret croissant plan', 'Not for the public yet.')
  await editor.getByRole('button', { name: 'More publish options' }).click()
  await editor.getByRole('menuitem', { name: 'Save draft' }).click()
  await editor.waitForURL(/\/bakery\/posts\/[0-9a-f]{24}$/)
  const [popup] = await Promise.all([editor.waitForEvent('popup'), editor.getByRole('button', { name: 'Preview' }).click()])
  await popup.waitForLoadState()
  await expect(popup.locator('h1')).toContainText('Secret croissant plan')
  await expect(popup.getByText('Preview — not published yet')).toBeVisible()
  expect((await editor.request.get(`${SITE}/blog/secret-croissant-plan`)).status()).toBe(404)
  // A tampered token is refused.
  const bad = new URL(popup.url())
  bad.searchParams.set('token', bad.searchParams.get('token')!.slice(0, -3) + 'abc')
  expect((await editor.request.get(bad.toString())).status()).toBe(404)
})

test('the agency switches between clients and sees them all', async () => {
  await agency.goto('/agency')
  await expect(agency.getByText('Northwind Bakery')).toBeVisible()
  await agency.keyboard.press('Control+k')
  await expect(agency.getByPlaceholder(/Search/)).toBeVisible()
  await agency.keyboard.type('Northwind')
  await agency.keyboard.press('Enter')
  await agency.waitForURL('**/bakery')
})
