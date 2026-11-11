'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowRight, Copy } from '@phosphor-icons/react'
import { createClient } from '@/lib/actions/agency'
import { WorkspaceMark } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const SWATCHES = ['#ff5b2e', '#e11d48', '#9333ea', '#4d5bd8', '#0284c7', '#0d9488', '#2f7d5b', '#ca8a04', '#18181b']

function toSlug(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** Add a client: the card on the right is what their workspace will look like. */
export function NewClientForm({ cmsHost }: { cmsHost: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [siteUrl, setSiteUrl] = useState('')
  const [accent, setAccent] = useState(SWATCHES[0])
  const [ownerEmail, setOwnerEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<{ url: string; slug: string } | null>(null)
  const effectiveSlug = slugTouched ? slug : toSlug(name)

  async function submit() {
    setBusy(true)
    const r = await createClient({ name, slug: effectiveSlug, siteUrl, accent, ownerEmail })
    setBusy(false)
    if (!r.ok) {
      setErrors(r.errors ?? { form: r.error ?? 'Could not create the client.' })
      return
    }
    toast.success(`${name} is ready`, { description: r.message })
    if (r.url) setLink({ url: r.url, slug: r.slug! })
    else router.push(`/${r.slug}/settings?tab=website`)
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {errors.form && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{errors.form}</p>}
        <Field label="Client name" error={errors.name}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Studio" autoFocus required maxLength={80} />}
        </Field>
        <Field label="Workspace address" error={errors.slug} hint="Their sign-in page lives here. It cannot be changed later.">
          {(p) => (
            <div className="flex items-center overflow-hidden rounded-xl bg-surface shadow-[inset_0_0_0_1px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_1.5px_var(--brand),var(--ring)]">
              <span className="shrink-0 bg-surface-2 py-3 pl-3.5 pr-1 font-mono text-[12.5px] text-faint">{cmsHost}/</span>
              <input
                {...p}
                value={effectiveSlug}
                onChange={(e) => {
                  setSlug(toSlug(e.target.value))
                  setSlugTouched(true)
                }}
                className="h-11 min-w-0 flex-1 bg-transparent pr-3 font-mono text-[13.5px] focus:outline-none"
              />
            </div>
          )}
        </Field>
        <Field label="Their website" error={errors.siteUrl} hint="Optional now — you can connect it later.">
          {(p) => <Input {...p} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://acme.com" />}
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-2">Brand colour</span>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAccent(c)}
                className={cn('size-9 rounded-full transition-transform hover:scale-110', accent === c && 'ring-2 ring-ink ring-offset-2 ring-offset-canvas')}
                style={{ background: c }}
                aria-label={`Use ${c}`}
              />
            ))}
            <label className="relative size-9 cursor-pointer overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title="Custom">
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
        <Field label="Invite their owner" error={errors.email} hint="Optional. They get an email to set a password and can then invite their own team.">
          {(p) => <Input {...p} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@acme.com" />}
        </Field>
        <Button type="submit" variant="brand" size="lg" loading={busy} className="group mt-2 self-start">
          Create workspace <ArrowRight className="transition-transform group-hover:translate-x-1" weight="bold" />
        </Button>
        <AnimatePresence>
          {link && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-warn-soft p-4 text-[13px] text-warn">
              <p className="font-medium">Email is not set up on this server — send the owner this invite link yourself:</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2 py-1.5 font-mono text-[12px] text-ink">{link.url}</code>
                <Button size="xs" variant="ink" type="button" onClick={() => (navigator.clipboard.writeText(link.url), toast.success('Copied'))}>
                  <Copy /> Copy
                </Button>
              </div>
              <Button size="sm" variant="ink" className="mt-3" type="button" onClick={() => router.push(`/${link.slug}/settings?tab=website`)}>
                Continue to the workspace
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      <div className="lg:sticky lg:top-12 lg:self-start">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Preview</span>
        <motion.div layout className="mt-3 overflow-hidden rounded-[24px] border border-line bg-surface shadow-float">
          <motion.div
            className="grain relative h-40 overflow-hidden"
            animate={{ background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 55%, black))` }}
            transition={{ duration: 0.5 }}
          >
            <div className="absolute -bottom-10 -right-6 size-40 animate-drift rounded-full opacity-60 blur-2xl" style={{ background: `color-mix(in oklab, ${accent} 50%, white)` }} />
            <div className="absolute left-5 top-5">
              <WorkspaceMark slug="preview" name={name || 'New client'} accent={accent} hasLogo={false} size={52} className="shadow-lg ring-2 ring-white/30" />
            </div>
            <p className="absolute bottom-4 left-5 font-serif text-[28px] leading-none text-white">Write it down.</p>
          </motion.div>
          <div className="p-5">
            <h3 className="truncate text-[17px] font-semibold tracking-[-0.015em]">{name || 'New client'}</h3>
            <p className="mt-0.5 truncate font-mono text-[12.5px] text-muted">
              {cmsHost}/{effectiveSlug || 'address'}/login
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
