'use client'

import { TimeAgo } from '@/components/ui/time-ago'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowsClockwise, CheckCircle, Copy, Eye, Key, Lightning, Plus, WarningCircle } from '@phosphor-icons/react'
import { createKey, revealWebhookSecret, revokeKey, rotateSecret, saveIntegration, testWebhook } from '@/lib/actions/workspace'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/confirm'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { Badge } from '@/components/ui/status'
import { cn } from '@/lib/utils'
import { Section } from './save-bar'

export type KeyRow = { id: string; label: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
export type DeliveryRow = { id: string; event: string; ok: boolean; status: number | null; error: string | null; at: string; durationMs: number | null }

function copy(text: string) {
  void navigator.clipboard.writeText(text)
  toast.success('Copied')
}

export function WebsitePanel({
  workspace,
  isAgency,
  cmsUrl,
  siteUrl,
  webhookUrl,
  keys,
  deliveries,
}: {
  workspace: string
  isAgency: boolean
  cmsUrl: string
  siteUrl: string
  webhookUrl: string
  keys: KeyRow[]
  deliveries: DeliveryRow[]
}) {
  const router = useRouter()
  const [site, setSite] = useState(siteUrl)
  const [hook, setHook] = useState(webhookUrl)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [label, setLabel] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<KeyRow | null>(null)
  const [pinging, setPinging] = useState(false)
  const active = keys.filter((k) => !k.revokedAt)

  return (
    <div>
      <Section
        title="Connection"
        description={
          isAgency
            ? 'Where the client’s website lives, and where the CMS tells it about changes.'
            : 'Set up by your agency. Ask them to change it.'
        }
      >
        <Field label="Website address" error={errors.siteUrl} hint="Used for previews and links in the editor.">
          {(p) => <Input {...p} value={site} onChange={(e) => setSite(e.target.value)} disabled={!isAgency} placeholder="https://acme.com" />}
        </Field>
        <Field label="Revalidate webhook" error={errors.webhookUrl} hint="The site kit’s route, normally https://<site>/api/cms/revalidate. Leave empty to rely on the 60-second refresh.">
          {(p) => <Input {...p} value={hook} onChange={(e) => setHook(e.target.value)} disabled={!isAgency} placeholder="https://acme.com/api/cms/revalidate" />}
        </Field>
        <div className="flex flex-wrap gap-2">
          {isAgency && (
            <Button
              variant="ink"
              loading={saving}
              disabled={site === siteUrl && hook === webhookUrl}
              onClick={async () => {
                setSaving(true)
                const r = await saveIntegration(workspace, { siteUrl: site, webhookUrl: hook })
                setSaving(false)
                if (!r.ok) return setErrors(r.errors ?? {})
                setErrors({})
                toast.success('Connection saved')
                router.refresh()
              }}
            >
              Save connection
            </Button>
          )}
          <Button
            variant="outline"
            loading={pinging}
            disabled={!webhookUrl}
            onClick={async () => {
              setPinging(true)
              const r = await testWebhook(workspace)
              setPinging(false)
              if (r.ok) toast.success('Your site answered', { description: r.message })
              else toast.error('No good answer from the site', { description: r.error })
              router.refresh()
            }}
          >
            <Lightning /> Send a test
          </Button>
        </div>
        {deliveries.length > 0 && (
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-ink-2">Recent deliveries</h3>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {deliveries.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0">
                  {d.ok ? <CheckCircle size={17} weight="fill" className="text-ok" /> : <WarningCircle size={17} weight="fill" className="text-danger" />}
                  <span className="font-mono text-[12px] text-ink-2">{d.event}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{d.ok ? `HTTP ${d.status}` : d.error}</span>
                  {d.durationMs !== null && <span className="font-mono text-[11px] text-faint">{d.durationMs}ms</span>}
                  <span className="w-20 shrink-0 text-right text-[12px] text-faint"><TimeAgo date={d.at} /></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Site keys" description="A key lets the website read its published posts. Keep it on the server — in an environment variable — never in browser code.">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await createKey(workspace, label)
            if (!r.ok) return void toast.error(r.error)
            setLabel('')
            setNewKey(r.key)
            router.refresh()
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Production site" maxLength={60} />
          <Button type="submit" variant="brand" className="shrink-0">
            <Plus weight="bold" /> New key
          </Button>
        </form>
        <ul className="flex flex-col gap-2">
          {keys.length === 0 && <li className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No keys yet.</li>}
          {keys.map((k) => (
            <li key={k.id} className={cn('flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3', k.revokedAt && 'opacity-55')}>
              <span className="grid size-9 place-items-center rounded-xl bg-sunken text-muted">
                <Key size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{k.label}</span>
                  {k.revokedAt ? <Badge tone="danger">Revoked</Badge> : <Badge tone="ok">Active</Badge>}
                </div>
                <span className="font-mono text-[12px] text-muted">
                  cms_{k.prefix}_•••• · {k.lastUsedAt ? <TimeAgo date={k.lastUsedAt} prefix="used " /> : 'never used'}
                </span>
              </div>
              {!k.revokedAt && (
                <Button variant="danger-ghost" size="sm" onClick={() => setRevoking(k)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Connect the site" description="Put these in the website’s environment (for example its .env.local), then deploy.">
        <div className="overflow-hidden rounded-2xl bg-[#111113] text-[12.5px] text-[#e6e5e1]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="font-mono text-[11px] text-white/50">.env.local</span>
            <button
              type="button"
              className="flex items-center gap-1 text-[11.5px] text-white/60 hover:text-white"
              onClick={() =>
                copy(`CMS_URL=${cmsUrl}\nCMS_SITE_KEY=${active[0] ? `cms_${active[0].prefix}_…` : '<create a key>'}\nCMS_WEBHOOK_SECRET=${secret ?? '<reveal below>'}\nSITE_URL=${siteUrl || 'https://…'}`)
              }
            >
              <Copy size={12} /> Copy
            </button>
          </div>
          <pre className="overflow-x-auto px-4 py-3 font-mono leading-relaxed">
            <span className="text-white/45">CMS_URL=</span>
            {cmsUrl}
            {'\n'}
            <span className="text-white/45">CMS_SITE_KEY=</span>
            {active[0] ? `cms_${active[0].prefix}_… (shown once when created)` : '<create a key above>'}
            {'\n'}
            <span className="text-white/45">CMS_WEBHOOK_SECRET=</span>
            {secret ?? '••••••••••••••••'}
            {'\n'}
            <span className="text-white/45">SITE_URL=</span>
            {siteUrl || 'https://…'}
          </pre>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const r = await revealWebhookSecret(workspace)
              if (r.ok) setSecret(r.secret)
              else toast.error(r.error)
            }}
          >
            <Eye /> Reveal webhook secret
          </Button>
          {isAgency && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const r = await rotateSecret(workspace)
                if (r.ok) {
                  setSecret(r.secret)
                  toast.success('New secret made', { description: 'Update CMS_WEBHOOK_SECRET on the site.' })
                } else toast.error(r.error)
              }}
            >
              <ArrowsClockwise /> Rotate secret
            </Button>
          )}
        </div>
      </Section>

      <Dialog
        open={newKey !== null}
        onOpenChange={(o) => !o && setNewKey(null)}
        title="Your new site key"
        description="Copy it now. For your safety it is never shown again — if you lose it, revoke it and make another."
        footer={
          <Button variant="ink" onClick={() => setNewKey(null)}>
            I have copied it
          </Button>
        }
      >
        <AnimatePresence>
          {newKey && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2 rounded-2xl bg-sunken p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-ink">{newKey}</code>
              <Button size="sm" variant="brand" onClick={() => copy(newKey)}>
                <Copy /> Copy
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Dialog>

      <Confirm
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.label}”?`}
        description="Any website using this key stops getting content on its next request. This cannot be undone."
        confirmLabel="Revoke key"
        danger
        onConfirm={async () => {
          if (!revoking) return
          const r = await revokeKey(workspace, revoking.id)
          if (r.ok) toast.success('Key revoked')
          else toast.error(r.error ?? 'Could not revoke')
          setRevoking(null)
          router.refresh()
        }}
      />
    </div>
  )
}
