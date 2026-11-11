import 'server-only'
import { newId, scoped, type ContactMessageRow, type Tx } from '@/lib/db'
import { isEmail, isPlainName } from '@/lib/security'

/**
 * The contact form and each workspace's inbox.
 *
 * Submissions arrive server-to-server from the client's website
 * (POST /api/v1/contact with its site key), so the visitor never sees a key.
 * The site forwards the visitor's IP; it is only ever stored hashed.
 */

export const CONTACT_LIMITS = { name: 120, email: 200, phone: 40, company: 160, topic: 80, message: 5000 } as const
type Field = keyof typeof CONTACT_LIMITS

export interface ContactMessage {
  id: string
  name: string
  email: string
  phone: string
  company: string
  topic: string
  message: string
  source: string | null
  receivedAt: Date
  readAt: Date | null
  archived: boolean
}

export type ValidationResult = { ok: true; values: Record<Field, string> } | { ok: false; errors: Record<string, string> }

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function looksLikePhone(value: string): boolean {
  return /^[+()\d\s.-]+$/.test(value) && (value.match(/\d/g) ?? []).length >= 6
}

export function validateSubmission(payload: Record<string, unknown>, topics: string[]): ValidationResult {
  const values = {} as Record<Field, string>
  for (const field of Object.keys(CONTACT_LIMITS) as Field[]) values[field] = asString(payload[field])

  const errors: Record<string, string> = {}
  if (!values.name) errors.name = 'Please tell us your name.'
  else if (!isPlainName(values.name)) errors.name = 'Please use letters, not symbols.'
  if (!values.email) errors.email = 'We need an email address to reply to.'
  else if (!isEmail(values.email)) errors.email = 'That email address does not look right.'
  if (values.phone && !looksLikePhone(values.phone)) errors.phone = 'That phone number does not look right.'
  if (values.company && !isPlainName(values.company)) errors.company = 'Please use letters, not symbols.'
  if (!values.message) errors.message = 'Please write a message.'
  if (values.topic && !topics.includes(values.topic)) errors.topic = 'Choose a topic from the list.'
  for (const field of Object.keys(CONTACT_LIMITS) as Field[]) {
    if (values[field].length > CONTACT_LIMITS[field]) {
      errors[field] = `That is longer than we can store (${CONTACT_LIMITS[field]} characters).`
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values }
}

// ---- Rate limiting ---------------------------------------------------------

/** Per visitor: 5 messages / 10 minutes. Per workspace: 60 / 10 minutes (a flood guard). */
export const CONTACT_RATE = { perVisitor: 5, perWorkspace: 60, windowMs: 10 * 60_000 }

export function contactAllowed(tx: Tx, workspaceId: string, visitorKey: string): Promise<boolean> {
  const now = new Date()
  return scoped(tx, workspaceId).contact.rateAllowed(visitorKey, CONTACT_RATE, new Date(now.getTime() - CONTACT_RATE.windowMs), now)
}

// ---- Storage ---------------------------------------------------------------

function toMessage(row: ContactMessageRow): ContactMessage {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    topic: row.topic,
    message: row.message,
    source: row.source,
    receivedAt: row.receivedAt,
    readAt: row.readAt,
    archived: row.archived,
  }
}

export async function storeSubmission(
  tx: Tx,
  workspaceId: string,
  values: Record<Field, string>,
  meta: { userAgent: string | null; source: string | null }
): Promise<ContactMessage> {
  const row = await scoped(tx, workspaceId).contact.insert({
    id: newId(),
    ...values,
    source: meta.source?.slice(0, 300) ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    receivedAt: new Date(),
  })
  return toMessage(row)
}

export type InboxFilter = 'inbox' | 'unread' | 'archived'

export async function listMessages(tx: Tx, workspaceId: string, filter: InboxFilter = 'inbox', search = ''): Promise<ContactMessage[]> {
  const rows = await scoped(tx, workspaceId).contact.list({
    archived: filter === 'archived',
    unreadOnly: filter === 'unread',
    q: search,
    limit: 500,
  })
  return rows.map(toMessage)
}

export async function getMessage(tx: Tx, workspaceId: string, id: string): Promise<ContactMessage | null> {
  const row = await scoped(tx, workspaceId).contact.get(id)
  return row ? toMessage(row) : null
}

export function countUnread(tx: Tx, workspaceId: string): Promise<number> {
  return scoped(tx, workspaceId).contact.countUnread()
}

export async function updateMessage(
  tx: Tx,
  workspaceId: string,
  id: string,
  patch: { read?: boolean; archived?: boolean }
): Promise<boolean> {
  const set: { readAt?: Date | null; archived?: boolean } = {}
  if (patch.read !== undefined) set.readAt = patch.read ? new Date() : null
  if (patch.archived !== undefined) set.archived = patch.archived
  if (!Object.keys(set).length) return Boolean(await getMessage(tx, workspaceId, id))
  return scoped(tx, workspaceId).contact.update(id, set)
}

export function deleteMessage(tx: Tx, workspaceId: string, id: string): Promise<boolean> {
  return scoped(tx, workspaceId).contact.delete(id)
}

export async function allMessages(tx: Tx, workspaceId: string): Promise<ContactMessage[]> {
  return (await scoped(tx, workspaceId).contact.all()).map(toMessage)
}

/**
 * One CSV cell. A value Excel would read as a formula (=, +, -, @, or a leading
 * tab/CR — after any leading spaces) gets a ' prefix so it opens as text.
 */
export function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
