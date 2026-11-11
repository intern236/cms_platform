import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifySignature } from '@cms/site-kit/next'
import { isPublicAddress, checkOutboundUrl } from '@/lib/integrations/net'
import { deliver, signPayload } from '@/lib/integrations/webhooks'
import { readSettings, accentForeground, workspaceSlugProblem } from '@/lib/workspaces/settings'
import { sniffLogo, normaliseSiteUrl, updateIntegration } from '@/lib/workspaces'
import { csvCell, validateSubmission } from '@/lib/content/contact'
import { slugify } from '@/lib/slug'
import { ipFromHeaders } from '@/lib/security'
import { esc, inviteEmail, notificationEmail, confirmationEmail } from '@/lib/mail/templates'
import { CONTENT_TABLES } from '@/lib/db/types'
import { COLLECTIONS } from '@/lib/db/mongo/schema.mjs'
import { makeWorkspace } from './fixtures'

describe('SSRF guard', () => {
  it('classifies private, loopback, link-local and metadata addresses', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '224.0.0.1']) {
      expect(isPublicAddress(a), a).toBe(false)
    }
    for (const a of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) expect(isPublicAddress(a), a).toBe(true)
  })

  it('in production refuses http, private hosts and credentials in URLs', async () => {
    const env = process.env as Record<string, string | undefined>
    const saved = env.NODE_ENV
    env.NODE_ENV = 'production'
    try {
      expect((await checkOutboundUrl('http://example.com/hook')).ok).toBe(false)
      expect((await checkOutboundUrl('https://127.0.0.1/hook')).ok).toBe(false)
      expect((await checkOutboundUrl('https://169.254.169.254/latest/meta-data')).ok).toBe(false)
      expect((await checkOutboundUrl('https://[::1]/hook')).ok).toBe(false)
      expect((await checkOutboundUrl('https://user:pass@example.com/')).ok).toBe(false)
      expect((await checkOutboundUrl('https://localhost/hook')).ok).toBe(false)
      expect((await checkOutboundUrl('file:///etc/passwd')).ok).toBe(false)
    } finally {
      env.NODE_ENV = saved
    }
  })
})

describe('webhooks', () => {
  let server: ReturnType<typeof createServer>
  let port = 0
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = []
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        received.push({ headers: req.headers, body })
        if (req.url === '/redirect') {
          res.writeHead(302, { location: 'http://169.254.169.254/' })
          return res.end()
        }
        res.writeHead(200).end('ok')
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    port = (server.address() as { port: number }).port
  })
  afterAll(() => server.close())

  it('signs the body; the site kit accepts it and rejects tampering and replays', async () => {
    const ws = await makeWorkspace('hook-ws')
    await updateIntegration(ws.id, { siteUrl: '', webhookUrl: `http://127.0.0.1:${port}/hook` })
    const out = await deliver(ws.id, 'post.published', { slugs: ['a'] })
    expect(out.ok).toBe(true)
    const got = received.at(-1)!
    const sig = String(got.headers['x-cms-signature'])
    const { getWebhookConfig } = await import('@/lib/workspaces')
    const secret = (await getWebhookConfig(ws.id))!.secret
    expect(verifySignature(secret, sig, got.body)).toBe(true)
    expect(verifySignature(secret, sig, got.body.replace('post.published', 'post.deleted'))).toBe(false)
    expect(verifySignature('wrong-secret', sig, got.body)).toBe(false)
    const old = signPayload(secret, got.body, Math.floor(Date.now() / 1000) - 3600)
    expect(verifySignature(secret, old, got.body)).toBe(false)
    expect(verifySignature(secret, null, got.body)).toBe(false)
  })

  it('does not follow redirects', async () => {
    const ws = await makeWorkspace('hook-redirect')
    await updateIntegration(ws.id, { siteUrl: '', webhookUrl: `http://127.0.0.1:${port}/redirect` })
    const out = await deliver(ws.id, 'ping')
    expect(out.ok).toBe(false)
    expect(out.status).toBe(302)
  })
})

