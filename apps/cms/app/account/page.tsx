import type { Metadata } from 'next'
import { AccountForms } from '@/components/account/account-forms'
import { AppShell } from '@/components/shell/app-shell'
import { PageHeader } from '@/components/ui/page-header'
import { getAccess, requireUser } from '@/lib/auth/access'
import { listSessions } from '@/lib/auth/session'
import { brandStyle } from '@/lib/brand-style'
import { mailConfigured } from '@/lib/env'
import { shellProps } from '@/lib/shell'

export const metadata: Metadata = { title: 'Your account' }

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser('/account')
  const { from } = await searchParams
  const access = typeof from === 'string' ? await getAccess(from) : null
  const props = await shellProps(user, access)
  const sessions = await listSessions(user.id)
  return (
    <div style={access ? brandStyle(access.workspace.accent) : undefined}>
      <AppShell {...props}>
        <PageHeader title="Your account" description="Your name, password, sign-in codes and devices. These apply in every workspace you belong to." />
        <AccountForms
          name={user.name}
          email={user.email}
          twoFactor={user.twoFactor}
          mailReady={mailConfigured()}
          currentSession={user.sessionId}
          sessions={sessions.reverse().map((s) => ({ id: s.id, userAgent: s.userAgent, lastSeenAt: s.lastSeenAt.toISOString(), createdAt: s.createdAt.toISOString() }))}
        />
      </AppShell>
    </div>
  )
}
