import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { ScanIO } from '../src/commands/scan.js'

export const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(here, '../../..')
export const SAMPLE = resolve(ROOT, 'examples/sample-portfolio.csv')
export const NOW = '2026-08-24T00:00:00Z'

export function captureIO(extra: Partial<ScanIO> = {}) {
  const out: string[] = []
  const err: string[] = []
  const io: ScanIO = { stdout: (s) => out.push(s), stderr: (s) => err.push(s), env: {}, cwd: ROOT, ...extra }
  return { io, stdout: () => out.join(''), stderr: () => err.join('') }
}
