import 'server-only'
import { randomBytes } from 'node:crypto'
import { MongoClient, type ClientSession, type Collection, type CommandStartedEvent, type Db, type Filter } from 'mongodb'
import type { PostListQuery, Scope, Store, System, WorkspaceStats } from '../store'
import type {
  AuditRow,
  AuthorRow,
  ChallengeRow,
  ContactMessageRow,
  InviteRow,
  MembershipRow,
  OutboxRow,
  PostRow,
  ResetRow,
  Role,
  SessionRow,
  SiteKeyRow,
  UserRow,
  WebhookDeliveryRow,
  WorkspaceRow,
} from '../types'
import { ensureSchema } from './schema.mjs'
import { FencedCollection, Queue } from './scoped'

/**
 * THE MONGODB ADAPTER. Implements lib/db/store.ts.
 *
 * - Collections mirror the record types (./schema.ts has validators and indexes).
 * - `_id` holds our own string id; rows coming out are given `id` back.
 * - Client content is only reachable through FencedCollection (./scoped.ts), bound
 *   to one workspace and one transaction. The raw content collections are used in
 *   exactly one place outside the fence: `overview`, the agency dashboard's
 *   cross-client counts.
 * - Transactions need a replica set: MongoDB Atlas always has one, and
 *   `npm run dev` starts a local single-node one.
 */

type Doc<R extends { id: string }> = Omit<R, 'id'> & { _id: string }
type MembershipDoc = MembershipRow & { _id: string }
type ResetDoc = ResetRow & { _id: string }
type LogoDoc = { _id: string; workspaceId: string; contentType: string; data: { buffer: Uint8Array } | Buffer; updatedAt: Date }
type AttemptDoc = { _id: string; key: string; at: Date }
type RateDoc = { _id: string; workspaceId: string; key: string; at: Date }

function row<R extends { id: string }>(doc: Doc<R>): R {
  const { _id, ...rest } = doc
  return { id: _id, ...rest } as unknown as R
}
function rows<R extends { id: string }>(docs: Doc<R>[]): R[] {
  return docs.map((d) => row<R>(d))
}
function strip<R>(doc: R & { _id: string }): R {
  const { _id: _ignored, ...rest } = doc
  void _ignored
  return rest as R
}

function rowId() {
  return randomBytes(12).toString('hex')
}

