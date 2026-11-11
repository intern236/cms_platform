/**
 * Settings read from the environment, with their defaults, in one place.
 * See .env.example for what each one does.
 */

/** Where this CMS is served, e.g. https://cms.youragency.com — used in emails and preview links. */
export function cmsUrl(): string {
  const raw = process.env.CMS_URL?.trim() || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

export function agencyName(): string {
  return process.env.AGENCY_NAME?.trim() || 'Studio CMS'
}

export function agencyAccent(): string {
  const value = process.env.AGENCY_ACCENT?.trim() || '#ff5b2e'
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#ff5b2e'
}

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST)
}

export function mailFrom(): { name: string; address: string } {
  return {
    name: process.env.MAIL_FROM_NAME?.trim() || agencyName(),
    address: process.env.MAIL_FROM?.trim() || 'no-reply@localhost',
  }
}

/** True outside production, or when explicitly enabled — shows the dev email outbox. */
export function outboxVisible(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.CMS_SHOW_OUTBOX === 'true'
}
