import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { ClientCard, type ClientCardData } from '@/components/agency/client-card'
import { WelcomePanel } from '@/components/agency/welcome-panel'
import { BarChart } from '@/components/dashboard/bar-chart'
import { StatTile } from '@/components/dashboard/stat'
import { Button } from '@/components/ui/button'
import { EmptyState, Stagger } from '@/components/ui/misc'
import { PageHeader } from '@/components/ui/page-header'
import { requireAgency } from '@/lib/auth/access'
import { DEMO_PASSWORD } from '@/lib/demo'
import { agencyOverview, agencyPublishing } from '@/lib/workspaces'

export const metadata: Metadata = { title: 'Clients' }

export default async function AgencyHome({ searchParams }: { searchParams: Promise<{ welcome?: string; archived?: string }> }) {
  const user = await requireAgency()
  const { welcome, archived } = await searchParams
  const [clients, daily] = await Promise.all([agencyOverview(archived === '1'), agencyPublishing(30)])
  const last30 = daily.reduce((n, d) => n + d.count, 0)
  const review = clients.reduce((n, c) => n + c.review, 0)
  const unread = clients.reduce((n, c) => n + c.unread, 0)
  const cards: ClientCardData[] = clients.map((c) => ({
    slug: c.slug,
    name: c.name,
    accent: c.accent,
    hasLogo: c.hasLogo,
    siteUrl: c.siteUrl,
    logoVersion: c.updatedAt.getTime(),
    members: c.members,
    published: c.published,
    drafts: c.drafts,
    review: c.review,
    unread: c.unread,
    lastPublishedAt: c.lastPublishedAt?.toISOString() ?? null,
    webhook: c.lastWebhook ? (c.lastWebhook.ok ? 'ok' : 'failing') : 'none',
    archived: c.archived,
  }))
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        description={`${clients.length} ${clients.length === 1 ? 'client' : 'clients'} · ${last30} ${last30 === 1 ? 'post' : 'posts'} published in the last 30 days`}
        actions={
          <Button asChild variant="brand">
            <Link href="/agency/new">
              <Plus weight="bold" />
              Add a client
            </Link>
          </Button>
        }
      />

      {welcome && <WelcomePanel demo={welcome === 'demo'} password={DEMO_PASSWORD} />}

      <Stagger className="grid grid-flow-dense grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Clients" value={clients.length} hint="Active workspaces" tone="ink" />
        <StatTile label="Published · 30d" value={last30} hint="Across every client" />
        <div className="col-span-2 row-span-2 flex min-h-[176px] flex-col rounded-[22px] border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Publishing, last 30 days</span>
            <span className="font-mono text-[11px] text-faint">all clients</span>
          </div>
          <BarChart data={daily} className="mt-auto" height={240} />
        </div>
        <StatTile label="Waiting for review" value={review} hint={review ? 'Writers are waiting on an editor' : 'Nothing waiting'} />
        <StatTile label="New enquiries" value={unread} hint="Unread, across clients" tone={unread ? 'brand' : 'plain'} />
      </Stagger>

      <div className="mt-14 flex items-end justify-between gap-4">
        <h2 className="font-serif text-[34px] leading-none tracking-[-0.015em]">{archived === '1' ? 'All clients' : 'Clients'}</h2>
        <Link href={archived === '1' ? '/agency' : '/agency?archived=1'} className="text-[13px] text-muted hover:text-ink">
          {archived === '1' ? 'Hide archived' : 'Show archived'}
        </Link>
      </div>
      {cards.length ? (
        <Stagger className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" delay={0.1}>
          <ul className="contents">
            {cards.map((c) => (
              <ClientCard key={c.slug} c={c} />
            ))}
          </ul>
        </Stagger>
      ) : (
        <EmptyState
          className="mt-5"
          title="No clients yet"
          body="Add your first client to give them a workspace, a branded sign-in page and a key for their website."
          action={
            <Button asChild variant="brand">
              <Link href="/agency/new">Add a client</Link>
            </Button>
          }
        />
      )}
    </>
  )
}
