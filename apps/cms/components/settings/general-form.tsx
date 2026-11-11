'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, Trash } from '@phosphor-icons/react'
import { saveSiteSettings } from '@/lib/actions/workspace'
import { SOCIAL_PLATFORMS, type WorkspaceSettings } from '@/lib/workspaces/settings'
import { TagInput } from '@/components/editor/tag-input'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SwitchRow } from '@/components/ui/switch'
import { SaveBar, Section } from './save-bar'

export function GeneralForm({ workspace, initial }: { workspace: string; initial: WorkspaceSettings }) {
  const router = useRouter()
  const [s, setS] = useState<WorkspaceSettings>(initial)
  const [base, setBase] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(base), [s, base])
  const set = <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => setS((prev) => ({ ...prev, [key]: value }))
  const blog = (patch: Partial<WorkspaceSettings['blog']>) => set('blog', { ...s.blog, ...patch })
  const cta = (patch: Partial<WorkspaceSettings['cta']>) => set('cta', { ...s.cta, ...patch })
  const contact = (patch: Partial<WorkspaceSettings['contact']>) => set('contact', { ...s.contact, ...patch })

  async function save() {
    setBusy(true)
    const r = await saveSiteSettings(workspace, s)
    setBusy(false)
    if (!r.ok) {
      setErrors(r.errors ?? {})
      toast.error('Not saved', { description: r.error ?? Object.values(r.errors ?? {})[0] })
      return
    }
    setErrors({})
    setBase(s)
    toast.success('Settings saved', { description: 'Your site picks them up within a minute.' })
    router.refresh()
  }

  return (
    <div className="pb-24">
      <Section title="Site" description="Used in search results, share cards and the site footer.">
        <Field label="Description" error={errors.description} counter={{ value: s.description.length, max: 300 }}>
          {(p) => <Textarea {...p} rows={3} value={s.description} onChange={(e) => set('description', e.target.value)} maxLength={300} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Legal name" error={errors.legalName}>
            {(p) => <Input {...p} value={s.legalName} onChange={(e) => set('legalName', e.target.value)} />}
          </Field>
          <Field label="Language" error={errors.language} hint="e.g. en, en-GB, hi">
            {(p) => <Input {...p} value={s.language} onChange={(e) => set('language', e.target.value)} />}
          </Field>
          <Field label="Date format" error={errors.dateLocale} hint={new Date().toLocaleDateString(safeLocale(s.dateLocale), { day: 'numeric', month: 'short', year: 'numeric' })}>
            {(p) => (
              <Select {...p} value={s.dateLocale} onChange={(e) => set('dateLocale', e.target.value)}>
                {['en-GB', 'en-US', 'en-IN', 'en-AU', 'de-DE', 'fr-FR', 'es-ES', 'nl-NL', 'hi-IN'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-2">Social profiles</span>
          <AnimatePresence initial={false}>
            {s.social.map((link, i) => (
              <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex gap-2">
                <div className="w-40 shrink-0">
                  <Select
                    value={link.platform}
                    onChange={(e) => set('social', s.social.map((l, j) => (j === i ? { ...l, platform: e.target.value as (typeof SOCIAL_PLATFORMS)[number] } : l)))}
                  >
                    {SOCIAL_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p === 'x' ? 'X' : p[0].toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Input
                  value={link.url}
                  aria-invalid={errors[`social.${i}.url`] ? true : undefined}
                  onChange={(e) => set('social', s.social.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                  placeholder="https://"
                />
                <button type="button" onClick={() => set('social', s.social.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-xl text-faint hover:bg-danger-soft hover:text-danger" aria-label="Remove">
                  <Trash size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {s.social.length < 8 && (
            <button type="button" onClick={() => set('social', [...s.social, { platform: 'linkedin', url: '' }])} className="flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-sunken hover:text-ink">
              <Plus size={13} weight="bold" /> Add a profile
            </button>
          )}
        </div>
      </Section>

      <Section title="Blog" description="How the blog section of the site behaves.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Blog title" error={errors['blog.title']}>
            {(p) => <Input {...p} value={s.blog.title} onChange={(e) => blog({ title: e.target.value })} maxLength={60} />}
          </Field>
          <Field label="Posts per page" error={errors['blog.postsPerPage']}>
            {(p) => <Input {...p} type="number" min={3} max={48} value={s.blog.postsPerPage} onChange={(e) => blog({ postsPerPage: Number(e.target.value) })} />}
          </Field>
        </div>
        <Field label="Blog description" error={errors['blog.description']}>
          {(p) => <Textarea {...p} rows={2} value={s.blog.description} onChange={(e) => blog({ description: e.target.value })} maxLength={300} />}
        </Field>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
          <SwitchRow title="Authors" description="Bylines with photos, and a profile page per author." checked={s.blog.authors} onCheckedChange={(v) => blog({ authors: v })} />
          <SwitchRow title="FAQ sections" description="Questions and answers under a post, marked up for search." checked={s.blog.faqs} onCheckedChange={(v) => blog({ faqs: v })} />
          <SwitchRow title="HTML-page posts" description="Paste a whole designed page as a post." checked={s.blog.htmlPages} onCheckedChange={(v) => blog({ htmlPages: v })} />
          <SwitchRow title="Mid-article call to action" description="Show the call to action halfway through long posts." checked={s.blog.midPostCta} onCheckedChange={(v) => blog({ midPostCta: v })} />
        </div>
      </Section>

      <Section title="Call to action" description="The band at the end of every post that asks readers to get in touch.">
        <div className="rounded-2xl border border-line bg-surface px-4">
          <SwitchRow title="Show a call to action" checked={s.cta.enabled} onCheckedChange={(v) => cta({ enabled: v })} />
        </div>
        <AnimatePresence initial={false}>
          {s.cta.enabled && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-5 overflow-hidden">
              <Field label="Heading" error={errors['cta.heading']}>
                {(p) => <Input {...p} value={s.cta.heading} onChange={(e) => cta({ heading: e.target.value })} maxLength={100} />}
              </Field>
              <Field label="Body" error={errors['cta.body']}>
                {(p) => <Textarea {...p} rows={2} value={s.cta.body} onChange={(e) => cta({ body: e.target.value })} maxLength={300} />}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Button label" error={errors['cta.label']}>
                  {(p) => <Input {...p} value={s.cta.label} onChange={(e) => cta({ label: e.target.value })} maxLength={40} />}
                </Field>
                <Field label="Button link" error={errors['cta.href']}>
                  {(p) => <Input {...p} value={s.cta.href} onChange={(e) => cta({ href: e.target.value })} placeholder="/contact" />}
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      <Section title="Contact form" description="Messages arrive in the Inbox. Optionally email them too.">
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
          <SwitchRow title="Accept messages" checked={s.contact.enabled} onCheckedChange={(v) => contact({ enabled: v })} />
          <SwitchRow title="Send a confirmation to the visitor" checked={s.contact.confirmation} onCheckedChange={(v) => contact({ confirmation: v })} />
        </div>
        <Field label="Email new messages to" error={Object.entries(errors).find(([k]) => k.startsWith('contact.notifyEmails'))?.[1]} hint="Up to five addresses. Leave empty to only use the Inbox.">
          {() => <TagInput value={s.contact.notifyEmails} onChange={(v) => contact({ notifyEmails: v })} suggestions={[]} max={5} placeholder="name@company.com" />}
        </Field>
        {s.contact.confirmation && (
          <Field label="Confirmation subject" error={errors['contact.confirmationSubject']}>
            {(p) => <Input {...p} value={s.contact.confirmationSubject} onChange={(e) => contact({ confirmationSubject: e.target.value })} maxLength={120} />}
          </Field>
        )}
        <Field label="Topics" hint="Optional. Visitors pick one; you can filter by it later.">
          {() => <TagInput value={s.contact.topics} onChange={(v) => contact({ topics: v })} suggestions={['New project', 'Support', 'Partnership', 'Careers', 'Something else']} max={12} placeholder="Add a topic…" />}
        </Field>
      </Section>

      <SaveBar show={dirty} busy={busy} onSave={save} onReset={() => (setS(base), setErrors({}))} />
    </div>
  )
}

function safeLocale(l: string) {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(l).length ? l : 'en-GB'
  } catch {
    return 'en-GB'
  }
}
