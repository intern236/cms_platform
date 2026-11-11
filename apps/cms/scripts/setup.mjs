// First-time setup for local development: writes apps/cms/.env.local with a
// fresh secret. Never overwrites an existing file.
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, '.env.local')

if (existsSync(file)) {
  console.log(`[setup] ${path.relative(process.cwd(), file)} already exists — left as it is.`)
} else {
  const secret = randomBytes(32).toString('base64url')
  writeFileSync(
    file,
    `# Local development settings. Not committed. See .env.example for every option.
CMS_URL=http://localhost:3000
CMS_SECRET=${secret}
AGENCY_NAME=My Agency
# No DATABASE_URL: "npm run dev" starts a local MongoDB (data in data/mongo).
# To use your own instead (Atlas, or a local replica set):
# DATABASE_URL=mongodb+srv://user:password@cluster.example.mongodb.net/cms
# No SMTP_HOST: emails are shown in Agency → Outbox instead of being sent.
`,
    { mode: 0o600 }
  )
  console.log(`[setup] Wrote ${path.relative(process.cwd(), file)} with a new CMS_SECRET.`)
}
console.log('[setup] Next: npm run dev, then open http://localhost:3000 to create the first agency account.')