describe('settings never crash a workspace', () => {
  it('falls back field by field', () => {
    const s = readSettings({ blog: { postsPerPage: 'lots', title: 7 }, social: [{ platform: 'myspace', url: 'x' }], dateLocale: 'xx-NOPE-zz-123', cta: 'nope' })
    expect(s.blog.postsPerPage).toBe(12)
    expect(s.social).toEqual([])
    expect(s.cta.enabled).toBe(false)
    expect(readSettings(null).blog.basePath).toBe('/blog')
  })

  it('validates workspace addresses', () => {
    expect(workspaceSlugProblem('acme')).toBeNull()
    for (const bad of ['a', 'Acme', 'login', 'agency', '-acme', 'acme_co', 'api', 'a'.repeat(60)]) expect(workspaceSlugProblem(bad), bad).not.toBeNull()
  })

  it('normalises site URLs and refuses odd ones', () => {
    expect(normaliseSiteUrl('https://acme.com/')).toBe('https://acme.com')
    expect(normaliseSiteUrl('javascript:alert(1)')).toBeNull()
    expect(normaliseSiteUrl('https://u:p@acme.com')).toBeNull()
  })

  it('picks readable text for any brand colour', () => {
    expect(accentForeground('#ffff00')).toBe('#0a0a0a')
    expect(accentForeground('#1a1a6e')).toBe('#ffffff')
  })
})

describe('logo uploads are sniffed, not trusted', () => {
  it('accepts real images and refuses renamed junk', () => {
    expect(sniffLogo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(sniffLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml')
    expect(sniffLogo(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull()
    expect(sniffLogo(Buffer.from('GIF89a'))).toBeNull()
  })
})

describe('contact validation and CSV', () => {
  it('guards spreadsheet formulas', () => {
    for (const v of ['=1+1', '+1', '-1', '@SUM(A1)', ' =1', '\t=1', '\r=1']) expect(csvCell(v).startsWith(`"'`), v).toBe(true)
    expect(csvCell('hello "world"')).toBe('"hello ""world"""')
  })

  it('refuses names with brackets or control characters', () => {
    const r = validateSubmission({ name: 'Bob\r\nBcc: x', email: 'a@b.co', message: 'hi' }, [])
    expect(r.ok).toBe(false)
  })
})

describe('emails escape everything people typed', () => {
  const brand = { name: 'Acme <b>', accent: '#ff0000"><script>', accentForeground: '#fff', logoUrl: 'javascript:alert(1)' }
  it('notification', () => {
    const e = notificationEmail({
      brand,
      submission: { id: '1', name: '<img src=x onerror=alert(1)>', email: 'a@b.co', company: '', phone: '', topic: '', message: '<script>alert(1)</script>', receivedAt: new Date() },
      inboxUrl: 'https://cms.test/a/inbox/1',
    })
    expect(e.html).not.toContain('<script>')
    expect(e.html).not.toContain('<img src=x')
    expect(e.html).not.toContain('javascript:')
  })
  it('invite and confirmation', () => {
    expect(inviteEmail({ brand, inviterName: '<b>x</b>', workspaceName: 'W', roleLabel: 'editor', url: 'javascript:alert(1)', expiresInDays: 7 }).html).not.toMatch(/href="javascript:/)
    expect(confirmationEmail({ brand, subject: 's', siteUrl: 'https://x.example' }).html).not.toContain('<script>')
    expect(esc(`<>"'&`)).toBe('&lt;&gt;&quot;&#39;&amp;')
  })
})

describe('small helpers', () => {
  it('slugify folds accents and strips everything else', () => {
    expect(slugify('Café au lait')).toBe('cafe-au-lait')
    expect(slugify('Straße & Co.')).toBe('strasse-co')
    expect(slugify('../../etc/passwd')).toBe('etc-passwd')
  })

  it('trusts only the right-most X-Forwarded-For hop', () => {
    expect(ipFromHeaders(new Headers({ 'x-forwarded-for': 'spoofed, 10.0.0.1, 203.0.113.7' }))).toBe('203.0.113.7')
    process.env.TRUSTED_PROXY_COUNT = '2'
    expect(ipFromHeaders(new Headers({ 'x-forwarded-for': 'spoofed, 10.0.0.1, 203.0.113.7' }))).toBe('10.0.0.1')
    delete process.env.TRUSTED_PROXY_COUNT
  })

  it('every client-content collection requires a valid workspaceId (MongoDB)', () => {
    for (const t of CONTENT_TABLES) {
      const schema = COLLECTIONS[t]?.validator.$jsonSchema as { required: string[]; properties: Record<string, { pattern?: string }> }
      expect(schema, t).toBeTruthy()
      expect(schema.required, t).toContain('workspaceId')
      expect(schema.properties.workspaceId.pattern, t).toBe('^[a-f0-9]{24}$')
    }
  })
})
