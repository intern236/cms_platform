/**
 * Stand-ins for the Next.js request APIs, so server actions and auth helpers run in
 * a unit test. Tests drive `jar` (cookies) and `requestHeaders` directly.
 */

export const jar = new Map<string, string>()
export const requestHeaders = new Map<string, string>()
export const revalidated: string[] = []

export class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT ${url}`)
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('NEXT_NOT_FOUND')
  }
}

export const nextHeaders = {
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      if (opts?.maxAge === 0 || value === '') jar.delete(name)
      else jar.set(name, value)
    },
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => {
    const h = new Headers()
    for (const [k, v] of requestHeaders) h.set(k, v)
    return h
  },
}

export const nextCache = {
  revalidatePath: (path: string) => void revalidated.push(path),
  revalidateTag: (tag: string) => void revalidated.push(`tag:${tag}`),
}

export const nextNavigation = {
  redirect: (url: string) => {
    throw new RedirectError(url)
  },
  notFound: () => {
    throw new NotFoundError()
  },
}

export function resetRequest() {
  jar.clear()
  requestHeaders.clear()
  revalidated.length = 0
}
