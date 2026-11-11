/**
 * Every email the CMS sends, as plain functions: data in, { subject, text, html } out.
 * No transport, no database — so each one can be rendered and checked in a test.
 *
 * ALL interpolated text goes through esc(). Names, messages and workspace names are
 * typed by people, and an inbox renders HTML.
 */

export type Brand = {
  /** "Acme Studio" or your agency's name. */
  name: string
  /** Hex accent. */
  accent: string
  accentForeground: string
  /** Absolute URL of a logo image, or null to show the name. */
  logoUrl: string | null
}

export type RenderedEmail = { subject: string; text: string; html: string }

const INK = '#0b0b0c'
const MUTED = '#6b6b70'
const LINE = '#e9e8e4'
const PAGE = '#f6f5f2'
const SURFACE = '#ffffff'
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const SERIF = "Georgia,'Times New Roman',serif"
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escMultiline(value: string): string {
  return esc(value).replace(/\r?\n/g, '<br>')
}

/** Only http(s) links ever make it into an href. */
function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : '#'
}

function frame({ brand, preheader, body, footer }: { brand: Brand; preheader: string; body: string; footer: string }) {
  const mark = brand.logoUrl
    ? `<img src="${safeHref(brand.logoUrl)}" alt="${esc(brand.name)}" height="28" style="display:block;height:28px;width:auto;border:0;">`
    : `<span style="font-family:${SANS};font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${INK};">${esc(brand.name)}</span>`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(brand.name)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};color:${INK};font-family:${SANS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background-color:${PAGE};">
<tr><td align="center" style="padding:32px 12px 40px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE}" style="width:560px;max-width:100%;background-color:${SURFACE};border:1px solid ${LINE};border-radius:16px;">
<tr><td style="height:4px;background-color:${esc(brand.accent)};border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 32px 8px;background-color:${SURFACE};">${mark}</td></tr>
<tr><td style="padding:16px 32px 32px;background-color:${SURFACE};font-size:15px;line-height:1.6;color:${INK};">${body}</td></tr>
<tr><td style="padding:16px 32px 22px;border-top:1px solid ${LINE};background-color:${PAGE};font-size:12px;line-height:1.5;color:${MUTED};border-radius:0 0 16px 16px;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function heading(text: string) {
  return `<h1 style="margin:0 0 14px;font-family:${SERIF};font-weight:400;font-size:28px;line-height:1.15;letter-spacing:-0.01em;color:${INK};">${esc(text)}</h1>`
}

function para(html: string) {
  return `<p style="margin:0 0 16px;color:${INK};">${html}</p>`
}

function button(brand: Brand, label: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr>
<td bgcolor="${esc(brand.accent)}" style="border-radius:999px;background-color:${esc(brand.accent)};">
<a href="${safeHref(url)}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:15px;font-weight:600;color:${esc(brand.accentForeground)};text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`
}

function smallLink(url: string) {
  return `<p style="margin:0;font-size:12px;color:${MUTED};word-break:break-all;">Or paste this into your browser: ${esc(url)}</p>`
}

// ---------------------------------------------------------------------------

export function inviteEmail(input: {
  brand: Brand
  inviterName: string
  workspaceName: string | null
  roleLabel: string
  url: string
  expiresInDays: number
}): RenderedEmail {
  const where = input.workspaceName ? `${input.workspaceName}'s CMS` : `the ${input.brand.name} team`
  const subject = input.workspaceName
    ? `${input.inviterName} invited you to ${input.workspaceName}`
    : `${input.inviterName} invited you to the ${input.brand.name} team`
  const text = [
    `${input.inviterName} invited you to ${where} as ${input.roleLabel}.`,
    '',
    `Accept the invite: ${input.url}`,
    '',
    `The link works once and expires in ${input.expiresInDays} days. If you were not expecting this, ignore it.`,
  ].join('\n')
  const html = frame({
    brand: input.brand,
    preheader: `Join ${where} as ${input.roleLabel}.`,
    body:
      heading('You are invited') +
      para(`${esc(input.inviterName)} invited you to <strong>${esc(where)}</strong> as <strong>${esc(input.roleLabel)}</strong>.`) +
      button(input.brand, 'Accept invite', input.url) +
      smallLink(input.url),
    footer: `The link works once and expires in ${input.expiresInDays} days. Not expecting this? Ignore it and nothing happens.`,
  })
  return { subject, text, html }
}

