import type { Metadata } from 'next'
import { brandStyle } from '@/lib/brand-style'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { getAccess, getWorkspaceBySlug } from '@/lib/auth/access'
import { currentSession } from '@/lib/auth/session'
import { agencyAccent, agencyName, outboxVisible } from '@/lib/env'

/**
 * A client's own sign-in page, in their colours: cms.youragency.com/<client>/login.
 * An unknown slug shows the plain agency sign-in rather than a 404, so the page
 * cannot be used to discover which clients exist.
 */
export async function generateMetadata({ params }: { params: Promise<{ workspace: string }> }): Promise<Metadata> {
  const ws = await getWorkspaceBySlug((await params).workspace)
  return { title: ws && !ws.archived ? `Sign in · ${ws.name}` : 'Sign in' }
}

export default async function WorkspaceLogin({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params
  const ws = await getWorkspaceBySlug(slug)
  if (await currentSession()) {
    if (ws && (await getAccess(slug))) redirect(`/${slug}`)
    redirect('/')
  }
  const known = ws && !ws.archived
  return (
    <div style={known ? brandStyle(ws.accent) : undefined}>
      <AuthShell
        brand={
          known
            ? { name: ws.name, slug: ws.slug, accent: ws.accent, hasLogo: ws.hasLogo, agency: agencyName(), logoVersion: ws.updatedAt.getTime() }
            : { name: agencyName(), slug: null, accent: agencyAccent(), hasLogo: false, agency: agencyName() }
        }
      >
        <LoginForm heading={known ? `Sign in to ${ws.name}` : 'Welcome back'} workspace={known ? ws.slug : undefined} outboxHint={outboxVisible()} />
      </AuthShell>
    </div>
  )
}
