import type { Metadata } from 'next'
import { AuthorsBoard } from '@/components/authors/authors-board'
import { PageHeader } from '@/components/ui/page-header'
import { requireWorkspace } from '@/lib/auth/access'
import { cloudinaryConfigured } from '@/lib/cloudinary/config'
import { listAuthors } from '@/lib/content/authors'
import { countPostsByAuthor } from '@/lib/content/posts'
import { inWorkspace } from '@/lib/db'

export const metadata: Metadata = { title: 'Authors' }

export default async function AuthorsPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params
  const access = await requireWorkspace(workspace, 'authors.manage')
  const wsId = access.workspace.id
  const authors = await inWorkspace(wsId, async (tx) => {
    const list = await listAuthors(tx, wsId)
    return Promise.all(list.map(async (a) => ({ ...a, posts: await countPostsByAuthor(tx, wsId, a.id) })))
  })
  return (
    <>
      <PageHeader title="Authors" description="The people behind the posts. Each gets a byline, a photo and a profile page." />
      <AuthorsBoard
        workspace={workspace}
        uploadsEnabled={cloudinaryConfigured()}
        authors={authors.map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          role: a.role,
          bio: a.bio,
          avatar: a.avatar,
          avatarAlt: a.avatarAlt,
          linkedinUrl: a.linkedinUrl,
          xUrl: a.xUrl,
          websiteUrl: a.websiteUrl,
          posts: a.posts,
        }))}
      />
    </>
  )
}
