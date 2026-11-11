import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * Database drivers may only be imported inside the data layer (lib/db). Everything
 * else goes through lib/db's interfaces, which keeps client content behind the
 * workspace fence. The adapter tests and the migrate/dev scripts are the only exceptions.
 */
const DRIVERS = ['mongodb', '@/lib/db/mongo', '@/lib/db/mongo/*']

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'data/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    ignores: ['lib/db/**', 'scripts/**', 'tests/unit/mongo-fence.test.ts', 'tests/unit/misc.test.ts', 'tests/unit/global-setup.ts', 'tests/e2e/server.mjs'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: DRIVERS, message: 'Database code lives in lib/db. Use sys() or inWorkspace() from @/lib/db instead.' }],
        },
      ],
    },
  },
]

export default config
