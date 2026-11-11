'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Daily bars that grow in one after another. Hover a bar for its date and count.
 * Pure SVG + motion, no chart library.
 */
export function BarChart({ data, className, height = 140 }: { data: { day: string; count: number }[]; className?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.count))
  const gap = 3
  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <div className="absolute inset-0 flex items-end" style={{ gap }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => {
          const h = d.count ? Math.max(6, (d.count / max) * (height - 28)) : 3
          return (
            <div key={d.day} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
              <motion.div
                className={cn('w-full rounded-[4px]', d.count ? 'bg-brand' : 'bg-line-strong', hover !== null && hover !== i && 'opacity-40')}
                initial={{ height: 0 }}
                animate={{ height: h }}
                transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.25 + i * 0.018 }}
                style={{ transition: 'opacity 200ms' }}
              />
            </div>
          )
        })}
      </div>
      {hover !== null && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none absolute -top-2 rounded-lg bg-ink px-2 py-1 font-mono text-[11px] text-canvas"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%`, transform: 'translateX(-50%)' }}
        >
          {new Date(data[hover].day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {data[hover].count}
        </motion.div>
      )}
    </div>
  )
}
