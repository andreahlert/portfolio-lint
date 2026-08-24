#!/usr/bin/env node
import { Command } from 'commander'
import { runScan } from './commands/scan.js'
import { renderRulesMarkdown, renderRulesTable } from './commands/rules.js'

const program = new Command()

program
  .name('portfolio-lint')
  .description('Score how ready a project portfolio is for AI forecasting. Reference implementation of the Portfolio AI-Readiness Framework.')
  .version('0.1.0')

program
  .command('scan')
  .description('Scan a portfolio from Jira or CSV and print a readiness report')
  .option('-s, --source <source>', 'jira or csv (defaults to csv when --file is given)')
  .option('-f, --file <path>', 'CSV file (see docs/csv-format.md)')
  .option('--url <url>', 'Jira site URL, e.g. https://acme.atlassian.net (env JIRA_URL)')
  .option('--email <email>', 'Atlassian account email (env JIRA_EMAIL)')
  .option('--token <token>', 'Atlassian API token (env JIRA_TOKEN)')
  .option('-p, --projects <keys>', 'Comma-separated Jira project keys (env JIRA_PROJECTS)')
  .option('--format <format>', 'table, md or json', 'table')
  .option('-o, --out <path>', 'Write the report to a file instead of stdout')
  .option('-c, --config <path>', 'Config file (default .portfoliolintrc.json if present)')
  .option('--fail-under <score>', 'Exit 1 when the portfolio score is below this value', parseFloat)
  .option('--now <iso>', 'Freeze "now" for reproducible runs, e.g. 2026-08-24T00:00:00Z')
  .option('--name <name>', 'Portfolio name shown in the report')
  .action(async (opts) => {
    const { code } = await runScan(opts, {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    })
    process.exitCode = code
  })

program
  .command('rules')
  .description('List the rules with their dimension, weight and affected forecasts')
  .option('--format <format>', 'table or md', 'table')
  .action((opts: { format: string }) => {
    if (opts.format === 'md') process.stdout.write(renderRulesMarkdown())
    else if (opts.format === 'table') process.stdout.write(renderRulesTable())
    else {
      process.stderr.write(`error: --format must be table or md, got "${opts.format}"\n`)
      process.exitCode = 2
    }
  })

program.parseAsync(process.argv).catch((e: unknown) => {
  process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exitCode = 2
})
