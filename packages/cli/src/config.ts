import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ConfigError, validateConfig, type LintConfigInput } from '@portfolio-lint/core'

export { ConfigError, validateConfig }

export const CONFIG_FILENAME = '.portfoliolintrc.json'

/**
 * Load a partial config. Explicit path must exist; the default file is optional.
 */
export function loadConfigFile(path: string | undefined, cwd: string = process.cwd()): LintConfigInput {
  const explicit = path !== undefined
  const file = resolve(cwd, path ?? CONFIG_FILENAME)
  if (!existsSync(file)) {
    if (explicit) throw new ConfigError(`Config file not found: ${file}`)
    return {}
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new ConfigError(`Config file is not valid JSON: ${file} (${(e as Error).message})`)
  }
  return validateConfig(raw, file)
}
