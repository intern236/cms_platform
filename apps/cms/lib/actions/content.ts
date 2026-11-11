'use server'

import { revalidatePath } from 'next/cache'
import { actionAccess } from '@/lib/auth/access'
import { audit } from '@/lib/audit'
import { cloudinary, cloudinaryConfigured, folderFor, mediaRoot } from '@/lib/cloudinary/config'
import { destroyAsset } from '@/lib/cloudinary/delete'
import { ACCEPTED_FORMATS, MAX_UPLOAD_BYTES, type CloudinaryImage, type MediaFolder, type SignedUploadParams } from '@/lib/cloudinary/types'
import { bodyUrl } from '@/lib/cloudinary/url'
import {
  AUTHOR_LIMITS,
  authorSlugTaken,
  deleteAuthor as deleteAuthorRow,
  getAuthor,
  insertAuthor,
  updateAuthor,
  type AuthorRecord,
} from '@/lib/content/authors'
import { deleteMessage, updateMessage } from '@/lib/content/contact'
import { livePosts } from '@/lib/content/posts'
import { inWorkspace, isId } from '@/lib/db'
import { notifySite } from '@/lib/integrations/webhooks'
import { checkOutboundUrl } from '@/lib/integrations/net'
import { slugify } from '@/lib/slug'

/**
 * Authors, inbox and media. Same rules as lib/actions/posts.ts: every action
 * re-checks session, workspace and role, and coerces everything it is sent.
 */

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asImage(value: unknown): CloudinaryImage | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const publicId = asString(raw.publicId)
  if (!publicId) return null
  return {
    url: asString(raw.url),
    secureUrl: asString(raw.secureUrl),
    publicId,
    width: Number(raw.width) || 0,
    height: Number(raw.height) || 0,
    format: asString(raw.format),
    bytes: Number(raw.bytes) || 0,
  }
}

function asUrl(value: unknown, field: string, errors: Record<string, string>): string | null {
  const raw = asString(value)
  if (!raw) return null
  if (raw.length > AUTHOR_LIMITS.url) {
    errors[field] = 'That address is too long.'
    return null
  }
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error()
    return parsed.toString()
  } catch {
    errors[field] = 'Enter a full web address, starting https://'
    return null
  }
}

// ---- Authors -----------------------------------------------------------------

export type AuthorPayload = {
  id?: string
  name: unknown
  slug: unknown
  role: unknown
  bio: unknown
  avatar: unknown
  avatarAlt: unknown
  linkedinUrl: unknown
  xUrl: unknown
  websiteUrl: unknown
}

export type SaveAuthorResult = { ok: true; id: string; slug: string } | { ok: false; errors: Record<string, string> }

