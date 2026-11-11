// Brings the database up to date. `npm start` runs this before the server.
//
// MongoDB (DATABASE_URL=mongodb://… or mongodb+srv://…): creates missing
// collections, applies validators and indexes, and runs data migrations
// (lib/db/mongo/schema.mjs). Idempotent; the app also does this when it starts.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
nextEnv.loadEnvConfig(root, process.env.NODE_ENV !== 'production')

const url = process.env.DATABASE_URL?.trim()
if (!url) {
  console.error('[migrate] DATABASE_URL is not set. Set it to your mongodb:// address. See .env.example.')
  process.exit(1)
}

if (!/^mongodb(\+srv)?:\/\//.test(url)) {
  console.error('[migrate] DATABASE_URL must start with mongodb:// or mongodb+srv://.')
  process.exit(1)
}

const { MongoClient } = await import('mongodb')
const { ensureSchema, SCHEMA_VERSION } = await import('../lib/db/mongo/schema.mjs')
const client = new MongoClient(url, { serverSelectionTimeoutMS: 15_000 })
const started = Date.now()
try {
  await client.connect()
  const name = new URL(url.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.slice(1) || 'cms'
  await ensureSchema(client.db(name))
  console.log(`[migrate] MongoDB "${name}" is up to date (schema v${SCHEMA_VERSION}, ${Date.now() - started} ms).`)
} catch (error) {
  console.error('[migrate] Failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.close()
}
process.exit()
