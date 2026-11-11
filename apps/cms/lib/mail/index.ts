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

function transporter(): Transporter {
  if (g.__cmsMailer) return g.__cmsMailer
  g.__cmsMailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
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
    console.error('[mail] send failed:', error instanceof Error ? error.message : error)
    return { sent: false, error: 'send failed' }
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
