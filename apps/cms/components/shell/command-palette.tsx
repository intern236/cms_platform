'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Buildings, MagnifyingGlass, Moon, NotePencil, Plus, SignOut, Sun } from '@phosphor-icons/react'
import { logout } from '@/lib/actions/auth'
import { searchPosts } from '@/lib/actions/search'
import { WorkspaceMark } from '@/components/ui/avatar'
import { StatusPill, type StatusKind } from '@/components/ui/status'
import { setTheme } from './app-shell'
import type { ShellProps } from './types'

/**
 * ⌘K. Jump anywhere, switch clients, find a post by title, start a new one.
 */
export function CommandPalette({
  open,
  onOpenChange,
  workspace,
  workspaces,
  nav,
  user,
  canCreatePost,
}: ShellProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; title: string; status: StatusKind }[]>([])
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!workspace || !open) return
    const t = setTimeout(() => {
      startTransition(async () => setResults(await searchPosts(workspace.slug, query)))
    }, 140)
    return () => clearTimeout(t)
  }, [query, workspace, open])

  const go = (href: string) => {
    setQuery('')
    onOpenChange(false)
    router.push(href)
  }

  const item =
    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-2 data-[selected=true]:bg-sunken data-[selected=true]:text-ink [&_svg]:size-[18px] [&_svg]:text-muted'

  return (
    <D.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery('')
        onOpenChange(o)
      }}
    >
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[rgb(12_12_13/0.25)] backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </D.Overlay>
            <D.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed left-1/2 top-[14vh] z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[22px] border border-line bg-surface shadow-float"
                initial={{ opacity: 0, scale: 0.96, y: -12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -8, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 480, damping: 34 }}
              >
                <D.Title className="sr-only">Command palette</D.Title>
                <Command loop label="Command palette" shouldFilter={true}>
                  <div className="flex items-center gap-3 border-b border-line px-4">
                    <MagnifyingGlass size={18} className="text-muted" />
                    <Command.Input
                      value={query}
                      onValueChange={setQuery}
                      placeholder={workspace ? `Search ${workspace.name}…` : 'Search…'}
                      className="h-14 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none focus-visible:shadow-none"
                    />
                    <kbd className="font-mono text-[11px] text-faint">esc</kbd>
                  </div>
                  <Command.List className="max-h-[56vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-faint">
                    <Command.Empty className="px-3 py-10 text-center text-sm text-muted">Nothing matches “{query}”.</Command.Empty>

                    {workspace && canCreatePost && (
                      <Command.Group heading="Create">
                        <Command.Item className={item} value="new post write" onSelect={() => go(`/${workspace.slug}/posts/new`)}>
                          <Plus /> New post
                          <ArrowRight className="ml-auto opacity-0 transition group-data-[selected=true]:opacity-100" />
                        </Command.Item>
                      </Command.Group>
                    )}

                    {workspace && results.length > 0 && (
                      <Command.Group heading="Posts">
                        {results.map((r) => (
                          <Command.Item key={r.id} className={item} value={`post ${r.title} ${r.id}`} onSelect={() => go(`/${workspace.slug}/posts/${r.id}`)}>
                            <NotePencil />
                            <span className="flex-1 truncate">{r.title}</span>
                            <StatusPill status={r.status} />
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}

                    <Command.Group heading="Go to">
                      {nav.map((n) => (
                        <Command.Item key={n.key} className={item} value={`go ${n.label}`} onSelect={() => go(n.href)}>
                          <ArrowRight /> {n.label}
                        </Command.Item>
                      ))}
                      {user.isAgency && (
                        <Command.Item className={item} value="go agency all clients" onSelect={() => go('/agency')}>
                          <Buildings /> All clients
                        </Command.Item>
                      )}
                    </Command.Group>

                    {workspaces.some((w) => w.slug !== workspace?.slug) && (
                      <Command.Group heading={workspace ? 'Switch client' : 'Open client'}>
                        {workspaces.filter((w) => w.slug !== workspace?.slug).map((w) => (
                          <Command.Item key={w.slug} className={item} value={`switch ${w.name} ${w.slug}`} onSelect={() => go(`/${w.slug}`)}>
                            <WorkspaceMark slug={w.slug} name={w.name} accent={w.accent} hasLogo={w.hasLogo} size={20} />
                            {w.name}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}

                    <Command.Group heading="Preferences">
                      <Command.Item className={item} value="theme dark mode" onSelect={() => { setTheme('dark'); onOpenChange(false) }}>
                        <Moon /> Dark mode
                      </Command.Item>
                      <Command.Item className={item} value="theme light mode" onSelect={() => { setTheme('light'); onOpenChange(false) }}>
                        <Sun /> Light mode
                      </Command.Item>
                      <Command.Item className={item} value="sign out log out" onSelect={() => { const f = new FormData(); if (workspace && !user.isAgency) f.set('workspace', workspace.slug); void logout(f) }}>
                        <SignOut /> Sign out
                      </Command.Item>
                    </Command.Group>
                  </Command.List>
                </Command>
              </motion.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  )
}
