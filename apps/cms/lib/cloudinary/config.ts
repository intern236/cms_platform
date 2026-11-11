import 'server-only'
import { v2 as cloudinary } from 'cloudinary'
import type { MediaFolder } from './types'

/**
 * ONE Cloudinary account for every client, ONE folder per workspace:
 * `cms/<workspace id>/…`. The id never changes, so renaming a client never orphans
 * their images, and deletes are refused for anything outside the workspace's folder.
 */

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

export { cloudinary }

export function mediaRoot(workspaceId: string): string {
  return `${process.env.CLOUDINARY_FOLDER?.trim() || 'cms'}/${workspaceId}`
}

const SUBFOLDER: Record<MediaFolder, string> = {
  cover: 'posts/covers',
  body: 'posts/body',
  avatar: 'authors',
}

export function folderFor(workspaceId: string, kind: MediaFolder): string {
  return `${mediaRoot(workspaceId)}/${SUBFOLDER[kind]}`
}

export function isOwnedAsset(publicId: string, workspaceId: string): boolean {
  return publicId.startsWith(`${mediaRoot(workspaceId)}/`) && !publicId.includes('..')
}

export function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  )
}
