'use client'

import { useId } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * A row of options with a pill that slides to the active one. Works as tabs
 * (onChange) or as links (render an <a> via `href`).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: { value: T; label: React.ReactNode; count?: number; href?: string }[]
  value: T
  onChange?: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  const group = useId()
  return (
    <div role="tablist" className={cn('relative inline-flex items-center gap-0.5 rounded-full bg-sunken p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        const inner = (
          <>
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--line)]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {o.label}
              {typeof o.count === 'number' && (
                <span className={cn('font-mono text-[11px] tabular-nums', active ? 'text-muted' : 'text-faint')}>{o.count}</span>
              )}
            </span>
          </>
        )
        const cls = cn(
          'relative rounded-full font-medium transition-colors',
          size === 'sm' ? 'px-3 py-1 text-[13px]' : 'px-3.5 py-1.5 text-sm',
          active ? 'text-ink' : 'text-muted hover:text-ink'
        )
        return o.href ? (
          <a key={o.value} href={o.href} role="tab" aria-selected={active} className={cls} onClick={(e) => {
            if (onChange) {
              e.preventDefault()
              onChange(o.value)
            }
          }}>
            {inner}
          </a>
        ) : (
          <button key={o.value} type="button" role="tab" aria-selected={active} className={cls} onClick={() => onChange?.(o.value)}>
            {inner}
          </button>
        )
      })}
    </div>
  )
}
