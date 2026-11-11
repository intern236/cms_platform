import { deleteUpload, signUpload } from '@/lib/actions/content'
import {
  ACCEPTED_FORMATS,
  MAX_UPLOAD_BYTES,
  formatBytes,
  validateFile,
  type CloudinaryImage,
  type CloudinaryUploadResult,
  type MediaFolder,
  type UploadProgress,
} from './types'

/**
 * Browser → Cloudinary upload, signed by the CMS for this workspace's folder only.
 * The file never passes through our server.
 */

export type UploadOutcome = { ok: true; image: CloudinaryImage } | { ok: false; error: string; cancelled?: boolean }

export interface UploadHandle {
  done: Promise<UploadOutcome>
  cancel: () => void
}

export function startUpload(workspace: string, file: File, kind: MediaFolder, onProgress?: (p: UploadProgress) => void): UploadHandle {
  let request: XMLHttpRequest | null = null
  let cancelled = false
  const done = (async (): Promise<UploadOutcome> => {
    const problem = validateFile(file)
    if (problem) return { ok: false, error: problem }
    const signed = await signUpload(workspace, kind)
    if (!signed.ok) return { ok: false, error: signed.error }
    if (cancelled) return { ok: false, error: 'Upload cancelled.', cancelled: true }
    const { cloudName, apiKey, timestamp, signature, folder } = signed.params
    const form = new FormData()
    form.append('file', file)
    form.append('api_key', apiKey)
    form.append('timestamp', String(timestamp))
    form.append('signature', signature)
    form.append('folder', folder)
    form.append('allowed_formats', ACCEPTED_FORMATS.join(','))
    return new Promise<UploadOutcome>((resolve) => {
      const xhr = new XMLHttpRequest()
      request = xhr
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress({ loaded: e.loaded, total: e.total, percent: Math.round((e.loaded / e.total) * 100) })
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const r = JSON.parse(xhr.responseText) as CloudinaryUploadResult
            const image: CloudinaryImage = {
              url: r.url,
              secureUrl: r.secure_url,
              publicId: r.public_id,
              width: r.width,
              height: r.height,
              format: r.format,
              bytes: r.bytes,
            }
            if (image.bytes > MAX_UPLOAD_BYTES) {
              void deleteUpload(workspace, image.publicId)
              resolve({ ok: false, error: `That image is ${formatBytes(image.bytes)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.` })
              return
            }
            resolve({ ok: true, image })
          } catch {
            resolve({ ok: false, error: 'The upload finished but the response could not be read.' })
          }
          return
        }
        let message = 'Upload failed. Try again.'
        try {
          const body = JSON.parse(xhr.responseText) as { error?: { message?: string } }
          if (body.error?.message) message = body.error.message
        } catch {
          /* keep generic */
        }
        resolve({ ok: false, error: message })
      }
      xhr.onerror = () => resolve({ ok: false, error: 'Upload failed. Check your connection.' })
      xhr.ontimeout = () => resolve({ ok: false, error: 'The upload timed out.' })
      xhr.onabort = () => resolve({ ok: false, error: 'Upload cancelled.', cancelled: true })
      xhr.timeout = 120_000
      xhr.send(form)
    })
  })()
  return {
    done,
    cancel: () => {
      cancelled = true
      request?.abort()
    },
  }
}
