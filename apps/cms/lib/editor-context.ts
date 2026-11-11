import 'server-only'
import type { EditorContext } from '@/components/editor/post-editor'
import type { Access } from '@/lib/auth/access'
import { cloudinaryConfigured } from '@/lib/cloudinary/config'
import { listAuthors } from '@/lib/content/authors'
import { usedCategories, usedTags } from '@/lib/content/posts'
import type { Tx } from '@/lib/db'
import { can } from '@/lib/permissions'

export async function editorContext(tx: Tx, access: Access): Promise<EditorContext> {
  const { workspace, role } = access
  const s = workspace.settings
  return {
    workspace: workspace.slug,
    siteUrl: workspace.siteUrl,
    basePath: s.blog.basePath,
    htmlPages: s.blog.htmlPages,
    faqsEnabled: s.blog.faqs,
    authorsEnabled: s.blog.authors,
    canPublish: can(role, 'posts.publish'),
    canDelete: can(role, 'posts.delete'),
    authors: s.blog.authors ? (await listAuthors(tx, workspace.id)).map((a) => ({ id: a.id, name: a.name, role: a.role })) : [],
    usedTags: await usedTags(tx, workspace.id),
    usedCategories: await usedCategories(tx, workspace.id),
    uploadsEnabled: cloudinaryConfigured(),
  }
}
