// @ts-check
/** @typedef {import('mongodb').Db} Db */
/** @typedef {import('mongodb').Document} Document */
/** @typedef {{ validator: Document, indexes: import('mongodb').IndexDescription[] }} CollectionSpec */

/**
 * THE MONGODB SCHEMA: one collection per record type in ../types.ts, with the same
 * field names.
 *
 * - a JSON Schema validator per collection: required fields, types, allowed values;
 * - unique indexes for uniqueness rules (one email per user, one slug per workspace
 *   for posts and authors, …);
 * - `_id` is our own 24-hex string id (newId()), never an ObjectId. Records keyed by
 *   something else use that as `_id` and keep the field as well (a reset's
 *   tokenHash, a logo's workspaceId, a membership's `<workspace>:<user>`).
 *
 * ensureSchema() is idempotent: it runs when the app opens the database (and from
 * `npm run db:migrate`), creating what is missing and updating validators in place.
 * Bump SCHEMA_VERSION and add a step to MIGRATIONS for changes that rewrite data.
 *
 * Plain JavaScript (checked by TypeScript) so scripts/migrate.mjs can run it
 * without a build step.
 */

export const SCHEMA_VERSION = 1

const ID = { bsonType: 'string', pattern: '^[a-f0-9]{24}$' }
const STR = { bsonType: 'string' }
const STR_OR_NULL = { bsonType: ['string', 'null'] }
const DATE = { bsonType: 'date' }
const DATE_OR_NULL = { bsonType: ['date', 'null'] }
const BOOL = { bsonType: 'bool' }
const INT = { bsonType: ['int', 'long', 'double'] }
const INT_OR_NULL = { bsonType: ['int', 'long', 'double', 'null'] }
const ROLE = { enum: ['owner', 'editor', 'writer'] }
const IMAGE_OR_NULL = { bsonType: ['object', 'null'] }

/**
 * @param {string[]} required
 * @param {Record<string, unknown>} properties
 * @param {Record<string, unknown>} [extra]
 * @returns {Document}
 */
function schema(required, properties, extra = {}) {
  return { $jsonSchema: { bsonType: 'object', required, properties, ...extra } }
}

