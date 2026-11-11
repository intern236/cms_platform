import { inject, vi } from 'vitest'
import { nextCache, nextHeaders, nextNavigation } from './next-mocks'

process.env.CMS_SECRET = 'unit-test-secret-unit-test-secret-unit-test-secret'
process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'demo-cloud'
process.env.CMS_URL = 'https://cms.test'
delete process.env.SMTP_HOST
delete process.env.DATABASE_URL

/* Each test file gets its own fresh database (see ./global-setup.ts). */
const dbName = `cms_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const url = new URL(inject('mongoUrl'))
url.pathname = `/${dbName}`
process.env.DATABASE_URL = url.toString()

vi.mock('next/headers', () => nextHeaders)
vi.mock('next/navigation', () => nextNavigation)
vi.mock('next/cache', () => nextCache)
