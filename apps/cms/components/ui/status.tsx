import { cn } from '@/lib/utils'

export type StatusKind = 'draft' | 'review' | 'scheduled' | 'published'

const STYLES: Record<StatusKind, { label: string; cls: string; dot: string; pulse?: boolean }> = {
  draft: { label: 'Draft', cls: 'bg-sunken text-ink-2', dot: 'bg-faint' },
  review: { label: 'In review', cls: 'bg-warn-soft text-warn', dot: 'bg-warn', pulse: true },
  scheduled: { label: 'Scheduled', cls: 'bg-info-soft text-info', dot: 'bg-info', pulse: true },
  published: { label: 'Published', cls: 'bg-ok-soft text-ok', dot: 'bg-ok' },
}

export function StatusPill({ status, className }: { status: StatusKind; className?: string }) {
  const s = STYLES[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', s.cls, className)}>
      <span className={cn('size-1.5 rounded-full', s.dot, s.pulse && 'animate-pulse-dot text-current')} />
      {s.label}
    </span>
  )
}

export function Badge({ children, className, tone = 'neutral' }: { children: React.ReactNode; className?: string; tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info' }) {
  const tones = {
    neutral: 'bg-sunken text-ink-2',
    brand: 'bg-brand-soft text-ink',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium', tones[tone], className)}>{children}</span>
}
