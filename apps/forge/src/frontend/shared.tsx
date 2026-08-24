import React, { useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Code,
  DynamicTable,
  Heading,
  Icon,
  Inline,
  Link,
  Lozenge,
  Pressable,
  ProgressBar,
  SectionMessage,
  Select,
  SectionMessageAction,
  Stack,
  Text,
  Tooltip,
  xcss,
} from '@forge/react'
import { NavigationTarget, router } from '@forge/bridge'

export type ForecastLabel = 'reliable' | 'degraded' | 'unreliable'

export interface ForecastCell {
  score: number
  label: ForecastLabel
  limitedBy?: string
}

export interface ForecastSet {
  schedule: ForecastCell
  capacity: ForecastCell
  scope: ForecastCell
}

export interface RemediationRow {
  ruleId: string
  violations: number
  remediation: string
  forecastImpact: string
  examples: string[]
}

export interface ViolationRow {
  ruleId: string
  projectKey: string
  itemKey?: string
  message: string
}

export interface RuleMeta {
  id: string
  dimension: string
  weight: number
  forecasts: string[]
  description: string
  forecastImpact: string
  remediation: string
}

export type RuleMap = Record<string, RuleMeta>

export const toRuleMap = (rules: RuleMeta[]): RuleMap => Object.fromEntries(rules.map((r) => [r.id, r]))

export const RULES_DOC_URL = 'https://github.com/andreahlert/portfolio-lint/blob/main/docs/rules.md'

export type Tone = 'success' | 'warning' | 'danger'

export const PROJECT_MODULE_KEY = 'portfolio-lint-project'

export const fmt = (n: number | null | undefined): string => (n == null ? 'n/a' : n.toFixed(1))

export const toneOf = (score: number | null | undefined): Tone =>
  score == null ? 'warning' : score >= 75 ? 'success' : score >= 50 ? 'warning' : 'danger'

export const labelAppearance = (label: ForecastLabel) =>
  label === 'reliable' ? 'success' : label === 'degraded' ? 'moved' : 'removed'

export const gradeAppearance = (grade: string) =>
  grade === 'A' ? 'success' : grade === 'B' ? 'inprogress' : grade === 'C' ? 'moved' : 'removed'

export const formatDate = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 16).replace('T', ' ') + ' UTC' : 'never'

/** "2 hours ago" style label. Falls back to the date for anything older than a month. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'never'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} days ago`
  return iso.slice(0, 10)
}

export function absoluteTime(iso: string, locale?: string): string {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return formatDate(iso)
  }
}

export function ScanTime({ iso, locale }: { iso: string | null | undefined; locale?: string }) {
  if (!iso) return <Text color="color.text.subtle">never</Text>
  return (
    <Tooltip content={absoluteTime(iso, locale)} position="bottom">
      <Text color="color.text.subtle" weight="medium">{relativeTime(iso)}</Text>
    </Tooltip>
  )
}

const issueKeyRe = /^[A-Z][A-Z0-9_]*-\d+$/
export const isIssueKey = (s: string): boolean => issueKeyRe.test(s)

/** Max keys in one `key in (...)` JQL. Keeps the URL well under browser limits. */
const JQL_KEY_CAP = 200

export const jqlKeysUrl = (keys: string[]): string =>
  `/issues/?jql=${encodeURIComponent(`key in (${keys.slice(0, JQL_KEY_CAP).join(',')}) ORDER BY key ASC`)}`

export const openIssues = (keys: string[]) => router.navigate(jqlKeysUrl(keys))

export const openProjectPage = (projectKey: string) =>
  router.navigate({ target: NavigationTarget.Module, moduleKey: PROJECT_MODULE_KEY, projectKey })

export const openIssue = (issueKey: string) => router.navigate({ target: NavigationTarget.Issue, issueKey })

const chipStyle = xcss({
  backgroundColor: 'color.background.neutral',
  borderRadius: 'radius.small',
  paddingInline: 'space.075',
  paddingBlock: 'space.025',
})

