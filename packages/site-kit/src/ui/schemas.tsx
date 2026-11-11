import type { AuthorRef, PostDetail, PostSummary, Site } from '../theme'

/**
 * JSON-LD for search engines. `<` is escaped so no content value can close the
 * script tag early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}

export function OrganizationSchema({ site }: { site: Site }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: site.name,
        legalName: site.legalName || site.name,
        url: site.url,
        description: site.description,
        ...(site.logoUrl ? { logo: site.logoUrl } : {}),
        ...(site.social.length ? { sameAs: site.social.map((s) => s.url) } : {}),
      }}
    />
  )
}

export function BreadcrumbSchema({ site, trail }: { site: Site; trail: { name: string; href: string }[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: `${site.url}${t.href}` })),
      }}
    />
  )
}

/** BlogPosting + FAQPage + breadcrumbs for one post. */
export function PostSchemas({ site, post }: { site: Site; post: PostDetail }) {
  const faqs = post.faqs.length ? post.faqs : post.bodyFaqs
  return (
    <>
      {post.emitSchema && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            url: `${site.url}${post.url}`,
            datePublished: post.publishedAt.toISOString(),
            dateModified: post.updatedAt.toISOString(),
            ...(post.cover ? { image: post.cover.ogSrc } : {}),
            ...(post.tags.length ? { keywords: post.tags.map((t) => t.label).join(', ') } : {}),
            author: post.author?.url
              ? { '@type': 'Person', '@id': `${site.url}${post.author.url}`, name: post.author.name, url: `${site.url}${post.author.url}` }
              : post.author
                ? { '@type': 'Person', name: post.author.name }
                : { '@type': 'Organization', name: site.name, url: site.url },
            publisher: { '@type': 'Organization', name: site.name, ...(site.logoUrl ? { logo: { '@type': 'ImageObject', url: site.logoUrl } } : {}) },
            mainEntityOfPage: `${site.url}${post.url}`,
          }}
        />
      )}
      {faqs.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
          }}
        />
      )}
      <BreadcrumbSchema
        site={site}
        trail={[
          { name: 'Home', href: '/' },
          { name: site.blog.title, href: site.blog.basePath },
          { name: post.title, href: post.url },
        ]}
      />
    </>
  )
}

export function CollectionSchema({ site, name, description, path, posts }: { site: Site; name: string; description?: string; path: string; posts: PostSummary[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name,
        ...(description ? { description } : {}),
        url: `${site.url}${path}`,
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: posts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: `${site.url}${p.url}` })),
        },
      }}
    />
  )
}

export function PersonSchema({ site, author }: { site: Site; author: AuthorRef }) {
  const url = author.url ? `${site.url}${author.url}` : site.url
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        mainEntity: {
          '@type': 'Person',
          '@id': url,
          name: author.name,
          url,
          ...(author.role ? { jobTitle: author.role } : {}),
          ...(author.bio ? { description: author.bio } : {}),
          ...(author.avatar ? { image: author.avatar.src } : {}),
          ...(author.links.length ? { sameAs: author.links.map((l) => l.url) } : {}),
          worksFor: { '@type': 'Organization', name: site.name, url: site.url },
        },
      }}
    />
  )
}
