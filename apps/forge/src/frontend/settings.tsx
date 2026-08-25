import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Code,
  Heading,
  HelperMessage,
  Inline,
  Label,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Textfield,
  Toggle,
  xcss,
} from '@forge/react'
import { invoke } from '@forge/bridge'

interface FieldMeta {
  key: string
  label: string
  help: string
  min: number
  integer: boolean
  default: number
}

interface RuleRow {
  id: string
  dimension: string
  weight: number
  description: string
}

interface Override {
  disabledRules?: string[]
  [key: string]: unknown
}

interface StoredConfig extends Override {
  projects?: Record<string, Override>
  forecast?: { enabled?: boolean; historyWeeks?: number; simulations?: number; seed?: number }
}

interface SettingsPayload {
  config: StoredConfig
  defaults: Record<string, unknown> & { disabledRules: string[]; forecast: { enabled: boolean; historyWeeks: number; simulations: number; seed: number } }
  fields: FieldMeta[]
  forecastFields: FieldMeta[]
  rules: RuleRow[]
  canEdit: boolean
  projects: Array<{ key: string; name: string }>
}

type SaveResult = { ok: true; config: StoredConfig } | { ok: false; error: string }

const fieldStyle = xcss({ minWidth: '280px', flexGrow: 1, maxWidth: '420px' })
const ruleStyle = xcss({ minWidth: '300px', flexGrow: 1, maxWidth: '480px' })
const sectionStyle = xcss({
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'radius.medium',
  padding: 'space.200',
})

const dimensionAppearance = (d: string) => (d === 'completeness' ? 'information' : d === 'freshness' ? 'discovery' : d === 'consistency' ? 'moved' : 'new')

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box xcss={sectionStyle}>
      <Stack space="space.150">
        <Stack space="space.050">
          <Heading as="h3" size="small">{title}</Heading>
          {hint ? <Text size="small" color="color.text.subtle">{hint}</Text> : null}
        </Stack>
        {children}
      </Stack>
    </Box>
  )
}