const linkStyle = xcss({ backgroundColor: 'color.background.neutral.subtle', padding: 'space.0' })

/** Issue key rendered as a tag-like chip. Navigates in-app (no full page load). */
export function IssueChip({ issueKey }: { issueKey: string }) {
  return (
    <Pressable xcss={chipStyle} onClick={() => openIssue(issueKey)}>
      <Text size="small" weight="medium">{issueKey}</Text>
    </Pressable>
  )
}

/** Issue key rendered as a plain link. Navigates in-app. */
export function IssueLink({ issueKey }: { issueKey: string }) {
  return (
    <Pressable xcss={linkStyle} onClick={() => openIssue(issueKey)}>
      <Text weight="semibold" color="color.text.brand">{issueKey}</Text>
    </Pressable>
  )
}

/** Unique issue keys failing a given rule, in first-seen order. */
export function keysForRule(violations: ViolationRow[], ruleId: string): string[] {
  const seen = new Set<string>()
  for (const v of violations) {
    if (v.ruleId === ruleId && v.itemKey && !seen.has(v.itemKey)) seen.add(v.itemKey)
  }
  return [...seen]
}

/** Rule id with a tooltip explaining what the rule checks. */
export function RuleCode({ ruleId, rules }: { ruleId: string; rules?: RuleMap }) {
  const meta = rules?.[ruleId]
  if (!meta) return <Code>{ruleId}</Code>
  return (
    <Tooltip content={`${meta.description} Dimension: ${meta.dimension}, weight ${meta.weight}.`} position="bottom">
      <Code>{ruleId}</Code>
    </Tooltip>
  )
}

export function RuleDocLink({ ruleId }: { ruleId: string }) {
  return (
    <Link href={`${RULES_DOC_URL}#${ruleId}`} openNewTab>
      Docs
    </Link>
  )
}

const toneIcon = {
  success: { glyph: 'status-success', color: 'color.icon.success' },
  warning: { glyph: 'status-warning', color: 'color.icon.warning' },
  danger: { glyph: 'status-error', color: 'color.icon.danger' },
} as const

const cardStyle = xcss({
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
  borderRadius: 'radius.medium',
  padding: 'space.200',
  flexGrow: 1,
  minWidth: '200px',
})

const toneCardStyle: Record<Tone, ReturnType<typeof xcss>> = {
  success: xcss({
    backgroundColor: 'color.background.success',
    borderRadius: 'radius.medium',
    padding: 'space.200',
    flexGrow: 1,
    minWidth: '200px',
  }),
  warning: xcss({
    backgroundColor: 'color.background.warning',
    borderRadius: 'radius.medium',
    padding: 'space.200',
    flexGrow: 1,
    minWidth: '200px',
  }),
  danger: xcss({
    backgroundColor: 'color.background.danger',
    borderRadius: 'radius.medium',
    padding: 'space.200',
    flexGrow: 1,
    minWidth: '200px',
  }),
}

const panelStyle = xcss({
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
  borderRadius: 'radius.medium',
  padding: 'space.250',
})

const tabBodyStyle = xcss({ paddingBlockStart: 'space.200', width: '100%' })

const barStyle = xcss({ minWidth: '120px', width: '100%' })

export function Card({ tone, children }: { tone?: Tone; children: React.ReactNode }) {
  return <Box xcss={tone ? toneCardStyle[tone] : cardStyle}>{children}</Box>
}

export function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Box xcss={panelStyle}>
      <Stack space="space.200">
        {title ? <Heading as="h3" size="small">{title}</Heading> : null}
        {children}
      </Stack>
    </Box>
  )
}

export function TabBody({ children }: { children: React.ReactNode }) {
  return <Box xcss={tabBodyStyle}>{children}</Box>
}

export function ScoreBar({ score }: { score: number | null }) {
  const v = score == null ? 0 : Math.max(0, Math.min(1, score / 100))
  return (
    <Box xcss={barStyle}>
      <ProgressBar value={v} appearance={score != null && score >= 75 ? 'success' : 'default'} ariaLabel={`Score ${fmt(score)}`} />
    </Box>
  )
}

