'use client'

import { AnimatePresence, Reorder, motion } from 'motion/react'
import { DotsSixVertical, Plus, Trash } from '@phosphor-icons/react'
import { Textarea, inputStyles } from '@/components/ui/field'
import { cn } from '@/lib/utils'

export type FaqDraft = { key: string; question: string; answer: string }

/** Questions and answers, published as an FAQ section with schema. Drag to reorder. */
export function FaqFields({ value, onChange, error }: { value: FaqDraft[]; onChange: (v: FaqDraft[]) => void; error?: string }) {
  const update = (key: string, patch: Partial<FaqDraft>) => onChange(value.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-muted">
        Shown as an FAQ under the post, and marked up so search engines can show them as answers. Plain text, two or three sentences each.
      </p>
      <Reorder.Group axis="y" values={value} onReorder={onChange} className="flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {value.map((f, i) => (
            <Reorder.Item
              key={f.key}
              value={f}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group rounded-2xl border border-line bg-surface p-3"
            >
              <div className="flex items-start gap-2">
                <span className="mt-2 cursor-grab text-faint active:cursor-grabbing">
                  <DotsSixVertical size={16} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    value={f.question}
                    onChange={(e) => update(f.key, { question: e.target.value })}
                    placeholder={`Question ${i + 1}`}
                    maxLength={200}
                    className={cn(inputStyles, 'h-10 font-medium')}
                  />
                  <Textarea value={f.answer} onChange={(e) => update(f.key, { answer: e.target.value })} placeholder="The answer" maxLength={900} rows={2} className="min-h-16 text-sm" />
                  {(!f.question.trim() || !f.answer.trim()) && (f.question || f.answer) && (
                    <span className="text-[12px] text-warn">Needs both a question and an answer to be published.</span>
                  )}
                </div>
                <button type="button" onClick={() => onChange(value.filter((x) => x.key !== f.key))} className="mt-1 grid size-8 place-items-center rounded-full text-faint opacity-0 transition hover:bg-danger-soft hover:text-danger group-hover:opacity-100" aria-label="Remove question">
                  <Trash size={15} />
                </button>
              </div>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
      {error && <p className="text-[12.5px] font-medium text-danger">{error}</p>}
      {value.length < 12 && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => onChange([...value, { key: Math.random().toString(36).slice(2), question: '', answer: '' }])}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-[13px] font-medium text-muted transition hover:border-ink hover:text-ink"
        >
          <Plus size={14} weight="bold" /> Add a question
        </motion.button>
      )}
    </div>
  )
}