export async function saveAuthor(workspace: string, payload: AuthorPayload): Promise<SaveAuthorResult> {
  const gate = await actionAccess(workspace, 'authors.manage')
  if (!gate.ok) return { ok: false, errors: { form: gate.error } }
  const { access } = gate
  const wsId = access.workspace.id

  const name = asString(payload.name)
  const role = asString(payload.role)
  const bio = asString(payload.bio)
  const avatarAlt = asString(payload.avatarAlt)
  const avatar = asImage(payload.avatar)
  const slug = slugify(asString(payload.slug) || name)
  const errors: Record<string, string> = {}
  const linkedinUrl = asUrl(payload.linkedinUrl, 'linkedinUrl', errors)
  const xUrl = asUrl(payload.xUrl, 'xUrl', errors)
  const websiteUrl = asUrl(payload.websiteUrl, 'websiteUrl', errors)
  if (!name) errors.name = 'Give the author a name.'
  else if (name.length > AUTHOR_LIMITS.name) errors.name = `Keep it under ${AUTHOR_LIMITS.name} characters.`
  if (!slug) errors.slug = 'The address is empty once tidied. Try different words.'
  if (role.length > AUTHOR_LIMITS.role) errors.role = `Keep it under ${AUTHOR_LIMITS.role} characters.`
  if (bio.length > AUTHOR_LIMITS.bio) errors.bio = `Keep the bio under ${AUTHOR_LIMITS.bio} characters.`
  if (avatarAlt.length > AUTHOR_LIMITS.avatarAlt) errors.avatarAlt = `Keep it under ${AUTHOR_LIMITS.avatarAlt} characters.`
  if (payload.avatar && !avatar) errors.avatar = 'That photo is not valid. Upload it again.'
  if (avatar && !avatar.publicId.startsWith(`${mediaRoot(wsId)}/`)) errors.avatar = 'That photo belongs to another site. Upload it again.'
  if (avatar && avatar.bytes > MAX_UPLOAD_BYTES) errors.avatar = 'That photo is over the size limit.'
  if (Object.keys(errors).length) return { ok: false, errors }
  if (payload.id !== undefined && !isId(payload.id)) return { ok: false, errors: { form: 'That author no longer exists.' } }

  return inWorkspace(wsId, async (tx): Promise<SaveAuthorResult> => {
    const existing = payload.id ? await getAuthor(tx, wsId, payload.id) : null
    if (payload.id && !existing) return { ok: false, errors: { form: 'That author no longer exists.' } }
    const hasLive = existing ? (await livePosts(tx, wsId, { limit: 1, offset: 0, authorId: existing.id })).total > 0 : false
    const finalSlug = hasLive ? existing!.slug : slug
    if (!hasLive && (await authorSlugTaken(tx, wsId, finalSlug, existing?.id))) {
      return { ok: false, errors: { slug: 'Another author already uses this address.' } }
    }
    const record: AuthorRecord = {
      slug: finalSlug,
      name,
      role: role || null,
      bio: bio || null,
      avatar: avatar ? { ...avatar, ...(avatarAlt ? { altText: avatarAlt } : {}) } : null,
      linkedinUrl,
      xUrl,
      websiteUrl,
      updatedAt: new Date(),
    }
    let id: string
    if (existing) {
      await updateAuthor(tx, wsId, existing.id, record)
      id = existing.id
    } else {
      id = await insertAuthor(tx, wsId, record)
    }
    await audit(tx, {
      workspaceId: wsId,
      actor: { id: access.user.id, name: access.user.name },
      action: existing ? 'author.updated' : 'author.created',
      targetType: 'author',
      targetId: id,
      summary: `${existing ? 'updated' : 'added'} author ${name}`,
    })
    const previous = existing?.avatar?.publicId
    if (previous && previous !== avatar?.publicId) await destroyAsset(tx, wsId, previous)
    if (hasLive || existing) notifySite(wsId, 'author.updated', { authors: [finalSlug] })
    return { ok: true, id, slug: finalSlug }
  })
}

export type DeleteAuthorResult = { ok: true; unassigned: number } | { ok: false; error: string }

export async function deleteAuthor(workspace: string, id: string): Promise<DeleteAuthorResult> {
  const gate = await actionAccess(workspace, 'authors.manage')
  if (!gate.ok) return { ok: false, error: gate.error }
  const { access } = gate
  const wsId = access.workspace.id
  if (!isId(id)) return { ok: false, error: 'That author no longer exists.' }
  return inWorkspace(wsId, async (tx): Promise<DeleteAuthorResult> => {
    const author = await getAuthor(tx, wsId, id)
    if (!author) return { ok: false, error: 'That author no longer exists.' }
    const unassigned = await deleteAuthorRow(tx, wsId, id)
    await audit(tx, {
      workspaceId: wsId,
      actor: { id: access.user.id, name: access.user.name },
      action: 'author.deleted',
      targetType: 'author',
      targetId: id,
      summary: `removed author ${author.name}`,
    })
    if (author.avatar) await destroyAsset(tx, wsId, author.avatar.publicId)
    notifySite(wsId, 'author.updated', { authors: [author.slug] })
    return { ok: true, unassigned }
  })
}

// ---- Inbox -------------------------------------------------------------------

export type InboxResult = { ok: true } | { ok: false; error: string }

export async function setMessageState(workspace: string, id: unknown, patch: { read?: boolean; archived?: boolean }): Promise<InboxResult> {
  const gate = await actionAccess(workspace, 'inbox.read')
  if (!gate.ok) return { ok: false, error: gate.error }
  const wsId = gate.access.workspace.id
  if (!isId(id)) return { ok: false, error: 'That message no longer exists.' }
  const clean: { read?: boolean; archived?: boolean } = {}
  if (typeof patch?.read === 'boolean') clean.read = patch.read
  if (typeof patch?.archived === 'boolean') {
    clean.archived = patch.archived
    clean.read = true
  }
  const ok = await inWorkspace(wsId, (tx) => updateMessage(tx, wsId, id, clean))
  revalidatePath(`/${gate.access.workspace.slug}`, 'layout')
  return ok ? { ok: true } : { ok: false, error: 'That message no longer exists.' }
}

