import type { Metadata } from 'next'
import { TeamPanel } from '@/components/agency/team-panel'
import { PageHeader } from '@/components/ui/page-header'
import { requireAgency } from '@/lib/auth/access'
import { agencyTeam } from '@/lib/agency-team'

export const metadata: Metadata = { title: 'Team' }

export default async function TeamPage() {
  const user = await requireAgency()
  const { members, pending } = await agencyTeam()
  return (
    <>
      <PageHeader title="Your team" description="People at your agency who manage every client." />
      <TeamPanel
        me={user.id}
        members={members.map((m) => ({ ...m, lastLoginAt: m.lastLoginAt?.toISOString() ?? null, disabled: Boolean(m.disabledAt) }))}
        pending={pending.map((p) => ({ ...p, expiresAt: p.expiresAt.toISOString() }))}
      />
    </>
  )
}
