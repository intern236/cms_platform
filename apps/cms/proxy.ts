import { NextResponse, type NextRequest } from 'next/server'

/**
 * A fresh Content-Security-Policy with a script nonce on every page.
 *
 * Only scripts carrying this request's nonce run, so even if someone found a
 * way to get markup into an admin page, a script inside it would be refused by
 * the browser. Next reads the nonce from the request header and adds it to its
 * own scripts automatically.
 *
 * The content API and the logo route set their own headers and are skipped.
 */
export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const dev = process.env.NODE_ENV !== 'production'
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.cloudinary.com${dev ? ' ws:' : ''}`,
    `frame-src 'self' blob:`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
  ].join('; ')

  const headers = new Headers(req.headers)
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', csp)
  const res = NextResponse.next({ request: { headers } })
  res.headers.set('content-security-policy', csp)
  res.headers.set('cache-control', 'no-store')
  return res
}

export const config = {
  matcher: [
    {
      source: '/((?!api/v1|brand/|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
}
