import React, { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Code,
  Heading,
  Inline,
  Link,
  List,
  ListItem,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Select,
  Spinner,
  Stack,
  Text,
  xcss,
} from '@forge/react'
import { invoke } from '@forge/bridge'
import { FIX_LABEL, fixKindForRule } from './fix'
import { labelAppearance, RULES_DOC_URL, type RuleMeta } from './shared'

interface FieldMeta {
  key: string
  label: string
  help: string
  min: number
  integer: boolean
  default: number
  rules?: string[]
}

interface DocsPayload {
  rules: RuleMeta[]
  fields: FieldMeta[]
  forecastFields: FieldMeta[]
  defaults: Record<string, unknown>
  config: Record<string, unknown>
}

const dimensionAppearance = (d: string) => (d === 'completeness' ? 'information' : d === 'freshness' ? 'discovery' : d === 'consistency' ? 'moved' : 'new')

const forecastAppearance = (f: string) => (f === 'schedule' ? 'inprogress' : f === 'capacity' ? 'new' : 'moved')

const sectionStyle = xcss({
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'radius.medium',
  padding: 'space.200',
})

const ruleCardStyle = xcss({
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
  borderRadius: 'radius.medium',
  padding: 'space.200',
})

const selectStyle = xcss({ minWidth: '260px' })

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box xcss={sectionStyle}>
      <Stack space="space.150">
        <Heading as="h3" size="small">{title}</Heading>
        {children}
      </Stack>
    </Box>
  )
}

function ScoringDocs() {
  return (
    <Section title="How scoring works">
      <List type="unordered">
        <ListItem>
          <Text>
            <Text as="strong">Rule score</Text> = <Code>100 x (1 - failing / checked)</Code>. Each rule only checks the items it applies to (for example, missing-estimate skips epics and done items). A rule with nothing to check is not scored.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Dimension score</Text> = weighted mean of its rule scores, weights 1 to 3. Four dimensions: completeness, freshness, consistency, traceability.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Project score</Text> = plain mean of the four dimensions. <Text as="strong">Portfolio score</Text> = mean of project scores weighted by item count.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Grade</Text>: A at 90 or more, B at 75, C at 60, D at 40, F below.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Forecast reliability</Text> (schedule, capacity, scope) = the lowest score among the rules feeding that forecast, because one bad input breaks the whole forecast. Reliable at 75 or more, degraded at 50, unreliable below. The card names the limiting rule.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Fix first</Text> ranks rules by <Code>(100 - score) x weight x items checked</Code>, summed across projects, so a heavy rule failing on many items rises to the top.
          </Text>
        </ListItem>
      </List>
    </Section>
  )
}

function ForecastDocs({ config, defaults }: { config: Record<string, unknown>; defaults: Record<string, unknown> }) {
  const f = { ...(defaults['forecast'] as Record<string, unknown>), ...((config['forecast'] as Record<string, unknown> | undefined) ?? {}) }
  return (
    <Section title="How the delivery forecast works">
      <List type="unordered">
        <ListItem>
          <Text>
            <Text as="strong">Throughput</Text>: completed work per week over the last {String(f['historyWeeks'])} weeks, taken from each item's resolution date. Points when the project estimates in points, otherwise item count.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Monte Carlo</Text>: {String(f['simulations'])} simulated futures per project. Each week draws a random historical week of throughput until the open work is done. p50, p85 and p95 are the weeks by which 50%, 85% and 95% of the runs finished. Commit to p85. A fixed seed ({String(f['seed'])}) keeps two scans of the same data identical.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Unestimated items</Text> get the project's median estimate, and the gap between the optimistic and pessimistic assumption is reported as weeks of uncertainty. Estimating them is usually the fastest way to tighten the forecast.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Critical path</Text>: longest chain of open items through the "blocks / is blocked by" links, by estimate. Items on it, and items that block the most others, appear under Fix first on the project page. Cycles are reported, not walked.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Commitment</Text> compares p85 with the latest due date on an open epic: on track, at risk (p50 before due, p85 after) or late.
          </Text>
        </ListItem>
        <ListItem>
          <Text>
            <Text as="strong">Confidence</Text> drops when fewer than 4 weeks have completed work, when more than 10% (medium) or 30% (low) of open points are unestimated, or when the forecast counts items instead of points.
          </Text>
        </ListItem>
      </List>
    </Section>
  )
}

function settingValue(config: Record<string, unknown>, defaults: Record<string, unknown>, key: string): string {
  const v = config[key] ?? defaults[key]
  return v === undefined ? 'n/a' : String(v)
}

