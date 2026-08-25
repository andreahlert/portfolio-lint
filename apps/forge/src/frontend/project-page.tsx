import React, { useEffect, useState } from 'react'
import ForgeReconciler, {
  Badge,
  Button,
  DynamicTable,
  EmptyState,
  Inline,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  useProductContext,
} from '@forge/react'
import { invoke } from '@forge/bridge'
import {
  DimensionBars,
  fmt,
  keysForRule,
  openIssues,
  Panel,
  RemediationList,
  RuleCode,
  RuleDocLink,
  ScanSummary,
  ScanTime,
  ScoreBar,
  ScoreCards,
  TabBody,
  toneOf,
  ViolationsTable,
  type ForecastSet,
  type RemediationRow,
  type RuleMap,
  type RuleMeta,
  type ScanDelta,
  toRuleMap,
  type ViolationRow,
} from './shared'
import { ProjectForecastPanel, type ProjectForecastRow } from './forecast'

interface RuleScore {
  id: string
  dimension: string
  weight: number
  applicable: number
  violations: number
  score: number | null
}

interface ProjectReport {
  key: string
  name: string
  itemCount: number
  score: number
  grade: string
  dimensions: Record<string, number>
  forecasts: ForecastSet
  rules: RuleScore[]
  remediation?: RemediationRow[]
}

interface ProjectPayload {
  project: ProjectReport | null
  scannedAt: string | null
  violations: ViolationRow[]
  /** True count for the project; `violations` can be shorter when the stored list is capped. */
  violationCount?: number
  forecast?: ProjectForecastRow | null
  historyWeeks?: number
}

const dimensionAppearance = (d: string) =>
  d === 'completeness' ? 'information' : d === 'freshness' ? 'discovery' : d === 'consistency' ? 'moved' : 'new'

function RulesTable({ rules, violations, meta }: { rules: RuleScore[]; violations: ViolationRow[]; meta?: RuleMap }) {
  return (
    <DynamicTable
      head={{
        cells: [
          { key: 'rule', content: 'Rule', isSortable: true },
          { key: 'dimension', content: 'Dimension', isSortable: true },
          { key: 'weight', content: 'Weight', isSortable: true },
          { key: 'applicable', content: 'Checked', isSortable: true },
          { key: 'violations', content: 'Failing', isSortable: true },
          { key: 'score', content: 'Score', isSortable: true },
          { key: 'open', content: '' },
        ],
      }}
      rows={[...rules]
        .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
        .map((r) => {
          const keys = keysForRule(violations, r.id)
          return {
            key: r.id,
            cells: [
              {
                key: 'rule',
                content: (
                  <Inline space="space.100" alignBlock="center">
                    <RuleCode ruleId={r.id} rules={meta} />
                    <RuleDocLink ruleId={r.id} />
                  </Inline>
                ),
              },
              { key: 'dimension', content: <Lozenge appearance={dimensionAppearance(r.dimension)}>{r.dimension}</Lozenge> },
              { key: 'weight', content: String(r.weight) },
              { key: 'applicable', content: String(r.applicable) },
              { key: 'violations', content: <Badge appearance={r.violations > 0 ? 'important' : 'default'}>{r.violations}</Badge> },
              {
                key: 'score',
                content:
                  r.score == null ? (
                    <Text color="color.text.subtle">not applicable</Text>
                  ) : (
                    <Inline space="space.100" alignBlock="center">
                      <Text weight="bold" color={`color.text.${toneOf(r.score)}`}>{fmt(r.score)}</Text>
                      <ScoreBar score={r.score} />
                    </Inline>
                  ),
              },
              {
                key: 'open',
                content:
                  keys.length > 0 ? (
                    <Button appearance="subtle" iconAfter="shortcut" onClick={() => openIssues(keys)}>
                      {`Open ${keys.length}`}
                    </Button>
                  ) : null,
              },
            ],
          }
        })}
    />
  )
}

