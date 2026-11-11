'use client'

import { forwardRef } from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonStyles = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,box-shadow,color,transform,opacity] duration-200 ease-out-expo active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        brand: 'bg-brand text-brand-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.12)] hover:brightness-[1.06]',
        ink: 'bg-ink text-canvas shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-ink/88',
        outline: 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2 hover:shadow-[inset_0_0_0_1px_var(--faint)]',
        ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
        soft: 'bg-sunken text-ink hover:bg-line',
        danger: 'bg-danger text-white hover:brightness-110',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'text-ink underline decoration-brand decoration-2 underline-offset-4 hover:decoration-ink',
      },
      size: {
        xs: 'h-7 rounded-full px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-8 rounded-full px-3 text-[13px] [&_svg]:size-4',
        md: 'h-10 rounded-full px-4 text-sm [&_svg]:size-[18px]',
        lg: 'h-12 rounded-full px-6 text-[15px] [&_svg]:size-5',
        icon: 'size-9 rounded-full [&_svg]:size-[18px]',
        'icon-sm': 'size-8 rounded-full [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'ink', size: 'md' },
  }
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & { asChild?: boolean; loading?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref
) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp ref={ref} className={cn(buttonStyles({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="absolute" />}
          <span className={cn('inline-flex items-center gap-2', loading && 'opacity-0')}>{children}</span>
        </>
      )}
    </Comp>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('size-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
