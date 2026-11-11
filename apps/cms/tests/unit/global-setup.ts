import type { TestProject } from 'vitest/node'

/**
 * Database for the unit suite:
 *
 *   a throwaway single-node MongoDB replica set, started here
 *   (or TEST_MONGO_URL, an existing replica set).
 *
 * Every test file gets a database of its own (see ./setup.ts).
 */

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUrl: string
  }
}

export default async function setup(project: TestProject) {
  const kind = process.env.TEST_DB || 'mongo'
  if (kind !== 'mongo') return
  if (process.env.TEST_MONGO_URL) {
    project.provide('mongoUrl', process.env.TEST_MONGO_URL)
    return
  }
  const { MongoMemoryReplSet } = await import('mongodb-memory-server-core')
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  project.provide('mongoUrl', replSet.getUri())
  return async () => {
    await replSet.stop()
  }
}