export async function removeMessage(workspace: string, id: unknown): Promise<InboxResult> {
  const gate = await actionAccess(workspace, 'inbox.read')
  if (!gate.ok) return { ok: false, error: gate.error }
  const { access } = gate
  const wsId = access.workspace.id
  if (!isId(id)) return { ok: false, error: 'That message no longer exists.' }
  const ok = await inWorkspace(wsId, async (tx) => {
    const done = await deleteMessage(tx, wsId, id)
    if (done) {
      await audit(tx, {
        workspaceId: wsId,
        actor: { id: access.user.id, name: access.user.name },
        action: 'message.deleted',
        targetType: 'message',
        targetId: id,
        summary: 'deleted a message',
      })
    }
    return done
  })
  revalidatePath(`/${access.workspace.slug}`, 'layout')
  return ok ? { ok: true } : { ok: false, error: 'That message no longer exists.' }
}

// ---- Media -------------------------------------------------------------------

export type SignResult = { ok: true; params: SignedUploadParams } | { ok: false; error: string }

/** Signs a direct browser → Cloudinary upload into this workspace's folder only. */
export async function signUpload(workspace: string, kind: MediaFolder): Promise<SignResult> {
  const gate = await actionAccess(workspace, kind === 'avatar' ? 'authors.manage' : 'posts.create')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!cloudinaryConfigured()) return { ok: false, error: 'Image uploads are not set up on this server yet.' }
  const folder = folderFor(gate.access.workspace.id, kind === 'body' || kind === 'avatar' ? kind : 'cover')
  const timestamp = Math.round(Date.now() / 1000)
  const params = { folder, timestamp, allowed_formats: ACCEPTED_FORMATS.join(',') }
  try {
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET as string)
    return {
      ok: true,
      params: {
        cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME as string,
        apiKey: process.env.CLOUDINARY_API_KEY as string,
        timestamp,
        signature,
        folder,
      },
    }
  } catch {
    return { ok: false, error: 'Could not start the upload. Try again.' }
  }
}

export type AdoptResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Imports an image pasted from another site into this workspace's folder.
 * Cloudinary fetches it, not this server — but the address is still checked so
 * nobody can make our account fetch from a private network.
 */
export async function adoptRemoteImage(workspace: string, sourceUrl: string): Promise<AdoptResult> {
  const gate = await actionAccess(workspace, 'posts.create')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!cloudinaryConfigured()) return { ok: false, error: 'Image uploads are not set up on this server yet.' }
  const check = await checkOutboundUrl(String(sourceUrl))
  if (!check.ok) return { ok: false, error: 'That image address cannot be imported.' }
  try {
    const result = (await cloudinary.uploader.upload(check.url.toString(), {
      folder: folderFor(gate.access.workspace.id, 'body'),
      resource_type: 'image',
      allowed_formats: [...ACCEPTED_FORMATS],
    })) as { public_id: string; bytes: number }
    if (result.bytes > MAX_UPLOAD_BYTES) {
      await inWorkspace(gate.access.workspace.id, (tx) => destroyAsset(tx, gate.access.workspace.id, result.public_id))
      return { ok: false, error: 'That image is over the size limit.' }
    }
    return { ok: true, url: bodyUrl(result.public_id) }
  } catch {
    return { ok: false, error: 'That image could not be imported.' }
  }
}

export async function deleteUpload(workspace: string, publicId: string, exceptPostId?: string): Promise<{ ok: boolean }> {
  const gate = await actionAccess(workspace, 'posts.create')
  if (!gate.ok) return { ok: false }
  const wsId = gate.access.workspace.id
  const outcome = await inWorkspace(wsId, (tx) =>
    destroyAsset(tx, wsId, String(publicId), { exceptPostId: isId(exceptPostId) ? exceptPostId : undefined })
  )
  return { ok: outcome.status !== 'failed' }
}