/** Text for a case-insensitive "contains" match, with regex characters escaped. */
function containing(text: string) {
  return { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
}

const membershipId = (workspaceId: string, userId: string) => `${workspaceId}:${userId}`

/** Standard name ordering. */
function byName<T extends { name: string }>(a: T, b: T) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

// ---------------------------------------------------------------------------

type Collections = {
  users: Collection<Doc<UserRow>>
  workspaces: Collection<Doc<WorkspaceRow>>
  logos: Collection<LogoDoc>
  memberships: Collection<MembershipDoc>
  invites: Collection<Doc<InviteRow>>
  sessions: Collection<Doc<SessionRow>>
  challenges: Collection<Doc<ChallengeRow>>
  resets: Collection<ResetDoc>
  attempts: Collection<AttemptDoc>
  siteKeys: Collection<Doc<SiteKeyRow>>
  webhooks: Collection<Doc<WebhookDeliveryRow>>
  outbox: Collection<Doc<OutboxRow>>
  /* Client content — reached through the fence, except by `overview`. */
  posts: Collection<Doc<PostRow>>
  authors: Collection<Doc<AuthorRow>>
  contact: Collection<Doc<ContactMessageRow>>
  rate: Collection<RateDoc>
  audit: Collection<Doc<AuditRow>>
}

function collections(db: Db): Collections {
  return {
    users: db.collection('users'),
    workspaces: db.collection('workspaces'),
    logos: db.collection('workspace_logos'),
    memberships: db.collection('memberships'),
    invites: db.collection('invites'),
    sessions: db.collection('sessions'),
    challenges: db.collection('login_challenges'),
    resets: db.collection('password_resets'),
    attempts: db.collection('login_attempts'),
    siteKeys: db.collection('site_keys'),
    webhooks: db.collection('webhook_deliveries'),
    outbox: db.collection('outbox'),
    posts: db.collection('posts'),
    authors: db.collection('authors'),
    contact: db.collection('contact_messages'),
    rate: db.collection('contact_rate'),
    audit: db.collection('audit_log'),
  }
}

const LIVE = (now: Date) => ({ status: 'published' as const, publishedAt: { $lte: now } })

// ---------------------------------------------------------------------------

function system(client: MongoClient, c: Collections): System {
  return {
    users: {
      count: () => c.users.countDocuments({}),
      async byId(id) {
        const doc = await c.users.findOne({ _id: id })
        return doc ? row<UserRow>(doc) : null
      },
      async byEmail(email) {
        const doc = await c.users.findOne({ email })
        return doc ? row<UserRow>(doc) : null
      },
      async insert(user) {
        await c.users.insertOne({
          _id: user.id,
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          isAgency: user.isAgency ?? false,
          twoFactor: false,
          disabledAt: null,
          lastLoginAt: null,
          createdAt: new Date(),
        })
      },
      async update(id, patch) {
        if (Object.keys(patch).length) await c.users.updateOne({ _id: id }, { $set: patch })
      },
      async delete(id) {
        await c.users.deleteOne({ _id: id })
      },
      async agency() {
        return rows<UserRow>(await c.users.find({ isAgency: true }).toArray()).sort(byName)
      },
      countActiveAgency(exceptUserId) {
        return c.users.countDocuments({ isAgency: true, disabledAt: null, ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}) })
      },
    },

    workspaces: {
      async byId(id) {
        const doc = await c.workspaces.findOne({ _id: id })
        return doc ? row<WorkspaceRow>(doc) : null
      },
      async bySlug(slug) {
        const doc = await c.workspaces.findOne({ slug })
        return doc ? row<WorkspaceRow>(doc) : null
      },
      async list(options) {
        const filter: Filter<Doc<WorkspaceRow>> = options?.includeArchived ? {} : { archivedAt: null }
        return rows<WorkspaceRow>(await c.workspaces.find(filter).toArray()).sort(byName)
      },
      async insert(input) {
        const now = new Date()
        const doc: Doc<WorkspaceRow> = {
          _id: input.id,
          slug: input.slug,
          name: input.name,
          siteUrl: input.siteUrl,
          accent: input.accent,
          hasLogo: false,
          settings: input.settings,
          webhookUrl: '',
          webhookSecret: input.webhookSecret,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        }
        await c.workspaces.insertOne(doc)
        return row<WorkspaceRow>(doc)
      },
      async update(id, patch) {
        await c.workspaces.updateOne({ _id: id }, { $set: patch })
      },
      async setLogo(id, data, contentType) {
        const now = new Date()
        await c.logos.updateOne({ _id: id }, { $set: { workspaceId: id, data, contentType, updatedAt: now } }, { upsert: true })
        await c.workspaces.updateOne({ _id: id }, { $set: { hasLogo: true, updatedAt: now } })
      },
      async removeLogo(id) {
        await c.logos.deleteOne({ _id: id })
        await c.workspaces.updateOne({ _id: id }, { $set: { hasLogo: false, updatedAt: new Date() } })
      },
      async logoBySlug(slug) {
        const ws = await c.workspaces.findOne({ slug }, { projection: { _id: 1 } })
        if (!ws) return null
        const logo = await c.logos.findOne({ _id: ws._id })
        if (!logo) return null
        const data = Buffer.isBuffer(logo.data) ? logo.data : Buffer.from((logo.data as { buffer: Uint8Array }).buffer)
        return { data, contentType: logo.contentType, updatedAt: logo.updatedAt }
      },
    },

    members: {
      async get(workspaceId, userId) {
        const doc = await c.memberships.findOne({ _id: membershipId(workspaceId, userId) })
        return doc ? strip<MembershipRow>(doc) : null
      },
      async list(workspaceId) {
        const ms = await c.memberships.find({ workspaceId }).toArray()
        if (!ms.length) return []
        const people = await c.users.find({ _id: { $in: ms.map((m) => m.userId) }, disabledAt: null }).toArray()
        const byId = new Map(people.map((u) => [u._id, u]))
        return ms
          .flatMap((m) => {
            const u = byId.get(m.userId)
            return u
              ? [{ userId: u._id, name: u.name, email: u.email, role: m.role, joinedAt: m.createdAt, lastLoginAt: u.lastLoginAt, twoFactor: u.twoFactor }]
              : []
          })
          .sort(byName)
      },
      async ownerCount(workspaceId) {
        const owners = await c.memberships.find({ workspaceId, role: 'owner' }, { projection: { userId: 1 } }).toArray()
        if (!owners.length) return 0
        return c.users.countDocuments({ _id: { $in: owners.map((o) => o.userId) }, disabledAt: null })
      },
      async setRole(workspaceId, userId, role) {
        await c.memberships.updateOne({ _id: membershipId(workspaceId, userId) }, { $set: { role } })
      },
      async remove(workspaceId, userId) {
        await c.memberships.deleteOne({ _id: membershipId(workspaceId, userId) })
      },
      async upsert(workspaceId, userId, role) {
        await upsertMembership(c, workspaceId, userId, role)
      },
      async workspacesOf(userId) {
        const ms = await c.memberships.find({ userId }).toArray()
        if (!ms.length) return []
        const roleOf = new Map(ms.map((m) => [m.workspaceId, m.role]))
        const wss = await c.workspaces.find({ _id: { $in: [...roleOf.keys()] }, archivedAt: null }).toArray()
        return rows<WorkspaceRow>(wss)
          .map((w) => ({ ...w, role: roleOf.get(w.id)! }))
          .sort(byName)
      },
    },

    invites: {
      async revokeOpen(email, workspaceId, at) {
        await c.invites.updateMany({ email, workspaceId, acceptedAt: null, revokedAt: null }, { $set: { revokedAt: at } })
      },
      async insert(input) {
        const { id, ...rest } = input
        await c.invites.insertOne({ _id: id, ...rest, acceptedAt: null, revokedAt: null, createdAt: new Date() })
      },
      async findOpen(tokenHash, now) {
        const doc = await c.invites.findOne({ tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { $gt: now } })
        return doc ? row<InviteRow>(doc) : null
      },
      async accept(invite, userId, at) {
        const session = client.startSession()
        try {
          return await session.withTransaction(async () => {
            /* Matching on acceptedAt: null makes a double click or a replay a no-op. */
            const used = await c.invites.findOneAndUpdate(
              { _id: invite.id, acceptedAt: null, revokedAt: null },
              { $set: { acceptedAt: at } },
              { session }
            )
            if (!used) return false
            if (invite.role === 'agency') {
              await c.users.updateOne({ _id: userId }, { $set: { isAgency: true } }, { session })
            } else if (invite.workspaceId) {
              await upsertMembership(c, invite.workspaceId, userId, invite.role, session)
            }
            return true
          })
        } finally {
          await session.endSession()
        }
      },
      async revoke(workspaceId, id, at) {
        await c.invites.updateOne({ _id: id, workspaceId }, { $set: { revokedAt: at } })
      },
      async pending(workspaceId, now) {
        const docs = await c.invites
          .find({ workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { $gt: now } })
          .sort({ createdAt: -1 })
          .toArray()
        return rows<InviteRow>(docs)
      },
    },

    sessions: {
      async insert(input) {
        const { id, ...rest } = input
        await c.sessions.insertOne({ _id: id, ...rest })
      },
      async findActive(id, now) {
        const s = await c.sessions.findOne({ _id: id, expiresAt: { $gt: now } })
        if (!s) return null
        const u = await c.users.findOne({ _id: s.userId })
        return u ? { session: row<SessionRow>(s), user: row<UserRow>(u) } : null
      },
      async touch(id, at) {
        await c.sessions.updateOne({ _id: id }, { $set: { lastSeenAt: at } })
      },
      async delete(id) {
        await c.sessions.deleteOne({ _id: id })
      },
      async deleteForUser(userId, keepId) {
        await c.sessions.deleteMany({ userId, ...(keepId ? { _id: { $ne: keepId } } : {}) })
      },
      async deleteExpired(now) {
        await c.sessions.deleteMany({ expiresAt: { $lt: now } })
      },
      async listForUser(userId, now) {
        return rows<SessionRow>(await c.sessions.find({ userId, expiresAt: { $gt: now } }).sort({ lastSeenAt: 1 }).toArray())
      },
    },

    challenges: {
      async deleteForUser(userId) {
        await c.challenges.deleteMany({ userId })
      },
      async deleteExpired(now) {
        await c.challenges.deleteMany({ expiresAt: { $lt: now } })
      },
      async insert(input) {
        const { id, ...rest } = input
        await c.challenges.insertOne({ _id: id, ...rest, attempts: 0, createdAt: new Date() })
      },
      async findActive(id, now) {
        const doc = await c.challenges.findOne({ _id: id, expiresAt: { $gt: now } })
        return doc ? row<ChallengeRow>(doc) : null
      },
      async delete(id) {
        await c.challenges.deleteOne({ _id: id })
      },
      async setAttempts(id, attempts) {
        await c.challenges.updateOne({ _id: id }, { $set: { attempts } })
      },
    },

    resets: {
      async deleteExpired(now) {
        await c.resets.deleteMany({ expiresAt: { $lt: now } })
      },
      async insert(input) {
        await c.resets.insertOne({ _id: input.tokenHash, ...input, usedAt: null, createdAt: new Date() })
      },
      async findActive(tokenHash, now) {
        const r = await c.resets.findOne({ _id: tokenHash, usedAt: null, expiresAt: { $gt: now } })
        if (!r) return null
        const u = await c.users.findOne({ _id: r.userId })
        return u ? { userId: u._id, email: u.email, name: u.name } : null
      },
      async markUsed(tokenHash, at) {
        const r = await c.resets.updateOne({ _id: tokenHash, usedAt: null }, { $set: { usedAt: at } })
        return r.modifiedCount > 0
      },
      async deleteForUser(userId) {
        await c.resets.deleteMany({ userId })
      },
    },

    attempts: {
      async deleteBefore(since) {
        await c.attempts.deleteMany({ at: { $lt: since } })
      },
      count: (key, since) => c.attempts.countDocuments({ key, at: { $gt: since } }),
      async insert(keys, at) {
        if (keys.length) await c.attempts.insertMany(keys.map((key) => ({ _id: rowId(), key, at })))
      },
      async deleteKeys(keys) {
        if (keys.length) await c.attempts.deleteMany({ key: { $in: keys } })
      },
    },

    siteKeys: {
      async insert(input) {
        const { id, ...rest } = input
        await c.siteKeys.insertOne({ _id: id, ...rest, createdAt: new Date(), lastUsedAt: null, revokedAt: null })
      },
      async list(workspaceId) {
        return rows<SiteKeyRow>(await c.siteKeys.find({ workspaceId }).sort({ createdAt: -1 }).toArray())
      },
      async revoke(workspaceId, id, at) {
        const r = await c.siteKeys.updateOne({ _id: id, workspaceId, revokedAt: null }, { $set: { revokedAt: at } })
        return r.modifiedCount > 0
      },
      async findActiveByPrefix(prefix) {
        const key = await c.siteKeys.findOne({ prefix, revokedAt: null })
        if (!key) return null
        const ws = await c.workspaces.findOne({ _id: key.workspaceId }, { projection: { slug: 1, archivedAt: 1 } })
        return ws ? { key: row<SiteKeyRow>(key), workspace: { slug: ws.slug, archivedAt: ws.archivedAt } } : null
      },
      async touch(id, at) {
        await c.siteKeys.updateOne({ _id: id }, { $set: { lastUsedAt: at } })
      },
    },

    webhooks: {
      async record(input) {
        const { id, ...rest } = input
        await c.webhooks.insertOne({ _id: id, ...rest })
      },
      async deleteBefore(workspaceId, before) {
        await c.webhooks.deleteMany({ workspaceId, at: { $lt: before } })
      },
      async recent(workspaceId, limit) {
        return rows<WebhookDeliveryRow>(await c.webhooks.find({ workspaceId }).sort({ at: -1 }).limit(limit).toArray())
      },
    },

    outbox: {
      async insert(input) {
        const { id, ...rest } = input
        await c.outbox.insertOne({ _id: id, ...rest })
      },
      async deleteBefore(before) {
        await c.outbox.deleteMany({ createdAt: { $lt: before } })
      },
      async latest(limit) {
        return rows<OutboxRow>(await c.outbox.find({}).sort({ createdAt: -1 }).limit(limit).toArray())
      },
    },

    /* The one place that reads content across workspaces: the agency dashboard. */
    overview: {
      async workspaceStats(workspaceId, now): Promise<WorkspaceStats> {
        const [members, published, last, drafts, review, unread, keys, deliv] = await Promise.all([
          c.memberships.countDocuments({ workspaceId }),
          c.posts.countDocuments({ workspaceId, ...LIVE(now) }),
          c.posts.find({ workspaceId, ...LIVE(now) }, { projection: { publishedAt: 1 } }).sort({ publishedAt: -1 }).limit(1).next(),
          c.posts.countDocuments({ workspaceId, status: 'draft' }),
          c.posts.countDocuments({ workspaceId, status: 'review' }),
          c.contact.countDocuments({ workspaceId, archived: false, readAt: null }),
          c.siteKeys.countDocuments({ workspaceId, revokedAt: null }),
          c.webhooks.find({ workspaceId }, { projection: { ok: 1, at: 1 } }).sort({ at: -1 }).limit(1).next(),
        ])
        return {
          members,
          published,
          lastPublishedAt: last?.publishedAt ?? null,
          drafts,
          review,
          unread,
          keys,
          lastWebhook: deliv ? { ok: deliv.ok, at: deliv.at } : null,
        }
      },
      async publishedBetween(since, now) {
        const docs = await c.posts
          .find({ status: 'published', publishedAt: { $gt: since, $lte: now } }, { projection: { publishedAt: 1 } })
          .toArray()
        return docs.map((d) => d.publishedAt!)
      },
    },
  }
}

