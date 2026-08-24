import React, { useEffect, useState } from 'react'
import ForgeReconciler, { Button, DynamicTable, Heading, Inline, Lozenge, SectionMessage, Spinner, Stack, Text } from '@forge/react'
import { invoke } from '@forge/bridge'
import { fmt, gradeAppearance, RemediationTable, ScoreHeadline, ViolationsTable, type ForecastSet, type RemediationRow, type ViolationRow } from './shared'

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

  if (error) return <SectionMessage appearance="error" title="Scan failed"><Text>{error}</Text></SectionMessage>
  if (!data) return <Spinner label="Loading report" />
  const r = data.report

  return (
    <Stack space="space.300">
      <Inline space="space.200" alignBlock="center" spread="space-between">
        <Heading as="h1">Portfolio AI-Readiness</Heading>
        <Button appearance="primary" onClick={scan} isDisabled={busy}>{busy ? 'Scanning' : 'Scan now'}</Button>
      </Inline>
      {!r ? (
        <SectionMessage appearance="information" title="No report yet">
          <Text>Run a scan to score every project this app can read. A daily scheduled scan keeps it fresh afterwards.</Text>
        </SectionMessage>
      ) : (
        <Stack space="space.300">
          <Text>{`Scanned ${r.scannedAt}. ${r.projects.length} projects, ${r.violationCount} violations.`}</Text>
          <ScoreHeadline score={r.score} grade={r.grade} forecasts={r.forecasts} />
          <Inline space="space.200">
            {Object.entries(r.dimensions).map(([d, s]) => (
              <Text key={d}>{`${d}: ${fmt(s)}`}</Text>
            ))}
          </Inline>
          <DynamicTable
            caption="Projects"
            head={{
              cells: [
                { key: 'key', content: 'Project' },
                { key: 'items', content: 'Items' },
                { key: 'score', content: 'Score' },
                { key: 'grade', content: 'Grade' },
                { key: 'schedule', content: 'Schedule' },
                { key: 'capacity', content: 'Capacity' },
                { key: 'scope', content: 'Scope' },
              ],
            }}
            rows={r.projects.map((p) => ({
              key: p.key,
              cells: [
                { key: 'key', content: `${p.key} (${p.name})` },
                { key: 'items', content: String(p.itemCount) },
                { key: 'score', content: fmt(p.score) },
                { key: 'grade', content: <Lozenge appearance={gradeAppearance(p.grade)}>{p.grade}</Lozenge> },
                { key: 'schedule', content: p.forecasts.schedule.label },
                { key: 'capacity', content: p.forecasts.capacity.label },
                { key: 'scope', content: p.forecasts.scope.label },
              ],
            }))}
          />
          <RemediationTable rows={r.remediation} />
          <ViolationsTable rows={r.violations} />
          {data.history.length > 1 ? (
            <Stack space="space.050">
              <Heading as="h3">Trend</Heading>
              <Text>{data.history.map((h) => `${h.scannedAt.slice(0, 10)}: ${fmt(h.score)} (${h.grade})`).join('  |  ')}</Text>
            </Stack>
          ) : null}
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
