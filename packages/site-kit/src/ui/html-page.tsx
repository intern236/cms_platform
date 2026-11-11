/**
 * Renders an "HTML page" post: its own styles (already scoped to .cms-html-post by
 * the CMS) followed by its markup. The CMS sanitised both on save — no scripts, no
 * event handlers — so this is safe to inject.
 */
export function HtmlPage({ body, className }: { body: { head: string; html: string }; className?: string }) {
  return (
    <div
      data-html-post
      className={['cms-html-post', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: body.head ? `${body.head}\n${body.html}` : body.html }}
    />
  )
}

/** Editor-post HTML, sanitised by the CMS. Put your prose styles on className. */
export function PostHtml({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