async function upsertMembership(c: Collections, workspaceId: string, userId: string, role: Role, session?: ClientSession) {
  await c.memberships.updateOne(
    { _id: membershipId(workspaceId, userId) },
    { $set: { role }, $setOnInsert: { workspaceId, userId, createdAt: new Date() } },
    { upsert: true, session }
  )
}

// ---------------------------------------------------------------------------

function scope(c: Collections, workspaceId: string, session: ClientSession): Scope {
  const queue = new Queue()
  const posts = new FencedCollection(c.posts, workspaceId, session, queue)
  const authors = new FencedCollection(c.authors, workspaceId, session, queue)
  const contact = new FencedCollection(c.contact, workspaceId, session, queue)
  const rate = new FencedCollection(c.rate, workspaceId, session, queue)
  const audit = new FencedCollection(c.audit, workspaceId, session, queue)

  function postFilter(q: PostListQuery): Filter<Doc<PostRow>> {
    const f: Filter<Doc<PostRow>> = {}
    if (q.createdBy) f.createdBy = q.createdBy
    switch (q.status) {
      case 'draft':
        f.status = 'draft'
        break
      case 'review':
        f.status = 'review'
        break
      case 'scheduled':
        f.status = 'published'
        f.publishedAt = { $gt: q.now }
        break
      case 'published':
        Object.assign(f, LIVE(q.now))
        break
    }
    const text = q.q?.trim().slice(0, 100)
    if (text) f.$or = [{ title: containing(text) }, { slug: containing(text) }, { category: containing(text) }]
    return f
  }

  return {
    workspaceId,

    posts: {
      async list(q) {
        return rows<PostRow>(await posts.find(postFilter(q), { sort: { updatedAt: -1 }, limit: q.limit }))
      },
      async get(id) {
        const doc = await posts.findOne({ _id: id })
        return doc ? row<PostRow>(doc) : null
      },
      async byIds(ids) {
        return ids.length ? rows<PostRow>(await posts.find({ _id: { $in: ids } })) : []
      },
      async slugTaken(slug, excludeId) {
        return (await posts.count({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }, { limit: 1 })) > 0
      },
      async categories() {
        return (await posts.distinct('category', { category: { $nin: [null, ''] } })) as string[]
      },
      async tags() {
        return (await posts.distinct('tags')) as string[]
      },
      countByAuthor: (authorId) => posts.count({ authorId }),
      async counts(now) {
        return {
          drafts: await posts.count({ status: 'draft' }),
          review: await posts.count({ status: 'review' }),
          scheduled: await posts.count({ status: 'published', publishedAt: { $gt: now } }),
          published: await posts.count(LIVE(now)),
        }
      },
      async nextScheduled(now) {
        const [doc] = await posts.find(
          { status: 'published', publishedAt: { $gt: now } },
          { sort: { publishedAt: 1 }, limit: 1, projection: { _id: 1, title: 1, publishedAt: 1 } }
        )
        return doc ? { id: doc._id, title: doc.title, publishedAt: doc.publishedAt } : null
      },
      async liveDatesSince(now, since) {
        const docs = await posts.find({ status: 'published', publishedAt: { $gt: since, $lte: now } }, { projection: { publishedAt: 1 } })
        return docs.map((d) => d.publishedAt!)
      },
      async recent(limit) {
        return rows<PostRow>(await posts.find({}, { sort: { updatedAt: -1 }, limit }))
      },

      async live(q) {
        const f: Filter<Doc<PostRow>> = { ...LIVE(q.now) }
        if (q.tagSlug) f.tagSlugs = q.tagSlug
        if (q.authorId) f.authorId = q.authorId
        const total = await posts.count(f)
        const docs = await posts.find(f, { sort: { publishedAt: -1, _id: -1 }, skip: q.offset, limit: q.limit })
        return { rows: rows<PostRow>(docs), total }
      },
      async liveBySlug(slug, now) {
        const doc = await posts.findOne({ slug, ...LIVE(now) })
        return doc ? row<PostRow>(doc) : null
      },
      async liveRelated(now, excludeIds, tagSlugs, limit) {
        if (limit <= 0 || (tagSlugs && !tagSlugs.length)) return []
        const f: Filter<Doc<PostRow>> = { ...LIVE(now) }
        if (excludeIds.length) f._id = { $nin: excludeIds }
        if (tagSlugs) f.tagSlugs = { $in: tagSlugs }
        return rows<PostRow>(await posts.find(f, { sort: { publishedAt: -1 }, limit }))
      },
      async liveTagLists(now) {
        const docs = await posts.find(LIVE(now), { sort: { publishedAt: -1 }, projection: { tags: 1 } })
        return docs.map((d) => d.tags ?? [])
      },
      async liveIndex(now) {
        const docs = await posts.find(LIVE(now), { sort: { publishedAt: -1 }, projection: { slug: 1, updatedAt: 1, publishedAt: 1 } })
        return docs.map((d) => ({ slug: d.slug, updatedAt: d.updatedAt, publishedAt: d.publishedAt! }))
      },
      async liveAuthorIds(now) {
        return (await posts.distinct('authorId', { ...LIVE(now), authorId: { $ne: null } })) as string[]
      },

      async insert(id, createdBy, fields) {
        await posts.insertOne({ _id: id, ...fields, createdBy, createdAt: fields.updatedAt })
      },
      async update(id, fields) {
        await posts.updateOne({ _id: id }, { $set: fields })
      },
      async delete(id) {
        await posts.deleteOne({ _id: id })
      },
      unassignAuthor: (authorId) => posts.updateMany({ authorId }, { $set: { authorId: null } }),
      async imageCandidates(publicId, exceptId) {
        const docs = await posts.find(
          {
            ...(exceptId ? { _id: { $ne: exceptId } } : {}),
            $or: [{ 'coverImage.publicId': publicId }, { contentHtml: containing(publicId) }],
          },
          { projection: { coverImage: 1, contentHtml: 1 } }
        )
        return docs.map((d) => ({ coverImage: d.coverImage ?? null, contentHtml: d.contentHtml }))
      },
    },

    authors: {
      async list() {
        return rows<AuthorRow>(await authors.find({})).sort(byName)
      },
      async get(id) {
        const doc = await authors.findOne({ _id: id })
        return doc ? row<AuthorRow>(doc) : null
      },
      async bySlug(slug) {
        const doc = await authors.findOne({ slug })
        return doc ? row<AuthorRow>(doc) : null
      },
      async byIds(ids) {
        return ids.length ? rows<AuthorRow>(await authors.find({ _id: { $in: ids } })) : []
      },
      async slugTaken(slug, excludeId) {
        return (await authors.count({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }, { limit: 1 })) > 0
      },
      async insert(id, fields) {
        await authors.insertOne({ _id: id, ...fields, createdAt: fields.updatedAt })
      },
      async update(id, fields) {
        await authors.updateOne({ _id: id }, { $set: fields })
      },
      async delete(id) {
        await authors.deleteOne({ _id: id })
      },
      async avatarCandidates(publicId) {
        const docs = await authors.find({ 'avatar.publicId': publicId }, { projection: { avatar: 1 } })
        return docs.map((d) => d.avatar ?? null)
      },
    },

    contact: {
      async rateAllowed(visitorKey, limits, since, now) {
        await rate.deleteMany({ at: { $lt: since } })
        if ((await rate.count({ key: visitorKey, at: { $gt: since } })) >= limits.perVisitor) return false
        if ((await rate.count({ at: { $gt: since } })) >= limits.perWorkspace) return false
        await rate.insertOne({ _id: rowId(), key: visitorKey, at: now })
        return true
      },
      async insert(input) {
        const { id, ...rest } = input
        const doc = await contact.insertOne({ _id: id, ...rest, readAt: null, archived: false })
        return row<ContactMessageRow>(doc)
      },
      async list(q) {
        const f: Filter<Doc<ContactMessageRow>> = { archived: q.archived }
        if (q.unreadOnly) f.readAt = null
        const text = q.q?.trim().slice(0, 100)
        if (text) f.$or = [{ name: containing(text) }, { email: containing(text) }, { company: containing(text) }, { message: containing(text) }]
        return rows<ContactMessageRow>(await contact.find(f, { sort: { receivedAt: -1 }, limit: q.limit }))
      },
      async get(id) {
        const doc = await contact.findOne({ _id: id })
        return doc ? row<ContactMessageRow>(doc) : null
      },
      countUnread: () => contact.count({ archived: false, readAt: null }),
      async update(id, set) {
        return (await contact.updateOne({ _id: id }, { $set: set })) > 0
      },
      async delete(id) {
        return (await contact.deleteOne({ _id: id })) > 0
      },
      async all() {
        return rows<ContactMessageRow>(await contact.find({}, { sort: { receivedAt: 1 } }))
      },
    },

    audit: {
      async insert(input) {
        const { id, ...rest } = input
        await audit.insertOne({ _id: id, ...rest, at: new Date() })
      },
      async recent(limit, purgeBefore) {
        await audit.deleteMany({ at: { $lt: purgeBefore } })
        return rows<AuditRow>(await audit.find({}, { sort: { at: -1 }, limit }))
      },
    },
  }
}

