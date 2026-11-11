import 'server-only'
import { randomBytes } from 'node:crypto'
import { openMongo } from './mongo'
import type { Backend, Scope, Store, System } from './store'

/**
 * THE DATABASE DOOR. Everything outside lib/db reaches data through here.
 *
 * Runs on MongoDB (`DATABASE_URL=mongodb://…` or `mongodb+srv://…`).
 * In local development, `npm run dev` starts a local MongoDB replica set automatically.
 *
 * TWO DOORS, ON PURPOSE:
 *
 * - `sys()` — the CMS's own records: users, sessions, workspaces, keys. Code that
 *   touches one workspace's records passes its id explicitly.
 * - `inWorkspace(id, fn)` — the only way to reach client content. `fn` gets a
 *   Scope already bound to that one workspace, inside a transaction. The adapter
 *   enforces the binding underneath (a wrapper that adds the workspace to every
 *   filter and every document).
 *
 * The workspace id must come from the server (a membership check, a verified site
 * key), never straight from a request.
 */

export type { AuthorFields, Backend, PostFields, Scope, Store, System } from './store'
export type * from './types'
/** The workspace-bound handle content code receives. (Kept under its old name.) */
export type Tx = Scope

export function backendFor(url: string | undefined): Backend {
  const value = (url ?? '').trim()
  if (/^mongodb(\+srv)?:\/\//.test(value)) return 'mongo'
  if (!value) {
    throw new Error(
      'DATABASE_URL is not set. Use `npm run dev` (it starts a local MongoDB for you), ' +
        'or set DATABASE_URL to a mongodb:// or mongodb+srv:// address. See apps/cms/.env.example.'
    )
  }
  throw new Error('DATABASE_URL must start with mongodb:// or mongodb+srv://.')
}

const g = globalThis as unknown as { __cmsStore?: Store }

function open(): Store {
  const url = process.env.DATABASE_URL
  backendFor(url)
  return openMongo(url!.trim())
}

/** The open store, ready to use. */
export async function store(): Promise<Store> {
  if (!g.__cmsStore) g.__cmsStore = open()
  await g.__cmsStore.ready
  return g.__cmsStore
}

/** The CMS's own records. NOT for client content — use inWorkspace(). */
export async function sys(): Promise<System> {
  return (await store()).system
}

/**
 * Runs `fn` with client content visible for one workspace only, in one transaction.
 */
export async function inWorkspace<T>(workspaceId: string, fn: (scope: Scope) => Promise<T>): Promise<T> {
  if (!isId(workspaceId)) throw new Error('inWorkspace: invalid workspace id')
  return (await store()).inWorkspace(workspaceId, fn)
}

/**
 * Content functions take the scope AND the workspace id they expect, as a
 * cross-check: a scope bound to one client handed to code working on another is a
 * bug, and it fails loudly instead of quietly doing the wrong thing.
 */
export function scoped(scope: Scope, workspaceId: string): Scope {
  if (scope.workspaceId !== workspaceId) throw new Error('Workspace scope mismatch')
  return scope
}

/** True when the error was a unique-key clash (an email, slug or prefix already taken). */
export async function isDuplicate(error: unknown): Promise<boolean> {
  return (await store()).isDuplicate(error)
}

/** For tests and scripts. */
export async function closeDatabase() {
  const s = g.__cmsStore
  if (!s) return
  g.__cmsStore = undefined
  await s.close()
}

export function newId(): string {
  return randomBytes(12).toString('hex')
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{24}$/.test(value)
}
