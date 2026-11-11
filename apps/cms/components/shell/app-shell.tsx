'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import {
  ArrowSquareOut,
  Buildings,
  CaretUpDown,
  Check,
  EnvelopeSimple,
  GearSix,
  List,
  MagnifyingGlass,
  Moon,
  NotePencil,
  Plus,
  SignOut,
  SquaresFour,
  Sun,
  Tray,
  UserCircle,
  UsersThree,
  X,
} from '@phosphor-icons/react'
import { logout } from '@/lib/actions/auth'
import { Avatar, WorkspaceMark } from '@/components/ui/avatar'
import { Kbd } from '@/components/ui/misc'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { ROLE_LABEL } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { CommandPalette } from './command-palette'
import type { NavItem, NavKey, ShellProps } from './types'

const ICONS: Record<NavKey, React.ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone' | 'bold' }>> = {
  dashboard: SquaresFour,
  posts: NotePencil,
  authors: UsersThree,
  inbox: Tray,
  settings: GearSix,
  clients: Buildings,
  team: UsersThree,
  outbox: EnvelopeSimple,
  account: UserCircle,
}

function isActive(item: NavItem, path: string) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`)
}

/**
 * The frame every signed-in page lives in: a sidebar on the paper frame, and the
 * page itself on an inset sheet. On phones the sidebar becomes a top bar and a
 * slide-over menu.
 */
export function AppShell({ children, ...props }: ShellProps & { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const path = usePathname()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* Close the phone menu whenever the page changes. */
  const [lastPath, setLastPath] = useState(path)
  if (lastPath !== path) {
    setLastPath(path)
    setMobileOpen(false)
  }

  return (
    <div className="min-h-dvh bg-sunken lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col px-3 py-3 lg:flex">
        <Sidebar {...props} onSearch={() => setPaletteOpen(true)} />
      </aside>

      <MobileBar {...props} onMenu={() => setMobileOpen(true)} onSearch={() => setPaletteOpen(true)} />

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-2 left-2 z-50 flex w-[290px] flex-col rounded-[24px] bg-sunken px-3 py-3 shadow-float lg:hidden"
              initial={{ x: '-110%' }}
              animate={{ x: 0 }}
              exit={{ x: '-110%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 z-10 grid size-8 place-items-center rounded-full text-muted hover:bg-line"
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
              <Sidebar {...props} onSearch={() => setPaletteOpen(true)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="min-w-0 px-2 pb-2 lg:py-3 lg:pl-0 lg:pr-3">
        <main id="main" className="relative min-h-[calc(100dvh-72px)] rounded-[22px] border border-line bg-canvas lg:min-h-[calc(100dvh-24px)] lg:rounded-[26px]">
          <motion.div
            key={path}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="mx-auto w-full max-w-[1180px] px-5 pb-20 pt-8 sm:px-8 lg:px-12 lg:pt-12"
          >
            {children}
          </motion.div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} {...props} />
    </div>
  )
}

function Sidebar({ user, workspace, workspaces, nav, agencyName, canCreatePost, onSearch }: ShellProps & { onSearch: () => void }) {
  const path = usePathname()
  return (
    <div className="flex h-full flex-col">
      <WorkspaceSwitcher user={user} workspace={workspace} workspaces={workspaces} agencyName={agencyName} />

      <button
        onClick={onSearch}
        className="mt-3 flex h-9 items-center gap-2.5 rounded-xl bg-canvas/60 px-3 text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--line)] transition hover:bg-canvas hover:text-ink"
      >
        <MagnifyingGlass size={15} />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>

      {workspace && canCreatePost && (
        <Link
          href={`/${workspace.slug}/posts/new`}
          className="group mt-2 flex h-10 items-center gap-2.5 rounded-xl bg-brand px-3 text-[13.5px] font-medium text-brand-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_2px_rgb(0_0_0/0.1)] transition hover:brightness-105"
        >
          <motion.span className="grid size-5 place-items-center rounded-md bg-white/20" whileHover={{ rotate: 90 }}>
            <Plus size={13} weight="bold" />
          </motion.span>
          New post
        </Link>
      )}

      <LayoutGroup id="sidebar-nav">
        <nav aria-label="Main" className="mt-5 flex flex-col gap-0.5">
          {nav.map((item) => {
            const Icon = ICONS[item.key]
            const active = isActive(item, path)
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-9 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors',
                  active ? 'text-ink' : 'text-ink-2/80 hover:text-ink'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl bg-canvas shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--line)]"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  />
                )}
                <span className="relative z-10 flex flex-1 items-center gap-3">
                  <Icon size={18} weight={active ? 'fill' : 'regular'} />
                  {item.label}
                </span>
                {!!item.badge && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="relative z-10 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 font-mono text-[10.5px] font-semibold text-brand-fg"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </motion.span>
                )}
                {active && <span className="absolute -left-3 top-2 h-5 w-[3px] rounded-r-full bg-brand" />}
              </Link>
            )
          })}
        </nav>
      </LayoutGroup>

      <div className="mt-auto flex flex-col gap-1 pt-6">
        {workspace?.siteUrl && (
          <a
            href={workspace.siteUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex h-9 items-center gap-3 rounded-xl px-3 text-[13px] text-muted transition hover:text-ink"
          >
            <ArrowSquareOut size={17} />
            <span className="truncate">{workspace.siteUrl.replace(/^https?:\/\//, '')}</span>
          </a>
        )}
        <UserMenu user={user} workspace={workspace} />
      </div>
    </div>
  )
}

function WorkspaceSwitcher({
  user,
  workspace,
  workspaces,
  agencyName,
}: Pick<ShellProps, 'user' | 'workspace' | 'workspaces' | 'agencyName'>) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-canvas/70 data-[state=open]:bg-canvas">
          {workspace ? (
            <WorkspaceMark slug={workspace.slug} name={workspace.name} accent={workspace.accent} hasLogo={workspace.hasLogo} size={36} version={workspace.logoVersion} />
          ) : (
            <span className="grid size-9 place-items-center rounded-[11px] bg-ink font-serif text-xl text-canvas">{agencyName.slice(0, 1)}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{workspace ? workspace.name : agencyName}</span>
            <span className="block truncate text-[12px] text-muted">
              {workspace ? (user.isAgency ? 'Agency access' : ROLE_LABEL[workspace.role]) : 'Agency'}
            </span>
          </span>
          <CaretUpDown size={15} className="text-faint transition group-hover:text-ink" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-[264px]">
        {user.isAgency && (
          <>
            <MenuItem asChild>
              <Link href="/agency">
                <Buildings />
                All clients
              </Link>
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuLabel>{user.isAgency ? 'Clients' : 'Your workspaces'}</MenuLabel>
        <div className="max-h-[50vh] overflow-y-auto">
          {workspaces.map((w) => (
            <MenuItem key={w.slug} asChild>
              <Link href={`/${w.slug}`}>
                <WorkspaceMark slug={w.slug} name={w.name} accent={w.accent} hasLogo={w.hasLogo} size={22} />
                <span className="flex-1 truncate">{w.name}</span>
                {workspace?.slug === w.slug && <Check size={14} weight="bold" className="!text-ink" />}
              </Link>
            </MenuItem>
          ))}
          {!workspaces.length && <p className="px-2.5 py-2 text-[13px] text-muted">No clients yet.</p>}
        </div>
        {user.isAgency && (
          <>
            <MenuSeparator />
            <MenuItem asChild>
              <Link href="/agency/new">
                <Plus />
                Add a client
              </Link>
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  )
}

export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  document.cookie = `cms_theme=${theme}; path=/; max-age=31536000; samesite=lax`
}

function UserMenu({ user, workspace }: Pick<ShellProps, 'user' | 'workspace'>) {
  const [dark, setDark] = useState(false)
  const readTheme = () => {
    const t = document.documentElement.dataset.theme
    setDark(t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)
  }
  return (
    <Menu onOpenChange={(o) => o && readTheme()}>
      <MenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-canvas/70 data-[state=open]:bg-canvas">
          <Avatar name={user.name} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
            <span className="block truncate text-[11.5px] text-muted">{user.email}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-[240px]">
        <MenuItem asChild>
          <Link href={workspace ? `/account?from=${workspace.slug}` : '/account'}>
            <UserCircle />
            Your account
          </Link>
        </MenuItem>
        <MenuItem
          onSelect={(e) => {
            e.preventDefault()
            const next = dark ? 'light' : 'dark'
            setTheme(next)
            setDark(!dark)
          }}
        >
          {dark ? <Sun /> : <Moon />}
          {dark ? 'Light mode' : 'Dark mode'}
        </MenuItem>
        <MenuSeparator />
        <form action={logout}>
          {workspace && !user.isAgency && <input type="hidden" name="workspace" value={workspace.slug} />}
          <MenuItem asChild danger>
            <button type="submit" className="w-full">
              <SignOut />
              Sign out
            </button>
          </MenuItem>
        </form>
      </MenuContent>
    </Menu>
  )
}

function MobileBar({ workspace, agencyName, onMenu, onSearch }: ShellProps & { onMenu: () => void; onSearch: () => void }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-sunken/85 px-3 backdrop-blur-md lg:hidden">
      <button onClick={onMenu} className="grid size-10 place-items-center rounded-xl text-ink hover:bg-canvas" aria-label="Open menu">
        <List size={20} />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {workspace ? (
          <WorkspaceMark slug={workspace.slug} name={workspace.name} accent={workspace.accent} hasLogo={workspace.hasLogo} size={26} version={workspace.logoVersion} />
        ) : (
          <span className="grid size-[26px] place-items-center rounded-lg bg-ink font-serif text-base text-canvas">{agencyName.slice(0, 1)}</span>
        )}
        <span className="truncate text-sm font-semibold">{workspace?.name ?? agencyName}</span>
      </div>
      <button onClick={onSearch} className="grid size-10 place-items-center rounded-xl text-ink hover:bg-canvas" aria-label="Search">
        <MagnifyingGlass size={19} />
      </button>
    </div>
  )
}