function RuleCard({ rule, fields, config, defaults }: { rule: RuleMeta; fields: FieldMeta[]; config: Record<string, unknown>; defaults: Record<string, unknown> }) {
  const used = fields.filter((f) => (rule.settings ?? f.rules ?? []).includes(rule.settings ? f.key : rule.id))
  const fix = fixKindForRule(rule.id)
  return (
    <Box xcss={ruleCardStyle}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Code>{rule.id}</Code>
          <Lozenge appearance={dimensionAppearance(rule.dimension)}>{rule.dimension}</Lozenge>
          <Badge appearance="primary">{`weight ${rule.weight}`}</Badge>
          {rule.forecasts.map((f) => (
            <Lozenge key={f} appearance={forecastAppearance(f)}>{`${f} forecast`}</Lozenge>
          ))}
        </Inline>
        <Text weight="medium">{rule.description}</Text>
        <Text size="small">
          <Text as="strong">Why it matters: </Text>
          {rule.forecastImpact}
        </Text>
        <Text size="small">
          <Text as="strong">How to fix: </Text>
          {rule.remediation}
        </Text>
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Text size="small" color="color.text.subtle">Inline fix:</Text>
          <Text size="small">{fix ? FIX_LABEL[fix] : 'none, fix it in Jira'}</Text>
          {used.length > 0 ? <Text size="small" color="color.text.subtle">| Settings:</Text> : null}
          {used.map((f) => (
            <Code key={f.key}>{`${f.key} = ${settingValue(config, defaults, f.key)}`}</Code>
          ))}
        </Inline>
      </Stack>
    </Box>
  )
}

/** One rule's documentation in a modal, for the "Docs" buttons on rule cards (the host ignores programmatic tab changes). */
export function RuleDocModal({ ruleId, onClose }: { ruleId: string; onClose: () => void }) {
  const [docs, setDocs] = useState<DocsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    invoke<DocsPayload>('getDocs')
      .then(setDocs)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  const rule = docs?.rules.find((r) => r.id === ruleId)
  return (
    <Modal onClose={onClose} width="large">
      <ModalHeader>
        <ModalTitle>{`Rule: ${ruleId}`}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {error ? <Text color="color.text.danger">{error}</Text> : null}
        {!error && !docs ? <Spinner label="Loading docs" /> : null}
        {docs && rule ? <RuleCard rule={rule} fields={docs.fields} config={docs.config} defaults={docs.defaults} /> : null}
        {docs && !rule ? <Text>Unknown rule.</Text> : null}
        {docs ? (
          <Box paddingBlockStart="space.150">
            <Text size="small" color="color.text.subtle">
              Full reference for every rule in the Docs tab or on <Link href={`${RULES_DOC_URL}#${ruleId}`} openNewTab>GitHub</Link>.
            </Text>
          </Box>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button appearance="subtle" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  )
}

/** In-app documentation: scoring, forecast method and one card per rule. `focusRule` preselects a rule. */
export function DocsPanel({ focusRule, onClearFocus }: { focusRule?: string | null; onClearFocus?: () => void }) {
  const [docs, setDocs] = useState<DocsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(focusRule ?? null)

  useEffect(() => {
    invoke<DocsPayload>('getDocs')
      .then(setDocs)
      .catch((e: unknown) => setError(String(e)))
  }, [])
  useEffect(() => {
    setSelected(focusRule ?? null)
  }, [focusRule])

  if (error) return <Text color="color.text.danger">{error}</Text>
  if (!docs) return <Spinner label="Loading docs" />

  const options = docs.rules.map((r) => ({ label: r.id, value: r.id }))
  const shown = selected ? docs.rules.filter((r) => r.id === selected) : docs.rules
  const pick = (id: string | null) => {
    setSelected(id)
    if (!id && onClearFocus) onClearFocus()
  }

  return (
    <Stack space="space.200">
      <Text color="color.text.subtle">
        Portfolio Readiness checks whether your Jira data is good enough for AI-driven schedule, capacity and scope forecasts, scores it, and shows what to fix first. Same rules, thresholds and formulas as the command line tool. Full reference on{' '}
        <Link href={RULES_DOC_URL} openNewTab>GitHub</Link>.
      </Text>
      <ScoringDocs />
      <ForecastDocs config={docs.config} defaults={docs.defaults} />
      <Section title={`Rules (${docs.rules.length})`}>
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Box xcss={selectStyle}>
            <Select
              placeholder="All rules"
              options={options}
              value={selected ? { label: selected, value: selected } : null}
              isClearable
              isSearchable
              spacing="compact"
              onChange={(opt: unknown) => pick(((opt as { value: string } | null)?.value) ?? null)}
            />
          </Box>
          {selected ? (
            <Button appearance="subtle" onClick={() => pick(null)}>
              Show all rules
            </Button>
          ) : null}
          <Text size="small" color="color.text.subtle">Thresholds shown are the current portfolio settings. Change them in the Settings tab.</Text>
        </Inline>
        <Stack space="space.150">
          {shown.map((r) => (
            <RuleCard key={r.id} rule={r} fields={docs.fields} config={docs.config} defaults={docs.defaults} />
          ))}
        </Stack>
      </Section>
    </Stack>
  )
}