// ---------------------------------------------------------------------------

function isDuplicate(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === 11000) return true
  }
  return false
}

/** `onCommand` sees every command sent — for the fence test only. */
export function openMongo(url: string, options: { onCommand?: (event: CommandStartedEvent) => void } = {}): Store {
  const client = new MongoClient(url, {
    ignoreUndefined: true,
    maxPoolSize: Number(process.env.DATABASE_POOL_MAX || 10),
    serverSelectionTimeoutMS: 15_000,
    appName: 'cms',
    monitorCommands: Boolean(options.onCommand),
  })
  if (options.onCommand) client.on('commandStarted', options.onCommand)
  /* The database named in the URL (mongodb://host/<name>), or "cms". */
  const db = client.db(new URL(url.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.slice(1) || 'cms')
  const c = collections(db)
  const ready = (async () => {
    await client.connect()
    await ensureSchema(db)
  })()
  ready.catch(() => undefined) // surfaced to whoever awaits it, not as an unhandled rejection

  return {
    backend: 'mongo',
    ready,
    system: system(client, c),
    async inWorkspace(workspaceId, fn) {
      const session = client.startSession()
      try {
        return await session.withTransaction(() => fn(scope(c, workspaceId, session)), {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        })
      } finally {
        await session.endSession()
      }
    },
    isDuplicate,
    close: () => client.close(),
  }
}
