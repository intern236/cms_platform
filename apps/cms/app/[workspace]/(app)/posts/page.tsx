import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { PostsList, type PostRow } from '@/components/posts/posts-list'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { requireWorkspace } from '@/lib/auth/access'
import { thumbUrl } from '@/lib/cloudinary/url'
import { authorsByIds } from '@/lib/content/authors'
import { displayStatus, listPosts, type DisplayStatus } from '@/lib/content/posts'
import { inWorkspace } from '@/lib/db'
import { can } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Posts' }

const FILTERS = ['all', 'draft', 'review', 'scheduled', 'published'] as const

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const { workspace: slug } = await params
  const sp = await searchParams
  const access = await requireWorkspace(slug)
  const { workspace, role, user } = access
  const status = (FILTERS as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof FILTERS)[number]) : 'all'
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 100) : ''
  const createdBy = can(role, 'posts.editAny') ? undefined : user.id

  const { rows, counts } = await inWorkspace(workspace.id, async (tx) => {
    const all = await listPosts(tx, workspace.id, { createdBy, q })
    const counts = { all: all.length, draft: 0, review: 0, scheduled: 0, published: 0 } as Record<'all' | DisplayStatus, number>
    for (const p of all) counts[displayStatus(p)]++
    const shown = status === 'all' ? all : all.filter((p) => displayStatus(p) === status)
    const authors = await authorsByIds(tx, workspace.id, shown.map((p) => p.authorId ?? '').filter(Boolean))
    const rows: PostRow[] = shown.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: displayStatus(p),
      category: p.category,
      author: p.authorId ? (authors.get(p.authorId)?.name ?? null) : null,
      cover: p.coverImage ? thumbUrl(p.coverImage.publicId, 160) : null,
      updatedAt: p.updatedAt.toISOString(),
      publishedAt: p.publishedAt?.toISOString() ?? null,
      readingMinutes: p.readingMinutes,
      tags: p.tags,
    }))
    return { rows, counts }
  })

  return (
    <>
      <PageHeader
        title="Posts"
        description={createdBy ? 'Your drafts and the posts you sent for review.' : `Everything on the ${workspace.settings.blog.title.toLowerCase()}, newest edit first.`}
        actions={
          can(role, 'posts.create') && (
            <Button asChild variant="brand">
              <Link href={`/${slug}/posts/new`}>
                <Plus weight="bold" />
                New post
              </Link>
            </Button>
          )
        }
      />
      <PostsList base={`/${slug}`} posts={rows} counts={counts} status={status} q={q} canCreate={can(role, 'posts.create')} />
    </>
  )
}
