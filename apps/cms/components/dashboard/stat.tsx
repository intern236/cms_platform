'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { NumberTicker, riseIn } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

/** A bento tile with a big number. Optional link turns the whole tile into a button. */
export function StatTile({
  label,
  value,
  hint,
  href,
  tone = 'plain',
  icon,
  className,
  span,
}: {
  label: string
  value: number
  hint?: React.ReactNode
  href?: string
  tone?: 'plain' | 'brand' | 'ink'
  icon?: React.ReactNode
  className?: string
  /** Grid placement classes, e.g. "col-span-2". */
  span?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className={cn('font-mono text-[11px] uppercase tracking-[0.12em]', tone === 'plain' ? 'text-muted' : 'opacity-75')}>{label}</span>
        {href ? (
          <ArrowUpRight size={16} className="opacity-40 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
        ) : (
          icon
        )}
      </div>
      <div className="mt-auto">
        <NumberTicker value={value} className="block font-serif text-[64px] leading-none tracking-[-0.03em]" />
        {hint && <div className={cn('mt-2 text-[13px]', tone === 'plain' ? 'text-muted' : 'opacity-80')}>{hint}</div>}
      </div>
    </>
  )
  const cls = cn(
    'group relative flex min-h-[176px] flex-col overflow-hidden rounded-[22px] p-5 transition-[transform,box-shadow] duration-500 ease-out-expo',
    tone === 'plain' && 'border border-line bg-surface shadow-card',
    tone === 'brand' && 'grain bg-brand text-brand-fg',
    tone === 'ink' && 'bg-ink text-canvas',
    href && 'hover:-translate-y-1 hover:shadow-float',
    'h-full',
    className
  )
  return (
    <motion.div variants={riseIn} className={cn('min-w-0', span)}>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </motion.div>
  )
}
