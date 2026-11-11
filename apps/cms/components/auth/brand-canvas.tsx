'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { WorkspaceMark } from '@/components/ui/avatar'

const LINES = [
  ['Write', 'it', 'down.'],
  ['Schedule', 'the', 'launch.'],
  ['Publish', 'with', 'care.'],
]

/**
 * The left half of every sign-in screen: the client's colour as a living field.
 * Three blurred blobs drift on long loops, a spotlight follows the pointer, a
 * grain sits on top, and a serif line rewrites itself every few seconds.
 */
export function BrandCanvas({
  name,
  slug,
  accent,
  hasLogo,
  agency,
  logoVersion,
}: {
  name: string
  slug: string | null
  accent: string
  hasLogo: boolean
  agency: string
  logoVersion?: number
}) {
  const [line, setLine] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 3800)
    return () => clearInterval(t)
  }, [])

  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.4)
  const sx = useSpring(mx, { stiffness: 60, damping: 20 })
  const sy = useSpring(my, { stiffness: 60, damping: 20 })
  const spotX = useTransform(sx, (v) => `${v * 100}%`)
  const spotY = useTransform(sy, (v) => `${v * 100}%`)

  return (
    <div
      className="grain relative isolate flex h-full min-h-[280px] flex-col justify-between overflow-hidden p-8 text-white sm:p-12"
      style={{ background: `color-mix(in oklab, ${accent} 88%, black)` }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width)
        my.set((e.clientY - r.top) / r.height)
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -left-1/4 -top-1/4 size-[80%] animate-drift rounded-full opacity-90 blur-[90px]"
          style={{ background: `radial-gradient(circle, color-mix(in oklab, ${accent} 70%, white) 0%, transparent 65%)` }}
        />
        <div
          className="absolute -bottom-1/3 -right-1/4 size-[90%] animate-drift-slow rounded-full opacity-80 blur-[100px]"
          style={{ background: `radial-gradient(circle, color-mix(in oklab, ${accent} 55%, black) 0%, transparent 60%)` }}
        />
        <div
          className="absolute left-1/3 top-1/2 size-[50%] animate-drift rounded-full opacity-60 blur-[80px] [animation-delay:-8s]"
          style={{ background: `radial-gradient(circle, color-mix(in oklab, ${accent} 40%, #ffd9a8) 0%, transparent 70%)` }}
        />
        <motion.div
          className="absolute size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[60px]"
          style={{ left: spotX, top: spotY, background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 60%)' }}
        />
        {/* Hairline grid, very faint, for structure. */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%)',
          }}
        />
      </div>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        {slug ? (
          <WorkspaceMark slug={slug} name={name} accent={accent} hasLogo={hasLogo} size={40} version={logoVersion} className="shadow-lg" />
        ) : (
          <span className="grid size-10 place-items-center rounded-xl bg-white/15 font-serif text-2xl backdrop-blur">{name.slice(0, 1)}</span>
        )}
        <span className="text-[15px] font-medium tracking-[-0.01em]">{name}</span>
      </motion.div>

      <div className="py-10">
        <h2 aria-live="polite" className="font-serif text-[clamp(44px,6vw,88px)] leading-[0.92] tracking-[-0.025em]">
          <AnimatePresence mode="wait">
            <motion.span key={line} className="block">
              {LINES[line].map((w, i) => (
                <span key={w + i} className="inline-block overflow-hidden pb-[0.1em] align-top">
                  <motion.span
                    className="inline-block"
                    initial={{ y: '110%', rotate: 4 }}
                    animate={{ y: 0, rotate: 0, transition: { type: 'spring', stiffness: 160, damping: 20, delay: i * 0.08 } }}
                    exit={{ y: '-110%', transition: { duration: 0.35, ease: [0.7, 0, 0.84, 0], delay: i * 0.04 } }}
                  >
                    {i === LINES[line].length - 1 ? <em className="not-italic opacity-90">{w}</em> : w}
                    {i < LINES[line].length - 1 ? ' ' : ''}
                  </motion.span>
                </span>
              ))}
            </motion.span>
          </AnimatePresence>
        </h2>
      </div>

      <div className="flex items-end justify-between gap-6 font-mono text-[11px] uppercase tracking-[0.14em] text-white/70">
        <span>{slug ? `${name} · Content studio` : 'Content studio'}</span>
        <span>Powered by {agency}</span>
      </div>
    </div>
  )
}
