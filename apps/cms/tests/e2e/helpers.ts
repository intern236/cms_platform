import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { openSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, type Browser, type Page } from '@playwright/test'

export const AGENCY = { name: 'Agnes Agency', email: 'agnes@agency.test', password: 'agency-pass-phrase-01' }
export const PASSWORD = 'member-pass-phrase-01'

export async function signIn(page: Page, email: string, password: string, path = '/login') {
  await page.goto(path)
  await page.locator('input[name=email]').fill(email)
  await page.locator('input[name=password]').fill(password)
  await page.locator('button[type=submit]').click()
}

/** Newest email in the agency outbox to an address, as text. */
export async function readOutbox(page: Page, to: string): Promise<{ subject: string; html: string }> {
  await page.goto('/agency/outbox')
  const item = page.locator('ul li button', { hasText: '' }).filter({ hasText: to }).first()
  await expect(item).toBeVisible()
  await item.click()
  const subject = (await item.locator('span').first().textContent()) ?? ''
  const html = (await page.locator('iframe').getAttribute('srcdoc')) ?? ''
  return { subject, html }
}

export function linkIn(html: string, kind: 'invite' | 'reset'): string {
  const m = html.match(new RegExp(`http://localhost:3300/${kind}/[A-Za-z0-9_-]+`))
  if (!m) throw new Error(`no ${kind} link in email`)
  return m[0]
}

/** Accepts an invite in a fresh browser context and returns a page signed in as the new user. */
export async function acceptInvite(browser: Browser, url: string, name: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url)
  await page.locator('input[name=name]').fill(name)
  await page.locator('input[name=password]').fill(PASSWORD)
  await page.locator('button[type=submit]').click()
  return page
}

let site: ChildProcess | null = null

/** Starts the built example site on :3400 pointed at the test CMS. */
export async function startSite(key: string, secret: string) {
  if (site) return
  // A site left over from an earlier run would answer with the wrong key and secret.
  if (await fetch('http://localhost:3400/robots.txt').then(() => true, () => false)) throw new Error('something is already listening on :3400')
  const cwd = path.resolve(__dirname, '../../../../examples/acme-site')
  // Pages and fetches cached by an earlier run belong to another (throwaway) database.
  for (const dir of ['.next/server/route-cache', '.next/cache/fetch-cache']) rmSync(path.join(cwd, dir), { recursive: true, force: true })
  site = spawn('npx', ['next', 'start', '--port', '3400'], {
    cwd,
    // Its own process group (POSIX), so stopSite() takes next-server down with npx.
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    env: { ...process.env, NODE_ENV: 'production', CMS_URL: 'http://localhost:3300', CMS_SITE_KEY: key, CMS_WEBHOOK_SECRET: secret, SITE_URL: 'http://localhost:3400' },
    // The site's own log, for debugging a failed run.
    stdio: ['ignore', openSync(path.join(tmpdir(), 'cms-e2e-site.log'), 'a'), openSync(path.join(tmpdir(), 'cms-e2e-site.log'), 'a')],
  })
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://localhost:3400/robots.txt')
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('example site did not start')
}

export function stopSite() {
  if (site?.pid) {
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(site.pid), '/T', '/F'])
      else process.kill(-site.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  site = null
}
