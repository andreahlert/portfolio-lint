import React from 'react'
import {
  Badge,
  Box,
  Code,
  DynamicTable,
  Heading,
  Icon,
  Inline,
  Lozenge,
  ProgressBar,
  Stack,
  Tag,
  TagGroup,
  Text,
  xcss,
} from '@forge/react'

export type ForecastLabel = 'reliable' | 'degraded' | 'unreliable'

export interface ForecastCell {
  score: number
  label: ForecastLabel
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

export type Tone = 'success' | 'warning' | 'danger'

export const fmt = (n: number | null | undefined): string => (n == null ? 'n/a' : n.toFixed(1))

export const toneOf = (score: number | null | undefined): Tone =>
  score == null ? 'warning' : score >= 75 ? 'success' : score >= 50 ? 'warning' : 'danger'

export const labelAppearance = (label: ForecastLabel) =>
  label === 'reliable' ? 'success' : label === 'degraded' ? 'moved' : 'removed'

export const gradeAppearance = (grade: string) =>
  grade === 'A' ? 'success' : grade === 'B' ? 'inprogress' : grade === 'C' ? 'moved' : 'removed'

export const formatDate = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 16).replace('T', ' ') + ' UTC' : 'never'

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
        <Text size="small" color="color.text.subtle">{forecastMeta[kind].hint}</Text>
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

export function RemediationList({ rows }: { rows: RemediationRow[] }) {
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
      {rows.map((r, i) => (
        <Box key={r.ruleId} xcss={rowStyle}>
          <Stack space="space.100">
            <Inline space="space.150" alignBlock="center" shouldWrap>
              <Badge appearance={i === 0 ? 'important' : 'primary'}>{i + 1}</Badge>
              <Code>{r.ruleId}</Code>
              <Badge appearance="default">{`${r.violations} ${r.violations === 1 ? 'item' : 'items'}`}</Badge>
            </Inline>
            <Text weight="medium">{r.remediation}</Text>
            <Text size="small" color="color.text.subtle">{`Improves: ${r.forecastImpact}`}</Text>
            {r.examples.length > 0 ? (
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <Text size="small" color="color.text.subtle">Examples:</Text>
                <TagGroup>
                  {r.examples.map((e) => (
                    <Tag key={e} text={e} />
                  ))}
                </TagGroup>
              </Inline>
            ) : null}
          </Stack>
        </Box>
      ))}
    </Stack>
  )
}

export function ViolationsTable({ rows, max = 100 }: { rows: ViolationRow[]; max?: number }) {
  if (rows.length === 0) return <Text color="color.text.subtle">No findings.</Text>
  const shown = rows.slice(0, max)
  return (
    <Stack space="space.100">
      {rows.length > max ? <Text color="color.text.subtle">{`Showing first ${max} of ${rows.length} findings.`}</Text> : null}
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
            { key: 'item', content: <Text weight="semibold">{v.itemKey ?? '(project)'}</Text> },
            { key: 'rule', content: <Code>{v.ruleId}</Code> },
            { key: 'message', content: v.message },
          ],
        }))}
      />
    </Stack>
  )
}
