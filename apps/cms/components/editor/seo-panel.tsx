'use client'

import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Check, X } from '@phosphor-icons/react'
import { Field, Input, Textarea } from '@/components/ui/field'
import { slugify } from '@/lib/slug'
import { cn } from '@/lib/utils'

const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

function cut(text: string, limit: number) {
  if (text.length <= limit) return text
  const c = text.slice(0, limit)
  const sp = c.lastIndexOf(' ')
  return `${(sp > 20 ? c.slice(0, sp) : c).trimEnd()}…`
}

/**
 * What the post looks like in a search result, plus a short list of checks
 * against the focus keyword. The checks are advice — none of them blocks saving.
 */
export function SeoPanel({
  siteUrl,
  basePath,
  title,
  seoTitle,
  description,
  slug,
  focusKeyword,
  bodyText,
  words,
  hasCover,
  coverAlt,
  hasHeading,
  tagCount,
  errors,
  onSeoTitle,
  onDescription,
  onFocusKeyword,
}: {
  siteUrl: string
  basePath: string
  title: string
  seoTitle: string
  description: string
  slug: string
  focusKeyword: string
  bodyText: string
  words: number
  hasCover: boolean
  coverAlt: string
  hasHeading: boolean
  tagCount: number
  errors: Record<string, string>
  onSeoTitle: (v: string) => void
  onDescription: (v: string) => void
  onFocusKeyword: (v: string) => void
}) {
  const effective = seoTitle.trim() || title.trim()
  const checks = useMemo(() => {
    const k = focusKeyword.trim().toLowerCase()
    const list = [
      { label: 'Title fits a search result', pass: effective.length >= 20 && effective.length <= TITLE_MAX },
      { label: 'Description is 70–160 characters', pass: description.trim().length >= 70 && description.trim().length <= DESCRIPTION_MAX },
      { label: 'At least 300 words', pass: words >= 300 },
      { label: 'Uses headings', pass: hasHeading },
      { label: 'Cover image has alt text', pass: hasCover && coverAlt.trim().length > 0 },
      { label: 'Has a tag', pass: tagCount > 0 },
    ]
    if (!k) return [{ label: 'Focus keyword is set', pass: false }, ...list]
    return [
      { label: 'Keyword in the title', pass: effective.toLowerCase().includes(k) },
      { label: 'Keyword in the description', pass: description.toLowerCase().includes(k) },
      { label: 'Keyword in the address', pass: slugify(k).length > 0 && slug.includes(slugify(k)) },
      { label: 'Keyword in the text', pass: bodyText.toLowerCase().includes(k) },
      ...list,
    ]
  }, [focusKeyword, effective, description, slug, bodyText, words, hasHeading, hasCover, coverAlt, tagCount])
  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100)
  const host = siteUrl ? siteUrl.replace(/^https?:\/\//, '') : 'yoursite.com'

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
          <span className="grid size-5 place-items-center rounded-full bg-sunken text-[10px] font-semibold text-ink">{host.slice(0, 1).toUpperCase()}</span>
          <span className="truncate">
            {host} › {basePath.replace(/^\//, '')} › {slug || 'your-post'}
          </span>
        </div>
        <p className="line-clamp-1 text-[18px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{cut(effective || 'Your post title', TITLE_MAX)}</p>
        <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-ink-2">{description ? cut(description, DESCRIPTION_MAX) : 'Write a description — it is the grey text under the title.'}</p>
      </div>

      <Field label="Meta description" error={errors.description} counter={{ value: description.length, max: 320, soft: DESCRIPTION_MAX }} hint="What search results and link previews show. One or two sentences.">
        {(p) => <Textarea {...p} value={description} onChange={(e) => onDescription(e.target.value)} rows={3} maxLength={320} />}
      </Field>
      <Field label="SEO title" error={errors.seoTitle} counter={{ value: effective.length, max: 80, soft: TITLE_MAX }} hint="Leave empty to use the post title.">
        {(p) => <Input {...p} value={seoTitle} onChange={(e) => onSeoTitle(e.target.value)} placeholder={title || 'Defaults to the title'} maxLength={80} />}
      </Field>
      <Field label="Focus keyword" error={errors.focusKeyword} hint="Never published. The checks below measure against it.">
        {(p) => <Input {...p} value={focusKeyword} onChange={(e) => onFocusKeyword(e.target.value)} placeholder="e.g. website planning" maxLength={60} />}
      </Field>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-2">Checks</span>
          <span className={cn('font-mono text-[12px]', score >= 80 ? 'text-ok' : score >= 50 ? 'text-warn' : 'text-danger')}>{score}%</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-sunken">
          <motion.div className={cn('h-full rounded-full', score >= 80 ? 'bg-ok' : score >= 50 ? 'bg-warn' : 'bg-danger')} animate={{ width: `${score}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        </div>
        <ul className="flex flex-col gap-1.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 text-[13px]">
              <motion.span
                key={String(c.pass)}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                className={cn('grid size-[18px] place-items-center rounded-full', c.pass ? 'bg-ok-soft text-ok' : 'bg-sunken text-faint')}
              >
                {c.pass ? <Check size={11} weight="bold" /> : <X size={10} weight="bold" />}
              </motion.span>
              <span className={c.pass ? 'text-ink-2' : 'text-muted'}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
