import { beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as site } from '@/app/api/v1/site/route'
import { GET as list } from '@/app/api/v1/posts/route'
import { GET as one } from '@/app/api/v1/posts/[slug]/route'
import { GET as tags } from '@/app/api/v1/tags/route'
import { GET as authors } from '@/app/api/v1/authors/route'
import { GET as sitemap } from '@/app/api/v1/sitemap/route'
import { GET as feed } from '@/app/api/v1/feed/route'
import { GET as preview } from '@/app/api/v1/preview/route'
import { POST as contact } from '@/app/api/v1/contact/route'
import { GET as logo } from '@/app/brand/[workspace]/logo/route'
import { savePost, previewLink } from '@/lib/actions/posts'
import { saveAuthor } from '@/lib/actions/content'
import { revokeKey } from '@/lib/actions/workspace'
import { inWorkspace, sys } from '@/lib/db'
import { listMessages } from '@/lib/content/contact'
import { createPreviewToken } from '@/lib/integrations/preview'
import { setLogo } from '@/lib/workspaces'
import { makeWorkspace, member, post, signInAs, siteKeyFor } from './fixtures'

let A: Awaited<ReturnType<typeof makeWorkspace>>
let B: Awaited<ReturnType<typeof makeWorkspace>>
let keyA: string
let keyB: string
let draftId: string

