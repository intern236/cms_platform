import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { currentSession } from '@/lib/auth/session'
import { agencyAccent, agencyName, outboxVisible } from '@/lib/env'
import { userCount } from '@/lib/setup-state'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if ((await userCount()) === 0) redirect('/setup')
  if (await currentSession()) redirect('/')
  const { next } = await searchParams
  return (
    <AuthShell brand={{ name: agencyName(), slug: null, accent: agencyAccent(), hasLogo: false, agency: agencyName() }}>
      <LoginForm heading="Welcome back" next={typeof next === 'string' ? next : undefined} outboxHint={outboxVisible()} />
    </AuthShell>
  )
}
