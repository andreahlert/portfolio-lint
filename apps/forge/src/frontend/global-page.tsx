import React, { useEffect, useState } from 'react'
import ForgeReconciler, {
  Button,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  LineChart,
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
} from '@forge/react'
import { invoke } from '@forge/bridge'
import {
  DimensionBars,
  ForecastLozenges,
  fmt,
  formatDate,
  gradeAppearance,
  Panel,
  RemediationList,
  ScoreBar,
  ScoreCards,
  TabBody,
  ViolationsTable,
  type ForecastSet,
  type RemediationRow,
  type ViolationRow,
} from './shared'

interface ProjectRow {
  key: string
  name: string
  itemCount: number
  score: number
  grade: string
  forecasts: ForecastSet
}

interface StoredReport {
  name: string
  scannedAt: string
  score: number
  grade: string
  forecasts: ForecastSet
  dimensions: Record<string, number>
  projects: ProjectRow[]
  remediation: RemediationRow[]
  violations: ViolationRow[]
  violationCount: number
}

interface HistoryPoint {
  scannedAt: string
  score: number
  grade: string
}

interface ReportPayload {
  report: StoredReport | null
  history: HistoryPoint[]
}

function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  return (
    <DynamicTable
      head={{
        cells: [
          { key: 'key', content: 'Project', isSortable: true },
          { key: 'items', content: 'Items', isSortable: true },
          { key: 'score', content: 'Score', isSortable: true },
          { key: 'grade', content: 'Grade' },
          { key: 'forecasts', content: 'Forecasts' },
        ],
      }}
      rows={[...projects]
        .sort((a, b) => a.score - b.score)
        .map((p) => ({
          key: p.key,
          cells: [
            {
              key: 'key',
              content: (
                <Stack space="space.0">
                  <Text weight="semibold">{p.key}</Text>
                  <Text size="small" color="color.text.subtle">{p.name}</Text>
                </Stack>
              ),
            },
            { key: 'items', content: String(p.itemCount) },
            {
              key: 'score',
              content: (
                <Inline space="space.100" alignBlock="center">
                  <Text weight="bold">{fmt(p.score)}</Text>
                  <ScoreBar score={p.score} />
                </Inline>
              ),
            },
            { key: 'grade', content: <Lozenge appearance={gradeAppearance(p.grade)} isBold>{p.grade}</Lozenge> },
            { key: 'forecasts', content: <ForecastLozenges forecasts={p.forecasts} /> },
          ],
        }))}
    />
  )
}

function History({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) {
    return <Text color="color.text.subtle">The trend appears after the second scan. The daily scheduled scan builds it automatically.</Text>
  }
  const data = history.map((h) => ({ date: h.scannedAt.slice(0, 16).replace('T', ' '), score: Math.round(h.score * 10) / 10 }))
  return (
    <Stack space="space.200">
      <LineChart data={data} xAccessor="date" yAccessor="score" height={280} title="Portfolio score over time" />
      <DynamicTable
        rowsPerPage={10}
        head={{ cells: [{ key: 'when', content: 'Scan' }, { key: 'score', content: 'Score' }, { key: 'grade', content: 'Grade' }] }}
        rows={[...history].reverse().map((h) => ({
          key: h.scannedAt,
          cells: [
            { key: 'when', content: formatDate(h.scannedAt) },
            { key: 'score', content: fmt(h.score) },
            { key: 'grade', content: <Lozenge appearance={gradeAppearance(h.grade)}>{h.grade}</Lozenge> },
          ],
        }))}
      />
    </Stack>
  )
}

function App() {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    invoke<ReportPayload>('getReport')
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  const scan = async () => {
    setBusy(true)
    setError(null)
    try {
      setData(await invoke<ReportPayload>('scanNow'))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!data && !error) return <Spinner label="Loading report" />
  const r = data?.report ?? null

  return (
    <Stack space="space.300">
      <Inline space="space.200" alignBlock="center" spread="space-between" shouldWrap>
        <Stack space="space.050">
          <Heading as="h1" size="large">Portfolio AI-Readiness</Heading>
          <Text color="color.text.subtle">
            {r
              ? `Last scan ${formatDate(r.scannedAt)}. ${r.projects.length} ${r.projects.length === 1 ? 'project' : 'projects'}, ${r.violationCount} ${r.violationCount === 1 ? 'finding' : 'findings'}.`
              : 'Scores how well your Jira data can feed an AI forecast, and tells you what to fix first.'}
          </Text>
        </Stack>
        <LoadingButton appearance="primary" onClick={scan} isLoading={busy}>
          {r ? 'Scan again' : 'Scan now'}
        </LoadingButton>
      </Inline>

      {error ? (
        <SectionMessage appearance="error" title="Scan failed">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {!r ? (
        <EmptyState
          header="No report yet"
          description="Run a scan to score every project this app can read. A daily scheduled scan keeps it fresh afterwards."
          primaryAction={<Button appearance="primary" onClick={scan} isDisabled={busy}>Scan now</Button>}
        />
      ) : (
        <Stack space="space.300">
          <ScoreCards
            score={r.score}
            grade={r.grade}
            forecasts={r.forecasts}
            subtitle={`${r.projects.reduce((n, p) => n + p.itemCount, 0)} items across ${r.projects.length} ${r.projects.length === 1 ? 'project' : 'projects'}`}
          />
          <DimensionBars dimensions={r.dimensions} />
          <Panel>
            <Tabs id="portfolio-tabs">
              <TabList>
                <Tab>Fix first</Tab>
                <Tab>Projects</Tab>
                <Tab>{`All findings (${r.violationCount})`}</Tab>
                <Tab>History</Tab>
              </TabList>
              <TabPanel>
                <TabBody>
                  <RemediationList rows={r.remediation} />
                </TabBody>
              </TabPanel>
              <TabPanel>
                <TabBody>
                  <ProjectsTable projects={r.projects} />
                </TabBody>
              </TabPanel>
              <TabPanel>
                <TabBody>
                  <ViolationsTable rows={r.violations} />
                </TabBody>
              </TabPanel>
              <TabPanel>
                <TabBody>
                  <History history={data?.history ?? []} />
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
