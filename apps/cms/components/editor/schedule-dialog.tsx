'use client'

import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { CalendarCheck } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Pick when a post goes live. Quick picks for the common cases, a picker for the rest. */
export function ScheduleDialog({
  open,
  onOpenChange,
  initial,
  error,
  busy,
  onSchedule,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: Date | null
  error?: string
  busy: boolean
  onSchedule: (when: Date) => void
}) {
  const [value, setValue] = useState(() => toLocalInput(initial && initial > new Date() ? initial : new Date(Date.now() + 86_400_000)))
  const picks = useMemo(() => {
    const at = (days: number, hour: number) => {
      const d = new Date()
      d.setDate(d.getDate() + days)
      d.setHours(hour, 0, 0, 0)
      return d
    }
    const monday = (() => {
      const d = new Date()
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
      d.setHours(9, 0, 0, 0)
      return d
    })()
    return [
      { label: 'Tomorrow, 9am', date: at(1, 9) },
      { label: 'Tomorrow, 2pm', date: at(1, 14) },
      { label: 'Monday, 9am', date: monday },
      { label: 'In a week', date: at(7, 9) },
    ]
  }, [])
  const parsed = new Date(value)
  const valid = !Number.isNaN(parsed.getTime()) && parsed > new Date()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule"
      description="The post goes live by itself at this time. Your site picks it up within a minute."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" loading={busy} disabled={!valid} onClick={() => onSchedule(parsed)}>
            <CalendarCheck weight="bold" /> Schedule
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {picks.map((p, i) => {
          const selected = toLocalInput(p.date) === value
          return (
            <motion.button
              key={p.label}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
              onClick={() => setValue(toLocalInput(p.date))}
              className={cn(
                'rounded-2xl border px-3 py-2.5 text-left transition',
                selected ? 'border-transparent bg-ink text-canvas' : 'border-line bg-surface-2 hover:border-line-strong'
              )}
            >
              <span className="block text-[13.5px] font-medium">{p.label}</span>
              <span className={cn('text-[12px]', selected ? 'text-canvas/70' : 'text-muted')}>
                {p.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </motion.button>
          )
        })}
      </div>
      <Field label="Or pick a date and time" error={error ?? (!valid && value ? 'Pick a time in the future.' : undefined)} className="mt-5">
        {(p) => <Input {...p} id="schedule-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
      <p className="mt-2 text-[12px] text-muted">Times are in your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
    </Dialog>
  )
}
