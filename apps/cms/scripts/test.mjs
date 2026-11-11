// `npm test` runs the unit suite on MongoDB. Pass extra vitest arguments after `--`.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const [...rest] = process.argv.slice(2).filter((arg) => arg !== 'mongo')
const pkg = createRequire(import.meta.url).resolve('vitest/package.json')
const vitest = path.join(path.dirname(pkg), 'vitest.mjs')
const child = spawn(process.execPath, [vitest, 'run', ...rest], { stdio: 'inherit', env: { ...process.env, TEST_DB: 'mongo' } })
child.on('exit', (code) => process.exit(code ?? 1))
