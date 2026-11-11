import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "3 min ago", "yesterday", "12 Mar" — compact relative time for lists. */
export function relativeTime(date: Date | string, now = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = now.getTime() - d.getTime()
  const future = diff < 0
  const abs = Math.abs(diff)
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (abs < min) return future ? 'in a moment' : 'just now'
  if (abs < hour) {
    const n = Math.round(abs / min)
    return future ? `in ${n} min` : `${n} min ago`
  }
  if (abs < day) {
    const n = Math.round(abs / hour)
    return future ? `in ${n} h` : `${n} h ago`
  }
  if (abs < 2 * day) return future ? 'tomorrow' : 'yesterday'
  if (abs < 7 * day) {
    const n = Math.round(abs / day)
    return future ? `in ${n} days` : `${n} days ago`
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  )
}

/** A stable hue per string, for avatar backgrounds. */
export function hueFor(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360
  return h
}
