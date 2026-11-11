import { AppShell } from '@/components/shell/app-shell'
import { requireWorkspace } from '@/lib/auth/access'
import { brandStyle } from '@/lib/brand-style'
import { shellProps } from '@/lib/shell'

/** Every page inside a client's workspace: signed in, a member, in their colours. */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspace: string }> }) {
  const { workspace } = await params
  const access = await requireWorkspace(workspace)
  const props = await shellProps(access.user, access)
  return (
    <div style={brandStyle(access.workspace.accent)}>
      <AppShell {...props}>{children}</AppShell>
    </div>
  )
}