/** @type {Record<string, CollectionSpec>} */
export const COLLECTIONS = {
  // ---- System ---------------------------------------------------------------
  users: {
    validator: schema(['_id', 'email', 'name', 'passwordHash', 'isAgency', 'twoFactor', 'createdAt'], {
      _id: ID,
      email: STR,
      name: STR,
      passwordHash: STR,
      isAgency: BOOL,
      twoFactor: BOOL,
      disabledAt: DATE_OR_NULL,
      lastLoginAt: DATE_OR_NULL,
      createdAt: DATE,
    }),
    indexes: [{ key: { email: 1 }, name: 'users_email', unique: true }, { key: { isAgency: 1, name: 1 }, name: 'users_agency' }],
  },
  workspaces: {
    validator: schema(['_id', 'slug', 'name', 'siteUrl', 'accent', 'hasLogo', 'settings', 'webhookUrl', 'webhookSecret', 'createdAt', 'updatedAt'], {
      _id: ID,
      slug: { bsonType: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,47}$' },
      name: STR,
      siteUrl: STR,
      accent: STR,
      hasLogo: BOOL,
      settings: { bsonType: 'object' },
      webhookUrl: STR,
      webhookSecret: STR,
      archivedAt: DATE_OR_NULL,
      createdAt: DATE,
      updatedAt: DATE,
    }),
    indexes: [{ key: { slug: 1 }, name: 'workspaces_slug', unique: true }, { key: { name: 1 }, name: 'workspaces_name' }],
  },
  workspace_logos: {
    validator: schema(['_id', 'workspaceId', 'contentType', 'data', 'updatedAt'], {
      _id: ID,
      workspaceId: ID,
      contentType: STR,
      data: { bsonType: 'binData' },
      updatedAt: DATE,
    }),
    indexes: [],
  },
  memberships: {
    validator: schema(['_id', 'workspaceId', 'userId', 'role', 'createdAt'], {
      _id: STR,
      workspaceId: ID,
      userId: ID,
      role: ROLE,
      createdAt: DATE,
    }),
    indexes: [
      { key: { workspaceId: 1, userId: 1 }, name: 'memberships_pair', unique: true },
      { key: { userId: 1 }, name: 'memberships_user' },
    ],
  },
  invites: {
    validator: schema(
      ['_id', 'email', 'role', 'tokenHash', 'expiresAt', 'createdAt'],
      {
        _id: ID,
        workspaceId: { bsonType: ['string', 'null'] },
        email: STR,
        role: { enum: ['owner', 'editor', 'writer', 'agency'] },
        tokenHash: STR,
        invitedBy: STR_OR_NULL,
        expiresAt: DATE,
        acceptedAt: DATE_OR_NULL,
        revokedAt: DATE_OR_NULL,
        createdAt: DATE,
      },
      /* An agency invite has no workspace; a workspace invite always has one. */
      {
        anyOf: [
          { required: ['workspaceId'], properties: { role: { enum: ['agency'] }, workspaceId: { bsonType: 'null' } } },
          { required: ['workspaceId'], properties: { role: ROLE, workspaceId: ID } },
        ],
      }
    ),
    indexes: [
      { key: { tokenHash: 1 }, name: 'invites_token', unique: true },
      { key: { workspaceId: 1, email: 1 }, name: 'invites_workspace' },
    ],
  },
  sessions: {
    validator: schema(['_id', 'userId', 'userAgent', 'createdAt', 'lastSeenAt', 'expiresAt'], {
      _id: STR,
      userId: ID,
      userAgent: STR,
      createdAt: DATE,
      lastSeenAt: DATE,
      expiresAt: DATE,
    }),
    indexes: [{ key: { userId: 1 }, name: 'sessions_user' }, { key: { expiresAt: 1 }, name: 'sessions_expiry' }],
  },
  login_challenges: {
    validator: schema(['_id', 'userId', 'codeHash', 'attempts', 'expiresAt', 'createdAt'], {
      _id: STR,
      userId: ID,
      codeHash: STR,
      attempts: INT,
      expiresAt: DATE,
      createdAt: DATE,
    }),
    indexes: [{ key: { userId: 1 }, name: 'challenges_user' }, { key: { expiresAt: 1 }, name: 'challenges_expiry' }],
  },
  password_resets: {
    validator: schema(['_id', 'tokenHash', 'userId', 'expiresAt', 'createdAt'], {
      _id: STR,
      tokenHash: STR,
      userId: ID,
      expiresAt: DATE,
      usedAt: DATE_OR_NULL,
      createdAt: DATE,
    }),
    indexes: [{ key: { userId: 1 }, name: 'resets_user' }, { key: { expiresAt: 1 }, name: 'resets_expiry' }],
  },
  login_attempts: {
    validator: schema(['_id', 'key', 'at'], { _id: ID, key: STR, at: DATE }),
    indexes: [{ key: { key: 1, at: 1 }, name: 'attempts_key' }, { key: { at: 1 }, name: 'attempts_at' }],
  },
  site_keys: {
    validator: schema(['_id', 'workspaceId', 'label', 'prefix', 'keyHash', 'createdAt'], {
      _id: ID,
      workspaceId: ID,
      label: STR,
      prefix: STR,
      keyHash: STR,
      createdBy: STR_OR_NULL,
      createdAt: DATE,
      lastUsedAt: DATE_OR_NULL,
      revokedAt: DATE_OR_NULL,
    }),
    indexes: [{ key: { prefix: 1 }, name: 'site_keys_prefix', unique: true }, { key: { workspaceId: 1, createdAt: -1 }, name: 'site_keys_workspace' }],
  },
  webhook_deliveries: {
    validator: schema(['_id', 'workspaceId', 'event', 'ok', 'at'], {
      _id: ID,
      workspaceId: ID,
      event: STR,
      ok: BOOL,
      status: INT_OR_NULL,
      error: STR_OR_NULL,
      durationMs: INT_OR_NULL,
      at: DATE,
    }),
    indexes: [{ key: { workspaceId: 1, at: -1 }, name: 'webhook_deliveries_ws' }],
  },
  outbox: {
    validator: schema(['_id', 'to', 'subject', 'html', 'text', 'createdAt'], {
      _id: ID,
      to: STR,
      subject: STR,
      html: STR,
      text: STR,
      createdAt: DATE,
    }),
    indexes: [{ key: { createdAt: -1 }, name: 'outbox_created' }],
  },

  // ---- Client content: every document carries a valid workspaceId ------------
  authors: {
    validator: schema(['_id', 'workspaceId', 'slug', 'name', 'createdAt', 'updatedAt'], {
      _id: ID,
      workspaceId: ID,
      slug: STR,
      name: STR,
      role: STR_OR_NULL,
      bio: STR_OR_NULL,
      avatar: IMAGE_OR_NULL,
      linkedinUrl: STR_OR_NULL,
      xUrl: STR_OR_NULL,
      websiteUrl: STR_OR_NULL,
      createdAt: DATE,
      updatedAt: DATE,
    }),
    indexes: [
      { key: { workspaceId: 1, slug: 1 }, name: 'authors_ws_slug', unique: true },
      { key: { workspaceId: 1, name: 1 }, name: 'authors_ws_name' },
    ],
  },
  posts: {
    validator: schema(
      ['_id', 'workspaceId', 'slug', 'title', 'description', 'format', 'contentHtml', 'tags', 'tagSlugs', 'faqs', 'status', 'readingMinutes', 'createdAt', 'updatedAt'],
      {
        _id: ID,
        workspaceId: ID,
        slug: STR,
        title: STR,
        description: STR,
        excerpt: STR_OR_NULL,
        format: { enum: ['editor', 'html'] },
        contentHtml: STR,
        coverImage: IMAGE_OR_NULL,
        category: STR_OR_NULL,
        tags: { bsonType: 'array', items: STR },
        tagSlugs: { bsonType: 'array', items: STR },
        faqs: { bsonType: 'array', items: { bsonType: 'object', required: ['question', 'answer'], properties: { question: STR, answer: STR } } },
        authorId: STR_OR_NULL,
        seoTitle: STR_OR_NULL,
        focusKeyword: STR_OR_NULL,
        status: { enum: ['draft', 'review', 'published'] },
        publishedAt: DATE_OR_NULL,
        readingMinutes: INT,
        createdBy: STR_OR_NULL,
        updatedBy: STR_OR_NULL,
        createdAt: DATE,
        updatedAt: DATE,
      }
    ),
    indexes: [
      { key: { workspaceId: 1, slug: 1 }, name: 'posts_ws_slug', unique: true },
      { key: { workspaceId: 1, status: 1, publishedAt: -1 }, name: 'posts_ws_live' },
      { key: { workspaceId: 1, updatedAt: -1 }, name: 'posts_ws_updated' },
      { key: { workspaceId: 1, authorId: 1 }, name: 'posts_ws_author' },
      { key: { workspaceId: 1, tagSlugs: 1 }, name: 'posts_ws_tags' },
      { key: { status: 1, publishedAt: -1 }, name: 'posts_live_all' },
    ],
  },
  contact_messages: {
    validator: schema(['_id', 'workspaceId', 'name', 'email', 'phone', 'company', 'topic', 'message', 'receivedAt', 'archived'], {
      _id: ID,
      workspaceId: ID,
      name: STR,
      email: STR,
      phone: STR,
      company: STR,
      topic: STR,
      message: STR,
      source: STR_OR_NULL,
      userAgent: STR_OR_NULL,
      receivedAt: DATE,
      readAt: DATE_OR_NULL,
      archived: BOOL,
    }),
    indexes: [{ key: { workspaceId: 1, archived: 1, receivedAt: -1 }, name: 'contact_ws_inbox' }],
  },
  contact_rate: {
    validator: schema(['_id', 'workspaceId', 'key', 'at'], { _id: ID, workspaceId: ID, key: STR, at: DATE }),
    indexes: [{ key: { workspaceId: 1, key: 1, at: 1 }, name: 'contact_rate_key' }, { key: { workspaceId: 1, at: 1 }, name: 'contact_rate_at' }],
  },
  audit_log: {
    validator: schema(['_id', 'workspaceId', 'actorName', 'action', 'summary', 'at'], {
      _id: ID,
      workspaceId: ID,
      actorId: STR_OR_NULL,
      actorName: STR,
      action: STR,
      targetType: STR_OR_NULL,
      targetId: STR_OR_NULL,
      summary: STR,
      at: DATE,
    }),
    indexes: [{ key: { workspaceId: 1, at: -1 }, name: 'audit_ws_at' }],
  },
}

