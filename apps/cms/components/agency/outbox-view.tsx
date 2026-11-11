'use client'

import { TimeAgo } from '@/components/ui/time-ago'
import { useState } from 'react'
import { motion } from 'motion/react'
import { EnvelopeSimple } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export function OutboxView({ mails }: { mails: { id: string; to: string; subject: string; html: string; createdAt: string }[] }) {
  const [open, setOpen] = useState(mails[0]?.id ?? null)
  const current = mails.find((m) => m.id === open)
  if (!mails.length)
    return (
      <div className="grid min-h-[300px] place-items-center rounded-[24px] border border-dashed border-line-strong text-center">
        <div>
          <EnvelopeSimple size={36} weight="thin" className="mx-auto text-faint" />
          <p className="mt-3 font-serif text-[28px] leading-none">Nothing sent yet</p>
          <p className="mt-2 text-sm text-muted">Invites, password resets and sign-in codes land here while email is not set up.</p>
        </div>
      </div>
    )
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <ul className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-card">
        {mails.map((m) => (
          <li key={m.id} className="border-b border-line last:border-0">
            <button onClick={() => setOpen(m.id)} className={cn('w-full px-4 py-3 text-left transition', open === m.id ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
              <span className="block truncate text-sm font-medium text-ink">{m.subject}</span>
              <span className="mt-0.5 flex justify-between gap-2 text-[12px] text-muted">
                <span className="truncate">{m.to}</span>
                <span className="shrink-0"><TimeAgo date={m.createdAt} /></span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <motion.div key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[22px] border border-line bg-white">
          <iframe title={current.subject} sandbox="" srcDoc={current.html} className="h-[72vh] w-full" />
        </motion.div>
      )}
    </div>
  )
}
