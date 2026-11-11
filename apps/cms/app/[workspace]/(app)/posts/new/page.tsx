import type { Metadata } from 'next'
import { PostEditor } from '@/components/editor/post-editor'
import { requireWorkspace } from '@/lib/auth/access'
import { inWorkspace } from '@/lib/db'
import { editorContext } from '@/lib/editor-context'

export const metadata: Metadata = { title: 'New post' }

export default async function NewPost({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params
  const access = await requireWorkspace(workspace, 'posts.create')
  const ctx = await inWorkspace(access.workspace.id, (tx) => editorContext(tx, access))
  return <PostEditor post={null} ctx={ctx} />
}
