// `npm run test:e2e`, on any OS: builds both apps, then runs the browser tests.
//
// The example site is built with its CMS deliberately unreachable, so every
// page renders on request against the throwaway test CMS instead of carrying
// content prebuilt from whatever CMS .env.local points at.
import { execSync } from 'node:child_process'

const run = (command, env = {}) => execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } })

run('npm run build -w @cms/app')
run('npm run build -w acme-site', { CMS_URL: 'http://127.0.0.1:9', CMS_SITE_KEY: 'cms_offline000_build' })
run('npm run test:e2e -w @cms/app')
