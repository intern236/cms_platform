import type { Metadata } from 'next'
import { InboxView } from '@/components/inbox/inbox-view'
import { requireWorkspace } from '@/lib/auth/access'
import { inboxData } from '@/lib/inbox-data'

export const metadata: Metadata = { title: 'Inbox' }

export default async function InboxPage({ params, searchParams }: { params: Promise<{ workspace: string }>; searchParams: Promise<{ filter?: string; q?: string }> }) {
  const { workspace } = await params
  const access = await requireWorkspace(workspace, 'inbox.read')
  const data = await inboxData(access, await searchParams)
  return <InboxView workspace={workspace} {...data} selected={null} />
}