function App() {
  const context = useProductContext()
  const locale = context?.locale
  const projectKey = (context?.extension as { project?: { key?: string } } | undefined)?.project?.key
  const [data, setData] = useState<ProjectPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [delta, setDelta] = useState<ScanDelta | null>(null)
  const [rules, setRules] = useState<RuleMap | undefined>(undefined)

  useEffect(() => {
    if (!projectKey) return
    invoke<ProjectPayload>('getProjectReport', { projectKey })
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
    invoke<RuleMeta[]>('listRules')
      .then((list) => setRules(toRuleMap(list)))
      .catch(() => undefined)
  }, [projectKey])

  const scan = async () => {
    if (!projectKey) return
    setBusy(true)
    setError(null)
    setDelta(null)
    const prev = data
    try {
      // Full portfolio scan: a partial scan would replace the stored portfolio report.
      await invoke('scanNow')
      const next = await invoke<ProjectPayload>('getProjectReport', { projectKey })
      setData(next)
      if (next.project) {
        setDelta({
          prevScore: prev?.project?.score ?? null,
          prevFindings: prev?.project ? (prev.violationCount ?? prev.violations.length) : null,
          score: next.project.score,
          findings: next.violationCount ?? next.violations.length,
        })
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!projectKey || (!data && !error)) return <Spinner label="Loading" />
  const p = data?.project ?? null
  const violations = data?.violations ?? []
  const violationCount = data?.violationCount ?? violations.length

  return (
    <Stack space="space.300">
      <Inline space="space.200" alignBlock="center" spread="space-between" shouldWrap>
        {p ? (
          <Inline space="space.075" alignBlock="center" shouldWrap>
            <Text color="color.text.subtle">Last scan</Text>
            <ScanTime iso={data?.scannedAt} locale={locale} />
            <Text color="color.text.subtle">{`| ${p.itemCount} items, ${violationCount} ${violationCount === 1 ? 'finding' : 'findings'}. Scans run daily.`}</Text>
          </Inline>
        ) : (
          <Text color="color.text.subtle">This project is not in the latest report yet.</Text>
        )}
        <LoadingButton appearance="primary" onClick={scan} isLoading={busy}>
          {p ? 'Scan again' : 'Scan now'}
        </LoadingButton>
      </Inline>

      {error ? (
        <SectionMessage appearance="error" title="Scan failed">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {delta ? <ScanSummary delta={delta} onDismiss={() => setDelta(null)} /> : null}

      {!p ? (
        <EmptyState
          header="Not scanned yet"
          description="Scan now, or wait for the daily portfolio scan."
          primaryAction={<Button appearance="primary" onClick={scan} isDisabled={busy}>Scan now</Button>}
        />
      ) : (
        <Stack space="space.300">
          <ScoreCards score={p.score} grade={p.grade} forecasts={p.forecasts} subtitle={`${p.itemCount} items in ${p.key}`} title="Project score" />
          <DimensionBars dimensions={p.dimensions} />
          <Panel>
            <Tabs id="project-tabs">
              <TabList>
                <Tab>Fix first</Tab>
                <Tab>Delivery forecast</Tab>
                <Tab>Rules</Tab>
                <Tab>{`Findings (${violationCount})`}</Tab>
              </TabList>
              <TabPanel>
                <TabBody>
                  {p.remediation ? (
                    <RemediationList rows={p.remediation} violations={violations} rules={rules} />
                  ) : (
                    <Text color="color.text.subtle">Scan again to get a prioritized fix list for this project.</Text>
                  )}
                </TabBody>
              </TabPanel>
              <TabPanel>
                <TabBody>
                  {data?.forecast ? (
                    <ProjectForecastPanel forecast={data.forecast} historyWeeks={data.historyWeeks ?? 12} rules={rules} />
                  ) : (
                    <Text color="color.text.subtle">Scan again to get a delivery forecast for this project.</Text>
                  )}
                </TabBody>
              </TabPanel>
              <TabPanel>
                <TabBody>
                  <RulesTable rules={p.rules} violations={violations} meta={rules} />
                </TabBody>
              </TabPanel>
              <TabPanel>
                <TabBody>
                  <ViolationsTable rows={violations} rules={rules} total={violationCount} />
                </TabBody>
              </TabPanel>
            </Tabs>
          </Panel>
        </Stack>
      )}
    </Stack>
  )
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
