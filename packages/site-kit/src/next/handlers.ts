import { createHmac, timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { CACHE_TAG } from '../client'
import type { Cms } from '../theme'

/**
 * Ready-made route handlers. Each client site re-exports them:
 *
 *   // app/api/cms/revalidate/route.ts
 *   export const POST = revalidateHandler({ secret: process.env.CMS_WEBHOOK_SECRET })
 */

/** Verifies `x-cms-signature: t=…,v1=…` — HMAC-SHA256 over `${t}.${body}`, at most five minutes old. */
export function verifySignature(secret: string, header: string | null, body: string, now = Date.now()): boolean {
  if (!secret || !header) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300 || !parts.v1) return false
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(parts.v1)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** POST /api/cms/revalidate — the CMS calls this when content changes. */
export function revalidateHandler({ secret }: { secret: string | undefined }) {
  return async function POST(req: Request) {
    const body = await req.text()
    if (body.length > 16_384 || !verifySignature(secret ?? '', req.headers.get('x-cms-signature'), body)) {
      return Response.json({ ok: false }, { status: 401 })
    }
    revalidateTag(CACHE_TAG, { expire: 0 })
    return Response.json({ ok: true, revalidated: true })
  }
}

function visitorIp(h: Headers): string {
  const hops = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const trusted = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? '1', 10) || 1)
  return hops.length >= trusted ? hops[hops.length - trusted] : (hops[0] ?? h.get('x-real-ip') ?? 'unknown')
}

/**
 * POST /api/contact — the browser posts the contact form here; this forwards it
 * to the CMS with the site key, which never leaves the server.
 *
 * - Bodies over 32 KB are refused before parsing.
 * - Cross-site posts (Origin from another host) are refused.
 * - A filled honeypot gets a fake success, so bots learn nothing.
 */
export function contactHandler(cms: Cms) {
  return async function POST(req: Request) {
    const origin = req.headers.get('origin')
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    if (origin && host && new URL(origin).host !== host) return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    const raw = await readLimited(req, 32 * 1024)
    if (raw === null) return Response.json({ ok: false, error: 'Message too large.' }, { status: 413 })
    let data: Record<string, unknown>
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      data = parsed
    } catch {
      return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
    }
    if (typeof data.botField === 'string' && data.botField.trim()) return Response.json({ ok: true }, { status: 201 })
    const fields = ['name', 'email', 'phone', 'company', 'topic', 'message', 'source']
    const body = Object.fromEntries(fields.map((f) => [f, typeof data[f] === 'string' ? data[f] : '']))
    try {
      const { status, result } = await cms.api.contact(body, { ip: visitorIp(req.headers), userAgent: req.headers.get('user-agent') ?? '' })
      return Response.json(result, { status })
    } catch {
      return Response.json({ ok: false, error: 'We could not send that right now. Please try again shortly.' }, { status: 502 })
    }
  }
}

async function readLimited(req: Request, max: number): Promise<string | null> {
  const reader = req.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** GET /feed.xml — RSS 2.0 of the 30 newest posts. */
export function feedHandler(cms: Cms) {
  return async function GET() {
    const site = await cms.site()
    const { items } = await cms.api.feed()
    const link = (slug: string) => `${site.url}${site.blog.basePath}/${slug}`
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xml(`${site.name} — ${site.blog.title}`)}</title>
<link>${xml(site.url + site.blog.basePath)}</link>
<description>${xml(site.blog.description || site.description)}</description>
<language>${xml(site.language)}</language>
<atom:link href="${xml(`${site.url}/feed.xml`)}" rel="self" type="application/rss+xml"/>
${items
  .map(
    (p) => `<item>
<title>${xml(p.title)}</title>
<link>${xml(link(p.slug))}</link>
<guid isPermaLink="true">${xml(link(p.slug))}</guid>
<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
<description>${xml(p.description)}</description>${p.category ? `\n<category>${xml(p.category)}</category>` : ''}${p.author ? `\n<author>${xml(p.author)}</author>` : ''}
</item>`
  )
  .join('\n')}
</channel>
</rss>`
    return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
  }
}

/** Entries for app/sitemap.ts: your own pages plus every post, tag and author. */
export async function sitemapEntries(cms: Cms, staticPaths: string[] = ['/']) {
  const site = await cms.site()
  const map = await cms.api.sitemap()
  const abs = (p: string) => `${site.url}${p}`
  const newest = map.posts[0]?.updatedAt ? new Date(map.posts[0].updatedAt) : undefined
  return [
    ...staticPaths.map((p) => ({ url: abs(p), lastModified: newest })),
    { url: abs(site.blog.basePath), lastModified: newest },
    ...map.posts.map((p) => ({ url: abs(`${site.blog.basePath}/${p.slug}`), lastModified: new Date(p.updatedAt) })),
    ...map.tags.map((t) => ({ url: abs(`${site.blog.basePath}/tag/${t}`) })),
    ...(site.blog.authors ? [{ url: abs('/authors') }, ...map.authors.map((a) => ({ url: abs(`/authors/${a}`) }))] : []),
  ]
}
