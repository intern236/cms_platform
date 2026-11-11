import type { CloudinaryImage } from '@/lib/cloudinary/types'

/**
 * Delivery URLs, built from a public id.
 *
 * CLIENT-SAFE BY CONSTRUCTION: it needs the cloud name and nothing else, so it
 * imports no SDK and reaches no secret. That is what lets the same function
 * render a preview in the editor and the finished image on the public page.
 *
 * URLS ARE BUILT, NOT STORED. The `secureUrl` Cloudinary returns points at the
 * original upload — full size, original format, no transformation. Storing that
 * and rendering it would ship a 4MB PNG to a phone. Storing the `publicId` and
 * composing the URL at render time means the transformation is a property of
 * the place it is displayed, and changing how covers are cropped is a change to
 * this file rather than a re-upload of every image ever published.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

/**
 * The two that belong on everything.
 *
 *   f_auto  serves AVIF or WebP to browsers that take them, the original format
 *           to those that do not — decided per request, not at upload time
 *   q_auto  picks a quality level from the image's own content, which saves far
 *           more than a fixed number and never visibly degrades a flat graphic
 */
const ALWAYS = 'f_auto,q_auto'

/** The widths a cover is offered at. Chosen to cover a phone at 2x, a laptop,
 *  and a wide desktop at 2x without generating a variant nobody requests —
 *  Cloudinary bills per transformation, so a long list is not free. */
export const COVER_WIDTHS = [640, 960, 1280, 1920] as const

/** 16:9, the standard blog ratio. `c_fill` crops rather than distorts, and
 *  `g_auto` picks the crop window from the image's own content, so a face or a
 *  subject near an edge survives the crop instead of being cut in half. */
const COVER_CROP = 'c_fill,g_auto,ar_16:9'

export function cloudinaryConfiguredForBrowser(): boolean {
  return Boolean(CLOUD_NAME)
}

