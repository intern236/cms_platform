import { z } from 'zod'

/**
 * A client's site settings — what used to be cms.config.ts, now edited in the
 * admin. Stored as JSON on the workspace and served to their website by
 * GET /api/v1/site.
 *
 * Every field has a default and a `.catch()`, so a value written by an older
 * version, or by hand, can never take a workspace down: the bad field falls back
 * and the rest still loads.
 */

export const SOCIAL_PLATFORMS = ['linkedin', 'x', 'instagram', 'facebook', 'youtube', 'github', 'tiktok'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

const text = (max: number, fallback = '') => z.string().trim().max(max).catch(fallback).default(fallback)
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v), 'Enter a full web address, starting https://')

const relativeOrAbsoluteHref = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v.startsWith('/') ? !v.startsWith('//') : /^(https?:|mailto:|tel:)/i.test(v), 'Use a path like /contact or a full https:// address')

export const settingsSchema = z.object({
  description: text(300),
  language: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).catch('en').default('en'),
  dateLocale: z
    .string()
    .trim()
    .refine((v) => {
      try {
        return Intl.DateTimeFormat.supportedLocalesOf(v).length > 0
      } catch {
        return false
      }
    })
    .catch('en-GB')
    .default('en-GB'),
  legalName: text(120),
  social: z
    .array(z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: httpsUrl }))
    .max(8)
    .catch([])
    .default([]),
  blog: z
    .object({
      title: text(60, 'Blog'),
      description: text(300),
      basePath: z.string().regex(/^\/[a-z0-9-]{1,40}$/).catch('/blog').default('/blog'),
      postsPerPage: z.number().int().min(3).max(48).catch(12).default(12),
      authors: z.boolean().catch(true).default(true),
      faqs: z.boolean().catch(true).default(true),
      htmlPages: z.boolean().catch(true).default(true),
      midPostCta: z.boolean().catch(true).default(true),
    })
    .catch({ title: 'Blog', description: '', basePath: '/blog', postsPerPage: 12, authors: true, faqs: true, htmlPages: true, midPostCta: true })
    .prefault({}),
  cta: z
    .object({
      enabled: z.boolean().catch(false).default(false),
      heading: text(100),
      body: text(300),
      label: text(40, 'Get in touch'),
      href: relativeOrAbsoluteHref.catch('/contact').default('/contact'),
    })
    .catch({ enabled: false, heading: '', body: '', label: 'Get in touch', href: '/contact' })
    .prefault({}),
  contact: z
    .object({
      enabled: z.boolean().catch(true).default(true),
      notifyEmails: z.array(z.string().trim().toLowerCase().email().max(254)).max(5).catch([]).default([]),
      confirmation: z.boolean().catch(true).default(true),
      confirmationSubject: text(120, 'Thanks — we got your message'),
      topics: z.array(z.string().trim().min(1).max(60)).max(12).catch([]).default([]),
    })
    .catch({ enabled: true, notifyEmails: [], confirmation: true, confirmationSubject: 'Thanks — we got your message', topics: [] })
    .prefault({}),
})

export type WorkspaceSettings = z.infer<typeof settingsSchema>

export function readSettings(value: unknown): WorkspaceSettings {
  const parsed = settingsSchema.safeParse(value && typeof value === 'object' ? value : {})
  return parsed.success ? parsed.data : settingsSchema.parse({})
}

/** Brand accent: a 6-digit hex colour. */
export function isHexColour(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

/** Black or white, whichever reads better on the accent. WCAG relative luminance. */
export function accentForeground(hex: string): '#ffffff' | '#0a0a0a' {
  if (!isHexColour(hex)) return '#ffffff'
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  const contrastWhite = 1.05 / (L + 0.05)
  const contrastBlack = (L + 0.05) / 0.05
  return contrastWhite >= contrastBlack ? '#ffffff' : '#0a0a0a'
}

/** Reserved because the admin itself owns these paths. */
export const RESERVED_WORKSPACE_SLUGS = new Set([
  'login', 'logout', 'agency', 'account', 'invite', 'reset', 'forgot', 'api', 'brand', 'auth',
  'settings', 'admin', 'static', '_next', 'favicon.ico', 'robots.txt', 'new', 'dev', 'help', 'docs',
])

export function workspaceSlugProblem(slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) {
    return 'Use 3–48 lowercase letters, numbers and dashes.'
  }
  if (RESERVED_WORKSPACE_SLUGS.has(slug)) return 'That address is reserved by the CMS.'
  return null
}
