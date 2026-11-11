import 'server-only'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { headers } from 'next/headers'

/**
 * Small, sharp tools every other module leans on. Kept in one place so there is
 * exactly one definition of "the client's IP", "a token" and "the server secret".
 */

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** A URL-safe random token. 32 bytes = 256 bits unless told otherwise. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * The server secret: signs preview tokens and salts hashed IPs.
 *
 * Required in production. In development a random one is created once in
 * data/.dev-secret so `npm run dev` works with no setup at all.
 */
let cachedSecret: string | null = null
export function serverSecret(): string {
  if (cachedSecret) return cachedSecret
  const fromEnv = process.env.CMS_SECRET?.trim()
  if (fromEnv && fromEnv.length >= 32) return (cachedSecret = fromEnv)
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CMS_SECRET must be set to a random string of at least 32 characters. Run `npm run setup`.')
  }
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', '.dev-secret')
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, randomToken(48), { mode: 0o600 })
  }
  return (cachedSecret = readFileSync(file, 'utf8').trim())
}

export function hmac(value: string, purpose: string): string {
  return createHmac('sha256', `${purpose}:${serverSecret()}`).update(value).digest('hex')
}

/**
 * The visitor's IP, as written by YOUR reverse proxy.
 *
 * Only the right-most X-Forwarded-For entries are trusted: the proxy appends the
 * address it actually saw, while everything to the left (and X-Real-IP,
 * CF-Connecting-IP, …) can be typed by anyone. With several proxies in a row, set
 * TRUSTED_PROXY_COUNT to how many.
 */
export function ipFromHeaders(h: Headers): string {
  const hops = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const trusted = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? '1', 10) || 1)
  return hops.length >= trusted ? hops[hops.length - trusted] : (hops[0] ?? 'unknown')
}

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers())
}

/** Hashed so rate-limit tables never hold raw addresses. */
export function ipKey(ip: string): string {
  return hmac(ip, 'ip').slice(0, 32)
}

export function normaliseEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * Strict on purpose: no quotes, commas, angle brackets, spaces or control
 * characters, so an address can never smuggle extra recipients into a header.
 */
export const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value)
}

/** Safe as a display name in an email header and on screen: no controls, no brackets. */
export function isPlainName(value: string): boolean {
  return !/[\u0000-\u001f\u007f<>"]/.test(value)
}
