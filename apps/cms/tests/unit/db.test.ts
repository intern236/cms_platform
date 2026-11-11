import { describe, expect, it } from 'vitest'
import { inWorkspace, isDuplicate, newId, scoped, store, type PostFields, type Scope } from '@/lib/db'
import { makeWorkspace } from './fixtures'

/**
 * Client isolation through the data layer. A scope bound to one workspace must
 * not be able to read, change or delete another workspace's content by any
 * method, even when handed the other workspace's ids. Underneath, MongoDB
 * enforces this with the workspace fence (mongo-fence.test.ts).
 */

function fields(over: Partial<PostFields> = {}): PostFields {
  const now = new Date(Date.now() - 60_000)
  return {
    slug: 'one',
    title: 'A post',
    description: '',
    excerpt: null,
    format: 'editor',
    contentHtml: '<p>hi</p>',
    coverImage: null,
    category: 'News',
    tags: ['Shared'],
    tagSlugs: ['shared'],
    faqs: [],
    authorId: null,
    seoTitle: null,
    focusKeyword: 'secret',
    status: 'published',
    publishedAt: now,
    readingMinutes: 1,
    updatedBy: null,
    updatedAt: now,
    ...over,
  }
}

async function seed(prefix: string) {
  const ws = await makeWorkspace(prefix)
  const postId = newId()
  const authorId = newId()
  const messageId = newId()
  await inWorkspace(ws.id, async (s) => {
    await s.authors.insert(authorId, { slug: 'author', name: `${prefix} author`, role: null, bio: null, avatar: null, linkedinUrl: null, xUrl: null, websiteUrl: null, updatedAt: new Date() })
    await s.posts.insert(postId, newId(), fields({ title: `${prefix} post`, authorId }))
    await s.contact.insert({ id: messageId, name: 'Visitor', email: 'v@example.com', phone: '', company: '', topic: '', message: `${prefix} message`, source: null, userAgent: null, receivedAt: new Date() })
  })
  return { ws, postId, authorId, messageId }
}

describe('workspace isolation through the data layer', () => {
  it('a scope never reads another workspace’s content', async () => {
    const a = await seed('iso-a')
    const b = await seed('iso-b')
    await inWorkspace(a.ws.id, async (s) => {
      const now = new Date()
      expect((await s.posts.list({ now, limit: 100 })).map((p) => p.title)).toEqual(['iso-a post'])
      expect(await s.posts.get(b.postId)).toBeNull()
      expect(await s.posts.byIds([a.postId, b.postId])).toHaveLength(1)
      expect((await s.posts.live({ now, limit: 50, offset: 0 })).total).toBe(1)
      expect((await s.posts.live({ now, limit: 50, offset: 0, tagSlug: 'shared' })).rows.map((p) => p.id)).toEqual([a.postId])
      expect(await s.posts.liveRelated(now, [], null, 10)).toHaveLength(1)
      expect(await s.posts.liveAuthorIds(now)).toEqual([a.authorId])
      expect(await s.posts.countByAuthor(b.authorId)).toBe(0)
      expect((await s.posts.counts(now)).published).toBe(1)
      expect(await s.authors.get(b.authorId)).toBeNull()
      expect(await s.authors.byIds([b.authorId])).toEqual([])
      expect((await s.authors.list()).map((x) => x.name)).toEqual(['iso-a author'])
      expect(await s.contact.get(b.messageId)).toBeNull()
      expect((await s.contact.all()).map((m) => m.message)).toEqual(['iso-a message'])
      expect(await s.contact.countUnread()).toBe(1)
    })
  })

  it('a scope cannot change or delete another workspace’s content, even by id', async () => {
    const a = await seed('iso-c')
    const b = await seed('iso-d')
    await inWorkspace(a.ws.id, async (s) => {
      await s.posts.update(b.postId, fields({ title: 'hijacked' }))
      await s.posts.delete(b.postId)
      expect(await s.posts.unassignAuthor(b.authorId)).toBe(0)
      await s.authors.update(b.authorId, { slug: 'x', name: 'hijacked', role: null, bio: null, avatar: null, linkedinUrl: null, xUrl: null, websiteUrl: null, updatedAt: new Date() })
      await s.authors.delete(b.authorId)
      expect(await s.contact.update(b.messageId, { archived: true })).toBe(false)
      expect(await s.contact.delete(b.messageId)).toBe(false)
    })
    await inWorkspace(b.ws.id, async (s) => {
      expect((await s.posts.get(b.postId))?.title).toBe('iso-d post')
      expect((await s.posts.get(b.postId))?.authorId).toBe(b.authorId)
      expect((await s.authors.get(b.authorId))?.name).toBe('iso-d author')
      expect((await s.contact.get(b.messageId))?.archived).toBe(false)
    })
  })

  it('content written in a scope belongs to that workspace', async () => {
    const a = await seed('iso-e')
    const id = newId()
    await inWorkspace(a.ws.id, (s) => s.posts.insert(id, newId(), fields({ slug: 'two' })))
    const row = await inWorkspace(a.ws.id, (s) => s.posts.get(id))
    expect(row?.workspaceId).toBe(a.ws.id)
  })

  it('a scope handed to code working on another workspace fails loudly', async () => {
    const a = await seed('iso-f')
    const b = await seed('iso-g')
    await inWorkspace(a.ws.id, async (s: Scope) => {
      expect(() => scoped(s, b.ws.id)).toThrow(/mismatch/)
    })
    await expect(inWorkspace('not-an-id', async () => 1)).rejects.toThrow(/invalid workspace/)
  })

  it('slugs are unique per workspace, and a clash is reported as a duplicate', async () => {
    const a = await seed('iso-h')
    const b = await seed('iso-i')
    // Both workspaces already have a post with slug "one": fine.
    let error: unknown
    try {
      await inWorkspace(a.ws.id, (s) => s.posts.insert(newId(), newId(), fields({ slug: 'one' })))
    } catch (e) {
      error = e
    }
    expect(error).toBeTruthy()
    expect(await isDuplicate(error)).toBe(true)
    expect(await isDuplicate(new Error('something else'))).toBe(false)
    expect(await inWorkspace(b.ws.id, (s) => s.posts.slugTaken('one'))).toBe(true)
  })

  it('a failed transaction leaves nothing behind', async () => {
    const a = await seed('iso-j')
    const id = newId()
    await expect(
      inWorkspace(a.ws.id, async (s) => {
        await s.posts.insert(id, newId(), fields({ slug: 'rolled-back' }))
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(await inWorkspace(a.ws.id, (s) => s.posts.get(id))).toBeNull()
  })

  it('runs on MongoDB', async () => {
    expect((await store()).backend).toBe('mongo')
  })
})
