'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/** The serif title every page opens with. Words rise in one after another. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: string
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  const words = title.split(' ')
  return (
    <header className={cn('flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {eyebrow}
          </motion.div>
        )}
        <h1 className="font-serif text-[44px] leading-[0.95] tracking-[-0.02em] text-ink sm:text-[56px]">
          {words.map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-top">
              <motion.span
                className="inline-block"
                initial={{ y: '105%' }}
                animate={{ y: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 26, delay: 0.04 * i }}
              >
                {w}
                {i < words.length - 1 ? ' ' : ''}
              </motion.span>
            </span>
          ))}
        </h1>
        {description && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted"
          >
            {description}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </motion.div>
      )}
    </header>
  )
}
