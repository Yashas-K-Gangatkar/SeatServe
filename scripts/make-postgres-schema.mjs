// Phase 4 — PostgreSQL schema generator.
// Reads prisma/schema.prisma and emits prisma/schema.postgres.prisma with the
// provider swapped to "postgresql". Everything else is byte-identical, so the
// production schema can NEVER drift from the sandbox schema. Run:
//   node scripts/make-postgres-schema.mjs
// then: DATABASE_URL=postgres://… bunx prisma db push --schema prisma/schema.postgres.prisma
import { readFileSync, writeFileSync } from 'node:fs'
const src = readFileSync('prisma/schema.prisma', 'utf8')
if (!src.includes('provider = "sqlite"')) throw new Error('expected sqlite provider in schema.prisma')
const out = src.replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace('// `scripts/make-postgres-schema.mjs`', '// THIS FILE IS GENERATED — edit prisma/schema.prisma and re-run the generator.')
writeFileSync('prisma/schema.postgres.prisma', out)
console.log('wrote prisma/schema.postgres.prisma (postgresql provider)')
