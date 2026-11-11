/**
 * Cloudinary types and limits, shared by the browser and the server.
 *
 * DELIBERATELY IMPORT-FREE. The SDK is server-only — it reads the API secret —
 * so anything a client component needs has to live in a module that does not
 * pull it in. Keeping the shapes and the validation constants here is what lets
 * the uploader component and the signing action agree on them without the
 * secret ever being reachable from a client bundle.
 */

/**
 * A stored image, as it is written onto a post.
 *
 * `publicId` is the load-bearing field: it is what lets the asset be
 * transformed, replaced or deleted later. The rest is metadata worth keeping so
 * a listing or a Media Library never has to call Cloudinary to render a row.
 *
 * `altText` and `caption` live here rather than on the post because they belong
 * to this use of this image, and a Media Library will want them travelling with
 * the asset record rather than scattered across whatever referenced it.
 */
export interface CloudinaryImage {
  url: string
  secureUrl: string
  publicId: string
  width: number
  height: number
  format: string
  bytes: number
  altText?: string
  caption?: string
}

/** The fields we read back from Cloudinary's upload response. Their payload has
 *  far more in it; this is the part we rely on and therefore the part we type. */
export interface CloudinaryUploadResult {
  public_id: string
  secure_url: string
  url: string
  width: number
  height: number
  format: string
  bytes: number
  resource_type: string
}

/** Everything the browser needs to upload directly, and nothing more. The API
 *  secret is used to compute `signature` on the server and never leaves it. */
export interface SignedUploadParams {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
}

export interface UploadProgress {
  loaded: number
  total: number
  /** 0-100, rounded. What the progress bar renders. */
  percent: number
}

export type UploadStatus = 'idle' | 'uploading' | 'error'

/** Where an upload is filed. Kept as a union rather than free strings so a typo
 *  cannot silently create a new Cloudinary folder that the sweep script then
 *  does not know to look in.
 *
 *  `avatar` is an author's portrait. It is its own kind rather than reusing
 *  `cover` because the two are cropped differently and by different rules — a
 *  cover is 16:9 with content-aware gravity, an avatar is a square centred on a
 *  FACE — and because filing people alongside post images would leave the sweep
 *  script unable to tell which is which. */
export type MediaFolder = 'cover' | 'body' | 'avatar'

// ---------------------------------------------------------------------------
// Validation — enforced in the browser for the message, and again on the server
// ---------------------------------------------------------------------------

/** 5MB, per the brief. Checked client-side so the failure is instant, and
 *  pinned again in the signed upload params so a hand-crafted request cannot
 *  exceed it. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const ACCEPTED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'] as const

/**
 * The cover size to supply, stated once and shown in the uploader.
 *
 * 16:9, WHICH IS WHAT EVERY SURFACE ALREADY USES. `COVER_CROP` in
 * lib/cloudinary/url.ts crops to `ar_16:9`, the blog index cards render 16:9,
 * the author page cards render 16:9, and the post page now does too. An upload
 * at this ratio is therefore passed through rather than cropped, so the writer
 * sees on the page exactly the frame they chose.
 *
 * 1280x720 RATHER THAN SOMETHING LARGER. 1280 is the widest entry in
 * COVER_WIDTHS that a layout actually requests — the 1920 above it exists for a
 * 2x wide desktop — so a source at 1280 is the smallest file that never has to
 * be upscaled at the sizes the site asks for. Supplying more costs upload time
 * and storage and changes nothing a reader sees.
 *
 * IT IS A RECOMMENDATION, NOT A CHECK, and deliberately not enforced. Cloudinary
 * crops whatever arrives to 16:9 with content-aware gravity, so an odd-shaped
 * image still produces a usable cover; refusing it would block a post over a
 * picture that was going to work. What the guidance buys is the writer knowing
 * which part of their image will survive before they upload it.
 */
export const RECOMMENDED_COVER = { width: 1280, height: 720 } as const

/** For the file input's `accept`, and for the first-pass check on the File. The
 *  authoritative check is Cloudinary's own `allowed_formats`, which inspects the
 *  bytes rather than trusting a MIME string the browser was handed. */
export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const ACCEPT_ATTRIBUTE = ACCEPTED_MIME_TYPES.join(',')

/** Human-readable, and used verbatim in the UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The client-side gate. Returns a message to show, or null when the file is
 * acceptable — so a caller reads as `const problem = validateFile(f)`.
 *
 * This is a courtesy, not a control: it exists so someone dragging a 40MB TIFF
 * finds out immediately instead of after a long upload. The real limits are on
 * the signed parameters, which the browser cannot alter without invalidating
 * the signature.
 */
export function validateFile(file: File): string | null {
  const type = file.type.toLowerCase()
  if (!ACCEPTED_MIME_TYPES.includes(type as (typeof ACCEPTED_MIME_TYPES)[number])) {
    return 'Unsupported file format. Please upload a JPG, PNG or WEBP image.'
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That image is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`
  }
  if (file.size === 0) {
    return 'That file is empty.'
  }
  return null
}
