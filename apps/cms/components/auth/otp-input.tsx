'use client'

import { useRef } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/** Six boxes for a sign-in code. Typing advances, Backspace goes back, paste fills all six. */
export function OtpInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')
  const set = (index: number, digit: string) => {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join('').replace(/\s+$/, ''))
  }
  return (
    <div className="flex justify-between gap-2" onPaste={(e) => {
      const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
      if (text) {
        e.preventDefault()
        onChange(text)
        refs.current[Math.min(text.length, 5)]?.focus()
      }
    }}>
      {digits.map((d, i) => (
        <motion.input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          autoFocus={autoFocus && i === 0}
          maxLength={1}
          value={d.trim()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1)
            set(i, v || ' ')
            if (v) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i].trim()) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight') refs.current[i + 1]?.focus()
          }}
          className={cn(
            'h-14 w-full min-w-0 rounded-2xl bg-surface text-center font-mono text-2xl text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] transition-shadow focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--brand),var(--ring)]',
            d.trim() && 'shadow-[inset_0_0_0_1.5px_var(--ink)]'
          )}
        />
      ))}
    </div>
  )
}
