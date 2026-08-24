// Validates manifest.yml offline with @forge/manifest (no Atlassian login needed).
import { validate } from '@forge/manifest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const manifest = resolve(dirname(fileURLToPath(import.meta.url)), 'manifest.yml')
const result = await validate(false, manifest)
for (const w of result.warnings ?? []) console.warn('warning:', w.message)
if (!result.success) {
  for (const e of result.errors ?? []) console.error('error:', e.message, e.reference ?? '')
  process.exit(1)
}
console.log('manifest.yml is valid')
