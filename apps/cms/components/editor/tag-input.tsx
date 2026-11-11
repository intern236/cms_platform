'use client'

import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { slugify } from '@/lib/slug'
import { cn } from '@/lib/utils'

/** Tags as chips. Enter or comma adds, Backspace on empty removes, suggestions from tags already in use. */
export function TagInput({
  value,
  onChange,
  suggestions,
  max = 12,
  placeholder = 'Add a tag…',
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
  max?: number
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const have = useMemo(() => new Set(value.map(slugify)), [value])
  const matches = useMemo(() => {
    const q = slugify(draft)
    return suggestions.filter((s) => !have.has(slugify(s)) && (!q || slugify(s).includes(q))).slice(0, 6)
  }, [draft, suggestions, have])

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,+$/, '').slice(0, 40)
    if (!tag || have.has(slugify(tag)) || value.length >= max || !slugify(tag)) return
    onChange([...value, tag])
    setDraft('')
  }

  return (
    <div className="relative">
      <div
        onClick={() => input.current?.focus()}
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl bg-surface px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--line-strong)] transition-shadow',
          focused && 'shadow-[inset_0_0_0_1.5px_var(--brand),var(--ring)]'
        )}
      >
        <AnimatePresence initial={false}>
          {value.map((tag) => (
            <motion.span
              key={tag}
              layout
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="inline-flex items-center gap-1 rounded-full bg-sunken py-1 pl-2.5 pr-1 text-[13px] font-medium text-ink"
            >
              {tag}
              <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="grid size-4 place-items-center rounded-full text-muted hover:bg-line hover:text-ink" aria-label={`Remove ${tag}`}>
                <X size={10} weight="bold" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          ref={input}
          value={draft}
          onChange={(e) => {
            const v = e.target.value
            if (v.endsWith(',')) add(v)
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 120)
            if (draft) add(draft)
          }}
          placeholder={value.length ? '' : placeholder}
          disabled={value.length >= max}
          className="min-w-24 flex-1 bg-transparent px-1.5 py-1 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:shadow-none"
        />
      </div>
      <AnimatePresence>
        {focused && matches.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-float"
          >
            {matches.map((m) => (
              <li key={m}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)} className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-ink hover:bg-sunken">
                  {m}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
