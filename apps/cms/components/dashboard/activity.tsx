'use client'

import { TimeAgo } from '@/components/ui/time-ago'
import { motion } from 'motion/react'
import { Avatar } from '@/components/ui/avatar'

export type ActivityItem = { id: string; actorName: string; summary: string; at: string; action: string }

/** A vertical timeline: who did what, newest first, each row drawing its line in. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <p className="py-6 text-sm text-muted">Nothing has happened here yet.</p>
  return (
    <ol className="relative">
      {items.map((item, i) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 + i * 0.05 }}
          className="relative flex gap-3 pb-4 last:pb-0"
        >
          {i < items.length - 1 && (
            <motion.span
              className="absolute left-[13px] top-8 w-px origin-top bg-line-strong"
              style={{ bottom: 0 }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.4 + i * 0.05, duration: 0.4 }}
            />
          )}
          <Avatar name={item.actorName} size={27} />
          <div className="min-w-0 pt-0.5 text-[13.5px] leading-snug">
            <span className="font-medium text-ink">{item.actorName}</span> <span className="text-ink-2">{item.summary}</span>
            <div className="mt-0.5 text-[12px] text-faint"><TimeAgo date={item.at} /></div>
          </div>
        </motion.li>
      ))}
    </ol>
  )
}
