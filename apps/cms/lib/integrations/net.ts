import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF GUARD for outgoing webhooks.
 *
 * The CMS POSTs to a URL someone typed in. Without a guard that URL could be
 * http://169.254.169.254/ (cloud metadata), http://localhost:5432 or anything on
 * the private network the server sits in. So in production:
 *
 * - only https,
 * - the host must resolve ONLY to public addresses,
 * - redirects are not followed (the caller uses redirect: 'manual').
 *
 * Local development may target http://localhost (the example site), and
 * CMS_ALLOW_PRIVATE_WEBHOOKS=true lifts the address check for a deliberate
 * same-network setup.
 */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

export async function checkOutboundUrl(raw: string): Promise<UrlCheck> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'Not a valid URL.' }
  }
  if (url.username || url.password) return { ok: false, reason: 'URLs with credentials are not allowed.' }
  const dev = process.env.NODE_ENV !== 'production'
  const allowPrivate = dev || process.env.CMS_ALLOW_PRIVATE_WEBHOOKS === 'true'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowPrivate)) {
    return { ok: false, reason: 'Use an https:// address.' }
  }
  if (allowPrivate) return { ok: true, url }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  } catch {
    return { ok: false, reason: 'That host name does not resolve.' }
  }
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a))) {
    return { ok: false, reason: 'That address points at a private or reserved network.' }
  }
  return { ok: true, url }
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return isPublicV4(address)
  if (isIP(address) === 6) {
    const a = address.toLowerCase()
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPublicV4(mapped[1])
    if (a === '::' || a === '::1') return false
    if (/^f[cd]/.test(a)) return false // unique local fc00::/7
    if (/^fe[89ab]/.test(a)) return false // link local fe80::/10
    if (/^ff/.test(a)) return false // multicast
    if (a.startsWith('64:ff9b:')) return false // NAT64
    if (a.startsWith('2001:db8')) return false // documentation
    return true
  }
  return false
}

function isPublicV4(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
  if (a === 169 && b === 254) return false // link local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0) return false // 192.0.0.0/24 + 192.0.2.0/24 docs
  if (a === 198 && (b === 18 || b === 19)) return false // benchmarking
  if (a === 198 && b === 51) return false // docs
  if (a === 203 && b === 0) return false // docs
  if (a >= 224) return false // multicast + reserved
  return true
}
