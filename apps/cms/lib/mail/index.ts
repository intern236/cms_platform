import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import { newId, sys } from '@/lib/db'
import { agencyAccent, agencyName, cmsUrl, mailConfigured, mailFrom } from '@/lib/env'
import { accentForeground } from '@/lib/workspaces/settings'
import type { Brand, RenderedEmail } from './templates'

/**
 * SENDING. With SMTP_HOST set, mail goes out over SMTP. Without it (local dev,
 * tests) every message is written to the `outbox` table instead, and agency users
 * can read it at /agency/outbox — so invites and password resets work end to end
 * on a laptop with no mail server.
 */

type Address = string | { name: string; address: string }

const g = globalThis as unknown as { __cmsMailer?: Transporter }

function clean(val?: string): string | undefined {
  if (!val) return undefined
  return val.trim().replace(/^["']|["']$/g, '').trim()
}

function transporter(): Transporter {
  if (g.__cmsMailer) return g.__cmsMailer
  const host = clean(process.env.SMTP_HOST)
  const port = Number(clean(process.env.SMTP_PORT) || 587)
  const secureEnv = clean(process.env.SMTP_SECURE)
  const user = clean(process.env.SMTP_USER)
  const pass = clean(process.env.SMTP_PASS)

  g.__cmsMailer = nodemailer.createTransport({
    host,
    port,
    secure: secureEnv ? secureEnv === 'true' : port === 465,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  })
  return g.__cmsMailer
}

export type MailResult = { sent: boolean; outbox?: boolean; error?: string }

export async function sendMail(input: { to: Address; replyTo?: Address; fromName?: string; email: RenderedEmail }): Promise<MailResult> {
  const { email } = input
  if (!mailConfigured()) {
    const db = await sys()
    const to = typeof input.to === 'string' ? input.to : `${input.to.name} <${input.to.address}>`
    await db.outbox.insert({ id: newId(), to, subject: email.subject, html: email.html, text: email.text, createdAt: new Date() })
    /* Keep the dev outbox small. */
    await db.outbox.deleteBefore(new Date(Date.now() - 7 * 86_400_000))
    if (process.env.NODE_ENV !== 'test') console.info(`[mail] (outbox) to ${to}: ${email.subject}`)
    return { sent: false, outbox: true }
  }
  try {
    const from = mailFrom()
    await transporter().sendMail({
      from: { name: input.fromName ?? from.name, address: from.address },
      to: input.to,
      replyTo: input.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
    })
    return { sent: true }
  } catch (error) {
    g.__cmsMailer = undefined
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[mail] send failed:', errMsg)
    return { sent: false, error: errMsg }
  }
}

export async function latestOutbox(limit = 50) {
  return (await sys()).outbox.latest(limit)
}

export function agencyBrand(): Brand {
  const accent = agencyAccent()
  return { name: agencyName(), accent, accentForeground: accentForeground(accent), logoUrl: null }
}

export function workspaceBrand(ws: { slug: string; name: string; accent: string; hasLogo: boolean; updatedAt?: Date }): Brand {
  return {
    name: ws.name,
    accent: ws.accent,
    accentForeground: accentForeground(ws.accent),
    logoUrl: ws.hasLogo ? `${cmsUrl()}/brand/${ws.slug}/logo${ws.updatedAt ? `?v=${ws.updatedAt.getTime()}` : ''}` : null,
  }
}
