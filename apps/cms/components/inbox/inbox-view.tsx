import Link from 'next/link'
import { ArrowLeft, DownloadSimple, Tray } from '@phosphor-icons/react/dist/ssr'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import type { ContactMessage, InboxFilter } from '@/lib/content/contact'
import { cn, relativeTime } from '@/lib/utils'
import { InboxSearch, MarkRead, MessageActions } from './inbox-client'

/**
 * The inbox: a list on the left, the open message on the right. On a phone the
 * open message takes the whole screen with a back arrow.
 */
export function InboxView({
  workspace,
  messages,
  filter,
  q,
  selected,
  counts,
}: {
  workspace: string
  messages: ContactMessage[]
  filter: InboxFilter
  q: string
  selected: ContactMessage | null
  counts: { unread: number }
}) {
  const base = `/${workspace}/inbox`
  const qs = (f: InboxFilter) => `?${new URLSearchParams({ ...(f !== 'inbox' ? { filter: f } : {}), ...(q ? { q } : {}) })}`
  return (
    <>
      <div className={cn(selected && 'hidden lg:block')}>
        <PageHeader
          title="Inbox"
          description={counts.unread ? `${counts.unread} unread ${counts.unread === 1 ? 'enquiry' : 'enquiries'} from the contact form.` : 'Enquiries from the contact form on your site.'}
          actions={
            <Button asChild variant="outline" size="sm">
              <a href={`${base}/export`} download>
                <DownloadSimple /> Export CSV
              </a>
            </Button>
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className={cn('flex min-w-0 flex-col gap-3', selected && 'hidden lg:flex')}>
          <div className="flex items-center gap-1 rounded-full bg-sunken p-1 text-[13px] font-medium">
            {(['inbox', 'unread', 'archived'] as const).map((f) => (
              <Link
                key={f}
                href={`${base}${qs(f)}`}
                className={cn('flex-1 rounded-full py-1.5 text-center capitalize transition', filter === f ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}
              >
                {f}
              </Link>
            ))}
          </div>
          <InboxSearch initial={q} />
          <ul className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-card">
            {messages.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-muted">
                <Tray size={32} weight="thin" />
                {q ? `Nothing matches “${q}”.` : filter === 'archived' ? 'Nothing archived.' : 'All caught up.'}
              </li>
            )}
            {messages.map((m) => {
              const active = selected?.id === m.id
              return (
                <li key={m.id} className="border-b border-line last:border-0">
                  <Link
                    href={`${base}/${m.id}${qs(filter)}`}
                    className={cn('relative flex gap-3 px-4 py-3.5 transition-colors', active ? 'bg-brand-soft' : 'hover:bg-surface-2')}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brand" />}
                    <Avatar name={m.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-sm', m.readAt ? 'text-ink-2' : 'font-semibold text-ink')}>{m.name}</span>
                        <span className="shrink-0 text-[11.5px] text-faint">{relativeTime(m.receivedAt)}</span>
                      </div>
                      {m.topic && <span className="text-[12px] text-muted">{m.topic}</span>}
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{m.message}</p>
                    </div>
                    {!m.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={cn('min-w-0', !selected && 'hidden lg:block')}>
          {selected ? (
            <article className="rounded-[24px] border border-line bg-surface p-6 shadow-card sm:p-8">
              <MarkRead workspace={workspace} id={selected.id} unread={!selected.readAt} />
              <Link href={`${base}${qs(filter)}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink lg:hidden">
                <ArrowLeft size={14} /> Inbox
              </Link>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar name={selected.name} size={52} />
                  <div>
                    <h2 className="font-serif text-[32px] leading-none tracking-[-0.01em]">{selected.name}</h2>
                    <a href={`mailto:${selected.email}`} className="mt-1 block text-sm text-muted hover:text-ink">
                      {selected.email}
                    </a>
                  </div>
                </div>
                <MessageActions workspace={workspace} id={selected.id} email={selected.email} name={selected.name} archived={selected.archived} filterQs={qs(filter)} />
              </div>
              <dl className="mt-6 flex flex-wrap gap-2 text-[12.5px]">
                {selected.topic && <Chip label="Topic" value={selected.topic} />}
                {selected.company && <Chip label="Company" value={selected.company} />}
                {selected.phone && <Chip label="Phone" value={selected.phone} />}
                <Chip label="Received" value={selected.receivedAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} />
                {selected.source && <Chip label="Page" value={selected.source} />}
              </dl>
              <div className="mt-6 whitespace-pre-wrap rounded-2xl bg-surface-2 p-5 text-[15.5px] leading-relaxed text-ink">{selected.message}</div>
            </article>
          ) : (
            <div className="grid h-full min-h-[360px] place-items-center rounded-[24px] border border-dashed border-line-strong text-center">
              <div>
                <p className="font-serif text-[30px] leading-none text-ink">Pick a message</p>
                <p className="mt-2 text-sm text-muted">It opens here.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1">
      <dt className="text-faint">{label}</dt>
      <dd className="max-w-[260px] truncate text-ink-2">{value}</dd>
    </div>
  )
}