const req = (path: string, key?: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`https://cms.test/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(init.headers ?? {}) },
    body: init.body,
  })
const params = <T,>(p: T) => ({ params: Promise.resolve(p) })

beforeAll(async () => {
  A = await makeWorkspace('api-a', { contact: { enabled: true, notifyEmails: [], confirmation: false, confirmationSubject: 'Thanks', topics: ['Hello'] } })
  B = await makeWorkspace('api-b')
  keyA = await siteKeyFor(A.id)
  keyB = await siteKeyFor(B.id)
  const ed = await member(A.id, 'editor')
  await signInAs(ed)
  const author = (await saveAuthor('api-a', { name: 'Priya Sharma', slug: '', role: 'Writer', bio: 'Bio', avatar: null, avatarAlt: '', linkedinUrl: '', xUrl: '', websiteUrl: '' })) as { id: string }
  for (let i = 1; i <= 5; i++) {
    await savePost('api-a', post({ title: `Live ${i}`, tags: i % 2 ? ['Odd'] : ['Even'], authorId: author.id, focusKeyword: 'secret keyword', intent: 'publish' }))
  }
  draftId = ((await savePost('api-a', post({ title: 'Hidden draft' }))) as { id: string }).id
  await savePost('api-a', post({ title: 'Hidden scheduled', intent: 'schedule', publishAt: new Date(Date.now() + 86_400_000).toISOString() }))
  const edB = await member(B.id, 'editor')
  await signInAs(edB)
  await savePost('api-b', post({ title: 'B only', intent: 'publish' }))
})

describe('authentication', () => {
  it('refuses no key, a malformed key, a made-up key and another format alike', async () => {
    for (const key of [undefined, 'nope', 'cms_aaaaaaaaaa_' + 'x'.repeat(43), keyA.slice(0, -1) + (keyA.endsWith('a') ? 'b' : 'a')]) {
      const res = await site(req('/site', key))
      expect(res.status).toBe(401)
    }
  })

  it('a revoked key stops working at once', async () => {
    const k = await siteKeyFor(A.id)
    expect((await site(req('/site', k))).status).toBe(200)
    const row = (await (await sys()).siteKeys.findActiveByPrefix(k.split('_')[1]))!.key
    const owner = await member(A.id, 'owner')
    await signInAs(owner)
    expect((await revokeKey('api-a', row.id)).ok).toBe(true)
    expect((await site(req('/site', k))).status).toBe(401)
  })

  it('sends no CORS headers and is never publicly cacheable', async () => {
    const res = await site(req('/site', keyA, { headers: { origin: 'https://evil.example' } }))
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})

describe('reads are scoped to the key’s workspace', () => {
  it('lists only live posts of that workspace, paginated', async () => {
    const res = await list(req('/posts?perPage=2&page=2', keyA))
    const body = await res.json()
    expect(body.total).toBe(5)
    expect(body.totalPages).toBe(3)
    expect(body.items).toHaveLength(2)
    const all = await (await list(req('/posts?perPage=50', keyA))).json()
    const titles = all.items.map((p: { title: string }) => p.title)
    expect(titles).not.toContain('Hidden draft')
    expect(titles).not.toContain('Hidden scheduled')
    expect(titles).not.toContain('B only')
  })

  it("B's key sees only B", async () => {
    const all = await (await list(req('/posts?perPage=50', keyB))).json()
    expect(all.items.map((p: { title: string }) => p.title)).toEqual(['B only'])
    expect((await one(req('/posts/live-1', keyB), params({ slug: 'live-1' }))).status).toBe(404)
  })

  it('a draft or scheduled slug is a 404', async () => {
    expect((await one(req('/posts/hidden-draft', keyA), params({ slug: 'hidden-draft' }))).status).toBe(404)
    expect((await one(req('/posts/hidden-scheduled', keyA), params({ slug: 'hidden-scheduled' }))).status).toBe(404)
  })

  it('never leaks admin-only fields', async () => {
    const body = await (await one(req('/posts/live-1', keyA), params({ slug: 'live-1' }))).json()
    const text = JSON.stringify(body)
    expect(text).not.toContain('secret keyword')
    expect(body).not.toHaveProperty('focusKeyword')
    expect(body).not.toHaveProperty('createdBy')
    expect(body).not.toHaveProperty('workspaceId')
    expect(body.author.name).toBe('Priya Sharma')
    expect(body.author.postCount).toBe(5)
    expect(body.body.kind).toBe('editor')
  })

  it('filters by tag and author, and validates numbers', async () => {
    const odd = await (await list(req('/posts?tag=odd&perPage=50', keyA))).json()
    expect(odd.total).toBe(3)
    const byAuthor = await (await list(req('/posts?author=priya-sharma', keyA))).json()
    expect(byAuthor.total).toBe(5)
    expect((await list(req('/posts?page=-1', keyA))).status).toBe(400)
    expect((await list(req('/posts?perPage=100000', keyA))).status).toBe(400)
    expect((await list(req("/posts?tag=' OR 1=1 --", keyA))).status).toBe(200)
  })

  it('tags, authors, sitemap and feed only cover live content', async () => {
    const t = await (await tags(req('/tags', keyA))).json()
    expect(t.items.map((x: { slug: string }) => x.slug).sort()).toEqual(['even', 'odd'])
    const a = await (await authors(req('/authors', keyA))).json()
    expect(a.items).toHaveLength(1)
    const s = await (await sitemap(req('/sitemap', keyA))).json()
    expect(s.posts).toHaveLength(5)
    const f = await (await feed(req('/feed', keyA))).json()
    expect(f.items.map((i: { title: string }) => i.title)).not.toContain('Hidden draft')
  })
})

describe('preview tokens', () => {
  it('shows a draft with a fresh token for the same workspace only', async () => {
    const token = await createPreviewToken(A.id, draftId)
    expect((await preview(req(`/preview?token=${token}`, keyA))).status).toBe(200)
    expect((await preview(req(`/preview?token=${token}`, keyB))).status).toBe(404)
    expect((await preview(req('/preview?token=forged.token.here', keyA))).status).toBe(404)
    expect((await preview(req(`/preview?token=${token}`))).status).toBe(401)
  })

  it('a token for another workspace’s post id is useless', async () => {
    const token = await createPreviewToken(B.id, draftId)
    expect((await preview(req(`/preview?token=${token}`, keyB))).status).toBe(404)
  })

  it('previewLink is built on the workspace’s own site address', async () => {
    const ed = await member(A.id, 'editor')
    await signInAs(ed)
    const r = (await previewLink('api-a', draftId)) as { ok: true; url: string }
    expect(r.url.startsWith('https://api-a.example/preview?token=')).toBe(true)
  })
})

describe('contact', () => {
  const send = (body: unknown, ip = '192.0.2.1', key = keyA) =>
    contact(req('/contact', key, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-cms-visitor-ip': ip } }))
  const ok = { name: 'Ana', email: 'ana@example.com', message: 'Hi', topic: 'Hello' }

  it('stores a valid message in that workspace only', async () => {
    expect((await send(ok)).status).toBe(201)
    const inA = await inWorkspace(A.id, (tx) => listMessages(tx, A.id))
    expect(inA.some((m) => m.email === 'ana@example.com')).toBe(true)
    const inB = await inWorkspace(B.id, (tx) => listMessages(tx, B.id))
    expect(inB).toHaveLength(0)
  })

  it('refuses header injection, bad emails, unknown topics and junk', async () => {
    expect((await send({ ...ok, name: 'Ana <victim@example.com>, x' }, '192.0.2.2')).status).toBe(400)
    expect((await send({ ...ok, email: 'a@example.com, b@example.com' }, '192.0.2.3')).status).toBe(400)
    expect((await send({ ...ok, email: 'a@example.com\r\nBcc: b@example.com' }, '192.0.2.4')).status).toBe(400)
    expect((await send({ ...ok, topic: 'Not a topic' }, '192.0.2.5')).status).toBe(400)
    expect((await send('not json', '192.0.2.6')).status).toBe(400)
    expect((await send('[1,2]', '192.0.2.7')).status).toBe(400)
    expect((await send({ ...ok, message: 'x'.repeat(40_000) }, '192.0.2.8')).status).toBe(413)
  })

  it('limits each visitor to 5 per 10 minutes', async () => {
    for (let i = 0; i < 5; i++) expect((await send(ok, '198.51.100.77')).status).toBe(201)
    expect((await send(ok, '198.51.100.77')).status).toBe(429)
    expect((await send(ok, '198.51.100.78')).status).toBe(201)
  })

  it('caps a whole workspace at 60 per 10 minutes', async () => {
    const W = await makeWorkspace('api-flood')
    const k = await siteKeyFor(W.id)
    let last = 0
    for (let i = 0; i < 61; i++) last = (await send({ name: 'n', email: 'n@example.com', message: 'm' }, `203.0.113.${i}`, k)).status
    expect(last).toBe(429)
  })

  it('stores the visitor IP only as a hash', async () => {
    const rows = await inWorkspace(A.id, (scope) => scope.contact.all())
    expect(rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(rows)).not.toContain('192.0.2.1')
  })
})

describe('logos', () => {
  it('serves SVG with a sandboxing CSP and refuses odd slugs', async () => {
    await setLogo(A.id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml')
    const res = await logo(new Request('https://cms.test/brand/api-a/logo'), params({ workspace: 'api-a' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await logo(new Request('https://cms.test/brand/x/logo'), params({ workspace: '../etc' }))).status).toBe(404)
  })
})
