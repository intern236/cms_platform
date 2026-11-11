'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'

/** Slides up from the bottom when a form has unsaved changes. */
export function SaveBar({ show, busy, onSave, onReset, label = 'Save changes' }: { show: boolean; busy: boolean; onSave: () => void; onReset: () => void; label?: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-full border border-line bg-ink py-2 pl-5 pr-2 text-canvas shadow-float lg:left-[calc(264px+12px)]"
        >
          <span className="flex-1 text-sm">You have unsaved changes</span>
          <Button variant="ghost" size="sm" className="text-canvas/70 hover:bg-white/10 hover:text-canvas" onClick={onReset}>
            Discard
          </Button>
          <Button variant="brand" size="sm" loading={busy} onClick={onSave}>
            {label}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Section({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-line py-10 first:border-t-0 first:pt-2 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12">
      <div>
        <h2 className="font-serif text-[26px] leading-none tracking-[-0.01em] text-ink">{title}</h2>
        {description && <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  )
}
