import type { Report } from '@portfolio-lint/core'

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2) + '\n'
}