export function ScoreCard({ score, grade, subtitle, title = 'Portfolio score' }: { score: number; grade: string; subtitle: string; title?: string }) {
  const tone = toneOf(score)
  return (
    <Card tone={tone}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Icon glyph="scorecard" label="score" size="small" />
          <Text size="small" weight="semibold" color="color.text.subtle">{title}</Text>
        </Inline>
        <Inline space="space.150" alignBlock="baseline">
          <Heading as="div" size="xxlarge">{fmt(score)}</Heading>
          <Lozenge appearance={gradeAppearance(grade)} isBold>{`Grade ${grade}`}</Lozenge>
        </Inline>
        <ScoreBar score={score} />
        <Text size="small" color="color.text.subtle">{subtitle}</Text>
      </Stack>
    </Card>
  )
}

const forecastMeta: Record<keyof ForecastSet, { title: string; hint: string }> = {
  schedule: { title: 'Schedule forecast', hint: 'Can an AI predict delivery dates?' },
  capacity: { title: 'Capacity forecast', hint: 'Can it reason about team load?' },
  scope: { title: 'Scope forecast', hint: 'Can it size what is left?' },
}

export function ForecastCard({ kind, cell }: { kind: keyof ForecastSet; cell: ForecastCell }) {
  const tone: Tone = cell.label === 'reliable' ? 'success' : cell.label === 'degraded' ? 'warning' : 'danger'
  const icon = toneIcon[tone]
  return (
    <Card tone={tone}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Icon glyph={icon.glyph} label={cell.label} size="small" color={icon.color} />
          <Text size="small" weight="semibold" color="color.text.subtle">{forecastMeta[kind].title}</Text>
        </Inline>
        <Inline space="space.150" alignBlock="baseline">
          <Heading as="div" size="xlarge">{fmt(cell.score)}</Heading>
          <Lozenge appearance={labelAppearance(cell.label)} isBold>{cell.label}</Lozenge>
        </Inline>
        <ScoreBar score={cell.score} />
        {cell.limitedBy ? (
          <Inline space="space.050" alignBlock="center">
            <Text size="small" color="color.text.subtle">Limited by</Text>
            <Code>{cell.limitedBy}</Code>
          </Inline>
        ) : (
          <Text size="small" color="color.text.subtle">{forecastMeta[kind].hint}</Text>
        )}
      </Stack>
    </Card>
  )
}

export function ScoreCards({ score, grade, forecasts, subtitle, title }: { score: number; grade: string; forecasts: ForecastSet; subtitle: string; title?: string }) {
  return (
    <Inline space="space.200" shouldWrap alignBlock="stretch">
      <ScoreCard score={score} grade={grade} subtitle={subtitle} title={title} />
      <ForecastCard kind="schedule" cell={forecasts.schedule} />
      <ForecastCard kind="capacity" cell={forecasts.capacity} />
      <ForecastCard kind="scope" cell={forecasts.scope} />
    </Inline>
  )
}

const dimensionOrder = ['completeness', 'freshness', 'consistency', 'traceability']
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function DimensionBars({ dimensions }: { dimensions: Record<string, number> }) {
  const keys = [...dimensionOrder.filter((k) => k in dimensions), ...Object.keys(dimensions).filter((k) => !dimensionOrder.includes(k))]
  return (
    <Panel title="Dimensions">
      <Inline space="space.300" shouldWrap>
        {keys.map((k) => (
          <Box key={k} xcss={cardStyle}>
            <Stack space="space.100">
              <Inline spread="space-between" alignBlock="center">
                <Text weight="semibold">{capitalize(k)}</Text>
                <Text weight="bold" color={`color.text.${toneOf(dimensions[k])}`}>{fmt(dimensions[k])}</Text>
              </Inline>
              <ScoreBar score={dimensions[k] ?? null} />
            </Stack>
          </Box>
        ))}
      </Inline>
    </Panel>
  )
}

