import { redirect } from 'next/navigation'
import Link from 'next/link'
import { listMyWorkspaces } from '@/lib/auth/access'
import { currentSession } from '@/lib/auth/session'
import { userCount } from '@/lib/setup-state'
import { WorkspaceMark } from '@/components/ui/avatar'
import { ROLE_LABEL } from '@/lib/permissions'
import { logout } from '@/lib/actions/auth'

/** Where "/" leads: setup, sign-in, the agency overview, your only workspace, or a chooser. */
export default async function Home() {
  if ((await userCount()) === 0) redirect('/setup')
  const user = await currentSession()
  if (!user) redirect('/login')
  if (user.isAgency) redirect('/agency')
  const workspaces = await listMyWorkspaces()
  if (workspaces.length === 1) redirect(`/${workspaces[0].slug}`)
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-[52px] leading-[0.95] tracking-[-0.02em]">Hello, {user.name.split(' ')[0]}</h1>
      <p className="mt-3 text-muted">{workspaces.length ? 'Pick a workspace.' : 'You are not in any workspace yet. Ask the person who invited you.'}</p>
      <ul className="mt-10 flex flex-col gap-2">
        {workspaces.map((w) => (
          <li key={w.slug}>
            <Link href={`/${w.slug}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-float">
              <WorkspaceMark slug={w.slug} name={w.name} accent={w.accent} hasLogo={w.hasLogo} size={44} />
              <span className="flex-1">
                <span className="block font-medium">{w.name}</span>
                <span className="text-sm text-muted">{ROLE_LABEL[w.role]}</span>
              </span>
              <span className="text-muted transition group-hover:translate-x-1 group-hover:text-ink">→</span>
            </Link>
          </li>
        ))}
      </ul>
      <form action={logout} className="mt-10">
        <button className="text-sm text-muted hover:text-ink">Sign out</button>
      </form>
    </main>
  )
}
