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
  StoredImage,
  UserRow,
  WebhookDeliveryRow,
  WorkspaceRow,
} from './types'

/**
 * THE DATA LAYER CONTRACT.
 *
 * Everything the app asks of its database, as plain methods. The app talks
 * only to these interfaces:
 *
 *   lib/db/mongo     MongoDB (production, and local development)
 *
 * Two kinds of access, on purpose:
 *
 * - `System` — the CMS's own records (users, sessions, workspaces, keys…). Methods
 *   that concern one workspace take its id explicitly.
 * - `Scope` — client content (posts, authors, enquiries, audit log). Only ever handed
 *   out by `inWorkspace(id, fn)`, already bound to that one workspace: its methods
 *   take no workspace id, so they cannot be pointed at another client. The adapter
 *   enforces the binding underneath (a wrapper that adds the workspace to every
 *   filter and every document).
 */

export type Backend = 'mongo'

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export type UserPatch = Partial<Pick<UserRow, 'name' | 'passwordHash' | 'twoFactor' | 'isAgency' | 'disabledAt' | 'lastLoginAt'>>
export type WorkspacePatch = Partial<
  Pick<WorkspaceRow, 'name' | 'accent' | 'settings' | 'siteUrl' | 'webhookUrl' | 'webhookSecret' | 'archivedAt' | 'hasLogo'>
> & { updatedAt: Date }

export type MemberRow = {
  userId: string
  name: string
  email: string
  role: Role
  joinedAt: Date
  lastLoginAt: Date | null
  twoFactor: boolean
}

export type WorkspaceStats = {
  members: number
  published: number
  lastPublishedAt: Date | null
  drafts: number
  review: number
  unread: number
  keys: number
  lastWebhook: { ok: boolean; at: Date } | null
}

export interface System {
  users: {
    count(): Promise<number>
    byId(id: string): Promise<UserRow | null>
    byEmail(email: string): Promise<UserRow | null>
    /** Throws a duplicate error (see isDuplicate) when the email is taken. */
    insert(user: Pick<UserRow, 'id' | 'email' | 'name' | 'passwordHash'> & Partial<Pick<UserRow, 'isAgency'>>): Promise<void>
    update(id: string, patch: UserPatch): Promise<void>
    delete(id: string): Promise<void>
    /** Agency users, by name. */
    agency(): Promise<UserRow[]>
    /** Agency users who are not disabled, optionally leaving one out. */
    countActiveAgency(exceptUserId?: string): Promise<number>
  }

  workspaces: {
    byId(id: string): Promise<WorkspaceRow | null>
    bySlug(slug: string): Promise<WorkspaceRow | null>
    /** By name. */
    list(options?: { includeArchived?: boolean }): Promise<WorkspaceRow[]>
    /** Throws a duplicate error when the slug is taken. */
    insert(row: Omit<WorkspaceRow, 'createdAt' | 'updatedAt' | 'hasLogo' | 'archivedAt' | 'webhookUrl'>): Promise<WorkspaceRow>
    update(id: string, patch: WorkspacePatch): Promise<void>
    setLogo(id: string, data: Buffer, contentType: string): Promise<void>
    removeLogo(id: string): Promise<void>
    logoBySlug(slug: string): Promise<{ data: Buffer; contentType: string; updatedAt: Date } | null>
  }

  members: {
    get(workspaceId: string, userId: string): Promise<MembershipRow | null>
    /** Active (not disabled) people in a workspace, by name. */
    list(workspaceId: string): Promise<MemberRow[]>
    /** Active owners. */
    ownerCount(workspaceId: string): Promise<number>
    setRole(workspaceId: string, userId: string, role: Role): Promise<void>
    remove(workspaceId: string, userId: string): Promise<void>
    upsert(workspaceId: string, userId: string, role: Role): Promise<void>
    /** The non-archived workspaces a user belongs to, with their role, by name. */
    workspacesOf(userId: string): Promise<(WorkspaceRow & { role: Role })[]>
  }

