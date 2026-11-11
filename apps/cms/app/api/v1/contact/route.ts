import type { NextRequest } from 'next/server'
import { runAfter } from '@/lib/after'
import { json, withSite } from '@/lib/api/handler'
import { contactAllowed, storeSubmission, validateSubmission } from '@/lib/content/contact'
import { cmsUrl } from '@/lib/env'
import { sendMail, workspaceBrand } from '@/lib/mail'
import { confirmationEmail, notificationEmail } from '@/lib/mail/templates'
import { ipKey } from '@/lib/security'

export const dynamic = 'force-dynamic'

const MAX_BODY = 32 * 1024

/** Reads at most MAX_BODY bytes, without trusting Content-Length. */
async function readLimited(req: NextRequest): Promise<string | null> {
  const reader = req.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * A contact-form submission, sent SERVER-TO-SERVER by the client's website.
 *
 * The site forwards its visitor's IP in `x-cms-visitor-ip`. That header is only
 * believed because the request carries the site's secret key — a browser cannot
 * call this route directly. Limits: 5 per visitor and 60 per site, per 10 minutes.
 */
export async function POST(req: NextRequest) {
  return withSite(req, async ({ ws, tx }) => {
    if (!ws.settings.contact.enabled) return json({ ok: false, error: 'The contact form is switched off.' }, 403)
    const raw = await readLimited(req)
    if (raw === null) return json({ ok: false, error: 'Message too large.' }, 413)
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      return json({ ok: false, error: 'Invalid request.' }, 400)
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ ok: false, error: 'Invalid request.' }, 400)

    const visitorIp = (req.headers.get('x-cms-visitor-ip') ?? '').slice(0, 64) || 'unknown'
    if (!(await contactAllowed(tx, ws.id, ipKey(`${ws.id}:${visitorIp}`)))) {
      return json({ ok: false, error: 'Too many messages. Try again in a few minutes.' }, 429)
    }
    const result = validateSubmission(payload as Record<string, unknown>, ws.settings.contact.topics)
    if (!result.ok) return json({ ok: false, errors: result.errors }, 400)

    const source = typeof (payload as Record<string, unknown>).source === 'string' ? String((payload as Record<string, unknown>).source) : null
    const message = await storeSubmission(tx, ws.id, result.values, {
      userAgent: req.headers.get('x-cms-visitor-ua'),
      source,
    })

    const brand = workspaceBrand(ws)
    const settings = ws.settings.contact
    runAfter(async () => {
      for (const to of settings.notifyEmails) {
        await sendMail({
          to,
          fromName: brand.name,
          replyTo: { name: message.name, address: message.email },
          email: notificationEmail({ brand, submission: message, inboxUrl: `${cmsUrl()}/${ws.slug}/inbox/${message.id}` }),
        })
      }
      if (settings.confirmation) {
        await sendMail({
          to: { name: message.name, address: message.email },
          fromName: brand.name,
          email: confirmationEmail({ brand, subject: settings.confirmationSubject, siteUrl: ws.siteUrl }),
        })
      }
    })
    return json({ ok: true }, 201)
  })
}
