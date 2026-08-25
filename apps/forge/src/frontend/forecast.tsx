import React from 'react'
import { Badge, Box, Button, Code, DynamicTable, Heading, Icon, Inline, Lozenge, SectionMessage, Stack, Text, xcss } from '@forge/react'
import { Card, fmt, IssueChip, openIssues, openProjectPage, Panel, RuleCode, type RuleMap, type Tone } from './shared'

export interface FinishEstimate {
  weeks: number
  date: string
}

export interface FinishRange {
  p50: FinishEstimate
  p85: FinishEstimate
  p95: FinishEstimate
}

export interface PathItem {
  key: string
  projectKey: string
  title: string
  estimate?: number
  issues: string[]
}

export interface ProjectForecastRow {
  key: string
  name: string
  status: 'ok' | 'no-open-work' | 'no-history'
  throughput: { unit: string; perWeek: number[]; mean: number; activeWeeks: number } | null
  remaining: { unit: string; openItems: number; estimatedItems: number; unestimatedItems: number; knownWork: number; typicalEstimate: number | null }
  finish: FinishRange | null
  finishIfEstimated: FinishRange | null
  scopeUncertaintyWeeks: number | null
  commitment: { dueDate: string; p85SlipWeeks: number; verdict: 'on-track' | 'at-risk' | 'late' } | null
  criticalPath: { items: PathItem[]; estimate: number; unestimated: number; crossProject: boolean; cycles: string[][] }
  confidence: { level: 'high' | 'medium' | 'low' | 'none'; reasons: string[] }
  leverage: PathItem[]
}