export function resetEmail(input: { brand: Brand; name: string; url: string; minutes: number }): RenderedEmail {
  const subject = 'Reset your password'
  const text = [
    `Hi ${input.name},`,
    '',
    `Choose a new password: ${input.url}`,
    '',
    `The link works once and expires in ${input.minutes} minutes. If you did not ask for this, ignore it — your password has not changed.`,
  ].join('\n')
  const html = frame({
    brand: input.brand,
    preheader: 'A link to choose a new password.',
    body:
      heading('Reset your password') +
      para(`Hi ${esc(input.name)}, someone (hopefully you) asked to reset your password.`) +
      button(input.brand, 'Choose a new password', input.url) +
      smallLink(input.url),
    footer: `Works once, expires in ${input.minutes} minutes. Didn't ask? Ignore this — your password has not changed.`,
  })
  return { subject, text, html }
}

export function codeEmail(input: { brand: Brand; code: string; minutes: number }): RenderedEmail {
  const subject = `${input.code} is your sign-in code`
  const text = `Your sign-in code is ${input.code}. It expires in ${input.minutes} minutes. If you did not just sign in, change your password.`
  const html = frame({
    brand: input.brand,
    preheader: `Expires in ${input.minutes} minutes.`,
    body:
      heading('Your sign-in code') +
      `<p style="margin:6px 0 18px;font-family:${MONO};font-size:34px;letter-spacing:0.3em;color:${INK};">${esc(input.code)}</p>` +
      para(`It expires in ${input.minutes} minutes and works once.`),
    footer: 'If you did not just try to sign in, someone has your password. Change it.',
  })
  return { subject, text, html }
}

export type ContactSubmission = {
  id: string
  name: string
  email: string
  company: string
  phone: string
  topic: string
  message: string
  receivedAt: Date
}

export function notificationEmail(input: { brand: Brand; submission: ContactSubmission; inboxUrl: string }): RenderedEmail {
  const s = input.submission
  const subject = `New enquiry from ${s.name}${s.topic ? ` · ${s.topic}` : ''}`
  const rows: [string, string][] = [
    ['Name', s.name],
    ['Email', s.email],
    ...(s.company ? [['Company', s.company] as [string, string]] : []),
    ...(s.phone ? [['Phone', s.phone] as [string, string]] : []),
    ...(s.topic ? [['Topic', s.topic] as [string, string]] : []),
  ]
  const text = [...rows.map(([k, v]) => `${k}: ${v}`), '', s.message, '', `Open the inbox: ${input.inboxUrl}`].join('\n')
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;font-family:${MONO};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;font-size:15px;color:${INK};">${esc(v)}</td></tr>`
    )
    .join('')
  const html = frame({
    brand: input.brand,
    preheader: s.message.slice(0, 120),
    body:
      heading(`New enquiry from ${s.name}`) +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">${table}</table>` +
      `<div style="padding:16px 18px;background-color:${PAGE};border:1px solid ${LINE};border-radius:12px;font-size:15px;line-height:1.6;color:${INK};">${escMultiline(s.message)}</div>` +
      `<div style="height:18px"></div>` +
      button(input.brand, 'Open in inbox', input.inboxUrl),
    footer: `Reply to this email to answer ${esc(s.name)} directly.`,
  })
  return { subject, text, html }
}

/**
 * The visitor's receipt. Deliberately echoes NOTHING the visitor typed — not their
 * name, not their message — so the contact form cannot be used to send arbitrary
 * text to arbitrary inboxes under the client's name.
 */
export function confirmationEmail(input: { brand: Brand; subject: string; siteUrl: string }): RenderedEmail {
  const text = [
    'Hello,',
    '',
    `Thanks for getting in touch with ${input.brand.name}. We have your message and will reply soon.`,
    '',
    'If you did not send a message, you can ignore this email.',
  ].join('\n')
  const html = frame({
    brand: input.brand,
    preheader: `Thanks for getting in touch with ${input.brand.name}.`,
    body: heading('Thanks for getting in touch') + para('We have your message and will reply soon.'),
    footer:
      'If you did not send a message, ignore this email. ' +
      (input.siteUrl ? `<a href="${safeHref(input.siteUrl)}" style="color:${MUTED};text-decoration:none;">${esc(input.siteUrl.replace(/^https?:\/\//, ''))}</a>` : esc(input.brand.name)),
  })
  return { subject: input.subject, text, html }
}
