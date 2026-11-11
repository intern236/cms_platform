'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

/** Days / hours / minutes / seconds to a moment, each digit flipping as it changes. */
export function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [])
  const p = parts(now === null ? 0 : target - now)
  const cells: [string, number][] = [
    ['days', p.d],
    ['hrs', p.h],
    ['min', p.m],
    ['sec', p.s],
  ]
  return (
    <div className="flex items-end gap-2 sm:gap-3" aria-label={`Goes live ${new Date(to).toLocaleString('en-GB')}`}>
      {cells.map(([label, v]) => (
        <div key={label} className="flex flex-col items-center">
          <div className="relative h-[52px] w-[54px] overflow-hidden rounded-xl bg-canvas/15 sm:w-[60px]">
            <AnimatePresence initial={false}>
              <motion.span
                key={now === null ? 'x' : v}
                className="absolute inset-0 grid place-items-center font-serif text-[34px] tabular-nums leading-none"
                initial={{ y: '-100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              >
                {now === null ? '–' : String(v).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
          </div>
          <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">{label}</span>
        </div>
      ))}
    </div>
  )
}
