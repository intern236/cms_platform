import type { MetadataRoute } from 'next'

/** The CMS itself is never indexed. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] }
}
