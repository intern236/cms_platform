import type { Metadata } from 'next'
import type { AuthorRef, PostDetail, Site } from '../theme'

/** Next.js Metadata builders, so every page gets canonical, Open Graph and Twitter tags right. */

function clamp(text: string, max = 158) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const i = cut.lastIndexOf(' ')
  return (i > 0 ? cut.slice(0, i) : cut).replace(/[,;:.\s]+$/, '')
}

function og(site: Site, title: string, description: string, path: string): NonNullable<Metadata['openGraph']> {
  return {
    title,
    description,
    url: `${site.url}${path}`,
    siteName: site.name,
    locale: site.dateLocale.replace('-', '_'),
    type: 'website',
    ...(site.logoUrl ? { images: [{ url: site.logoUrl }] } : {}),
  }
}

export function rootMetadata(site: Site): Metadata {
  return {
    metadataBase: new URL(site.url),
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.description,
    alternates: { types: { 'application/rss+xml': [{ url: '/feed.xml', title: `${site.name} — ${site.blog.title}` }] } },
    openGraph: og(site, site.name, site.description, '/'),
  }
}

export function pageMetadata(site: Site, { title, description, path }: { title: string; description: string; path: string }): Metadata {
  return { title, description: clamp(description), alternates: { canonical: path }, openGraph: og(site, title, clamp(description), path) }
}

export function blogMetadata(site: Site, page = 1): Metadata {
  const path = page > 1 ? `${site.blog.basePath}/page/${page}` : site.blog.basePath
  const title = page > 1 ? `${site.blog.title} — page ${page}` : site.blog.title
  return pageMetadata(site, { title, description: site.blog.description || site.description, path })
}

export function tagMetadata(site: Site, tag: { label: string; slug: string }, page = 1): Metadata {
  const base = `${site.blog.basePath}/tag/${tag.slug}`
  const title = `${tag.label}${page > 1 ? ` — page ${page}` : ''}`
  return pageMetadata(site, { title, description: `Everything ${site.name} has written about ${tag.label}.`, path: page > 1 ? `${base}/page/${page}` : base })
}

export function postMetadata(site: Site, post: PostDetail): Metadata {
  const path = post.url
  const title = post.seoTitle || post.title
  const description = clamp(post.description || post.excerpt || site.description)
  return {
    title,
    description,
    keywords: post.tags.map((t) => t.label),
    alternates: { canonical: path },
    openGraph: {
      ...og(site, title, description, path),
      type: 'article',
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      ...(post.cover ? { images: [{ url: post.cover.ogSrc, width: 1200, height: 630, alt: post.cover.alt }] } : {}),
    },
    twitter: { card: post.cover ? 'summary_large_image' : 'summary' },
  }
}

export function authorMetadata(site: Site, author: AuthorRef): Metadata {
  return {
    ...pageMetadata(site, {
      title: `${author.name}${author.role ? ` — ${author.role}` : ''}`,
      description: author.bio || `${author.name} writes for ${site.name}.`,
      path: author.url ?? '/authors',
    }),
  }
}