function base(publicId: string, transform: string): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${publicId}`
}

/** One cover URL at a given width — the `src`, and what a browser without
 *  srcset support falls back to. */
export function coverUrl(publicId: string, width = 1280): string {
  return base(publicId, `${ALWAYS},${COVER_CROP},w_${width}`)
}

/** The responsive set. Paired with a `sizes` attribute at the call site, this is
 *  what stops a 390px phone downloading a 1920px image. */
export function coverSrcSet(publicId: string): string {
  return COVER_WIDTHS.map((w) => `${coverUrl(publicId, w)} ${w}w`).join(', ')
}

/**
 * An image placed inside a post's text.
 *
 * No forced ratio: a diagram, a screenshot and a photograph are all legitimate
 * here and cropping them to 16:9 would ruin two of the three. `c_limit` only
 * ever shrinks — an image narrower than the cap is served untouched rather than
 * being upscaled into softness.
 */
export function bodyUrl(publicId: string, width = 1280): string {
  return base(publicId, `${ALWAYS},c_limit,w_${width}`)
}

export function bodySrcSet(publicId: string): string {
  return [640, 960, 1280].map((w) => `${bodyUrl(publicId, w)} ${w}w`).join(', ')
}

/** The sizes an author portrait is offered at: the 40px byline on a post, the
 *  72px row in the admin list and on a card, and the 160px on the profile page —
 *  each doubled for a 2x screen. Small enough that the whole set is cheap. */
export const AVATAR_SIZES = [80, 144, 320] as const

/**
 * An author's portrait: a square, cropped around their FACE.
 *
 * `g_face` RATHER THAN THE COVER'S `g_auto`, and this is the whole reason
 * avatars do not just reuse `coverUrl` with an ar_1:1. Content-aware gravity
 * optimises for "the interesting part of the picture", which on a photograph of
 * a person standing in a room is frequently the room. Face gravity centres the
 * crop on the person, which is the only thing a byline portrait is for.
 *
 * `z_0.7` pulls back from the tight crop `g_face` defaults to, so the result is
 * a head-and-shoulders portrait rather than a close-up that cuts the ears off.
 *
 * Cloudinary falls back to the image centre when it finds no face, so an
 * illustration or a logo used as a portrait still renders sensibly rather than
 * failing.
 */
export function avatarUrl(publicId: string, size = 144): string {
  return base(publicId, `${ALWAYS},c_fill,g_face,z_0.7,ar_1:1,r_max,w_${size}`)
}

export function avatarSrcSet(publicId: string): string {
  return AVATAR_SIZES.map((s) => `${avatarUrl(publicId, s)} ${s}w`).join(', ')
}

/**
 * The share card: 1200×630, the size every platform crops to anyway.
 *
 * Fixed dimensions rather than a width hint, because a scraper does not
 * negotiate — it fetches once, with no Accept header worth reading. `f_auto`
 * would hand some of them AVIF, which several still cannot decode, so this is
 * the one place the format is pinned to JPEG.
 */
export function ogUrl(publicId: string): string {
  return base(publicId, 'f_jpg,q_auto,c_fill,g_auto,w_1200,h_630')
}

/** A small square, for admin lists and a future Media Library. */
export function thumbUrl(publicId: string, size = 160): string {
  return base(publicId, `${ALWAYS},c_fill,g_auto,w_${size},h_${size}`)
}

/**
 * The public id inside a Cloudinary delivery URL, or null.
 *
 * Needed because images inside a post's body are stored as finished `<img src>`
 * in the HTML — that is what the editor produces and what the page renders. To
 * know which assets a post still references, and therefore which are safe to
 * delete, the ids have to be read back out of that markup.
 *
 * The transformation segment is skipped rather than parsed: everything between
 * `/upload/` and the id is optional and varies, and a version segment (`v1234`)
 * may or may not be present.
 */
export function publicIdFromUrl(url: string): string | null {
  const marker = '/image/upload/'
  const at = url.indexOf(marker)
  if (at === -1) return null

  const tail = url.slice(at + marker.length)
  const parts = tail.split('/').filter(Boolean)
  /* Drop the transformation chunk (it contains commas or is a known prefix) and
     a version segment if there is one. What remains is the id, which may itself
     contain slashes because it includes the folder. */
  const kept = parts.filter(
    (part, index) => !(index === 0 && part.includes(',')) && !/^v\d+$/.test(part)
  )
  if (kept.length === 0) return null

  const last = kept[kept.length - 1]
  const withoutExtension = last.replace(/\.[a-z0-9]+$/i, '')
  return [...kept.slice(0, -1), withoutExtension].join('/')
}

/**
 * Is this `src` one the post may actually keep — an image we host ourselves?
 *
 * THE SANITISER AND THE EDITOR MUST AGREE ON THIS, which is why it lives here
 * rather than in either of them. lib/blog.ts uses it to decide what survives a
 * save; the editor uses it to decide which pasted images still need adopting
 * into Cloudinary. Two copies of this rule would drift, and the way it would
 * announce the drift is images silently vanishing from published posts — which
 * is exactly the bug this function was extracted to fix.
 *
 * The cloud name is checked, not just the host: `res.cloudinary.com` serves
 * every Cloudinary account on the internet, so allowing the bare host would
 * allow anyone's images.
 */
export function isStoredImageSrc(src: string, folderPrefix?: string): boolean {
  if (!CLOUD_NAME || !src.startsWith(`https://res.cloudinary.com/${CLOUD_NAME}/image/upload/`)) return false
  if (!folderPrefix) return true
  const id = publicIdFromUrl(src)
  return Boolean(id && id.startsWith(`${folderPrefix}/`) && !id.includes('..'))
}

/** Every Cloudinary asset referenced by a chunk of post HTML. */
export function publicIdsInHtml(html: string): string[] {
  const ids = new Set<string>()
  for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    const id = publicIdFromUrl(match[1])
    if (id) ids.add(id)
  }
  return [...ids]
}

/** Convenience for a stored cover: the src at the default width. */
export function imageSrc(image: CloudinaryImage, width?: number): string {
  return coverUrl(image.publicId, width)
}
