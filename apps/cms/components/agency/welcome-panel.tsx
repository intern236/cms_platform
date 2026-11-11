'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Confetti, X } from '@phosphor-icons/react'

export function WelcomePanel({ demo, password }: { demo: boolean; password: string }) {
  const [open, setOpen] = useState(true)
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          className="grain relative mb-8 overflow-hidden rounded-[24px] bg-ink p-6 text-canvas sm:p-8"
        >
          <button onClick={() => setOpen(false)} className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-canvas/60 hover:bg-white/10 hover:text-canvas" aria-label="Dismiss">
            <X size={16} />
          </button>
          <motion.div initial={{ rotate: -30, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.2 }} className="mb-4 inline-grid size-11 place-items-center rounded-2xl bg-brand text-brand-fg">
            <Confetti size={22} weight="fill" />
          </motion.div>
          <h2 className="font-serif text-[36px] leading-none tracking-[-0.015em]">You are set up.</h2>
          {demo ? (
            <div className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-canvas/75">
              <p>
                Three demo clients are ready. Acme Studio has a team you can sign in as, each with the password{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[13px] text-canvas">{password}</code>:
              </p>
              <ul className="mt-3 grid gap-1.5 font-mono text-[13px] sm:grid-cols-3">
                <li>owner@acme.test</li>
                <li>editor@acme.test</li>
                <li>writer@acme.test</li>
              </ul>
              <p className="mt-3">
                The example website is already connected: run <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[13px]">npm run dev:site</code> and open
                localhost:3100.
              </p>
            </div>
          ) : (
            <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-canvas/75">
              Add your first client, invite their owner, and connect their website with a site key from their Settings.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
