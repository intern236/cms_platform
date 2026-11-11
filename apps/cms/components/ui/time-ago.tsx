'use client'

import { relativeTime } from '@/lib/utils'

/** "5 min ago". The server and the browser may disagree by a minute, so hydration is told not to mind. */
export function TimeAgo({ date, prefix = '' }: { date: string | Date; prefix?: string }) {
  const d = typeof date === 'string' ? new Date(date) : date
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString('en-GB')} suppressHydrationWarning>
      {prefix}
      {relativeTime(d)}
    </time>
  )
}