  invites: {
    /** Revokes every open invite for this address to this workspace (null = agency). */
    revokeOpen(email: string, workspaceId: string | null, at: Date): Promise<void>
    insert(row: Omit<InviteRow, 'acceptedAt' | 'revokedAt' | 'createdAt'>): Promise<void>
    /** Unused, unrevoked, unexpired. */
    findOpen(tokenHash: string, now: Date): Promise<InviteRow | null>
    /**
     * Atomically marks the invite accepted and grants what it promised: agency
     * access, or a workspace role. False if it was already used or revoked.
     */
    accept(invite: { id: string; role: Role | 'agency'; workspaceId: string | null }, userId: string, at: Date): Promise<boolean>
    revoke(workspaceId: string | null, id: string, at: Date): Promise<void>
    /** Open invites, newest first. */
    pending(workspaceId: string | null, now: Date): Promise<InviteRow[]>
  }

  sessions: {
    insert(row: SessionRow): Promise<void>
    findActive(id: string, now: Date): Promise<{ session: SessionRow; user: UserRow } | null>
    touch(id: string, at: Date): Promise<void>
    delete(id: string): Promise<void>
    deleteForUser(userId: string, keepId?: string): Promise<void>
    deleteExpired(now: Date): Promise<void>
    /** Unexpired, least recently seen first. */
    listForUser(userId: string, now: Date): Promise<SessionRow[]>
  }

  challenges: {
    deleteForUser(userId: string): Promise<void>
    deleteExpired(now: Date): Promise<void>
    insert(row: Omit<ChallengeRow, 'attempts' | 'createdAt'>): Promise<void>
    findActive(id: string, now: Date): Promise<ChallengeRow | null>
    delete(id: string): Promise<void>
    setAttempts(id: string, attempts: number): Promise<void>
  }

  resets: {
    deleteExpired(now: Date): Promise<void>
    insert(row: Omit<ResetRow, 'usedAt' | 'createdAt'>): Promise<void>
    findActive(tokenHash: string, now: Date): Promise<{ userId: string; email: string; name: string } | null>
    /** Atomically marks it used. False if it already was. */
    markUsed(tokenHash: string, at: Date): Promise<boolean>
    deleteForUser(userId: string): Promise<void>
  }

  /** Counters for rate limits: one record per event, keyed. */
  attempts: {
    deleteBefore(since: Date): Promise<void>
    count(key: string, since: Date): Promise<number>
    insert(keys: string[], at: Date): Promise<void>
    deleteKeys(keys: string[]): Promise<void>
  }

  siteKeys: {
    insert(row: Omit<SiteKeyRow, 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<void>
    /** Newest first. */
    list(workspaceId: string): Promise<SiteKeyRow[]>
    revoke(workspaceId: string, id: string, at: Date): Promise<boolean>
    /** The unrevoked key with this prefix, and its workspace. */
    findActiveByPrefix(prefix: string): Promise<{ key: SiteKeyRow; workspace: Pick<WorkspaceRow, 'slug' | 'archivedAt'> } | null>
    touch(id: string, at: Date): Promise<void>
  }

  webhooks: {
    record(row: WebhookDeliveryRow): Promise<void>
    deleteBefore(workspaceId: string, before: Date): Promise<void>
    /** Newest first. */
    recent(workspaceId: string, limit: number): Promise<WebhookDeliveryRow[]>
  }

  outbox: {
    insert(row: OutboxRow): Promise<void>
    deleteBefore(before: Date): Promise<void>
    latest(limit: number): Promise<OutboxRow[]>
  }

  /** Cross-workspace counts for the agency dashboard. Agency-only callers. */
  overview: {
    workspaceStats(workspaceId: string, now: Date): Promise<WorkspaceStats>
    /** Publish times of posts that went live in (since, now]. */
    publishedBetween(since: Date, now: Date): Promise<Date[]>
  }
}

// ---------------------------------------------------------------------------
// Scope — one workspace's content
// ---------------------------------------------------------------------------

export type PostListQuery = {
  now: Date
  status?: 'draft' | 'review' | 'scheduled' | 'published' | 'all'
  /** Case-insensitive substring of title, slug or category. */
  q?: string
  createdBy?: string
  limit: number
}

export type PostFields = Omit<PostRow, 'id' | 'workspaceId' | 'createdAt' | 'createdBy'>
export type AuthorFields = Omit<AuthorRow, 'id' | 'workspaceId' | 'createdAt'>

export interface Scope {
  readonly workspaceId: string

