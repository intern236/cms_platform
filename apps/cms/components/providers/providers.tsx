'use client'

import { MotionConfig } from 'motion/react'
import { Toaster } from 'sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}>
      {children}
      <Toaster
        position="bottom-right"
        gap={10}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'group flex w-[360px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm text-ink shadow-float',
            title: 'font-medium',
            description: 'text-muted mt-0.5',
            actionButton: 'ml-auto shrink-0 rounded-full bg-ink px-3 py-1 text-xs font-medium text-canvas',
            icon: 'mt-0.5',
          },
        }}
      />
    </MotionConfig>
  )
}
