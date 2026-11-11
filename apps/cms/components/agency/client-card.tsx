'use client'

import { TimeAgo } from '@/components/ui/time-ago'
import Link from 'next/link'
import { motion, useMotionTemplate, useMotionValue } from 'motion/react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { WorkspaceMark } from '@/components/ui/avatar'
import { riseIn } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

export type ClientCardData = {
  slug: string
  name: string
  accent: string
  hasLogo: boolean
  siteUrl: string
  logoVersion: number
  members: number
  published: number
  drafts: number
  review: number
  unread: number
  lastPublishedAt: string | null
  webhook: 'ok' | 'failing' | 'none'
  archived: boolean
}

/**
 * One client. The top is painted in their colour with a soft light that follows
 * the pointer; the numbers underneath are what needs attention.
 */
export function ClientCard({ c }: { c: ClientCardData }) {
  const mx = useMotionValue(50)
  const my = useMotionValue(30)
  const glow = useMotionTemplate`radial-gradient(240px circle at ${mx}% ${my}%, rgba(255,255,255,0.35), transparent 70%)`
  return (
    <motion.li variants={riseIn} className="min-w-0">
      <Link
        href={`/${c.slug}`}
        className={cn(
          'group block overflow-hidden rounded-[24px] border border-line bg-surface shadow-card transition-[transform,box-shadow] duration-500 ease-out-expo hover:-translate-y-1.5 hover:shadow-float',
          c.archived && 'opacity-60'
        )}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          mx.set(((e.clientX - r.left) / r.width) * 100)
          my.set(((e.clientY - r.top) / r.height) * 100)
        }}
      >
        <div className="grain relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${c.accent}, color-mix(in oklab, ${c.accent} 55%, black))` }}>
          <motion.div className="absolute inset-0" style={{ background: glow }} />
          <div
            className="absolute -bottom-10 -right-6 size-40 rounded-full opacity-50 blur-2xl transition-transform duration-700 group-hover:scale-125"
            style={{ background: `color-mix(in oklab, ${c.accent} 50%, white)` }}
          />
          <div className="absolute left-5 top-5 transition-transform duration-500 ease-out-expo group-hover:scale-105">
            <WorkspaceMark slug={c.slug} name={c.name} accent={c.accent} hasLogo={c.hasLogo} size={52} version={c.logoVersion} className="shadow-lg ring-2 ring-white/30" />
          </div>
          <span className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur transition-all duration-500 group-hover:opacity-100 group-hover:rotate-0 rotate-[-45deg]">
            <ArrowUpRight size={16} weight="bold" />
          </span>
          {c.unread > 0 && (
            <span className="absolute bottom-4 right-4 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink shadow">
              {c.unread} new {c.unread === 1 ? 'enquiry' : 'enquiries'}
            </span>
          )}
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-[17px] font-semibold tracking-[-0.015em] text-ink">{c.name}</h3>
            <HealthDot state={c.webhook} />
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted">{c.siteUrl ? c.siteUrl.replace(/^https?:\/\//, '') : 'No website connected yet'}</p>
          <dl className="mt-5 grid grid-cols-3 gap-2">
            <Num label="Live" value={c.published} />
            <Num label="Drafts" value={c.drafts} />
            <Num label="Review" value={c.review} highlight={c.review > 0} />
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-muted">
            {c.lastPublishedAt ? <TimeAgo date={c.lastPublishedAt} prefix="Last published " /> : 'Nothing published yet'} · {c.members}{' '}
            {c.members === 1 ? 'person' : 'people'}
          </p>
        </div>
      </Link>
    </motion.li>
  )
}

function Num({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn('rounded-xl px-3 py-2', highlight ? 'bg-warn-soft' : 'bg-surface-2')}>
      <dt className={cn('text-[11px]', highlight ? 'text-warn' : 'text-muted')}>{label}</dt>
      <dd className="font-serif text-[26px] leading-tight text-ink">{value}</dd>
    </div>
  )
}

function HealthDot({ state }: { state: 'ok' | 'failing' | 'none' }) {
  const map = {
    ok: { cls: 'bg-ok', label: 'Site connected' },
    failing: { cls: 'bg-danger animate-pulse-dot text-danger', label: 'Last webhook failed' },
    none: { cls: 'bg-faint', label: 'No webhook yet' },
  }[state]
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] text-muted" title={map.label}>
      <span className={cn('size-2 rounded-full', map.cls)} />
      <span className="hidden sm:inline">{map.label}</span>
    </span>
  )
}
