import React, { useEffect, useState } from 'react'
import ForgeReconciler, {
  Button,
  DynamicTable,
  EmptyState,
  Inline,
  LineChart,
  LoadingButton,
  Lozenge,
  ModalTransition,
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
  absoluteTime,
  DimensionBars,
  DocsNavContext,
  ForecastLozenges,
  fmt,
  gradeAppearance,
  openProjectPage,
  Panel,
  RemediationList,
  ScanSummary,
  ScanTime,
  ScoreBar,
  ScoreCards,
  TabBody,
  type ForecastSet,
  type RemediationRow,
  type RuleMap,
  type RuleMeta,
  type ScanDelta,
  toRuleMap,
  type ViolationRow,
} from './shared'
import { DeliveryForecastTable, ProgrammeBanner, type ForecastReportRow } from './forecast'
import { ViolationsTable } from './findings'
import { FixHint } from './fix'
import { DocsPanel, RuleDocModal } from './docs'
import { SettingsPanel } from './settings'


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
  forecast?: ForecastReportRow
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
          { key: 'open', content: '' },
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
                <Stack space="space.0" alignInline="start">
                  <Button appearance="subtle" spacing="none" onClick={() => openProjectPage(p.key)}>
                    {p.key}
                  </Button>
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
            {
              key: 'open',
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

function History({ history, locale }: { history: HistoryPoint[]; locale?: string }) {
  if (history.length < 2) {
    return <Text color="color.text.subtle">The trend appears after the second scan. The daily scheduled scan builds it automatically.</Text>
  }
  const data = history.map((h) => ({ date: absoluteTime(h.scannedAt, locale), score: Math.round(h.score * 10) / 10 }))
  return (
    <Stack space="space.200">
      <LineChart data={data} xAccessor="date" yAccessor="score" height={280} title="Portfolio score over time" />
      <DynamicTable
        rowsPerPage={10}
        head={{ cells: [{ key: 'when', content: 'Scan' }, { key: 'score', content: 'Score' }, { key: 'grade', content: 'Grade' }] }}
        rows={[...history].reverse().map((h) => ({
          key: h.scannedAt,
          cells: [
            { key: 'when', content: absoluteTime(h.scannedAt, locale) },
            { key: 'score', content: fmt(h.score) },
            { key: 'grade', content: <Lozenge appearance={gradeAppearance(h.grade)}>{h.grade}</Lozenge> },
          ],
        }))}
      />
    </Stack>
  )
}

function App() {
  const context = useProductContext()
  const locale = context?.locale
  const [data, setData] = useState<ReportPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [delta, setDelta] = useState<ScanDelta | null>(null)
  const [rules, setRules] = useState<RuleMap | undefined>(undefined)
  useEffect(() => {
    invoke<ReportPayload>('getReport')
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
    invoke<RuleMeta[]>('listRules')
      .then((list) => setRules(toRuleMap(list)))
      .catch(() => undefined)
  }, [])

  const scan = async () => {
    setBusy(true)
    setError(null)
    setDelta(null)
    const prev = data?.report ?? null
    try {
      const next = await invoke<ReportPayload>('scanNow')
      setData(next)
      if (next.report) {
        setDelta({
          prevScore: prev?.score ?? null,
          prevFindings: prev?.violationCount ?? null,
          score: next.report.score,
          findings: next.report.violationCount,
        })
      }
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
        {r ? (
          <Inline space="space.075" alignBlock="center" shouldWrap>
            <Text color="color.text.subtle">Last scan</Text>
            <ScanTime iso={r.scannedAt} locale={locale} />
            <Text color="color.text.subtle">
              {`| ${r.projects.length} ${r.projects.length === 1 ? 'project' : 'projects'}, ${r.violationCount} ${r.violationCount === 1 ? 'finding' : 'findings'}. Scans run daily.`}
            </Text>
          </Inline>
        ) : (
          <Text color="color.text.subtle">Scores how well your Jira data can feed an AI forecast, and tells you what to fix first.</Text>
        )}
        <LoadingButton appearance="primary" onClick={scan} isLoading={busy}>
          {r ? 'Scan again' : 'Scan now'}
        </LoadingButton>
      </Inline>

      {error ? (
        <SectionMessage appearance="error" title="Scan failed">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {delta ? <ScanSummary delta={delta} onDismiss={() => setDelta(null)} /> : null}

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
        </Stack>
      )}

      <Panel>
        <Tabs id="portfolio-tabs" defaultSelected={0}>
            <TabList>
              <Tab>Fix first</Tab>
              <Tab>Delivery forecast</Tab>
              <Tab>Projects</Tab>
              <Tab>{r ? `All findings (${r.violationCount})` : 'All findings'}</Tab>
              <Tab>History</Tab>
              <Tab>Docs</Tab>
              <Tab>Settings</Tab>
            </TabList>
            <TabPanel>
              <TabBody>{r ? <RemediationList rows={r.remediation} violations={r.violations} rules={rules} /> : <NoReport />}</TabBody>
            </TabPanel>
            <TabPanel>
              <TabBody>
                {r?.forecast ? (
                  <Stack space="space.200">
                    <ProgrammeBanner forecast={r.forecast} />
                    <DeliveryForecastTable projects={r.forecast.projects} />
                    <Text size="small" color="color.text.subtle">
                      p50 and p85 are the dates by which 50% and 85% of Monte Carlo runs finish the open work, using each project's own weekly throughput. Commitment compares p85 with the latest due date on an open epic. Open a project for its critical path and the items to fix first.
                    </Text>
                  </Stack>
                ) : r ? (
                  <Text color="color.text.subtle">Scan again to get a delivery forecast. Reports from older versions of the app do not include one.</Text>
                ) : (
                  <NoReport />
                )}
              </TabBody>
            </TabPanel>
            <TabPanel>
              <TabBody>{r ? <ProjectsTable projects={r.projects} /> : <NoReport />}</TabBody>
            </TabPanel>
            <TabPanel>
              <TabBody>
                {r ? (
                  <Stack space="space.150">
                    <FixHint />
                    <ViolationsTable rows={r.violations} rules={rules} total={r.violationCount} />
                  </Stack>
                ) : (
                  <NoReport />
                )}
              </TabBody>
            </TabPanel>
            <TabPanel>
              <TabBody>
                <History history={data?.history ?? []} locale={locale} />
              </TabBody>
            </TabPanel>
            <TabPanel>
              <TabBody>
                <DocsPanel />
              </TabBody>
            </TabPanel>
            <TabPanel>
              <TabBody>
                <SettingsPanel onRescan={scan} />
              </TabBody>
            </TabPanel>
        </Tabs>
      </Panel>
    </Stack>
  )
}

function NoReport() {
  return <Text color="color.text.subtle">No report yet. Run a scan first.</Text>
}

/**
 * Owns the rule-docs modal and provides `showDocs` to the tree. Must sit above every host element: the UI Kit
 * reconciler copies `children` into host props on update, and a Context.Provider element in there is a circular
 * structure that freezes the sandbox when the doc is serialized.
 */
function DocsHost() {
  const [docsRule, setDocsRule] = useState<string | null>(null)
  return (
    <DocsNavContext.Provider value={setDocsRule}>
      <App />
      <ModalTransition>{docsRule ? <RuleDocModal ruleId={docsRule} onClose={() => setDocsRule(null)} /> : null}</ModalTransition>
    </DocsNavContext.Provider>
  )
}

ForgeReconciler.render(
  <React.StrictMode>
    <DocsHost />
  </React.StrictMode>,
)
