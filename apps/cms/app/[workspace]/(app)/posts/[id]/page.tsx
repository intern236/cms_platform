import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PostEditor, type EditorPost } from '@/components/editor/post-editor'
import { requireWorkspace } from '@/lib/auth/access'
import { canEditPost } from '@/lib/content/post-access'
import { displayStatus, getPost, hasGoneLive } from '@/lib/content/posts'
import { inWorkspace, isId } from '@/lib/db'
import { editorContext } from '@/lib/editor-context'

export const metadata: Metadata = { title: 'Edit post' }

export default async function EditPost({ params }: { params: Promise<{ workspace: string; id: string }> }) {
  const { workspace, id } = await params
  const access = await requireWorkspace(workspace, 'posts.create')
  if (!isId(id)) notFound()
  const data = await inWorkspace(access.workspace.id, async (tx) => {
    const post = await getPost(tx, access.workspace.id, id)
    if (!post || !canEditPost(access, post)) return null
    return { post, ctx: await editorContext(tx, access) }
  })
  if (!data) notFound()
  const { post, ctx } = data
  const editorPost: EditorPost = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    description: post.description,
    excerpt: post.excerpt ?? '',
    format: post.format,
    contentHtml: post.contentHtml,
    coverImage: post.coverImage,
    coverAlt: post.coverAlt ?? '',
    coverCaption: post.coverCaption ?? '',
    category: post.category ?? '',
    tags: post.tags,
    faqs: post.faqs,
    authorId: post.authorId ?? '',
    seoTitle: post.seoTitle ?? '',
    focusKeyword: post.focusKeyword ?? '',
    status: displayStatus(post),
    publishedAt: post.publishedAt?.toISOString() ?? null,
    everLive: hasGoneLive(post),
    updatedAt: post.updatedAt.toISOString(),
  }
  return <PostEditor key={post.id} post={editorPost} ctx={ctx} />
}
