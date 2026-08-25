import React, { useEffect, useState } from 'react'
import {
  Button,
  Code,
  DatePicker,
  ErrorMessage,
  HelperMessage,
  Inline,
  Label,
  LoadingButton,
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
  Textfield,
  UserPicker,
} from '@forge/react'
import { invoke } from '@forge/bridge'
import { RuleCode, type RuleMap, type ViolationRow } from './shared'

export type FixKind = 'estimate' | 'assignee' | 'dueDate' | 'dueDateOrClose' | 'parent' | 'transition' | 'links'

/** Which inline fix each rule offers. Rules absent here (person-level, epic-without-children) are fixed in Jira itself. */
const FIX_KIND: Record<string, FixKind> = {
  'missing-estimate': 'estimate',
  'estimate-outlier': 'estimate',
  'missing-assignee': 'assignee',
  'missing-due-date': 'dueDate',
  'overdue-open': 'dueDateOrClose',
  'missing-parent': 'parent',
  'stale-in-progress': 'transition',
  'stale-open': 'transition',
  'status-resolution-mismatch': 'transition',
  'broken-dependency': 'links',
  'dependency-cycle': 'links',
}

export const FIX_LABEL: Record<FixKind, string> = {
  estimate: 'Set estimate',
  assignee: 'Assign',
  dueDate: 'Set due date',
  dueDateOrClose: 'Reschedule or close',
  parent: 'Set parent',
  transition: 'Change status',
  links: 'Edit links',
}

export const fixKindForRule = (ruleId: string): FixKind | undefined => FIX_KIND[ruleId]

export function fixKindFor(v: ViolationRow): FixKind | undefined {
  if (!v.itemKey) return undefined
  return FIX_KIND[v.ruleId]
}

interface EpicOption {
  key: string
  summary: string
}
interface TransitionOption {
  id: string
  name: string
  to: string
  toCategory: string
}
interface LinkOption {
  id: string
  type: string
  direction: string
  otherKey: string
  otherSummary: string
}
interface FixOptions {
  epics?: EpicOption[]
  transitions?: TransitionOption[]
  links?: LinkOption[]
}

type OptionsResult = { ok: true; options: FixOptions } | { ok: false; error: string }
type FixResult = { ok: true; note: string } | { ok: false; error: string }

interface SelectOption {
  label: string
  value: string
}

const kindsFor = (kind: FixKind): Array<'epics' | 'transitions' | 'links'> =>
  kind === 'parent' ? ['epics'] : kind === 'transition' || kind === 'dueDateOrClose' ? ['transitions'] : kind === 'links' ? ['links'] : []

const today = () => new Date().toISOString().slice(0, 10)

