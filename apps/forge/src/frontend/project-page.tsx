import React, { useEffect, useState } from 'react'
import ForgeReconciler, {
  Badge,
  Button,
  Code,
  DynamicTable,
  EmptyState,
  Heading,
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
  formatDate,
  Panel,
  ScoreBar,
  ScoreCards,
  TabBody,
  toneOf,
  ViolationsTable,
  type ForecastSet,
  type ViolationRow,
} from './shared'

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
}

interface ProjectPayload {
  project: ProjectReport | null
  scannedAt: string | null
  violations: ViolationRow[]
}

const dimensionAppearance = (d: string) =>
  d === 'completeness' ? 'information' : d === 'freshness' ? 'discovery' : d === 'consistency' ? 'moved' : 'new'

function RulesTable({ rules }: { rules: RuleScore[] }) {
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
        ],
      }}
      rows={[...rules]
        .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
        .map((r) => ({
          key: r.id,
          cells: [
            { key: 'rule', content: <Code>{r.id}</Code> },
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
          ],
        }))}
    />
  )
}

function App() {
  const context = useProductContext()
  const projectKey = (context?.extension as { project?: { key?: string } } | undefined)?.project?.key
  const [data, setData] = useState<ProjectPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectKey) return
    invoke<ProjectPayload>('getProjectReport', { projectKey })
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
  }, [projectKey])

  const scan = async () => {
    if (!projectKey) return
    setBusy(true)
    setError(null)
    try {
      await invoke('scanNow', { projectKeys: [projectKey] })
      setData(await invoke<ProjectPayload>('getProjectReport', { projectKey }))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!projectKey || (!data && !error)) return <Spinner label="Loading" />
  const p = data?.project ?? null

  return (
    <Stack space="space.300">
      <Inline space="space.200" alignBlock="center" spread="space-between" shouldWrap>
        <Stack space="space.050">
          <Heading as="h1" size="large">{p ? `${p.name} AI-readiness` : `${projectKey} AI-readiness`}</Heading>
          <Text color="color.text.subtle">
            {p ? `Last scan ${formatDate(data?.scannedAt)}. ${p.itemCount} items, ${data?.violations.length ?? 0} findings.` : 'This project is not in the latest report yet.'}
          </Text>
        </Stack>
        <LoadingButton appearance="primary" onClick={scan} isLoading={busy}>
          {p ? 'Scan again' : 'Scan this project'}
        </LoadingButton>
      </Inline>

      {error ? (
        <SectionMessage appearance="error" title="Scan failed">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {!p ? (
        <EmptyState
          header="Not scanned yet"
          description="Scan it now, or wait for the daily portfolio scan."
          primaryAction={<Button appearance="primary" onClick={scan} isDisabled={busy}>Scan this project</Button>}
        />
      ) : (
        <Stack space="space.300">
          <ScoreCards score={p.score} grade={p.grade} forecasts={p.forecasts} subtitle={`${p.itemCount} items in ${p.key}`} title="Project score" />
          <DimensionBars dimensions={p.dimensions} />
          <Panel>
            <Tabs id="project-tabs">
              <TabList>
                <Tab>Rules</Tab>
                <Tab>{`Findings (${data?.violations.length ?? 0})`}</Tab>
              </TabList>
              <TabPanel>
                <TabBody>
                  <RulesTable rules={p.rules} />
                </TabBody>
              </TabPanel>
              <TabPanel>
                <TabBody>
                  <ViolationsTable rows={data?.violations ?? []} />
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
