import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResetForm } from '@/components/auth/forms'
import { findReset } from '@/lib/auth/reset'
import { agencyAccent, agencyName } from '@/lib/env'

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' }

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await findReset(token)
  return (
    <AuthShell brand={{ name: agencyName(), slug: null, accent: agencyAccent(), hasLogo: false, agency: agencyName() }}>
      {found ? (
        <ResetForm token={token} email={found.email} />
      ) : (
        <div>
          <h1 className="font-serif text-[44px] leading-[0.95] tracking-[-0.02em]">This link has expired</h1>
          <p className="mt-3 text-[15px] text-muted">Reset links work once, for 30 minutes. Ask for a fresh one.</p>
          <Link href="/forgot" className="mt-8 inline-flex text-sm font-medium underline decoration-brand decoration-2 underline-offset-4">
            Send a new link
          </Link>
        </div>
      )}
    </AuthShell>
  )
}
