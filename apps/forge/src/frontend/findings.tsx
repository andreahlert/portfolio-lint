import React, { useState } from 'react'
import { Box, Button, DynamicTable, Inline, ModalTransition, Pagination, SectionMessage, Select, Stack, Text, xcss } from '@forge/react'
import { FixButton, FixModal, fixKindFor, type FixKind } from './fix'
import { IssueLink, RuleCode, type RuleMap, type ViolationRow } from './shared'

interface Option {
  label: string
  value: string
}

const filterStyle = xcss({ minWidth: '180px' })

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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Message without the leading issue key: the key already has its own column. */
export function shortMessage(v: ViolationRow): string {
  if (v.itemKey && v.message.startsWith(`${v.itemKey} `)) return capitalize(v.message.slice(v.itemKey.length + 1))
  return v.message
}

const rowKey = (v: ViolationRow) => `${v.projectKey}|${v.itemKey ?? ''}|${v.ruleId}|${v.message}`

/** ERPSCM-12 before ERPSCM-100: compare the numeric part of the key when the prefix matches. */
function compareKeys(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return a === b ? 0 : a ? 1 : -1
  const [pa, na] = a.split('-')
  const [pb, nb] = b.split('-')
  if (pa !== pb) return a.localeCompare(b)
  return Number(na) - Number(nb)
}

/**
 * Findings table. The full list is filtered, sorted and paginated here, and only the current page is rendered:
 * UI Kit ships the whole page tree to Jira on every render, so a table with hundreds of rows freezes the page.
 * One fix dialog is shared by all rows. Fixed rows disappear until the next scan.
 */
export function ViolationsTable({
  rows,
  rules,
  total,
  showProject = true,
  rowsPerPage = 25,
}: {
  rows: ViolationRow[]
  rules?: RuleMap
  total?: number
  showProject?: boolean
  rowsPerPage?: number
}) {
  const [project, setProject] = useState<string | null>(null)
  const [dimension, setDimension] = useState<string | null>(null)
  const [rule, setRule] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [fixed, setFixed] = useState<Record<string, string>>({})
  const [fixing, setFixing] = useState<{ violation: ViolationRow; kind: FixKind } | null>(null)

  if (rows.length === 0) return <Text color="color.text.subtle">No findings.</Text>

  const live = rows.filter((v) => !(rowKey(v) in fixed))
  const fixedCount = Object.keys(fixed).length
  const projects = [...new Set(live.map((v) => v.projectKey))].sort()
  const ruleIds = [...new Set(live.map((v) => v.ruleId))].sort()
  const dimensions = rules ? [...new Set(ruleIds.map((id) => rules[id]?.dimension).filter((d): d is string => Boolean(d)))].sort() : []

  const filtered = live
    .filter(
      (v) =>
        (project === null || v.projectKey === project) &&
        (rule === null || v.ruleId === rule) &&
        (dimension === null || rules?.[v.ruleId]?.dimension === dimension),
    )
    .sort((a, b) => a.projectKey.localeCompare(b.projectKey) || a.ruleId.localeCompare(b.ruleId) || compareKeys(a.itemKey, b.itemKey))
  const active = project !== null || dimension !== null || rule !== null
  const withReset = (set: (v: string | null) => void) => (v: string | null) => {
    set(v)
    setPage(0)
  }
  const clear = () => {
    setProject(null)
    setDimension(null)
    setRule(null)
    setPage(0)
  }
  const fixableCount = filtered.filter((v) => fixKindFor(v)).length

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const current = Math.min(page, pageCount - 1)
  const start = current * rowsPerPage
  const pageRows = filtered.slice(start, start + rowsPerPage)

  const head = {
    cells: [
      ...(showProject ? [{ key: 'project', content: 'Project', width: 9 }] : []),
      { key: 'item', content: 'Item', width: showProject ? 11 : 12 },
      { key: 'rule', content: 'Rule', width: showProject ? 18 : 20 },
      { key: 'message', content: 'What is wrong' },
      { key: 'fix', content: 'Fix', width: 14 },
    ],
  }

  const markFixed = (note: string) => {
    if (!fixing) return
    const k = rowKey(fixing.violation)
    setFixed((f) => ({ ...f, [k]: note }))
  }

  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        {showProject && projects.length > 1 ? (
          <FilterSelect placeholder="All projects" options={projects.map((p) => ({ label: p, value: p }))} value={project} onChange={withReset(setProject)} />
        ) : null}
        {dimensions.length > 1 ? (
          <FilterSelect
            placeholder="All dimensions"
            options={dimensions.map((d) => ({ label: capitalize(d), value: d }))}
            value={dimension}
            onChange={withReset(setDimension)}
          />
        ) : null}
        <FilterSelect placeholder="All rules" options={ruleIds.map((r) => ({ label: r, value: r }))} value={rule} onChange={withReset(setRule)} />
        {active ? (
          <Button appearance="subtle" onClick={clear}>
            Clear
          </Button>
        ) : null}
        <Text color="color.text.subtle">
          {active ? `${filtered.length} of ${live.length} findings` : `${live.length} findings`}
          {fixableCount > 0 ? `, ${fixableCount} fixable here.` : '.'}
        </Text>
      </Inline>
      {total !== undefined && total > rows.length ? (
        <Text size="small" color="color.text.subtle">
          {`${total} findings in total. Only ${rows.length} are stored here, spread across projects. Open a project page for its complete list, or use the CLI for a full export.`}
        </Text>
      ) : null}
      {fixedCount > 0 ? (
        <SectionMessage appearance="success" title={`${fixedCount} ${fixedCount === 1 ? 'finding' : 'findings'} fixed in Jira`}>
          <Text>Scores update on the next scan. Use Scan again at the top of the page.</Text>
        </SectionMessage>
      ) : null}
      {filtered.length === 0 ? (
        <Text color="color.text.subtle">No findings match these filters.</Text>
      ) : (
        <DynamicTable
          head={head}
          rows={pageRows.map((v) => ({
            key: rowKey(v),
            cells: [
              ...(showProject ? [{ key: 'project', content: <Text size="small">{v.projectKey}</Text> }] : []),
              { key: 'item', content: v.itemKey ? <IssueLink issueKey={v.itemKey} /> : <Text size="small" color="color.text.subtle">(project)</Text> },
              { key: 'rule', content: <RuleCode ruleId={v.ruleId} rules={rules} /> },
              { key: 'message', content: <Text size="small">{shortMessage(v)}</Text> },
              { key: 'fix', content: <FixButton violation={v} onOpen={(violation, kind) => setFixing({ violation, kind })} /> },
            ],
          }))}
        />
      )}
      {pageCount > 1 ? (
        <Inline space="space.100" alignBlock="center" spread="space-between" shouldWrap>
          <Text size="small" color="color.text.subtle">{`${start + 1} to ${Math.min(start + rowsPerPage, filtered.length)} of ${filtered.length}`}</Text>
          <Pagination
            pages={Array.from({ length: pageCount }, (_, i) => i + 1)}
            selectedIndex={current}
            max={7}
            onChange={(_e: unknown, p: unknown) => setPage(Number(p) - 1)}
          />
        </Inline>
      ) : null}
      <ModalTransition>
        {fixing ? (
          <FixModal violation={fixing.violation} kind={fixing.kind} rules={rules} onClose={() => setFixing(null)} onFixed={markFixed} />
        ) : null}
      </ModalTransition>
    </Stack>
  )
}
