'use client'

import { useEffect, useRef, useState } from 'react'
import { animate, motion, useInView } from 'motion/react'
import { Tooltip as T } from 'radix-ui'
import { cn } from '@/lib/utils'

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-grid h-5 min-w-5 place-items-center rounded-md border border-line-strong bg-surface px-1 font-mono text-[10.5px] font-medium text-muted shadow-[0_1px_0_var(--line-strong)]', className)}>
      {children}
    </kbd>
  )
}

/** Counts up from 0 when it scrolls into view. */
export function NumberTicker({ value, className, duration = 1.1 }: { value: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) })
    return () => controls.stop()
  }, [inView, value, duration])
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {shown.toLocaleString('en-GB')}
    </span>
  )
}

export function Tooltip({ label, children, side = 'top' }: { label: React.ReactNode; children: React.ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            side={side}
            sideOffset={8}
            className="z-50 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-canvas shadow-float data-[state=delayed-open]:animate-[menu-in_160ms_cubic-bezier(0.16,1,0.3,1)]"
          >
            {label}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  )
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-[20px] border border-line bg-surface shadow-card', className)} {...props}>
      {children}
    </div>
  )
}

/** Children fade and rise in, one after another. */
export function Stagger({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  )
}

export const riseIn = {
  hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 260, damping: 28 } },
}

export function Rise({ children, className, as = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'li' | 'section' }) {
  const Comp = motion[as]
  return (
    <Comp className={className} variants={riseIn}>
      {children}
    </Comp>
  )
}

export function EmptyState({
  title,
  body,
  action,
  art,
  className,
}: {
  title: string
  body?: React.ReactNode
  action?: React.ReactNode
  art?: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex flex-col items-center justify-center rounded-[24px] border border-dashed border-line-strong px-6 py-16 text-center', className)}
    >
      {art && <div className="mb-5 text-faint">{art}</div>}
      <h3 className="font-serif text-[30px] leading-tight text-ink">{title}</h3>
      {body && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  )
}
