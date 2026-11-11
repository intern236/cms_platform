import 'server-only'
import { createHmac } from 'node:crypto'
import { lookup } from 'node:dns'
import { runAfter } from '@/lib/after'
import { Agent, fetch as undiciFetch } from 'undici'
import { newId, sys } from '@/lib/db'
import { getWebhookConfig } from '@/lib/workspaces'
import { checkOutboundUrl, isPublicAddress } from './net'

/**
 * "CONTENT CHANGED" WEBHOOKS.
 *
 * When a post, author or setting changes, the CMS POSTs a small JSON body to the
 * client site's revalidate route (the site kit provides it). The site checks the
 * signature and refreshes its cached pages, so a publish shows up in seconds
 * instead of waiting for the 60-second refresh.
 *
 * Signature: header `x-cms-signature: t=<unix seconds>,v1=<hex>` where v1 is
 * HMAC-SHA256(secret, `${t}.${body}`). The site rejects anything older than five
 * minutes, so a captured request cannot be replayed later.
 *
 * Delivery runs after the response is sent (next/server `after`), never blocks a
 * save, follows no redirects, and gives up after 5 seconds.
 */

export type WebhookEvent =
  | 'post.published'
  | 'post.updated'
  | 'post.unpublished'
  | 'post.deleted'
  | 'author.updated'
  | 'settings.updated'
  | 'ping'

export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `t=${timestamp},v1=${v1}`
}

/** Connect-time address check, so DNS cannot be switched between the check and the request. */
function guardedAgent() {
  const allowPrivate = process.env.NODE_ENV !== 'production' || process.env.CMS_ALLOW_PRIVATE_WEBHOOKS === 'true'
  return new Agent({
    connect: {
      timeout: 5000,
      lookup: (hostname, options, callback) => {
        lookup(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return callback(err, '', 0)
          const list = addresses as { address: string; family: number }[]
          if (!allowPrivate && list.some((a) => !isPublicAddress(a.address))) {
            return callback(new Error('Refused: private address'), '', 0)
          }
          const first = list[0]
          if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list)
          callback(null, first.address, first.family)
        })
      },
    },
  })
}

export async function deliver(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown> = {}
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const config = await getWebhookConfig(workspaceId)
  if (!config?.url) return { ok: false, error: 'No webhook URL set.' }
  const check = await checkOutboundUrl(config.url)
  const started = Date.now()
  let outcome: { ok: boolean; status?: number; error?: string }
  if (!check.ok) {
    outcome = { ok: false, error: check.reason }
  } else {
    const body = JSON.stringify({ event, workspace: config.slug, at: new Date().toISOString(), ...data })
    try {
      const res = await undiciFetch(check.url, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'cms-webhook/2',
          'x-cms-event': event,
          'x-cms-signature': signPayload(config.secret, body),
        },
        body,
        signal: AbortSignal.timeout(5000),
        dispatcher: guardedAgent(),
      })
      await res.body?.cancel().catch(() => {})
      outcome = res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `HTTP ${res.status}` }
    } catch (error) {
      const message = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : 'failed'
      outcome = { ok: false, error: message.slice(0, 200) }
    }
  }
  const db = await sys()
  await db.webhooks.record({
    id: newId(),
    workspaceId,
    event,
    ok: outcome.ok,
    status: outcome.status ?? null,
    error: outcome.error ?? null,
    durationMs: Date.now() - started,
    at: new Date(),
  })
  await db.webhooks.deleteBefore(workspaceId, new Date(Date.now() - 30 * 86_400_000))
  return outcome
}

/** Fire-and-forget after the response. Safe to call from any action. */
export function notifySite(workspaceId: string, event: WebhookEvent, data: Record<string, unknown> = {}) {
  runAfter(() => deliver(workspaceId, event, data))
}

export async function recentDeliveries(workspaceId: string, limit = 10) {
  return (await sys()).webhooks.recent(workspaceId, limit)
}
