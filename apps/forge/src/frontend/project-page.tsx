import React, { useEffect, useState } from 'react'
import ForgeReconciler, { Button, DynamicTable, Heading, Inline, SectionMessage, Spinner, Stack, Text, useProductContext } from '@forge/react'
import { invoke } from '@forge/bridge'
import { fmt, ScoreHeadline, ViolationsTable, type ForecastSet, type ViolationRow } from './shared.js'

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

  if (error) return <SectionMessage appearance="error" title="Scan failed"><Text>{error}</Text></SectionMessage>
  if (!projectKey || !data) return <Spinner label="Loading" />
  const p = data.project

  return (
    <Stack space="space.300">
      <Inline space="space.200" alignBlock="center" spread="space-between">
        <Heading as="h1">{`AI readiness: ${projectKey}`}</Heading>
        <Button appearance="primary" onClick={scan} isDisabled={busy}>{busy ? 'Scanning' : 'Scan this project'}</Button>
      </Inline>
      {!p ? (
        <SectionMessage appearance="information" title="Not scanned yet">
          <Text>This project is not in the latest report. Scan it now, or wait for the daily portfolio scan.</Text>
        </SectionMessage>
      ) : (
        <Stack space="space.300">
          <Text>{`Scanned ${data.scannedAt}. ${p.itemCount} items.`}</Text>
          <ScoreHeadline score={p.score} grade={p.grade} forecasts={p.forecasts} />
          <DynamicTable
            caption="Rules"
            head={{
              cells: [
                { key: 'rule', content: 'Rule' },
                { key: 'dimension', content: 'Dimension' },
                { key: 'weight', content: 'Weight' },
                { key: 'applicable', content: 'Applicable' },
                { key: 'violations', content: 'Violations' },
                { key: 'score', content: 'Score' },
              ],
            }}
            rows={p.rules.map((r) => ({
              key: r.id,
              cells: [
                { key: 'rule', content: r.id },
                { key: 'dimension', content: r.dimension },
                { key: 'weight', content: String(r.weight) },
                { key: 'applicable', content: String(r.applicable) },
                { key: 'violations', content: String(r.violations) },
                { key: 'score', content: fmt(r.score) },
              ],
            }))}
          />
          <ViolationsTable rows={data.violations} />
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