export interface ForecastReportRow {
  historyWeeks: number
  simulations: number
  seed: number
  projects: ProjectForecastRow[]
  programme: { p85: FinishEstimate | null; drivenBy: string | null }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const confidenceAppearance = (level: ProjectForecastRow['confidence']['level']) =>
  level === 'high' ? 'success' : level === 'medium' ? 'moved' : level === 'low' ? 'removed' : 'default'

export const verdictAppearance = (v: 'on-track' | 'at-risk' | 'late') => (v === 'on-track' ? 'success' : v === 'at-risk' ? 'moved' : 'removed')

const verdictTone = (v: 'on-track' | 'at-risk' | 'late' | undefined): Tone | undefined => (v === 'on-track' ? 'success' : v === 'at-risk' ? 'warning' : v === 'late' ? 'danger' : undefined)

export function statusNote(p: ProjectForecastRow): string | null {
  if (p.status === 'no-open-work') return 'Nothing open, so there is nothing to forecast.'
  if (p.status === 'no-history') return 'No completed items with a resolution date in the history window, so throughput is unknown. Resolve work in Jira (not by deleting it) and the forecast appears.'
  return null
}

function slipText(p: ProjectForecastRow): string {
  if (!p.commitment) return 'no open epic with a due date'
  const w = p.commitment.p85SlipWeeks
  if (w <= 0) return `p85 lands ${plural(Math.abs(w), 'week')} before the ${p.commitment.dueDate} commitment`
  return `p85 lands ${plural(w, 'week')} after the ${p.commitment.dueDate} commitment`
}

export function ProgrammeBanner({ forecast }: { forecast: ForecastReportRow }) {
  if (!forecast.programme.p85) {
    return (
      <SectionMessage appearance="information" title="No delivery forecast yet">
        <Text>No project has both open work and completed work in the last {forecast.historyWeeks} weeks, so throughput cannot be measured.</Text>
      </SectionMessage>
    )
  }
  const driver = forecast.projects.find((p) => p.key === forecast.programme.drivenBy)
  return (
    <SectionMessage appearance="discovery" title={`Programme finish (p85): ${forecast.programme.p85.date}, ${plural(forecast.programme.p85.weeks, 'week')} out`}>
      <Text>
        {`Latest p85 across projects, driven by ${forecast.programme.drivenBy}${driver && driver.scopeUncertaintyWeeks ? `. ${plural(driver.scopeUncertaintyWeeks, 'week')} of that is uncertainty from ${driver.remaining.unestimatedItems} unestimated items in ${driver.key}: estimate them and the date moves to ${driver.finishIfEstimated?.p85.date}` : ''}. Monte Carlo on ${forecast.historyWeeks} weeks of throughput, ${forecast.simulations} runs per project.`}
      </Text>
    </SectionMessage>
  )
}

function finishCell(p: ProjectForecastRow, which: keyof FinishRange) {
  if (!p.finish) return <Text color="color.text.subtle">n/a</Text>
  const f = p.finish[which]
  return (
    <Stack space="space.0">
      <Text weight="medium">{f.date}</Text>
      <Text size="small" color="color.text.subtle">{plural(f.weeks, 'week')}</Text>
    </Stack>
  )
}

export function DeliveryForecastTable({ projects }: { projects: ProjectForecastRow[] }) {
  return (
    <DynamicTable
      head={{
        cells: [
          { key: 'key', content: 'Project', isSortable: true },
          { key: 'open', content: 'Open', isSortable: true },
          { key: 'unest', content: 'Unestimated', isSortable: true },
          { key: 'tp', content: 'Throughput / week' },
          { key: 'p50', content: 'p50' },
          { key: 'p85', content: 'p85' },
          { key: 'commit', content: 'Commitment' },
          { key: 'conf', content: 'Confidence' },
          { key: 'go', content: '' },
        ],
      }}
      rows={[...projects]
        .sort((a, b) => (b.finish?.p85.weeks ?? -1) - (a.finish?.p85.weeks ?? -1))
        .map((p) => ({
          key: p.key,
          cells: [
            {
              key: 'key',
              content: (
                <Stack space="space.0" alignInline="start">
                  <Button appearance="subtle" spacing="none" onClick={() => openProjectPage(p.key)}>
                    {p.key}
                  </Button>
                  <Text size="small" color="color.text.subtle">{p.name}</Text>
                </Stack>
              ),
            },
            { key: 'open', content: String(p.remaining.openItems) },
            { key: 'unest', content: <Badge appearance={p.remaining.unestimatedItems > 0 ? 'important' : 'default'}>{p.remaining.unestimatedItems}</Badge> },
            { key: 'tp', content: p.throughput ? `${fmt(p.throughput.mean)} ${p.throughput.unit}` : <Text color="color.text.subtle">unknown</Text> },
            { key: 'p50', content: finishCell(p, 'p50') },
            { key: 'p85', content: finishCell(p, 'p85') },
            {
              key: 'commit',
              content: p.commitment ? (
                <Stack space="space.050" alignInline="start">
                  <Lozenge appearance={verdictAppearance(p.commitment.verdict)} isBold>{p.commitment.verdict}</Lozenge>
                  <Text size="small" color="color.text.subtle">{`${p.commitment.dueDate} (${p.commitment.p85SlipWeeks > 0 ? '+' : ''}${fmt(p.commitment.p85SlipWeeks)}w)`}</Text>
                </Stack>
              ) : (
                <Text color="color.text.subtle">none</Text>
              ),
            },
            { key: 'conf', content: <Lozenge appearance={confidenceAppearance(p.confidence.level)}>{p.confidence.level}</Lozenge> },
            {
              key: 'go',
              content: (
                <Button appearance="subtle" iconAfter="chevron-right" onClick={() => openProjectPage(p.key)}>
                  Details
                </Button>
              ),
            },
          ],
        }))}
    />
  )
}

const chainStyle = xcss({ paddingBlock: 'space.050' })

function PathChain({ items }: { items: PathItem[] }) {
  return (
    <Inline space="space.075" alignBlock="center" shouldWrap>
      {items.map((i, idx) => (
        <Inline key={`${idx}-${i.key}`} space="space.075" alignBlock="center">
          {idx > 0 ? <Icon glyph="arrow-right" label="then" size="small" /> : null}
          <Box xcss={chainStyle}>
            <Stack space="space.0" alignInline="start">
              <IssueChip issueKey={i.key} />
              <Text size="small" color="color.text.subtle">{i.estimate !== undefined ? `${i.estimate} pts` : 'no estimate'}</Text>
            </Stack>
          </Box>
        </Inline>
      ))}
    </Inline>
  )
}

function DateCard({ title, finish, hint, tone }: { title: string; finish: FinishEstimate | null; hint: string; tone?: Tone }) {
  return (
    <Card tone={tone}>
      <Stack space="space.100">
        <Text size="small" weight="semibold" color="color.text.subtle">{title}</Text>
        <Heading as="div" size="large">{finish ? finish.date : 'n/a'}</Heading>
        <Text size="small" color="color.text.subtle">{finish ? `${plural(finish.weeks, 'week')} from the scan. ${hint}` : hint}</Text>
      </Stack>
    </Card>
  )
}

export function ProjectForecastPanel({ forecast, historyWeeks, rules }: { forecast: ProjectForecastRow; historyWeeks: number; rules?: RuleMap }) {
  const note = statusNote(forecast)
  if (note) {
    return (
      <SectionMessage appearance="information" title="No delivery forecast for this project">
        <Text>{note}</Text>
      </SectionMessage>
    )
  }
  const p = forecast
  const leverageKeys = p.leverage.map((i) => i.key)
  return (
    <Stack space="space.300">
      <Inline space="space.200" shouldWrap alignBlock="stretch">
        <DateCard title="Likely (p50)" finish={p.finish?.p50 ?? null} hint="Half of the simulations finish by here." />
        <DateCard title="Commit (p85)" finish={p.finish?.p85 ?? null} hint="85% of simulations finish by here. Promise this one." tone={verdictTone(p.commitment?.verdict)} />
        <DateCard title="Worst case (p95)" finish={p.finish?.p95 ?? null} hint="Only 1 in 20 runs is later." />
        <Card>
          <Stack space="space.100">
            <Text size="small" weight="semibold" color="color.text.subtle">Confidence</Text>
            <Inline space="space.100" alignBlock="center">
              <Lozenge appearance={confidenceAppearance(p.confidence.level)} isBold>{p.confidence.level}</Lozenge>
              {p.commitment ? <Lozenge appearance={verdictAppearance(p.commitment.verdict)}>{p.commitment.verdict}</Lozenge> : null}
            </Inline>
            <Text size="small" color="color.text.subtle">{slipText(p)}</Text>
          </Stack>
        </Card>
      </Inline>

      {p.scopeUncertaintyWeeks !== null && p.scopeUncertaintyWeeks > 0 && p.finishIfEstimated ? (
        <SectionMessage appearance="warning" title={`Estimate ${plural(p.remaining.unestimatedItems, 'item')} and the p85 moves ${plural(p.scopeUncertaintyWeeks, 'week')} earlier`}>
          <Text>
            {`With every open item sized at the project's typical ${p.remaining.typicalEstimate ?? 0} ${p.remaining.unit}, the p85 goes from ${p.finish?.p85.date} to ${p.finishIfEstimated.p85.date}. That gap is pure data uncertainty, not delivery risk.`}
          </Text>
        </SectionMessage>
      ) : null}

      <Panel title="What limits this forecast">
        {p.confidence.reasons.length === 0 ? (
          <Text color="color.text.subtle">Nothing in the data limits this forecast. The dates above are as good as the throughput history.</Text>
        ) : (
          <Stack space="space.075">
            {p.confidence.reasons.map((r, i) => (
              <Inline key={`${i}-${r.slice(0, 12)}`} space="space.100" alignBlock="start">
                <Icon glyph="status-warning" label="limit" size="small" color="color.icon.warning" />
                <Text>{r}</Text>
              </Inline>
            ))}
          </Stack>
        )}
        <Text size="small" color="color.text.subtle">
          {`${p.remaining.openItems} open items, ${p.remaining.knownWork} ${p.remaining.unit} already sized. Throughput ${fmt(p.throughput?.mean)} ${p.remaining.unit} per week over ${p.throughput?.activeWeeks ?? 0} active weeks of the last ${historyWeeks}.`}
        </Text>
      </Panel>

      <Panel title={`Critical path (${plural(p.criticalPath.items.length, 'item')}, ${p.criticalPath.estimate} ${p.remaining.unit})`}>
        {p.criticalPath.items.length === 0 ? (
          <Text color="color.text.subtle">No open dependency chain.</Text>
        ) : (
          <Stack space="space.150">
            <PathChain items={p.criticalPath.items} />
            <Inline space="space.100" shouldWrap>
              {p.criticalPath.unestimated > 0 ? <Lozenge appearance="removed">{`${plural(p.criticalPath.unestimated, 'item')} unestimated`}</Lozenge> : null}
              {p.criticalPath.crossProject ? <Lozenge appearance="new">crosses projects</Lozenge> : null}
              {p.criticalPath.items.length === 1 ? <Lozenge appearance="default">heaviest single item, no chain longer than it</Lozenge> : null}
            </Inline>
            {p.criticalPath.cycles.map((c) => (
              <SectionMessage key={c.join('|')} appearance="error" title="Dependency cycle">
                <Text>{`${[...c, c[0]].join(' -> ')}. Nothing downstream of this can be scheduled until one link is removed.`}</Text>
              </SectionMessage>
            ))}
          </Stack>
        )}
      </Panel>

      <Panel title="Fix these first to tighten the forecast">
        {p.leverage.length === 0 ? (
          <Text color="color.text.subtle">No data problems on the critical path or in-progress work.</Text>
        ) : (
          <Stack space="space.150">
            <Text color="color.text.subtle">Items on the critical path, then in-progress items, ranked by how much their missing data distorts the dates.</Text>
            <DynamicTable
              head={{
                cells: [
                  { key: 'item', content: 'Item' },
                  { key: 'title', content: 'Title' },
                  { key: 'issues', content: 'Problems' },
                ],
              }}
              rows={p.leverage.map((i, idx) => ({
                key: `${idx}-${i.key}`,
                cells: [
                  { key: 'item', content: <IssueChip issueKey={i.key} /> },
                  { key: 'title', content: i.title },
                  {
                    key: 'issues',
                    content: (
                      <Inline space="space.075" shouldWrap>
                        {i.issues.map((id) => (rules ? <RuleCode key={id} ruleId={id} rules={rules} /> : <Code key={id}>{id}</Code>))}
                      </Inline>
                    ),
                  },
                ],
              }))}
            />
            <Inline>
              <Button appearance="default" iconAfter="shortcut" onClick={() => openIssues(leverageKeys)}>
                {`Open ${plural(leverageKeys.length, 'item')} in Jira`}
              </Button>
            </Inline>
          </Stack>
        )}
      </Panel>
    </Stack>
  )
}
