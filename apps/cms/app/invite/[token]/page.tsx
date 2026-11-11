import type { Metadata } from 'next'
import { brandStyle } from '@/lib/brand-style'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { InviteForm } from '@/components/auth/forms'
import { findInvite } from '@/lib/auth/invites'
import { currentSession } from '@/lib/auth/session'
import { agencyAccent, agencyName } from '@/lib/env'
import { ROLE_LABEL } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Accept invite', referrer: 'no-referrer' }

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await findInvite(token)
  const session = await currentSession()
  const ws = invite?.workspace
  const brand = ws
    ? { name: ws.name, slug: ws.slug, accent: ws.accent, hasLogo: ws.hasLogo, agency: agencyName(), logoVersion: ws.updatedAt.getTime() }
    : { name: agencyName(), slug: null, accent: agencyAccent(), hasLogo: false, agency: agencyName() }

  if (!invite) {
    return (
      <AuthShell brand={brand}>
        <h1 className="font-serif text-[44px] leading-[0.95] tracking-[-0.02em]">This invite has expired</h1>
        <p className="mt-3 text-[15px] text-muted">Invites work once, for 7 days. Ask whoever invited you to send a new one.</p>
        <Link href="/login" className="mt-8 inline-flex text-sm font-medium underline decoration-brand decoration-2 underline-offset-4">
          Go to sign in
        </Link>
      </AuthShell>
    )
  }

  const mode = invite.existingUserId
    ? session?.id === invite.existingUserId
      ? 'join'
      : session
        ? 'wrong'
        : 'signin'
    : session
      ? 'wrong'
      : 'new'

  return (
    <div style={ws ? brandStyle(ws.accent) : undefined}>
      <AuthShell brand={brand}>
        <InviteForm
          token={token}
          email={invite.email}
          where={ws ? ws.name : `the ${agencyName()} team`}
          roleLabel={invite.role === 'agency' ? 'agency admin' : ROLE_LABEL[invite.role].toLowerCase()}
          mode={mode}
        />
      </AuthShell>
    </div>
  )
}