export function ForecastLozenges({ forecasts }: { forecasts: ForecastSet }) {
  return (
    <Inline space="space.100" shouldWrap>
      <Lozenge appearance={labelAppearance(forecasts.schedule.label)}>{`schedule ${forecasts.schedule.label}`}</Lozenge>
      <Lozenge appearance={labelAppearance(forecasts.capacity.label)}>{`capacity ${forecasts.capacity.label}`}</Lozenge>
      <Lozenge appearance={labelAppearance(forecasts.scope.label)}>{`scope ${forecasts.scope.label}`}</Lozenge>
    </Inline>
  )
}

const rowStyle = xcss({
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'radius.medium',
  padding: 'space.200',
})

export function RemediationList({ rows, violations, rules }: { rows: RemediationRow[]; violations: ViolationRow[]; rules?: RuleMap }) {
  if (rows.length === 0) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Icon glyph="status-success" label="clean" color="color.icon.success" />
        <Text>No violations. Every rule passes.</Text>
      </Inline>
    )
  }
  return (
    <Stack space="space.150">
      <Text color="color.text.subtle">Ordered by impact: (100 - score) x weight x items affected. Fix the top of the list first.</Text>
      {rows.map((r, i) => {
        const keys = keysForRule(violations, r.ruleId)
        const keyExamples = r.examples.filter(isIssueKey)
        const textExamples = r.examples.filter((e) => !isIssueKey(e))
        const openLabel = keys.length < r.violations ? `Open first ${keys.length} in Jira` : `Open ${keys.length} in Jira`
        return (
          <Box key={r.ruleId} xcss={rowStyle}>
            <Stack space="space.100">
              <Inline spread="space-between" alignBlock="center" shouldWrap>
                <Inline space="space.150" alignBlock="center" shouldWrap>
                  <Badge appearance={i === 0 ? 'important' : 'primary'}>{i + 1}</Badge>
                  <RuleCode ruleId={r.ruleId} rules={rules} />
                  <Badge appearance="default">{`${r.violations} ${r.violations === 1 ? 'item' : 'items'}`}</Badge>
                  <RuleDocLink ruleId={r.ruleId} />
                </Inline>
                {keys.length > 0 ? (
                  <Button appearance="default" onClick={() => openIssues(keys)} iconAfter="shortcut">
                    {openLabel}
                  </Button>
                ) : null}
              </Inline>
              <Text weight="medium">{r.remediation}</Text>
              <Text size="small" color="color.text.subtle">{`Improves: ${r.forecastImpact}`}</Text>
              {keyExamples.length > 0 ? (
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Text size="small" color="color.text.subtle">Examples:</Text>
                  {keyExamples.map((e) => (
                    <IssueChip key={e} issueKey={e} />
                  ))}
                </Inline>
              ) : null}
              {textExamples.map((e) => (
                <Text key={e} size="small">{e}</Text>
              ))}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}

interface Option {
  label: string
  value: string
}

const filterStyle = xcss({ minWidth: '200px' })

function FilterSelect({ placeholder, options, value, onChange }: { placeholder: string; options: Option[]; value: string | null; onChange: (v: string | null) => void }) {
  const selected = options.find((o) => o.value === value) ?? null
  return (
    <Box xcss={filterStyle}>
      <Select
        placeholder={placeholder}
        options={options}
        value={selected}
        isClearable
        spacing="compact"
        onChange={(opt: unknown) => onChange((opt as Option | null)?.value ?? null)}
      />
    </Box>
  )
}

const capitalizeWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function ViolationsTable({ rows, rules, max = 100 }: { rows: ViolationRow[]; rules?: RuleMap; max?: number }) {
  const [project, setProject] = useState<string | null>(null)
  const [dimension, setDimension] = useState<string | null>(null)
  const [rule, setRule] = useState<string | null>(null)

  if (rows.length === 0) return <Text color="color.text.subtle">No findings.</Text>

  const projects = [...new Set(rows.map((v) => v.projectKey))].sort()
  const ruleIds = [...new Set(rows.map((v) => v.ruleId))].sort()
  const dimensions = rules ? [...new Set(ruleIds.map((id) => rules[id]?.dimension).filter((d): d is string => Boolean(d)))].sort() : []

  const filtered = rows.filter(
    (v) =>
      (project === null || v.projectKey === project) &&
      (rule === null || v.ruleId === rule) &&
      (dimension === null || rules?.[v.ruleId]?.dimension === dimension),
  )
  const shown = filtered.slice(0, max)
  const active = project !== null || dimension !== null || rule !== null
  const clear = () => {
    setProject(null)
    setDimension(null)
    setRule(null)
  }

  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        {projects.length > 1 ? (
          <FilterSelect placeholder="All projects" options={projects.map((p) => ({ label: p, value: p }))} value={project} onChange={setProject} />
        ) : null}
        {dimensions.length > 1 ? (
          <FilterSelect placeholder="All dimensions" options={dimensions.map((d) => ({ label: capitalizeWord(d), value: d }))} value={dimension} onChange={setDimension} />
        ) : null}
        <FilterSelect placeholder="All rules" options={ruleIds.map((r) => ({ label: r, value: r }))} value={rule} onChange={setRule} />
        {active ? (
          <Button appearance="subtle" onClick={clear}>
            Clear
          </Button>
        ) : null}
        <Text color="color.text.subtle">
          {filtered.length > max ? `Showing first ${max} of ${filtered.length} findings.` : active ? `${filtered.length} of ${rows.length} findings.` : `${rows.length} findings.`}
        </Text>
      </Inline>
      {filtered.length === 0 ? (
        <Text color="color.text.subtle">No findings match these filters.</Text>
      ) : (
        <DynamicTable
          rowsPerPage={20}
          head={{
            cells: [
              { key: 'project', content: 'Project', isSortable: true },
              { key: 'item', content: 'Item', isSortable: true },
              { key: 'rule', content: 'Rule', isSortable: true },
              { key: 'message', content: 'What is wrong' },
            ],
          }}
          rows={shown.map((v, i) => ({
            key: `${v.projectKey}-${v.itemKey ?? 'project'}-${v.ruleId}-${i}`,
            cells: [
              { key: 'project', content: v.projectKey },
              { key: 'item', content: v.itemKey ? <IssueLink issueKey={v.itemKey} /> : <Text color="color.text.subtle">(project)</Text> },
              { key: 'rule', content: <RuleCode ruleId={v.ruleId} rules={rules} /> },
              { key: 'message', content: v.message },
            ],
          }))}
        />
      )}
    </Stack>
  )
}

export interface ScanDelta {
  prevScore: number | null
  prevFindings: number | null
  score: number
  findings: number
}

const signed = (n: number, digits = 1) => (n > 0 ? `+${n.toFixed(digits)}` : n.toFixed(digits))

export function ScanSummary({ delta, onDismiss }: { delta: ScanDelta; onDismiss: () => void }) {
  const first = delta.prevScore == null || delta.prevFindings == null
  const dScore = first ? 0 : delta.score - (delta.prevScore as number)
  const dFind = first ? 0 : delta.findings - (delta.prevFindings as number)
  const unchanged = !first && Math.abs(dScore) < 0.05 && dFind === 0
  const appearance = first || unchanged ? 'information' : dScore >= 0 && dFind <= 0 ? 'success' : 'warning'
  const body = first
    ? `Score ${fmt(delta.score)}, ${delta.findings} findings.`
    : unchanged
      ? `Nothing changed since the previous scan: score ${fmt(delta.score)}, ${delta.findings} findings.`
      : `Score ${fmt(delta.prevScore)} to ${fmt(delta.score)} (${signed(dScore)}). Findings ${delta.prevFindings} to ${delta.findings} (${signed(dFind, 0)}).`
  return (
    <SectionMessage appearance={appearance} title="Scan finished" actions={<SectionMessageAction onClick={onDismiss}>Dismiss</SectionMessageAction>}>
      <Text>{body}</Text>
    </SectionMessage>
  )
}
