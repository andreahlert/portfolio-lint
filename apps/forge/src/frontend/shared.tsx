import React from 'react'
import { DynamicTable, Inline, Lozenge, Stack, Text } from '@forge/react'

export type ForecastLabel = 'reliable' | 'degraded' | 'unreliable' | 'n/a'

export interface ForecastCell {
  score: number | null
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

export const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? 'n/a' : n.toFixed(1))

export function labelAppearance(label: ForecastLabel): 'success' | 'moved' | 'removed' | 'default' {
  if (label === 'reliable') return 'success'
  if (label === 'degraded') return 'moved'
  if (label === 'unreliable') return 'removed'
  return 'default'
}

export function gradeAppearance(grade: string): 'success' | 'inprogress' | 'moved' | 'removed' | 'default' {
  if (grade === 'A') return 'success'
  if (grade === 'B') return 'inprogress'
  if (grade === 'C') return 'moved'
  return 'removed'
}

export function ForecastLozenges({ forecasts }: { forecasts: ForecastSet }) {
  return (
    <Inline space="space.100" alignBlock="center">
      {(['schedule', 'capacity', 'scope'] as const).map((f) => (
        <Inline key={f} space="space.050" alignBlock="center">
          <Text>{f}</Text>
          <Lozenge appearance={labelAppearance(forecasts[f].label)}>{`${forecasts[f].label} ${fmt(forecasts[f].score)}`}</Lozenge>
        </Inline>
      ))}
    </Inline>
  )
}

export function ScoreHeadline({ score, grade, forecasts }: { score: number; grade: string; forecasts: ForecastSet }) {
  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center">
        <Text size="large" weight="bold">{`Readiness ${fmt(score)} / 100`}</Text>
        <Lozenge appearance={gradeAppearance(grade)} isBold>{`grade ${grade}`}</Lozenge>
      </Inline>
      <ForecastLozenges forecasts={forecasts} />
    </Stack>
  )
}

export function RemediationTable({ rows }: { rows: RemediationRow[] }) {
  return (
    <DynamicTable
      caption="Remediation, highest impact first"
      head={{
        cells: [
          { key: 'n', content: '#' },
          { key: 'rule', content: 'Rule' },
          { key: 'count', content: 'Violations' },
          { key: 'fix', content: 'Fix' },
          { key: 'examples', content: 'Examples' },
        ],
      }}
      rows={rows.map((r, i) => ({
        key: r.ruleId,
        cells: [
          { key: 'n', content: String(i + 1) },
          { key: 'rule', content: r.ruleId },
          { key: 'count', content: String(r.violations) },
          { key: 'fix', content: `${r.remediation} (${r.forecastImpact})` },
          { key: 'examples', content: r.examples.join(', ') },
        ],
      }))}
      emptyView={<Text>Nothing to fix.</Text>}
    />
  )
}

export function ViolationsTable({ rows, max = 100 }: { rows: ViolationRow[]; max?: number }) {
  const shown = rows.slice(0, max)
  return (
    <Stack space="space.100">
      <DynamicTable
        caption={`Violations (${rows.length})`}
        rowsPerPage={20}
        head={{
          cells: [
            { key: 'project', content: 'Project' },
            { key: 'item', content: 'Item' },
            { key: 'rule', content: 'Rule' },
            { key: 'message', content: 'Message' },
          ],
        }}
        rows={shown.map((v, i) => ({
          key: `${v.ruleId}-${v.itemKey ?? i}`,
          cells: [
            { key: 'project', content: v.projectKey },
            { key: 'item', content: v.itemKey ?? '' },
            { key: 'rule', content: v.ruleId },
            { key: 'message', content: v.message },
          ],
        }))}
        emptyView={<Text>No violations.</Text>}
      />
      {rows.length > max ? <Text>{`${rows.length - max} more not shown.`}</Text> : null}
    </Stack>
  )
}
