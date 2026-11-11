import type {
  ClientSession,
  Collection,
  CountDocumentsOptions,
  Document,
  Filter,
  FindOptions,
  OptionalUnlessRequiredId,
  UpdateFilter,
} from 'mongodb'

/**
 * THE WORKSPACE FENCE.
 *
 * Keeps client content strictly isolated by workspace. Client content is never
 * reached through a raw collection. Scope code (./index.ts, `scope()`) only gets
 * these wrappers, each bound to one workspace and one transaction:
 *
 * - every filter is ANDed with `{ workspaceId: <this workspace> }`, overriding any
 *   workspaceId the caller put in it — a query cannot be pointed elsewhere, and a
 *   query that "forgot" its filter still sees only this workspace;
 * - every inserted document is stamped with this workspace;
 * - an update that tries to change `workspaceId` is refused;
 * - every call joins the transaction (`session`), and calls run one at a time, as
 *   a MongoDB transaction requires.
 *
 * A test watches every command the driver sends and fails if any content command
 * lacks the workspace filter (tests/unit/mongo-fence.test.ts).
 */

export type Fenced = { _id: string; workspaceId: string }

/** Runs operations one after another: a transaction's session is not concurrent-safe. */
export class Queue {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.tail.then(op, op)
    this.tail = next.catch(() => undefined)
    return next
  }
}

function touchesWorkspace(update: UpdateFilter<Document>): boolean {
  for (const [op, fields] of Object.entries(update)) {
    if (!op.startsWith('$')) return true // a replacement document
    if (fields && typeof fields === 'object' && 'workspaceId' in fields) return true
  }
  return false
}

export class FencedCollection<T extends Fenced> {
  constructor(
    private readonly collection: Collection<T>,
    private readonly workspaceId: string,
    private readonly session: ClientSession,
    private readonly queue: Queue
  ) {}

  private where(filter: Filter<T> = {}): Filter<T> {
    return { ...filter, workspaceId: this.workspaceId } as Filter<T>
  }

  private guard(update: UpdateFilter<T>): UpdateFilter<T> {
    if (touchesWorkspace(update as UpdateFilter<Document>)) throw new Error('A record cannot be moved to another workspace.')
    return update
  }

  find(filter: Filter<T>, options: Omit<FindOptions, 'session'> = {}): Promise<T[]> {
    return this.queue.run(() => this.collection.find(this.where(filter), { ...options, session: this.session }).toArray() as Promise<T[]>)
  }

  findOne(filter: Filter<T>, options: Omit<FindOptions, 'session'> = {}): Promise<T | null> {
    return this.queue.run(() => this.collection.findOne(this.where(filter), { ...options, session: this.session }) as Promise<T | null>)
  }

  count(filter: Filter<T> = {}, options: Omit<CountDocumentsOptions, 'session'> = {}): Promise<number> {
    return this.queue.run(() => this.collection.countDocuments(this.where(filter), { ...options, session: this.session }))
  }

  distinct(field: string, filter: Filter<T> = {}): Promise<unknown[]> {
    return this.queue.run(() => this.collection.distinct(field as never, this.where(filter), { session: this.session }))
  }

  async insertOne(doc: Omit<T, 'workspaceId'>): Promise<T> {
    const stamped = { ...doc, workspaceId: this.workspaceId } as T
    await this.queue.run(() => this.collection.insertOne(stamped as OptionalUnlessRequiredId<T>, { session: this.session }))
    return stamped
  }

  async updateOne(filter: Filter<T>, update: UpdateFilter<T>): Promise<number> {
    const guarded = this.guard(update)
    const r = await this.queue.run(() => this.collection.updateOne(this.where(filter), guarded, { session: this.session }))
    return r.matchedCount
  }

  async updateMany(filter: Filter<T>, update: UpdateFilter<T>): Promise<number> {
    const guarded = this.guard(update)
    const r = await this.queue.run(() => this.collection.updateMany(this.where(filter), guarded, { session: this.session }))
    return r.matchedCount
  }

  async deleteOne(filter: Filter<T>): Promise<number> {
    const r = await this.queue.run(() => this.collection.deleteOne(this.where(filter), { session: this.session }))
    return r.deletedCount
  }

  async deleteMany(filter: Filter<T>): Promise<number> {
    const r = await this.queue.run(() => this.collection.deleteMany(this.where(filter), { session: this.session }))
    return r.deletedCount
  }
}
