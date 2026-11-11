import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CalendarBlank, NotePencil, Plus, Tray } from '@phosphor-icons/react/dist/ssr'
import { ActivityFeed } from '@/components/dashboard/activity'
import { BarChart } from '@/components/dashboard/bar-chart'
import { Countdown } from '@/components/dashboard/countdown'
import { StatTile } from '@/components/dashboard/stat'
import { Avatar } from '@/components/ui/avatar'
import { Stagger } from '@/components/ui/misc'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status'
import { requireWorkspace } from '@/lib/auth/access'
import { recentActivity } from '@/lib/audit'
import { listMessages } from '@/lib/content/contact'
import { dashboardStats, displayStatus, listPosts } from '@/lib/content/posts'
import { inWorkspace } from '@/lib/db'
import { can } from '@/lib/permissions'
import { relativeTime } from '@/lib/utils'

export async function generateMetadata({ params }: { params: Promise<{ workspace: string }> }): Promise<Metadata> {
  const { workspace } = await params
  const access = await requireWorkspace(workspace)
  return { title: access.workspace.name }
}

export default async function Dashboard({ params, searchParams }: { params: Promise<{ workspace: string }>; searchParams: Promise<{ denied?: string }> }) {
  const { workspace: slug } = await params
  const { denied } = await searchParams
  const access = await requireWorkspace(slug)
  const { workspace, role, user } = access
  const writer = !can(role, 'posts.editAny')

  const data = await inWorkspace(workspace.id, async (tx) => ({
    stats: await dashboardStats(tx, workspace.id),
    messages: can(role, 'inbox.read') && workspace.settings.contact.enabled ? (await listMessages(tx, workspace.id, 'inbox')).slice(0, 4) : null,
    activity: can(role, 'activity.read') ? await recentActivity(tx, workspace.id, 7) : null,
    review: can(role, 'posts.publish') ? await listPosts(tx, workspace.id, { status: 'review' }) : [],
    mine: writer ? await listPosts(tx, workspace.id, { createdBy: user.id }) : [],
  }))
  const { stats } = data
  const published30 = stats.daily.reduce((n, d) => n + d.count, 0)
  const unread = data.messages?.filter((m) => !m.readAt).length ?? 0
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const base = `/${slug}`
  const pairSpan = data.messages && data.activity ? 'col-span-2 row-span-2' : 'col-span-2 md:col-span-4'

  return (
    <>
      {denied && (
        <div role="status" className="mb-6 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          Your role does not include that page. Ask an owner of {workspace.name} if you need it.
        </div>
      )}
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        description={
          writer
            ? 'Write drafts and send them for review. An editor will publish them.'
            : `${stats.published} live ${stats.published === 1 ? 'post' : 'posts'} on ${workspace.siteUrl ? workspace.siteUrl.replace(/^https?:\/\//, '') : workspace.name}.`
        }
      />

      <Stagger className="grid grid-flow-dense grid-cols-2 gap-3 md:grid-cols-4">
        {/* Row 1: new post · live count · chart (2) */}
        <StatTileLink href={`${base}/posts/new`} />
        <StatTile label="Live posts" value={stats.published} hint={`${published30} in the last 30 days`} href={`${base}/posts?status=published`} />
        <div className="col-span-2 flex min-h-[176px] flex-col rounded-[22px] border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Published, last 30 days</span>
            <span className="font-serif text-2xl leading-none">{published30}</span>
          </div>
          <BarChart data={stats.daily} className="mt-auto" height={104} />
        </div>

        {/* Row 2: next scheduled (2) · drafts · review */}
        <div className="grain relative col-span-2 flex min-h-[176px] flex-col justify-between overflow-hidden rounded-[22px] bg-ink p-5 text-canvas">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-canvas/60">
            <CalendarBlank size={14} /> Next scheduled
          </div>
          {stats.nextScheduled ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <Link href={`${base}/posts/${stats.nextScheduled.id}`} className="max-w-[260px] font-serif text-[24px] leading-[1.05] hover:underline">
                {stats.nextScheduled.title}
              </Link>
              <Countdown to={stats.nextScheduled.publishedAt.toISOString()} />
            </div>
          ) : (
            <p className="font-serif text-[26px] leading-tight text-canvas/80">Nothing scheduled. Pick a post and choose “Schedule”.</p>
          )}
        </div>
        <StatTile label="Drafts" value={stats.drafts} href={`${base}/posts?status=draft`} />
        <StatTile label="In review" value={stats.review} href={`${base}/posts?status=review`} hint={stats.review ? 'Waiting for an editor' : 'All clear'} />

        {/* Row 3: inbox (2×2) · activity (2×2) — or the writer's own posts */}
        {data.messages && (
          <section className={`${pairSpan} flex flex-col rounded-[22px] border border-line bg-surface p-5 shadow-card`}>
            <header className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                <Tray size={14} /> Inbox {unread > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-fg">{unread} new</span>}
              </span>
              <Link href={`${base}/inbox`} className="group flex items-center gap-1 text-[13px] text-muted hover:text-ink">
                Open <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
              </Link>
            </header>
            <ul className="mt-4 flex flex-col">
              {data.messages.length === 0 && <li className="py-6 text-sm text-muted">No enquiries yet. They arrive here from the contact form.</li>}
              {data.messages.map((m) => (
                <li key={m.id}>
                  <Link href={`${base}/inbox/${m.id}`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-2">
                    <Avatar name={m.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={m.readAt ? 'text-sm text-ink-2' : 'text-sm font-semibold text-ink'}>{m.name}</span>
                        <span className="shrink-0 text-[11.5px] text-faint">{relativeTime(m.receivedAt)}</span>
                      </div>
                      <p className="truncate text-[13px] text-muted">{m.message}</p>
                    </div>
                    {!m.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {data.activity && (
          <section className={`${pairSpan} rounded-[22px] border border-line bg-surface p-5 shadow-card`}>
            <header className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Activity</header>
            <ActivityFeed
              items={data.activity.map((a) => ({ id: a.id, actorName: a.actorName, summary: a.summary, at: a.at.toISOString(), action: a.action }))}
            />
          </section>
        )}
        {writer && (
          <section className="col-span-2 rounded-[22px] border border-line bg-surface p-5 shadow-card md:col-span-4">
            <header className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Your posts</header>
            <PostList base={base} posts={data.mine.slice(0, 8).map((p) => ({ id: p.id, title: p.title, status: displayStatus(p), updatedAt: p.updatedAt.toISOString() }))} />
          </section>
        )}
      </Stagger>

      {!writer && (
        <section className="mt-12">
          <div className="flex items-end justify-between">
            <h2 className="font-serif text-[30px] leading-none tracking-[-0.015em]">{data.review.length ? 'Waiting for review' : 'Recently edited'}</h2>
            <Link href={`${base}/posts`} className="text-[13px] text-muted hover:text-ink">
              All posts →
            </Link>
          </div>
          <div className="mt-4 rounded-[22px] border border-line bg-surface p-2 shadow-card">
            <PostList
              base={base}
              posts={(data.review.length ? data.review : stats.recent).map((p) => ({
                id: p.id,
                title: p.title,
                status: displayStatus(p),
                updatedAt: p.updatedAt.toISOString(),
              }))}
            />
          </div>
        </section>
      )}
    </>
  )
}

function StatTileLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="grain group relative flex min-h-[176px] flex-col justify-between overflow-hidden rounded-[22px] bg-brand p-5 text-brand-fg transition-[transform,box-shadow] duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-float"
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-white/20 transition-transform duration-500 ease-spring group-hover:rotate-90 group-hover:scale-110">
        <Plus size={22} weight="bold" />
      </span>
      <span>
        <span className="block font-serif text-[30px] leading-none">New post</span>
        <span className="mt-1.5 flex items-center gap-1 text-[13px] opacity-80">
          Start writing <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
        </span>
      </span>
    </Link>
  )
}

function PostList({ base, posts }: { base: string; posts: { id: string; title: string; status: 'draft' | 'review' | 'scheduled' | 'published'; updatedAt: string }[] }) {
  if (!posts.length) return <p className="px-3 py-6 text-sm text-muted">No posts yet.</p>
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>
          <Link href={`${base}/posts/${p.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-surface-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken text-muted">
              <NotePencil size={17} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink">{p.title}</span>
            <StatusPill status={p.status} className="hidden sm:inline-flex" />
            <span className="w-24 shrink-0 text-right text-[12px] text-faint">{relativeTime(p.updatedAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
