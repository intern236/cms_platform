import sanitizeHtml from 'sanitize-html'
import { isStoredImageSrc } from '@/lib/cloudinary/url'
import { pageBodyText, sanitizePagePostHtml } from '@/lib/content/post-page-html'
import type { PostFormat } from '@/lib/db/types'

/**
 * THE STORED-XSS BOUNDARY for rich-editor posts.
 *
 * Every save passes the editor's HTML through this before it touches the database,
 * so nothing executable is ever STORED. The allowlist is exactly what the admin's
 * TipTap configuration can emit. Images must come from our own Cloudinary cloud;
 * links keep only href and the closed-set `data-button` flag.
 *
 * HTML-page posts use the wider boundary in post-page-html.ts instead.
 * sanitizeForFormat() is the one place that choice is made.
 */
function options(folderPrefix?: string): sanitizeHtml.IOptions {
  return {
  allowedTags: [
    'p', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 's', 'u', 'code',
    'a', 'ul', 'ol', 'li',
    'blockquote', 'pre', 'img', 'hr', 'br',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'data-button'],
    img: ['src', 'alt'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    img: (tagName, attribs) => {
      const src = attribs.src ?? ''
      const kept: Record<string, string> = {}
      if (isStoredImageSrc(src, folderPrefix)) kept.src = src
      if (attribs.alt) kept.alt = attribs.alt
      return { tagName, attribs: kept }
    },
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        ...('data-button' in attribs ? { 'data-button': attribs['data-button'] === 'outline' ? 'outline' : '' } : {}),
      },
    }),
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  }
}

/**
 * `folderPrefix` (the workspace's media folder) narrows images to that client's
 * own uploads, so one client's post can never point at — and later break when
 * deleted — another client's image.
 */
export function sanitizePostHtml(html: string, folderPrefix?: string): string {
  return sanitizeHtml(html, options(folderPrefix))
}

export function sanitizeForFormat(html: string, format: PostFormat, folderPrefix?: string): string {
  return format === 'html' ? sanitizePagePostHtml(html) : sanitizePostHtml(html, folderPrefix)
}

export function countImageTags(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length
}

/** Wraps every table in a scroll container for small screens. Safe because the input is sanitised (bare <table>). */
export function renderablePostHtml(html: string): string {
  return html.replaceAll('<table>', '<div class="cms-table-scroll"><table>').replaceAll('</table>', '</table></div>')
}

const VOID_TAGS = new Set(['img', 'hr', 'br'])
const MID_CTA_MIN_LENGTH = 2200

/**
 * Splits a post at the top-level block boundary nearest its middle, for a
 * mid-article call to action. Counts tag depth so it never cuts inside a
 * blockquote or table. Null when the post is short or has no good midpoint.
 */
export function splitForMidCta(html: string): { before: string; after: string } | null {
  if (html.length < MID_CTA_MIN_LENGTH) return null
  const boundaries: number[] = []
  let depth = 0
  const tag = /<(\/?)([a-z0-9]+)[^>]*?(\/?)>/gi
  let match: RegExpExecArray | null
  while ((match = tag.exec(html)) !== null) {
    const [full, closing, name, selfClosing] = match
    if (VOID_TAGS.has(name.toLowerCase()) || selfClosing === '/') continue
    depth += closing ? -1 : 1
    if (depth === 0 && closing) boundaries.push(match.index + full.length)
  }
  if (boundaries.length < 2) return null
  const middle = html.length / 2
  const cut = boundaries.reduce((best, offset) => (Math.abs(offset - middle) < Math.abs(best - middle) ? offset : best))
  if (cut < html.length * 0.2 || cut > html.length * 0.8) return null
  return { before: html.slice(0, cut), after: html.slice(cut) }
}

/** ~200 words a minute, from the sanitised HTML. */
export function readingMinutes(html: string, format: PostFormat = 'editor'): number {
  const text = format === 'html' ? pageBodyText(html) : sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

export function asPostFormat(value: unknown): PostFormat {
  return value === 'html' ? 'html' : 'editor'
}
