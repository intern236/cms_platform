// Starts the built CMS for the end-to-end tests: production mode, a fresh
// throwaway database, no SMTP (emails land in the outbox), fixed secrets.
//
// The database (migrated the way `npm start` does):
//   default                      a throwaway MongoDB replica set, started here
//   E2E_DATABASE_URL=mongodb://… an existing, empty database
import { spawn } from 'node:child_process'

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: '3300',
  CMS_URL: 'http://localhost:3300',
  CMS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
  CMS_SETUP_TOKEN: 'e2e-setup-token',
  CMS_SHOW_OUTBOX: 'true',
  CMS_ALLOW_PRIVATE_WEBHOOKS: 'true',
  AGENCY_NAME: 'Test Agency',
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: '',
}
delete env.SMTP_HOST

let replSet = null
const wanted = process.env.E2E_DATABASE_URL?.trim()
if (wanted) {
  env.DATABASE_URL = wanted
} else {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server-core')
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  const url = new URL(replSet.getUri())
  url.pathname = '/cms_e2e'
  env.DATABASE_URL = url.toString()
}

const child = spawn('node scripts/migrate.mjs && npx next start --port 3300', { env, stdio: 'inherit', shell: true })
// Playwright stops this whole process group when the run ends.
const stop = async () => {
  child.kill('SIGTERM')
  await replSet?.stop()
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
child.on('exit', async (code) => {
  await replSet?.stop()
  process.exit(code ?? 0)
})
