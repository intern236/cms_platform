import { actionAccess } from '@/lib/auth/access'
import { allMessages, csvCell } from '@/lib/content/contact'
import { inWorkspace } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Every message as CSV, formula-safe for Excel. Same permission as reading the inbox. */
export async function GET(_req: Request, { params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params
  const gate = await actionAccess(workspace, 'inbox.read')
  if (!gate.ok) return new Response('Not found', { status: 404 })
  const wsId = gate.access.workspace.id
  const rows = await inWorkspace(wsId, (tx) => allMessages(tx, wsId))
  const header = ['Received', 'Name', 'Email', 'Phone', 'Company', 'Topic', 'Message', 'Read', 'Archived']
  const lines = [
    header.map(csvCell).join(','),
    ...rows.map((m) =>
      [m.receivedAt.toISOString(), m.name, m.email, m.phone, m.company, m.topic, m.message, m.readAt ? 'yes' : 'no', m.archived ? 'yes' : 'no']
        .map(csvCell)
        .join(',')
    ),
  ]
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${gate.access.workspace.slug}-enquiries-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
