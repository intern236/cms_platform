import 'server-only'
import { scoped, type Tx } from '@/lib/db'
import { cloudinary, cloudinaryConfigured, isOwnedAsset } from './config'
import { publicIdsInHtml } from './url'

/**
 * Deletes an image from Cloudinary — but only one inside this workspace's folder,
 * and only when no other post or author in the workspace still uses it.
 * Never throws: the worst case is an orphan the sweep script collects later.
 */

export type DeleteOutcome =
  | { status: 'deleted' }
  | { status: 'in-use'; by: number }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string }

export async function countReferences(tx: Tx, workspaceId: string, publicId: string, exceptPostId?: string): Promise<number> {
  const scope = scoped(tx, workspaceId)
  const candidates = await scope.posts.imageCandidates(publicId, exceptPostId)
  const inPosts = candidates.filter((p) => p.coverImage?.publicId === publicId || publicIdsInHtml(p.contentHtml).includes(publicId)).length
  const avatars = await scope.authors.avatarCandidates(publicId)
  return inPosts + avatars.filter((a) => a?.publicId === publicId).length
}

export async function destroyAsset(
  tx: Tx,
  workspaceId: string,
  publicId: string,
  options?: { exceptPostId?: string }
): Promise<DeleteOutcome> {
  if (!publicId) return { status: 'skipped', reason: 'no public id' }
  if (!cloudinaryConfigured()) return { status: 'skipped', reason: 'Cloudinary is not configured' }
  if (!isOwnedAsset(publicId, workspaceId)) return { status: 'skipped', reason: 'outside this workspace' }
  try {
    const references = await countReferences(tx, workspaceId, publicId, options?.exceptPostId)
    if (references > 0) return { status: 'in-use', by: references }
    const result = (await cloudinary.uploader.destroy(publicId, { invalidate: true })) as { result?: string }
    if (result.result === 'ok' || result.result === 'not found') return { status: 'deleted' }
    return { status: 'failed', error: result.result ?? 'unknown response' }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}
