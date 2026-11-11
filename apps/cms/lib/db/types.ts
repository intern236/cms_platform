/**
 * THE DATA MODEL.
 *
 * These are the records the rest of the app reads and writes.
 * Ids are 24-hex strings made by newId() (lib/db/index.ts).
 */

export type Role = 'owner' | 'editor' | 'writer'
export type PostStatus = 'draft' | 'review' | 'published'
export type PostFormat = 'editor' | 'html'

export interface StoredImage {
  url: string
  secureUrl: string
  publicId: string
  width: number
  height: number
  format: string
  bytes: number
  altText?: string
  caption?: string
}

// ---------------------------------------------------------------------------
// System records — the CMS's own bookkeeping
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string
  /** Always stored lower-cased; unique across the whole CMS. */
  email: string
  name: string
  passwordHash: string
  /** Your agency's own team: every workspace, plus the agency area. */
  isAgency: boolean
  /** Email a 6-digit code on every sign-in. */
  twoFactor: boolean
  disabledAt: Date | null
  lastLoginAt: Date | null
  createdAt: Date
}

export interface WorkspaceRow {
  id: string
  /** In admin URLs (/acme/posts) and the Cloudinary folder. Unique; never changes. */
  slug: string
  name: string
  /** The client's public website, e.g. https://acme.com. */
  siteUrl: string
  /** Brand colour for their admin, buttons and emails. */
  accent: string
  hasLogo: boolean
  /** Validated on read by lib/workspaces/settings.ts. */
  settings: unknown
  /** Where "content changed" is POSTed. Agency-only to edit. */
  webhookUrl: string
  webhookSecret: string
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface MembershipRow {
  workspaceId: string
  userId: string
  role: Role
  createdAt: Date
}

export interface InviteRow {
  id: string
  /** Null for an invite to the agency team. */
  workspaceId: string | null
  email: string
  /** A workspace role, or 'agency'. */
  role: Role | 'agency'
  tokenHash: string
  invitedBy: string | null
  expiresAt: Date
  acceptedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export interface SessionRow {
  /** sha256 of the cookie value. The raw token is never stored. */
  id: string
  userId: string
  userAgent: string
  createdAt: Date
  lastSeenAt: Date
  expiresAt: Date
}

/** A password that was right, waiting for the emailed code. */
export interface ChallengeRow {
  /** sha256 of the pending cookie value. */
  id: string
  userId: string
  codeHash: string
  attempts: number
  expiresAt: Date
  createdAt: Date
}

export interface ResetRow {
  tokenHash: string
  userId: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

export interface SiteKeyRow {
  id: string
  workspaceId: string
  label: string
  /** The visible part, `cms_<prefix>_…`, used to look the key up. Unique. */
  prefix: string
  keyHash: string
  createdBy: string | null
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

export interface WebhookDeliveryRow {
  id: string
  workspaceId: string
  event: string
  ok: boolean
  status: number | null
  error: string | null
  durationMs: number | null
  at: Date
}

/** Emails the CMS would have sent, when no SMTP server is configured. */
export interface OutboxRow {
  id: string
  to: string
  subject: string
  html: string
  text: string
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Client content — every record carries its workspace, and is only reachable
// through a workspace scope (see Scope in ./store.ts)
// ---------------------------------------------------------------------------

export interface AuthorRow {
  id: string
  workspaceId: string
  /** Unique within the workspace. */
  slug: string
  name: string
  role: string | null
  bio: string | null
  avatar: StoredImage | null
  linkedinUrl: string | null
  xUrl: string | null
  websiteUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface PostRow {
  id: string
  workspaceId: string
  /** Unique within the workspace. */
  slug: string
  title: string
  description: string
  excerpt: string | null
  format: PostFormat
  contentHtml: string
  coverImage: StoredImage | null
  category: string | null
  tags: string[]
  /** slugify() of each tag, kept beside it so tag archives are one indexed query. */
  tagSlugs: string[]
  faqs: { question: string; answer: string }[]
  authorId: string | null
  seoTitle: string | null
  focusKeyword: string | null
  /** draft → review (a writer asks for it) → published. Future publishedAt = scheduled. */
  status: PostStatus
  publishedAt: Date | null
  readingMinutes: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ContactMessageRow {
  id: string
  workspaceId: string
  name: string
  email: string
  phone: string
  company: string
  topic: string
  message: string
  source: string | null
  userAgent: string | null
  receivedAt: Date
  readAt: Date | null
  archived: boolean
}

export interface AuditRow {
  id: string
  workspaceId: string
  actorId: string | null
  actorName: string
  action: string
  targetType: string | null
  targetId: string | null
  summary: string
  at: Date
}

/**
 * Where client content lives. In MongoDB these collections are only reachable
 * through the workspace-scoped wrapper.
 */
export const CONTENT_TABLES = ['authors', 'posts', 'contact_messages', 'contact_rate', 'audit_log'] as const
