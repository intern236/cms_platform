import type { NextRequest } from 'next/server'
import { withSite } from '@/lib/api/handler'
import { siteInfo } from '@/lib/api/serialize'

export const dynamic = 'force-dynamic'

/** The client's site settings: name, blog options, CTA, social links, logo. */
export function GET(req: NextRequest) {
  return withSite(req, async ({ ws }) => siteInfo(ws))
}
