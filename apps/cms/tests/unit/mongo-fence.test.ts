import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CommandStartedEvent, Document } from 'mongodb'
import { newId, type PostFields, type Scope, type Store } from '@/lib/db'
import { CONTENT_TABLES } from '@/lib/db/types'

/**
 * THE WORKSPACE FENCE, MongoDB's stand-in for row-level security
 * (lib/db/mongo/scoped.ts). This opens its own store, records every command the
 * driver sends while a workspace scope runs, and checks that each one sent to a
 * client-content collection is pinned to that workspace — for every Scope method.
 */

const onMongo = (process.env.TEST_DB || 'mongo') === 'mongo'
const commands: CommandStartedEvent[] = []
let recording = false
let s: Store

beforeAll(async () => {
  if (!onMongo) return
  const { openMongo } = await import('@/lib/db/mongo')
  s = openMongo(process.env.DATABASE_URL!.replace(/\/cms_test_[^/?]+/, `/fence_${Date.now()}`), {
    onCommand: (e) => {
      if (recording) commands.push(e)
    },
  })
  await s.ready
})
afterAll(async () => {
  if (onMongo) await s.close()
})

const CONTENT = new Set<string>(CONTENT_TABLES)

/** The workspace each content command is restricted to (or what it stamps on inserts). */
function pins(e: CommandStartedEvent): { collection: string; workspaces: unknown[] } | null {
  const c = e.command as Document
  const name = e.commandName
  const collection = c[name]
  if (typeof collection !== 'string' || !CONTENT.has(collection)) return null
  switch (name) {
    case 'find':
      return { collection, workspaces: [c.filter?.workspaceId] }
    case 'aggregate':
      return { collection, workspaces: [c.pipeline?.[0]?.$match?.workspaceId] }
    case 'distinct':
    case 'count':
      return { collection, workspaces: [c.query?.workspaceId] }
    case 'findAndModify':
      return { collection, workspaces: [c.query?.workspaceId] }
    case 'update':
      return { collection, workspaces: c.updates.map((u: Document) => u.q?.workspaceId) }
    case 'delete':
      return { collection, workspaces: c.deletes.map((d: Document) => d.q?.workspaceId) }
    case 'insert':
      return { collection, workspaces: c.documents.map((d: Document) => d.workspaceId) }
    default:
      return { collection, workspaces: [`unexpected command ${name}`] }
  }
}

function postFields(over: Partial<PostFields> = {}): PostFields {
  const at = new Date(Date.now() - 60_000)
  return {
    slug: `p-${newId()}`,
    title: 'Fence post',
    description: '',
    excerpt: null,
    format: 'editor',
    contentHtml: '<p>img-x</p>',
    coverImage: null,
    category: 'News',
    tags: ['T'],
    tagSlugs: ['t'],
    faqs: [],
    authorId: null,
    seoTitle: null,
    focusKeyword: null,
    status: 'published',
    publishedAt: at,
    readingMinutes: 1,
    updatedBy: null,
    updatedAt: at,
    ...over,
  }
}

/** Calls every Scope method once. */
async function everything(scope: Scope) {
  const now = new Date()
  const postId = newId()
  const authorId = newId()
  const messageId = newId()
  await scope.authors.insert(authorId, { slug: `a-${authorId}`, name: 'A', role: null, bio: null, avatar: null, linkedinUrl: null, xUrl: null, websiteUrl: null, updatedAt: now })
  await scope.posts.insert(postId, newId(), postFields({ authorId }))
  await scope.posts.list({ now, limit: 10, q: 'fence', status: 'published', createdBy: 'x' })
  await scope.posts.list({ now, limit: 10, status: 'scheduled' })
  await scope.posts.get(postId)
  await scope.posts.byIds([postId])
  await scope.posts.slugTaken('x', postId)
  await scope.posts.categories()
  await scope.posts.tags()
  await scope.posts.countByAuthor(authorId)
  await scope.posts.counts(now)
  await scope.posts.nextScheduled(now)
  await scope.posts.liveDatesSince(now, new Date(0))
  await scope.posts.recent(3)
  await scope.posts.live({ now, limit: 5, offset: 0, tagSlug: 't', authorId })
  await scope.posts.liveBySlug('x', now)
  await scope.posts.liveRelated(now, [postId], ['t'], 3)
  await scope.posts.liveRelated(now, [postId], null, 3)
  await scope.posts.liveTagLists(now)
  await scope.posts.liveIndex(now)
  await scope.posts.liveAuthorIds(now)
  await scope.posts.imageCandidates('img-x', postId)
  await scope.posts.update(postId, postFields({ title: 'renamed' }))
  await scope.posts.unassignAuthor(authorId)
  await scope.authors.list()
  await scope.authors.get(authorId)
  await scope.authors.bySlug('x')
  await scope.authors.byIds([authorId])
  await scope.authors.slugTaken('x', authorId)
  await scope.authors.update(authorId, { slug: `a-${authorId}`, name: 'B', role: null, bio: null, avatar: null, linkedinUrl: null, xUrl: null, websiteUrl: null, updatedAt: now })
  await scope.authors.avatarCandidates('img-x')
  await scope.contact.rateAllowed('visitor', { perVisitor: 5, perWorkspace: 60 }, new Date(Date.now() - 600_000), now)
  await scope.contact.insert({ id: messageId, name: 'V', email: 'v@example.com', phone: '', company: '', topic: '', message: 'hi', source: null, userAgent: null, receivedAt: now })
  await scope.contact.list({ archived: false, unreadOnly: true, q: 'v', limit: 10 })
  await scope.contact.get(messageId)
  await scope.contact.countUnread()
  await scope.contact.update(messageId, { readAt: now })
  await scope.contact.all()
  await scope.contact.delete(messageId)
  await scope.audit.insert({ id: newId(), actorId: null, actorName: 'T', action: 'post.created', targetType: null, targetId: null, summary: 's' })
  await scope.audit.recent(5, new Date(0))
  await scope.posts.delete(postId)
  await scope.authors.delete(authorId)
}

