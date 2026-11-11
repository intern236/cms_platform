import { getLogo } from '@/lib/workspaces'

export const dynamic = 'force-dynamic'

/**
 * A client's logo — public, because it is shown on their sign-in page and in the
 * emails the CMS sends. SVGs are served with a sandboxing CSP so a script inside
 * one can never run, even when the file is opened directly.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params
  if (!/^[a-z0-9-]{1,48}$/.test(workspace)) return new Response('Not found', { status: 404 })
  const logo = await getLogo(workspace)
  if (!logo) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(logo.data), {
    headers: {
      'content-type': logo.contentType,
      'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'cross-origin',
    },
  })
}
