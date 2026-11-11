import { AppShell } from '@/components/shell/app-shell'
import { requireAgency } from '@/lib/auth/access'
import { shellProps } from '@/lib/shell'

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAgency()
  return <AppShell {...await shellProps(user, null)}>{children}</AppShell>
}
