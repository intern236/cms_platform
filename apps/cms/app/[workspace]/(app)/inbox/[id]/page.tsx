import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { InboxView } from '@/components/inbox/inbox-view'
import { requireWorkspace } from '@/lib/auth/access'
import { inboxData } from '@/lib/inbox-data'

export const metadata: Metadata = { title: 'Message' }

export default async function MessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; id: string }>
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const { workspace, id } = await params
  const access = await requireWorkspace(workspace, 'inbox.read')
  const data = await inboxData(access, await searchParams, id)
  if (!data.selected) notFound()
  return <InboxView workspace={workspace} {...data} />
}
