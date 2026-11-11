'use client'

import { forwardRef, useId } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'

export const inputStyles =
  'w-full rounded-xl bg-surface px-3.5 text-[15px] text-ink placeholder:text-faint shadow-[inset_0_0_0_1px_var(--line-strong)] transition-[box-shadow,background-color] duration-200 hover:shadow-[inset_0_0_0_1px_var(--faint)] focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--brand),var(--ring)] disabled:opacity-60 aria-[invalid=true]:shadow-[inset_0_0_0_1.5px_var(--danger)]'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(inputStyles, 'h-11', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return <textarea ref={ref} className={cn(inputStyles, 'min-h-24 py-2.5 leading-relaxed', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(inputStyles, 'h-11 appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
})

/**
 * Label + control + hint + animated error. Pass a render function to get the
 * ids wired up for accessibility.
 */
export function Field({
  label,
  hint,
  error,
  counter,
  className,
  children,
}: {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  counter?: { value: number; max: number; soft?: number }
  className?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode
}) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || counter) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
              {label}
            </label>
          )}
          {counter && (
            <span
              className={cn(
                'font-mono text-[11px] tabular-nums text-faint transition-colors',
                counter.soft && counter.value > counter.soft && 'text-warn',
                counter.value > counter.max && 'text-danger'
              )}
            >
              {counter.value}/{counter.soft ?? counter.max}
            </span>
          )}
        </div>
      )}
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12.5px] leading-snug text-muted">
          {hint}
        </p>
      )}
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[12.5px] font-medium text-danger"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-ink-2', className)} {...props} />
}