  posts: {
    /** Admin list, most recently updated first. */
    list(query: PostListQuery): Promise<PostRow[]>
    get(id: string): Promise<PostRow | null>
    byIds(ids: string[]): Promise<PostRow[]>
    slugTaken(slug: string, excludeId?: string): Promise<boolean>
    /** Distinct non-empty categories. */
    categories(): Promise<string[]>
    /** Distinct tags across every post. */
    tags(): Promise<string[]>
    countByAuthor(authorId: string): Promise<number>
    counts(now: Date): Promise<{ drafts: number; review: number; scheduled: number; published: number }>
    nextScheduled(now: Date): Promise<Pick<PostRow, 'id' | 'title' | 'publishedAt'> | null>
    /** Publish times of live posts published after `since`. */
    liveDatesSince(now: Date, since: Date): Promise<Date[]>
    /** Most recently updated first. */
    recent(limit: number): Promise<PostRow[]>

    /** Live = published with publishedAt <= now. Newest first (publishedAt, then id). */
    live(query: { now: Date; limit: number; offset: number; tagSlug?: string; authorId?: string }): Promise<{ rows: PostRow[]; total: number }>
    liveBySlug(slug: string, now: Date): Promise<PostRow | null>
    /** Live posts other than `excludeIds` sharing any of the tag slugs (any, if none given), newest first. */
    liveRelated(now: Date, excludeIds: string[], tagSlugs: string[] | null, limit: number): Promise<PostRow[]>
    /** The tag lists of every live post, newest first. */
    liveTagLists(now: Date): Promise<string[][]>
    liveIndex(now: Date): Promise<{ slug: string; updatedAt: Date; publishedAt: Date }[]>
    liveAuthorIds(now: Date): Promise<string[]>

    insert(id: string, createdBy: string, fields: PostFields): Promise<void>
    update(id: string, fields: PostFields): Promise<void>
    delete(id: string): Promise<void>
    /** Clears the author on their posts. Returns how many changed. */
    unassignAuthor(authorId: string): Promise<number>
    /** Posts (other than one) whose cover or body might use this image. */
    imageCandidates(publicId: string, exceptId?: string): Promise<{ coverImage: StoredImage | null; contentHtml: string }[]>
  }

  authors: {
    /** By name. */
    list(): Promise<AuthorRow[]>
    get(id: string): Promise<AuthorRow | null>
    bySlug(slug: string): Promise<AuthorRow | null>
    byIds(ids: string[]): Promise<AuthorRow[]>
    slugTaken(slug: string, excludeId?: string): Promise<boolean>
    insert(id: string, fields: AuthorFields): Promise<void>
    update(id: string, fields: AuthorFields): Promise<void>
    delete(id: string): Promise<void>
    avatarCandidates(publicId: string): Promise<(StoredImage | null)[]>
  }

  contact: {
    /**
     * Drops counters older than `since`, then records this event unless the
     * visitor or the whole workspace has reached its limit. True = allowed.
     */
    rateAllowed(visitorKey: string, limits: { perVisitor: number; perWorkspace: number }, since: Date, now: Date): Promise<boolean>
    insert(row: Omit<ContactMessageRow, 'workspaceId' | 'readAt' | 'archived'>): Promise<ContactMessageRow>
    /** Newest first. */
    list(query: { archived: boolean; unreadOnly: boolean; q?: string; limit: number }): Promise<ContactMessageRow[]>
    get(id: string): Promise<ContactMessageRow | null>
    countUnread(): Promise<number>
    update(id: string, set: { readAt?: Date | null; archived?: boolean }): Promise<boolean>
    delete(id: string): Promise<boolean>
    /** Oldest first. */
    all(): Promise<ContactMessageRow[]>
  }

  audit: {
    insert(row: Omit<AuditRow, 'workspaceId' | 'at'>): Promise<void>
    /** Drops entries older than `purgeBefore`, then returns the newest. */
    recent(limit: number, purgeBefore: Date): Promise<AuditRow[]>
  }
}

// ---------------------------------------------------------------------------

export interface Store {
  readonly backend: Backend
  /** Resolves once the database is reachable and its schema is in place. */
  ready: Promise<void>
  system: System
  /** Runs fn in one transaction with content visible for this workspace only. */
  inWorkspace<T>(workspaceId: string, fn: (scope: Scope) => Promise<T>): Promise<T>
  /** Was this error a unique-key clash? */
  isDuplicate(error: unknown): boolean
  close(): Promise<void>
}