/** Data-rewriting steps, run once each, in order, when SCHEMA_VERSION goes up. */
/** @type {Record<number, (db: Db) => Promise<void>>} */
const MIGRATIONS = {}

const NAMESPACE_EXISTS = 48
const UNAUTHORIZED = 13

/** @param {Db} db */
export async function ensureSchema(db) {
  const existing = new Map((await db.listCollections({}).toArray()).map((c) => [c.name, /** @type {{ options?: Document }} */ (c).options ?? {}]))
  for (const [name, spec] of Object.entries(COLLECTIONS)) {
    const options = existing.get(name)
    if (!options) {
      try {
        await db.createCollection(name, { validator: spec.validator, validationLevel: 'strict', validationAction: 'error' })
      } catch (error) {
        /* Another instance created it first. */
        if (/** @type {{ code?: number }} */ (error).code !== NAMESPACE_EXISTS) throw error
      }
    } else if (JSON.stringify(options.validator) !== JSON.stringify(spec.validator) || options.validationLevel !== 'strict') {
      /* The rules changed in an upgrade. Needs the dbAdmin role; the app keeps working without it. */
      try {
        await db.command({ collMod: name, validator: spec.validator, validationLevel: 'strict', validationAction: 'error' })
      } catch (error) {
        if (/** @type {{ code?: number }} */ (error).code !== UNAUTHORIZED) throw error
        console.warn(`[db] Could not update the validator of "${name}": the database user needs the dbAdmin role for that.`)
      }
    }
    if (spec.indexes.length) await db.collection(name).createIndexes(spec.indexes)
  }

  /** @type {import('mongodb').Collection<{ _id: string, version: number, updatedAt: Date }>} */
  const meta = db.collection('_meta')
  const current = (await meta.findOne({ _id: 'schema' }))?.version ?? 0
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    await MIGRATIONS[v]?.(db)
    await meta.updateOne({ _id: 'schema' }, { $set: { version: v, updatedAt: new Date() } }, { upsert: true })
  }
}