describe.skipIf(!onMongo)('MongoDB workspace fence', () => {
  it('every command a scope sends to client content is pinned to its workspace', async () => {
    const ws = newId()
    commands.length = 0
    recording = true
    try {
      await s.inWorkspace(ws, everything)
    } finally {
      recording = false
    }
    const content = commands.map(pins).filter((p): p is NonNullable<typeof p> => p !== null)
    // Every content collection was exercised…
    expect(new Set(content.map((c) => c.collection))).toEqual(CONTENT)
    // …and every single command was restricted to (or stamped with) this workspace.
    for (const c of content) {
      for (const w of c.workspaces) expect(w, `${c.collection}`).toBe(ws)
    }
    expect(content.length).toBeGreaterThan(40)
  })

  it('cannot be pointed at, or moved into, another workspace', async () => {
    const a = newId()
    const b = newId()
    const id = newId()
    const { FencedCollection, Queue } = await import('@/lib/db/mongo/scoped')
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(process.env.DATABASE_URL!)
    await client.connect()
    const session = client.startSession()
    try {
      type Row = { _id: string; workspaceId: string; title?: string }
      const raw = client.db('fence_raw').collection<Row>('things')
      await raw.insertOne({ _id: id, workspaceId: b, title: 'B only' })
      const fenced = new FencedCollection<Row>(raw, a, session, new Queue())
      // A filter naming the other workspace is overridden, not obeyed.
      expect(await fenced.find({ workspaceId: b })).toEqual([])
      expect(await fenced.count({ _id: id })).toBe(0)
      expect(await fenced.updateOne({ _id: id }, { $set: { title: 'hijacked' } })).toBe(0)
      expect(await fenced.deleteMany({})).toBe(0)
      // Inserts are stamped with the fence's workspace, whatever they claim.
      const stamped = await fenced.insertOne({ _id: newId(), workspaceId: b } as never)
      expect(stamped.workspaceId).toBe(a)
      // Changing a record's workspace is refused outright.
      await expect(fenced.updateOne({}, { $set: { workspaceId: b } })).rejects.toThrow(/another workspace/)
      await expect(fenced.updateMany({}, { $unset: { workspaceId: '' } })).rejects.toThrow(/another workspace/)
      await expect(fenced.updateOne({}, { workspaceId: b } as never)).rejects.toThrow(/another workspace/)
      expect((await raw.findOne({ _id: id }))?.title).toBe('B only')
    } finally {
      await session.endSession()
      await client.close()
    }
  })

  it('the database rejects content without a valid workspace', async () => {
    const { MongoClient } = await import('mongodb')
    const url = process.env.DATABASE_URL!
    const client = new MongoClient(url)
    await client.connect()
    try {
      const name = new URL(url.replace(/^mongodb:/, 'http:')).pathname.slice(1)
      await (await import('@/lib/db/mongo/schema.mjs')).ensureSchema(client.db(name))
      const posts = client.db(name).collection('posts')
      await expect(posts.insertOne({ _id: newId(), title: 'orphan' } as never)).rejects.toThrow(/validation/i)
      await expect(posts.insertOne({ ...postFields(), _id: newId(), workspaceId: 'not-a-workspace', createdAt: new Date(), createdBy: null } as never)).rejects.toThrow(/validation/i)
      await expect(posts.insertOne({ ...postFields({ status: 'bogus' as never }), _id: newId(), workspaceId: newId(), createdAt: new Date(), createdBy: null } as never)).rejects.toThrow(/validation/i)
    } finally {
      await client.close()
    }
  })
})
