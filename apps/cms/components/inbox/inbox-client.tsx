'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, ArrowUUpLeft, EnvelopeSimple, EnvelopeSimpleOpen, MagnifyingGlass, Trash } from '@phosphor-icons/react'
import { removeMessage, setMessageState } from '@/lib/actions/content'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/confirm'
import { Tooltip } from '@/components/ui/misc'

/** Opening a message marks it read, once. */
export function MarkRead({ workspace, id, unread }: { workspace: string; id: string; unread: boolean }) {
  const router = useRouter()
  const done = useRef(false)
  useEffect(() => {
    if (!unread || done.current) return
    done.current = true
    void setMessageState(workspace, id, { read: true }).then(() => router.refresh())
  }, [workspace, id, unread, router])
  return null
}

export function InboxSearch({ initial }: { initial: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState(initial)
  const [, start] = useTransition()
  useEffect(() => {
    if (q === initial) return
    const t = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (q) next.set('q', q)
      else next.delete('q')
      start(() => router.replace(`${pathname}?${next}`, { scroll: false }))
    }, 250)
    return () => clearTimeout(t)
  }, [q, initial, params, pathname, router])
  return (
    <label className="relative flex h-10 items-center">
      <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, email, message…"
        aria-label="Search messages"
        className="h-full w-full rounded-full bg-surface pl-10 pr-4 text-sm shadow-[inset_0_0_0_1px_var(--line-strong)] placeholder:text-faint focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--brand),var(--ring)]"
      />
    </label>
  )
}

export function MessageActions({
  workspace,
  id,
  email,
  name,
  archived,
  filterQs,
}: {
  workspace: string
  id: string
  email: string
  name: string
  archived: boolean
  filterQs: string
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const act = async (patch: { read?: boolean; archived?: boolean }, message: string, leave?: boolean) => {
    const r = await setMessageState(workspace, id, patch)
    if (!r.ok) return toast.error(r.error)
    toast.success(message)
    if (leave) router.push(`/${workspace}/inbox${filterQs}`)
    else router.refresh()
  }
  return (
    <div className="flex items-center gap-1.5">
      <Button asChild variant="ink" size="sm">
        <a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Re: your message`)}`}>
          <ArrowUUpLeft weight="bold" /> Reply
        </a>
      </Button>
      <Tooltip label="Mark unread">
        <Button variant="outline" size="icon-sm" onClick={() => act({ read: false }, 'Marked unread', true)} aria-label="Mark unread">
          <EnvelopeSimple />
        </Button>
      </Tooltip>
      <Tooltip label={archived ? 'Move to inbox' : 'Archive'}>
        <Button variant="outline" size="icon-sm" onClick={() => act({ archived: !archived }, archived ? 'Moved to inbox' : 'Archived', true)} aria-label={archived ? 'Unarchive' : 'Archive'}>
          {archived ? <EnvelopeSimpleOpen /> : <Archive />}
        </Button>
      </Tooltip>
      <Tooltip label="Delete">
        <Button variant="outline" size="icon-sm" onClick={() => setConfirm(true)} aria-label="Delete" className="text-danger">
          <Trash />
        </Button>
      </Tooltip>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this message?"
        description={`The message from ${name} will be gone for good. Archive it instead if you might need it.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          const r = await removeMessage(workspace, id)
          if (!r.ok) return void toast.error(r.error)
          setConfirm(false)
          toast.success('Message deleted')
          router.push(`/${workspace}/inbox${filterQs}`)
        }}
      />
    </div>
  )
}
