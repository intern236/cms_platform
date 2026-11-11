'use client'

import { Dialog as D } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * A centred modal on desktop, a bottom sheet on phones. Springs in, fades the
 * page behind it. Radix handles focus trapping, Escape and aria.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  side,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** 'right' renders a full-height side sheet instead. */
  side?: 'right'
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[rgb(12_12_13/0.32)] backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </D.Overlay>
            <D.Content asChild forceMount>
              {side === 'right' ? (
                <motion.div
                  className={cn(
                    'fixed inset-y-2 right-2 z-50 flex w-[min(560px,calc(100vw-16px))] flex-col overflow-hidden rounded-[22px] border border-line bg-surface shadow-float focus:outline-none',
                    className
                  )}
                  initial={{ x: '104%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '104%' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                >
                  <Header title={title} description={description} />
                  <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
                  {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-6 py-4">{footer}</div>}
                </motion.div>
              ) : (
                <motion.div
                  className={cn(
                    'fixed inset-x-2 bottom-2 z-50 max-h-[calc(100dvh-16px)] overflow-y-auto rounded-[22px] border border-line bg-surface shadow-float focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:w-[min(520px,calc(100vw-32px))] sm:-translate-x-1/2',
                    className
                  )}
                  initial={{ opacity: 0, y: 24, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.15 } }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                >
                  <Header title={title} description={description} />
                  {children && <div className="px-6 pb-6">{children}</div>}
                  {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-6 py-4">{footer}</div>}
                </motion.div>
              )}
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  )
}

function Header({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
      <div>
        <D.Title className="font-serif text-[28px] leading-none tracking-[-0.01em] text-ink">{title}</D.Title>
        {description ? (
          <D.Description className="mt-2 text-sm leading-relaxed text-muted">{description}</D.Description>
        ) : (
          <D.Description className="sr-only">Dialog</D.Description>
        )}
      </div>
      <D.Close className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink" aria-label="Close">
        <X size={18} />
      </D.Close>
    </div>
  )
}
