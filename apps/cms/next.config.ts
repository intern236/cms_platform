import type { NextConfig } from 'next'

/**
 * The CMS is an admin app and an API. Nothing here is meant to be indexed,
 * framed or cached by a shared proxy. The per-request Content-Security-Policy
 * (with a script nonce) is set in proxy.ts.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  serverExternalPackages: ['mongodb'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
