import 'server-only'
import { jwtVerify, SignJWT } from 'jose'
import { serverSecret } from '@/lib/security'

/**
 * DRAFT PREVIEW LINKS.
 *
 * "Preview" in the editor opens `<client site>/preview?token=…`. The token is a
 * 15-minute signed claim "workspace W may show post P". The site passes it back to
 * GET /api/v1/preview with its site key, and the CMS checks both belong to the
 * same workspace — so a token is useless on any other client's site, and useless
 * after 15 minutes.
 */

const MINUTES = 15
const key = () => new TextEncoder().encode(`preview:${serverSecret()}`)

export async function createPreviewToken(workspaceId: string, postId: string): Promise<string> {
  return new SignJWT({ ws: workspaceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(postId)
    .setAudience('cms-preview')
    .setIssuedAt()
    .setExpirationTime(`${MINUTES}m`)
    .sign(key())
}

export async function readPreviewToken(token: string, workspaceId: string): Promise<string | null> {
  if (!token || token.length > 1000) return null
  try {
    const { payload } = await jwtVerify(token, key(), { audience: 'cms-preview', algorithms: ['HS256'] })
    if (payload.ws !== workspaceId || typeof payload.sub !== 'string') return null
    return payload.sub
  } catch {
    return null
  }
}
