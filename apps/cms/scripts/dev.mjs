// `npm run dev`: the CMS on http://localhost:3000, with a database.
//
// With DATABASE_URL set (in the environment or .env.local) it simply runs
// `next dev` against that database. Without it, it first starts a local MongoDB
// for you — a single-node replica set (transactions need one) on 127.0.0.1:27027,
// keeping its data in apps/cms/data/mongo — so there is nothing to install.
// The MongoDB server program is downloaded on the first run (about 100 MB, by
// mongodb-memory-server-core) and reused from ~/.cache/mongodb-binaries after that.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
nextEnv.loadEnvConfig(root, true)

const PORT = Number(process.env.LOCAL_MONGO_PORT || 27027)
const REPLICA_SET = 'cms'
const children = []

function stopAll(code = 0) {
  for (const child of children.reverse()) child.kill()
  process.exit(code)
}
process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function reachable(url) {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 800, directConnection: true })
  try {
    await client.connect()
    await client.db('admin').command({ ping: 1 })
    return true
  } catch {
    return false
  } finally {
    await client.close().catch(() => {})
  }
}

async function startLocalMongo() {
  const direct = `mongodb://127.0.0.1:${PORT}/?directConnection=true`
  if (await reachable(direct)) {
    console.log(`[dev] Using the MongoDB already running on 127.0.0.1:${PORT}.`)
  } else {
    const { MongoBinary } = await import('mongodb-memory-server-core')
    console.log('[dev] Preparing MongoDB (the first run downloads it once, about 100 MB)…')
    const binary = await MongoBinary.getPath()
    const dbPath = path.join(root, 'data', 'mongo')
    mkdirSync(dbPath, { recursive: true })
    console.log(`[dev] Starting a local MongoDB on 127.0.0.1:${PORT} (data in ${path.relative(process.cwd(), dbPath) || dbPath})…`)
    const mongod = spawn(binary, ['--replSet', REPLICA_SET, '--bind_ip', '127.0.0.1', '--port', String(PORT), '--dbpath', dbPath, '--quiet'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    children.push(mongod)
    mongod.on('exit', (code) => {
      if (code) {
        console.error(`[dev] MongoDB stopped (exit ${code}). Is port ${PORT} free? Set LOCAL_MONGO_PORT to use another.`)
        stopAll(1)
      }
    })
    for (let i = 0; i < 60 && !(await reachable(direct)); i++) await sleep(500)
  }

  // A fresh data folder needs its replica set started once; later runs remember it.
  const { MongoClient } = await import('mongodb')
  const admin = new MongoClient(direct)
  await admin.connect()
  try {
    await admin.db('admin').command({ replSetInitiate: { _id: REPLICA_SET, members: [{ _id: 0, host: `127.0.0.1:${PORT}` }] } })
  } catch (error) {
    if (error?.codeName !== 'AlreadyInitialized') throw error
  }
  for (let i = 0; i < 60; i++) {
    const hello = await admin.db('admin').command({ hello: 1 })
    if (hello.isWritablePrimary) break
    await sleep(500)
  }
  await admin.close()
  return `mongodb://127.0.0.1:${PORT}/cms?replicaSet=${REPLICA_SET}`
}

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = await startLocalMongo()
}

/* Node runs Next's own CLI directly (no npx in between), so stopping this script stops Next too. */
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next')
const next = spawn(process.execPath, [nextBin, 'dev', '--port', process.env.PORT || '3000'], { cwd: root, stdio: 'inherit', env: process.env })
children.push(next)
next.on('exit', (code) => stopAll(code ?? 0))
