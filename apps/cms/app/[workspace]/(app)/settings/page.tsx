import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandingForm } from '@/components/settings/branding-form'
import { GeneralForm } from '@/components/settings/general-form'
import { PeoplePanel } from '@/components/settings/people-panel'
import { WebsitePanel } from '@/components/settings/website-panel'
import { PageHeader } from '@/components/ui/page-header'
import { requireWorkspace } from '@/lib/auth/access'
import { cmsUrl } from '@/lib/env'
import { listSiteKeys } from '@/lib/integrations/site-keys'
import { recentDeliveries } from '@/lib/integrations/webhooks'
import { listMembers, pendingInvites } from '@/lib/workspaces/members'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Settings' }

const TABS = [
  { key: 'general', label: 'Site' },
  { key: 'branding', label: 'Branding' },
  { key: 'people', label: 'People' },
  { key: 'website', label: 'Website & keys' },
] as const

type Tab = (typeof TABS)[number]['key']

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ workspace: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { workspace } = await params
  const { tab: raw } = await searchParams
  const access = await requireWorkspace(workspace, 'settings.edit')
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : 'general'
  const ws = access.workspace

  return (
    <>
      <PageHeader title="Settings" description={`How ${ws.name} looks, who can sign in, and how the website connects.`} />
      <nav className="-mx-1 mb-8 flex gap-1 overflow-x-auto border-b border-line px-1 scrollbar-none" aria-label="Settings sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/${workspace}/settings${t.key === 'general' ? '' : `?tab=${t.key}`}`}
            className={cn(
              'relative -mb-px whitespace-nowrap border-b-2 px-3 pb-3 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'general' && <GeneralForm workspace={workspace} initial={ws.settings} />}
      {tab === 'branding' && <BrandingForm workspace={workspace} initial={{ name: ws.name, accent: ws.accent, hasLogo: ws.hasLogo, version: ws.updatedAt.getTime() }} />}
      {tab === 'people' && (
        <PeoplePanel
          workspace={workspace}
          workspaceName={ws.name}
          me={access.user.id}
          myRole={access.role}
          members={(await listMembers(ws.id)).map((m) => ({ ...m, lastLoginAt: m.lastLoginAt?.toISOString() ?? null }))}
          invites={(await pendingInvites(ws.id)).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
        />
      )}
      {tab === 'website' && (
        <WebsitePanel
          workspace={workspace}
          isAgency={access.isAgency}
          cmsUrl={cmsUrl()}
          siteUrl={ws.siteUrl}
          webhookUrl={ws.webhookUrl}
          keys={(await listSiteKeys(ws.id)).map((k) => ({
            id: k.id,
            label: k.label,
            prefix: k.prefix,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            revokedAt: k.revokedAt?.toISOString() ?? null,
          }))}
          deliveries={(await recentDeliveries(ws.id)).map((d) => ({ id: d.id, event: d.event, ok: d.ok, status: d.status, error: d.error, at: d.at.toISOString(), durationMs: d.durationMs }))}
        />
      )}
    </>
  )
}