function NumberField({
  id,
  field,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  id: string
  field: FieldMeta
  value: string
  placeholder?: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  const n = value === '' ? undefined : Number(value)
  const invalid = n !== undefined && (!Number.isFinite(n) || n < field.min || (field.integer && !Number.isInteger(n)))
  return (
    <Box xcss={fieldStyle}>
      <Stack space="space.050">
        <Label labelFor={id}>{field.label}</Label>
        <Textfield
          id={id}
          type="number"
          min={field.min}
          value={value}
          placeholder={placeholder}
          isDisabled={disabled}
          isInvalid={invalid}
          width="medium"
          onChange={(e) => onChange(String(e.target.value ?? ''))}
        />
        <HelperMessage>{invalid ? `Must be ${field.integer ? 'a whole number' : 'a number'} of at least ${field.min}.` : field.help}</HelperMessage>
      </Stack>
    </Box>
  )
}

const asNumber = (v: unknown): string => (typeof v === 'number' ? String(v) : '')

/**
 * Settings form. Without `projectKey` it edits the portfolio config (Jira admins). With it, the project's
 * overrides (project admins): empty fields inherit the portfolio value, and a rule turned off for the whole
 * portfolio cannot be turned back on here.
 */
export function SettingsPanel({ projectKey, onRescan }: { projectKey?: string; onRescan?: () => Promise<void> }) {
  const [data, setData] = useState<SettingsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [disabled, setDisabled] = useState<Set<string>>(new Set())
  const [forecastEnabled, setForecastEnabled] = useState(true)
  const [forecastValues, setForecastValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<'save' | 'rescan' | null>(null)
  const [notice, setNotice] = useState<{ appearance: 'success' | 'error' | 'information'; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  const isProject = Boolean(projectKey)

  const hydrate = (d: SettingsPayload) => {
    const scope: Override = isProject ? (d.config.projects?.[projectKey as string] ?? {}) : d.config
    setValues(Object.fromEntries(d.fields.map((f) => [f.key, isProject ? asNumber(scope[f.key]) : asNumber(scope[f.key] ?? d.defaults[f.key])])))
    setDisabled(new Set(scope.disabledRules ?? []))
    setForecastEnabled(d.config.forecast?.enabled ?? d.defaults.forecast.enabled)
    setForecastValues(
      Object.fromEntries(d.forecastFields.map((f) => [f.key, asNumber((d.config.forecast as Record<string, unknown> | undefined)?.[f.key] ?? (d.defaults.forecast as Record<string, unknown>)[f.key])])),
    )
    setDirty(false)
  }

  useEffect(() => {
    invoke<SettingsPayload>('getSettings', { projectKey })
      .then((d) => {
        setData(d)
        hydrate(d)
      })
      .catch((e: unknown) => setError(String(e)))
  }, [projectKey])

  if (error) return <Text color="color.text.danger">{error}</Text>
  if (!data) return <Spinner label="Loading settings" />

  const canEdit = data.canEdit
  const globalDisabled = new Set(data.config.disabledRules ?? [])
  const touch = () => {
    setDirty(true)
    setNotice(null)
  }
  const setValue = (key: string, v: string) => {
    if ((values[key] ?? '') === v) return
    setValues((s) => ({ ...s, [key]: v }))
    touch()
  }
  const toggleRule = (id: string) => {
    setDisabled((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    touch()
  }

  const parse = (v: string, f: FieldMeta): number | undefined => {
    if (v === '') return undefined
    const n = Number(v)
    if (!Number.isFinite(n) || n < f.min || (f.integer && !Number.isInteger(n))) throw new Error(`${f.label} must be ${f.integer ? 'a whole number' : 'a number'} of at least ${f.min}.`)
    return n
  }

  const buildOverride = (): Override => {
    const out: Override = {}
    for (const f of data.fields) {
      const n = parse(values[f.key] ?? '', f)
      if (n !== undefined) out[f.key] = n
    }
    if (disabled.size > 0) out.disabledRules = [...disabled].sort()
    return out
  }

  const buildConfig = (): StoredConfig => {
    const out: StoredConfig = {}
    for (const f of data.fields) {
      const n = parse(values[f.key] ?? '', f)
      out[f.key] = n ?? f.default
    }
    out.disabledRules = [...disabled].sort()
    const forecast: NonNullable<StoredConfig['forecast']> = { enabled: forecastEnabled }
    for (const f of data.forecastFields) {
      const n = parse(forecastValues[f.key] ?? '', f)
      ;(forecast as Record<string, unknown>)[f.key] = n ?? f.default
    }
    out.forecast = forecast
    return out
  }

  const save = async (rescan: boolean) => {
    setSaving(rescan ? 'rescan' : 'save')
    setNotice(null)
    try {
      const res = isProject
        ? await invoke<SaveResult>('saveProjectSettings', { projectKey, override: buildOverride() })
        : await invoke<SaveResult>('saveSettings', { config: buildConfig() })
      if (!res.ok) {
        setNotice({ appearance: 'error', text: res.error })
        return
      }
      const next = { ...data, config: res.config }
      setData(next)
      hydrate(next)
      if (rescan && onRescan) {
        setNotice({ appearance: 'information', text: 'Saved. Scanning with the new settings.' })
        await onRescan()
        setNotice({ appearance: 'success', text: 'Saved and rescanned.' })
      } else {
        setNotice({ appearance: 'success', text: 'Saved. Scores use the new settings from the next scan.' })
      }
    } catch (e) {
      setNotice({ appearance: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(null)
    }
  }

  const resetForm = () => {
    if (isProject) {
      setValues(Object.fromEntries(data.fields.map((f) => [f.key, ''])))
      setDisabled(new Set())
    } else {
      setValues(Object.fromEntries(data.fields.map((f) => [f.key, String(f.default)])))
      setDisabled(new Set())
      setForecastEnabled(data.defaults.forecast.enabled)
      setForecastValues(Object.fromEntries(data.forecastFields.map((f) => [f.key, String(f.default)])))
    }
    touch()
  }

  const portfolioValue = (key: string): string => asNumber(data.config[key] ?? data.defaults[key])
  const overrideCount = Object.keys(data.config.projects ?? {}).length

  return (
    <Stack space="space.200">
      {!canEdit ? (
        <SectionMessage appearance="information" title="View only">
          <Text>
            {isProject
              ? `Only administrators of ${projectKey} (or Jira administrators) can change these overrides.`
              : 'Only Jira administrators can change portfolio settings. Project administrators can override thresholds on their project page.'}
          </Text>
        </SectionMessage>
      ) : null}
      {notice ? (
        <SectionMessage appearance={notice.appearance}>
          <Text>{notice.text}</Text>
        </SectionMessage>
      ) : null}

      <Section
        title="Thresholds"
        hint={
          isProject
            ? `Leave a field empty to inherit the portfolio value. Overrides apply to ${projectKey} only.`
            : `Portfolio-wide defaults. ${overrideCount > 0 ? `${overrideCount} ${overrideCount === 1 ? 'project overrides' : 'projects override'} some of them on their own page.` : 'Projects can override them on their own page.'}`
        }
      >
        <Inline space="space.200" shouldWrap>
          {data.fields.map((f) => (
            <NumberField
              key={f.key}
              id={`setting-${f.key}`}
              field={f}
              value={values[f.key] ?? ''}
              placeholder={isProject ? `Portfolio: ${portfolioValue(f.key)}` : undefined}
              disabled={!canEdit}
              onChange={(v) => setValue(f.key, v)}
            />
          ))}
        </Inline>
      </Section>

      <Section
        title="Rules"
        hint={
          isProject
            ? 'Turn a rule off for this project only. A rule turned off for the whole portfolio stays off here.'
            : 'A rule turned off is not scored anywhere and never limits a forecast.'
        }
      >
        <Inline space="space.100" shouldWrap>
          {data.rules.map((r) => {
            const lockedOff = isProject && globalDisabled.has(r.id)
            const on = !lockedOff && !disabled.has(r.id)
            return (
              <Box key={r.id} xcss={ruleStyle}>
                <Inline space="space.100" alignBlock="center">
                  <Toggle id={`rule-${r.id}`} label={r.id} isChecked={on} isDisabled={!canEdit || lockedOff} onChange={() => toggleRule(r.id)} />
                  <Stack space="space.0">
                    <Inline space="space.075" alignBlock="center">
                      <Code>{r.id}</Code>
                      <Lozenge appearance={dimensionAppearance(r.dimension)}>{r.dimension}</Lozenge>
                      {lockedOff ? <Lozenge appearance="removed">off for portfolio</Lozenge> : null}
                    </Inline>
                    <Text size="small" color="color.text.subtle">{r.description}</Text>
                  </Stack>
                </Inline>
              </Box>
            )
          })}
        </Inline>
      </Section>

      {!isProject ? (
        <Section title="Delivery forecast" hint="Monte Carlo and critical path settings. Applies to every project.">
          <Stack space="space.150">
            <Inline space="space.100" alignBlock="center">
              <Toggle id="forecast-enabled" label="Delivery forecast" isChecked={forecastEnabled} isDisabled={!canEdit} onChange={() => { setForecastEnabled((v) => !v); touch() }} />
              <Text>{forecastEnabled ? 'Forecast enabled' : 'Forecast disabled: scans skip the Monte Carlo and critical path pass'}</Text>
            </Inline>
            <Inline space="space.200" shouldWrap>
              {data.forecastFields.map((f) => (
                <NumberField
                  key={f.key}
                  id={`forecast-${f.key}`}
                  field={f}
                  value={forecastValues[f.key] ?? ''}
                  disabled={!canEdit || !forecastEnabled}
                  onChange={(v) => {
                    if ((forecastValues[f.key] ?? '') === v) return
                    setForecastValues((s) => ({ ...s, [f.key]: v }))
                    touch()
                  }}
                />
              ))}
            </Inline>
          </Stack>
        </Section>
      ) : null}

      {canEdit ? (
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <LoadingButton appearance="primary" isLoading={saving === 'save'} isDisabled={saving !== null || !dirty} onClick={() => save(false)}>
            Save
          </LoadingButton>
          {onRescan ? (
            <LoadingButton appearance="default" isLoading={saving === 'rescan'} isDisabled={saving !== null || !dirty} onClick={() => save(true)}>
              Save and scan again
            </LoadingButton>
          ) : null}
          <Button appearance="subtle" isDisabled={saving !== null} onClick={resetForm}>
            {isProject ? 'Clear overrides' : 'Reset to defaults'}
          </Button>
          {dirty ? <Text size="small" color="color.text.subtle">Unsaved changes.</Text> : null}
        </Inline>
      ) : null}
    </Stack>
  )
}
