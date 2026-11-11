'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Check, Trash, UploadSimple } from '@phosphor-icons/react'
import { removeLogo, saveBranding, uploadLogo } from '@/lib/actions/workspace'
import { WorkspaceMark } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { SaveBar, Section } from './save-bar'

const SWATCHES = ['#ff5b2e', '#e11d48', '#db2777', '#9333ea', '#4d5bd8', '#0284c7', '#0d9488', '#2f7d5b', '#65a30d', '#ca8a04', '#b45309', '#18181b']

function readable(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#0a0a0a'
}

export function BrandingForm({
  workspace,
  initial,
}: {
  workspace: string
  initial: { name: string; accent: string; hasLogo: boolean; version: number }
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [accent, setAccent] = useState(initial.accent)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [uploading, startUpload] = useTransition()
  const file = useRef<HTMLInputElement>(null)
  const dirty = name !== initial.name || accent.toLowerCase() !== initial.accent.toLowerCase()
  const valid = /^#[0-9a-f]{6}$/i.test(accent)
  const fg = valid ? readable(accent) : '#ffffff'

  async function save() {
    setBusy(true)
    const r = await saveBranding(workspace, { name, accent })
    setBusy(false)
    if (!r.ok) return setErrors(r.errors ?? {})
    setErrors({})
    toast.success('Branding saved')
    router.refresh()
  }

  return (
    <div className="pb-24">
      <Section title="Identity" description="What this client's team sees: on their sign-in page, in the sidebar and in every email the CMS sends them.">
        <Field label="Name" error={errors.name}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </Field>
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-medium text-ink-2">Logo</span>
          <div className="flex items-center gap-4">
            <WorkspaceMark slug={workspace} name={name} accent={valid ? accent : initial.accent} hasLogo={initial.hasLogo} size={64} version={initial.version} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" loading={uploading} onClick={() => file.current?.click()}>
                <UploadSimple /> {initial.hasLogo ? 'Replace' : 'Upload'}
              </Button>
              {initial.hasLogo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    startUpload(async () => {
                      await removeLogo(workspace)
                      router.refresh()
                    })
                  }
                >
                  <Trash /> Remove
                </Button>
              )}
            </div>
          </div>
          <p className="text-[12.5px] text-muted">PNG, JPG, WebP or SVG, up to 256 KB. A square mark or a short wordmark works best. PNG shows in every email client.</p>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const form = new FormData()
              form.set('logo', f)
              startUpload(async () => {
                const r = await uploadLogo(workspace, form)
                if (r.ok) toast.success('Logo updated')
                else toast.error(r.error ?? 'Upload failed')
                router.refresh()
              })
            }}
          />
        </div>
      </Section>

      <Section title="Colour" description="Drives buttons, highlights and the sign-in canvas. Text on it switches between black and white automatically to stay readable.">
        <div className="flex flex-wrap gap-2.5">
          {SWATCHES.map((c) => (
            <motion.button
              key={c}
              type="button"
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setAccent(c)}
              className="relative grid size-10 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]"
              style={{ background: c }}
              aria-label={`Use ${c}`}
            >
              {accent.toLowerCase() === c && (
                <motion.span layoutId="swatch" className="absolute -inset-1 rounded-full shadow-[0_0_0_2px_var(--ink)]" />
              )}
              {accent.toLowerCase() === c && <Check size={16} weight="bold" style={{ color: readable(c) }} />}
            </motion.button>
          ))}
          <label className="relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title="Custom colour">
            <input type="color" value={valid ? accent : '#000000'} onChange={(e) => setAccent(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <Field label="Hex" error={errors.accent ?? (!valid ? 'Use a 6-digit hex like #ff5b2e' : undefined)}>
          {(p) => <Input {...p} value={accent} onChange={(e) => setAccent(e.target.value.trim())} className="max-w-40 font-mono" maxLength={7} />}
        </Field>

        <div className="mt-2">
          <span className="text-[13px] font-medium text-ink-2">Preview</span>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_1fr]">
            <div
              className="grain relative flex h-48 flex-col justify-between overflow-hidden rounded-[20px] p-5 text-white"
              style={{ background: `color-mix(in oklab, ${valid ? accent : initial.accent} 88%, black)` }}
            >
              <div className="absolute -left-10 -top-10 size-48 animate-drift rounded-full opacity-80 blur-3xl" style={{ background: `color-mix(in oklab, ${valid ? accent : initial.accent} 65%, white)` }} />
              <div className="relative flex items-center gap-2 text-[13px] font-medium">
                <WorkspaceMark slug={workspace} name={name} accent={valid ? accent : initial.accent} hasLogo={initial.hasLogo} size={26} version={initial.version} />
                {name}
              </div>
              <p className="relative font-serif text-[34px] leading-none">Publish with care.</p>
            </div>
            <div className="flex flex-col justify-center gap-3 rounded-[20px] border border-line bg-surface p-5">
              <div className="h-9 rounded-xl shadow-[inset_0_0_0_1px_var(--line-strong)]" />
              <div className="h-9 rounded-xl shadow-[inset_0_0_0_1px_var(--line-strong)]" />
              <div className={cn('grid h-10 place-items-center rounded-full text-sm font-medium')} style={{ background: valid ? accent : initial.accent, color: fg }}>
                Sign in
              </div>
            </div>
          </div>
        </div>
      </Section>

      <SaveBar show={dirty} busy={busy} onSave={save} onReset={() => (setName(initial.name), setAccent(initial.accent))} />
    </div>
  )
}