export function FixModal({ violation, kind, rules, onClose, onFixed }: { violation: ViolationRow; kind: FixKind; rules?: RuleMap; onClose: () => void; onFixed: (note: string) => void }) {
  const issueKey = violation.itemKey as string
  const needs = kindsFor(kind)
  const [options, setOptions] = useState<FixOptions | null>(needs.length ? null : {})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [estimate, setEstimate] = useState('')
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState('')
  const [parentKey, setParentKey] = useState('')
  const [transitionId, setTransitionId] = useState('')
  const [mode, setMode] = useState<'date' | 'transition'>('date')
  const [removed, setRemoved] = useState(0)

  const loadOptions = () => {
    if (!needs.length) return
    setOptions(null)
    invoke<OptionsResult>('getFixOptions', { issueKey, projectKey: violation.projectKey, kinds: needs })
      .then((r) => (r.ok ? setOptions(r.options) : setError(r.error)))
      .catch((e: unknown) => setError(String(e)))
  }
  useEffect(loadOptions, [issueKey])

  const run = async (action: Record<string, unknown>, closeAfter = true) => {
    setBusy(true)
    setError(null)
    try {
      const r = await invoke<FixResult>('fixIssue', { issueKey, action })
      if (!r.ok) {
        setError(r.error)
        return false
      }
      if (closeAfter) {
        onFixed(r.note)
        onClose()
      }
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    if (kind === 'estimate') return run({ type: 'setEstimate', value: Number(estimate) })
    if (kind === 'assignee') return run({ type: 'assign', accountId })
    if (kind === 'dueDate' || (kind === 'dueDateOrClose' && mode === 'date')) return run({ type: 'setDueDate', date })
    if (kind === 'parent') return run({ type: 'setParent', parentKey })
    return run({ type: 'transition', transitionId })
  }

  const canSubmit =
    kind === 'estimate'
      ? Number(estimate) > 0
      : kind === 'assignee'
        ? accountId !== ''
        : kind === 'dueDate' || (kind === 'dueDateOrClose' && mode === 'date')
          ? date !== ''
          : kind === 'parent'
            ? parentKey !== ''
            : transitionId !== ''

  const transitionOptions: SelectOption[] = (options?.transitions ?? []).map((t) => ({ label: t.to === t.name ? t.name : `${t.name} (to ${t.to})`, value: t.id }))
  const epicOptions: SelectOption[] = (options?.epics ?? []).map((e) => ({ label: `${e.key} ${e.summary}`, value: e.key }))

  const removeLink = async (link: LinkOption) => {
    const ok = await run({ type: 'deleteLink', linkId: link.id }, false)
    if (ok) {
      setRemoved((n) => n + 1)
      loadOptions()
    }
  }

  const finishLinks = () => {
    if (removed > 0) onFixed(`${removed} ${removed === 1 ? 'link' : 'links'} removed`)
    onClose()
  }

  const body = () => {
    if (options === null && !error) return <Spinner label="Loading options" />
    switch (kind) {
      case 'estimate':
        return (
          <Stack space="space.050">
            <Label labelFor="fix-estimate">Estimate</Label>
            <Textfield id="fix-estimate" type="number" min={0} value={estimate} autoFocus onChange={(e) => setEstimate(String(e.target.value ?? ''))} placeholder="e.g. 5" />
            <HelperMessage>Written to the story points field, or to the original time estimate (hours) when the project tracks time.</HelperMessage>
          </Stack>
        )
      case 'assignee':
        return (
          <Stack space="space.050">
            <UserPicker name="fix-assignee" label="Assignee" placeholder="Search people" onChange={(u) => setAccountId(u?.id ?? '')} />
          </Stack>
        )
      case 'dueDate':
        return (
          <Stack space="space.050">
            <Label labelFor="fix-due">Due date</Label>
            <DatePicker id="fix-due" value={date} minDate={today()} onChange={setDate} placeholder="Pick a date" />
          </Stack>
        )
      case 'dueDateOrClose':
        return (
          <Stack space="space.150">
            <Inline space="space.100">
              <Button appearance={mode === 'date' ? 'primary' : 'default'} onClick={() => setMode('date')}>New due date</Button>
              <Button appearance={mode === 'transition' ? 'primary' : 'default'} onClick={() => setMode('transition')}>Change status</Button>
            </Inline>
            {mode === 'date' ? (
              <Stack space="space.050">
                <Label labelFor="fix-due2">Due date</Label>
                <DatePicker id="fix-due2" value={date} minDate={today()} onChange={setDate} placeholder="Pick a date" />
              </Stack>
            ) : (
              <Stack space="space.050">
                <Label labelFor="fix-transition2">Transition</Label>
                <Select id="fix-transition2" options={transitionOptions} placeholder="Pick a transition" onChange={(o) => setTransitionId(((o as SelectOption | null)?.value) ?? '')} />
              </Stack>
            )}
          </Stack>
        )
      case 'parent':
        return (
          <Stack space="space.050">
            <Label labelFor="fix-parent">Parent epic</Label>
            <Select id="fix-parent" options={epicOptions} placeholder={epicOptions.length ? 'Pick an open epic' : 'No open epics in this project'} isSearchable onChange={(o) => setParentKey(((o as SelectOption | null)?.value) ?? '')} />
            <HelperMessage>{`Open epics in ${violation.projectKey}. Create one in Jira first if none fits.`}</HelperMessage>
          </Stack>
        )
      case 'transition':
        return (
          <Stack space="space.050">
            <Label labelFor="fix-transition">Transition</Label>
            <Select id="fix-transition" options={transitionOptions} placeholder={transitionOptions.length ? 'Pick a transition' : 'No transitions available'} onChange={(o) => setTransitionId(((o as SelectOption | null)?.value) ?? '')} />
            <HelperMessage>Close it if the work is done or abandoned, or move it back to the backlog. Any status change also refreshes the updated date.</HelperMessage>
          </Stack>
        )
      case 'links': {
        const links = options?.links ?? []
        if (links.length === 0) return <Text color="color.text.subtle">No links left on this item.</Text>
        return (
          <Stack space="space.100">
            {links.map((l) => (
              <Inline key={l.id} space="space.100" alignBlock="center" spread="space-between">
                <Inline space="space.075" alignBlock="center" shouldWrap>
                  <Lozenge>{l.direction}</Lozenge>
                  <Text weight="semibold">{l.otherKey}</Text>
                  <Text color="color.text.subtle">{l.otherSummary}</Text>
                </Inline>
                <LoadingButton appearance="danger" spacing="compact" isLoading={busy} onClick={() => removeLink(l)}>
                  Remove
                </LoadingButton>
              </Inline>
            ))}
          </Stack>
        )
      }
      default:
        return null
    }
  }

  return (
    <Modal onClose={onClose} width="medium">
      <ModalHeader>
        <ModalTitle>{`${FIX_LABEL[kind]}: ${issueKey}`}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <RuleCode ruleId={violation.ruleId} rules={rules} />
            <Text color="color.text.subtle">{violation.message}</Text>
          </Inline>
          {body()}
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        </Stack>
      </ModalBody>
      <ModalFooter>
        {kind === 'links' ? (
          <Button appearance="primary" onClick={finishLinks}>
            Done
          </Button>
        ) : (
          <Inline space="space.100">
            <Button appearance="subtle" onClick={onClose}>
              Cancel
            </Button>
            <LoadingButton appearance="primary" isLoading={busy} isDisabled={!canSubmit} onClick={submit}>
              Apply
            </LoadingButton>
          </Inline>
        )}
      </ModalFooter>
    </Modal>
  )
}

/** Compact "fix" button for one finding. The table owns the single dialog, so the page stays small. */
export function FixButton({ violation, onOpen }: { violation: ViolationRow; onOpen: (violation: ViolationRow, kind: FixKind) => void }) {
  const kind = fixKindFor(violation)
  if (!kind) return null
  return (
    <Button appearance="default" spacing="compact" iconBefore="edit" onClick={() => onOpen(violation, kind)}>
      {FIX_LABEL[kind]}
    </Button>
  )
}

export function FixHint() {
  return (
    <Inline space="space.050" alignBlock="center">
      <Code>Fix</Code>
      <Text size="small" color="color.text.subtle">writes to Jira as you. Scan again afterwards to refresh the scores.</Text>
    </Inline>
  )
}
