import 'server-only'
import type { Access } from '@/lib/auth/access'
import { countUnread, getMessage, listMessages, type InboxFilter } from '@/lib/content/contact'
import { inWorkspace, isId } from '@/lib/db'

export async function inboxData(access: Access, sp: { filter?: string; q?: string }, selectedId?: string) {
  const filter: InboxFilter = sp.filter === 'unread' || sp.filter === 'archived' ? sp.filter : 'inbox'
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 100) : ''
  const wsId = access.workspace.id
  return inWorkspace(wsId, async (tx) => ({
    filter,
    q,
    messages: await listMessages(tx, wsId, filter, q),
    selected: selectedId && isId(selectedId) ? await getMessage(tx, wsId, selectedId) : null,
    counts: { unread: await countUnread(tx, wsId) },
  }))
}
