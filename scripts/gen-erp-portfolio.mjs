#!/usr/bin/env node
/**
 * Generates a synthetic but realistic ERP programme (SAP S/4HANA style rollout) as a
 * portfolio-lint CSV: several workstream projects, thousands of items, epics, dependency
 * chains inside and across projects, and hygiene noise that differs per workstream.
 *
 * Deterministic for a given seed. No dependencies.
 *
 *   node scripts/gen-erp-portfolio.mjs --out examples/erp-portfolio.csv --seed 42 --now 2026-08-24
 */
import { writeFileSync } from 'node:fs'

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : [])).filter((p) => p.length),
)
const SEED = Number(args.seed ?? 42)
const NOW = new Date(args.now ?? '2026-08-24T00:00:00Z')
const OUT = args.out ?? 'examples/erp-portfolio.csv'
const SCALE = Number(args.scale ?? 1)

// ---------- prng ----------
let s = SEED >>> 0
function rnd() {
  s = (s + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const chance = (p) => rnd() < p
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const pickN = (arr, n) => {
  const copy = [...arr]
  const out = []
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0])
  return out
}
const weighted = (pairs) => {
  const total = pairs.reduce((a, [, w]) => a + w, 0)
  let r = rnd() * total
  for (const [v, w] of pairs) {
    r -= w
    if (r <= 0) return v
  }
  return pairs[pairs.length - 1][0]
}

// ---------- dates ----------
const DAY = 86_400_000
const d = (iso) => new Date(iso + 'T00:00:00Z')
const addDays = (date, n) => new Date(date.getTime() + n * DAY)
const iso = (date) => date.toISOString().slice(0, 10)
const isoT = (date) => date.toISOString().slice(0, 19) + 'Z'
const minD = (a, b) => (a < b ? a : b)
const maxD = (a, b) => (a > b ? a : b)
const withTime = (date) => addDays(date, rnd() * 0.6 + 0.3) // working hours-ish

// ---------- programme calendar (SAP Activate) ----------
const PHASES = {
  explore: { start: d('2025-12-01'), end: d('2026-02-27') },
  realize: { start: d('2026-02-16'), end: d('2026-08-14') },
  sit: { start: d('2026-07-06'), end: d('2026-09-25') },
  uat: { start: d('2026-09-28'), end: d('2026-10-23') },
  cutover: { start: d('2026-10-17'), end: d('2026-11-02') },
  hypercare: { start: d('2026-11-02'), end: d('2026-12-18') },
  training: { start: d('2026-09-01'), end: d('2026-10-30') },
  wave2: { start: d('2027-03-01'), end: d('2027-06-30') },
}
const PROCESSES = ['Record-to-Report', 'Procure-to-Pay', 'Order-to-Cash', 'Plan-to-Produce', 'Acquire-to-Retire', 'Hire-to-Retire']

// ---------- people ----------
const FIRST = ['Ana', 'Bruno', 'Camila', 'Diego', 'Elena', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karen', 'Lucas', 'Mariana', 'Nikhil', 'Olivia', 'Priya', 'Rafael', 'Sarah', 'Tomás', 'Vanessa', 'Wei', 'Yasmin', 'Aarav', 'Beatriz', 'Chloé', 'Daniel', 'Émilie', 'Fatima', 'Gustavo', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura', 'Marcus', 'Nadia', 'Omar', 'Paula', 'Quentin', 'Renata', 'Samuel', 'Tânia', 'Ulrich', 'Victor', 'Wendy', 'Xavier', 'Yuki', 'Zoe']
const LAST = ['Souza', 'Martins', 'Oliveira', 'Costa', 'Pereira', 'Lima', 'Sharma', 'Patel', 'Tremblay', 'Gagnon', 'Roy', 'Lavoie', 'Müller', 'Schmidt', 'Nguyen', 'Chen', 'Kim', 'Singh', 'Ferreira', 'Almeida', 'Rocha', 'Carvalho', 'Bouchard', 'Côté', 'Fischer', 'Weber', 'Iyer', 'Reddy', 'Wilson', 'Taylor', 'Campbell', 'Morrison']
const peopleUsed = new Set()
function person(role) {
  let name
  do name = `${pick(FIRST)} ${pick(LAST)}`
  while (peopleUsed.has(name))
  peopleUsed.add(name)
  const id = 'u-' + name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.')
  return { id, name, role }
}
// shared programme people
const SHARED = {
  pmo: person('PMO'),
  intArch: person('Integration architect'),
  dataLead: person('Data migration lead'),
  testLead: person('Test manager'),
  basis: person('Basis/BTP'),
}

// ---------- workstream vocab ----------
const WS = [
  {
    key: 'ERPFIN',
    name: 'Aurora ERP: Finance & Controlling',
    profile: 'good',
    team: 11,
    modules: [
      { code: 'FI-GL', objects: ['chart of accounts VETRA', 'company code 1000 (Vetra Canada)', 'company code 2000 (Vetra US)', 'document splitting', 'GST/HST tax codes', 'QST tax procedure for Quebec', 'fiscal year variant and posting periods', 'parallel ledgers (IFRS, local GAAP)', 'intercompany elimination', 'period-end closing cockpit', 'recurring entries and accruals', 'foreign currency valuation'] },
      { code: 'FI-AP', objects: ['vendor Business Partner roles', 'payment terms and cash discount', 'automatic payment program F110', 'ISO 20022 pain.001 payment file', 'invoice verification tolerances', 'three-way match blocking', 'down payment process', 'withholding tax (T4A/NR4)'] },
      { code: 'FI-AR', objects: ['customer Business Partner roles', 'dunning procedure', 'lockbox and CAMT.053 statement import', 'credit management (FSCM) limits', 'cash application rules', 'customer statements', 'bad debt provisioning'] },
      { code: 'FI-AA', objects: ['asset classes and depreciation keys', 'CCA classes for Canadian tax', 'asset under construction settlement', 'asset transfer from legacy JDE', 'depreciation run AFAB', 'impairment posting'] },
      { code: 'CO-PC', objects: ['cost center standard hierarchy', 'activity types and rates', 'costing variant PPC1', 'material ledger actual costing', 'WIP calculation and settlement', 'variance analysis for production orders', 'overhead costing sheet'] },
      { code: 'CO-PA', objects: ['profitability characteristics', 'account-based CO-PA activation', 'profit center structure', 'internal orders for capex', 'plan/actual reporting', 'top-down distribution'] },
      { code: 'TR', objects: ['house banks RBC and TD', 'bank account management', 'cash position and liquidity forecast', 'bank communication management', 'in-house cash for intercompany'] },
    ],
  },
  {
    key: 'ERPSCM',
    name: 'Aurora ERP: Supply Chain & Sales',
    profile: 'chaotic',
    team: 14,
    modules: [
      { code: 'MM-PUR', objects: ['purchasing org 1000 and groups', 'release strategy for POs above 50k CAD', 'source list and quota arrangement', 'contracts and scheduling agreements', 'purchase requisition workflow', 'vendor evaluation', 'consignment stock process', 'subcontracting with components', 'Ariba supplier network readiness'] },
      { code: 'MM-IM', objects: ['storage locations for Guelph plant', 'movement types and reasons', 'physical inventory cycle counting', 'batch management and shelf life', 'STO between plants 1100 and 1200', 'goods receipt with inbound delivery', 'stock in transit valuation'] },
      { code: 'EWM', objects: ['warehouse structure Mississauga DC', 'handling unit management', 'pick/pack/ship strategies', 'putaway rules for hazardous goods', 'RF device screens', 'wave management', 'carrier labels (Purolator, FedEx)'] },
      { code: 'SD', objects: ['sales org and distribution channels', 'pricing procedure ZVAA01', 'condition types for customer rebates', 'ATP check with backorder processing', 'output determination for delivery notes', 'returns and credit memo process', 'intercompany sales US to Canada', 'customer hierarchy', 'export documents for US border (Livingston)', 'revenue recognition for service contracts'] },
      { code: 'MRP', objects: ['MRP types and lot sizing', 'MRP areas per storage location', 'safety stock and reorder points', 'planning calendar', 'MRP Live cockpit', 'demand management PIRs'] },
    ],
  },
  {
    key: 'ERPMFG',
    name: 'Aurora ERP: Manufacturing & Quality',
    profile: 'medium',
    team: 10,
    modules: [
      { code: 'PP', objects: ['material master MRP and work scheduling views', 'BOM for pump assembly family', 'routings and work centers Guelph line 2', 'capacity planning profiles', 'production order type ZP01', 'backflush and confirmation', 'rework order process', 'scrap reporting', 'kanban replenishment', 'variant configuration for pump models', 'serial number profiles', 'MES Ignition confirmation interface readiness'] },
      { code: 'QM', objects: ['inspection plans for incoming goods', 'quality notifications Q1/Q2', 'usage decision and stock posting', 'certificates of analysis', 'sampling procedures', 'calibration inspection'] },
      { code: 'PM', objects: ['equipment hierarchy and functional locations', 'maintenance plans for CNC fleet', 'preventive maintenance strategy', 'work order types and priorities', 'spare parts BOMs', 'breakdown notification process'] },
      { code: 'PP-SFC', objects: ['shop floor papers', 'operator dashboards', 'labor confirmation via barcode', 'downtime reason codes', 'OEE reporting feed'] },
    ],
  },
  {
    key: 'ERPHCM',
    name: 'Aurora ERP: HR & Payroll (SuccessFactors)',
    profile: 'medium',
    team: 8,
    modules: [
      { code: 'EC', objects: ['org structure and positions', 'Employee Central to S/4 replication', 'position management', 'manager self-service approvals', 'recruiting to onboarding flow', 'compensation planning', 'benefits enrollment', 'learning compliance training'] },
      { code: 'PY-CA', objects: ['Canadian payroll schema', 'Ontario ESA vacation accrual', 'Quebec payroll (RL-1, QPP)', 'union pay scales (Unifor Local 88)', 'garnishments', 'year-end T4 and ROE', 'time and attendance via Kronos', 'retroactive pay'] },
    ],
  },
  {
    key: 'ERPINT',
    name: 'Aurora ERP: Integrations & Platform',
    profile: 'brokenDeps',
    team: 9,
    modules: [
      { code: 'EDI', objects: ['EDI 850 inbound purchase orders (OpenText)', 'EDI 855 order acknowledgement', 'EDI 856 ASN outbound', 'EDI 810 invoices to top 20 customers', 'EDI 940/945 with 3PL (DHL)', 'partner profile onboarding'] },
      { code: 'BTP', objects: ['Integration Suite tenant setup', 'API management policies', 'Cloud Connector to on-prem MES', 'monitoring and alerting (AIF)', 'error handling and reprocessing', 'SSO with Entra ID'] },
      { code: 'IF', objects: ['Salesforce opportunity to quote', 'MES Ignition production confirmations', 'Kronos time export to payroll', 'Concur expenses to FI', 'Shopify B2B orders to SD', 'RBC/TD bank statements CAMT.053', 'CRA tax rate service', 'Power BI extraction via CDS/OData', 'legacy JDE coexistence bridge', 'customs broker Livingston export docs', 'carrier rating service', 'Ariba PO and invoice flows'] },
    ],
  },
  {
    key: 'ERPMIG',
    name: 'Aurora ERP: Data Migration & Cutover',
    profile: 'overdue',
    team: 9,
    modules: [
      { code: 'MD', objects: ['customer master to Business Partner', 'vendor master to Business Partner', 'material master', 'BOMs', 'routings', 'pricing conditions', 'cost centers and profit centers', 'bank master', 'equipment and functional locations', 'employee master'] },
      { code: 'TD', objects: ['open purchase orders', 'open sales orders', 'GL balances', 'open AP items', 'open AR items', 'fixed assets', 'inventory balances', 'open production orders'] },
    ],
  },
  {
    key: 'ERPBI',
    name: 'Aurora ERP: Reporting & Analytics',
    profile: 'good',
    team: 6,
    modules: [
      { code: 'RPT', objects: ['AR aging report', 'inventory valuation report', 'OEE dashboard', 'gross margin by product line', '13-week cash forecast', 'supplier OTIF scorecard', 'production variance report', 'headcount and overtime report', 'open PO commitment report', 'tax reconciliation GST/HST'] },
      { code: 'DM', objects: ['CDS views for finance', 'CDS views for logistics', 'Fiori launchpad catalogs', 'embedded analytics tiles', 'SAC data model', 'Power BI semantic model'] },
    ],
  },
  {
    key: 'ERPPMO',
    name: 'Aurora ERP: PMO, Change & Training',
    profile: 'ops',
    team: 6,
    modules: [
      { code: 'PMO', objects: ['steering committee pack', 'risk register review', 'RAID log update', 'budget re-forecast', 'vendor invoice review (Kepler Consulting)', 'go/no-go criteria', 'SOX ITGC audit prep', 'cutover weekend logistics', 'hypercare staffing plan', 'benefits realisation tracker'] },
      { code: 'OCM', objects: ['change impact assessment Finance', 'change impact assessment Plants', 'super user network', 'communication plan', 'training curriculum', 'end-user training Guelph', 'end-user training Mississauga', 'training environment refresh', 'readiness survey', 'leadership alignment sessions'] },
    ],
  },
]

const PROFILES = {
  good: { onTrack: 0.93, missingEstimate: 0.05, unassignedWip: 0.03, epicNoDue: 0.05, orphan: 0.02, emptyEpic: 1, staleWip: 0.08, staleOpen: 0.1, wipHeavy: 1, outliers: 1, mismatch: 0.01, dueRate: 0.75, dangling: 0.005 },
  medium: { onTrack: 0.85, missingEstimate: 0.14, unassignedWip: 0.08, epicNoDue: 0.15, orphan: 0.06, emptyEpic: 2, staleWip: 0.18, staleOpen: 0.25, wipHeavy: 2, outliers: 2, mismatch: 0.02, dueRate: 0.6, dangling: 0.01 },
  chaotic: { onTrack: 0.72, missingEstimate: 0.28, unassignedWip: 0.15, epicNoDue: 0.3, orphan: 0.12, emptyEpic: 3, staleWip: 0.3, staleOpen: 0.4, wipHeavy: 4, outliers: 3, mismatch: 0.04, dueRate: 0.5, dangling: 0.02 },
  brokenDeps: { onTrack: 0.8, missingEstimate: 0.12, unassignedWip: 0.06, epicNoDue: 0.1, orphan: 0.05, emptyEpic: 1, staleWip: 0.15, staleOpen: 0.2, wipHeavy: 2, outliers: 2, mismatch: 0.02, dueRate: 0.7, dangling: 0.03 },
  overdue: { onTrack: 0.62, missingEstimate: 0.1, unassignedWip: 0.05, epicNoDue: 0.1, orphan: 0.04, emptyEpic: 1, staleWip: 0.12, staleOpen: 0.15, wipHeavy: 3, outliers: 1, mismatch: 0.02, dueRate: 0.9, dangling: 0.01 },
  ops: { onTrack: 0.8, missingEstimate: 0.6, unassignedWip: 0.1, epicNoDue: 0.5, orphan: 0.55, emptyEpic: 2, staleWip: 0.2, staleOpen: 0.35, wipHeavy: 1, outliers: 0, mismatch: 0.02, dueRate: 0.4, dangling: 0 },
}

const DEFECTS = ['pricing condition not applied on returns', 'GST rounding differs from JDE by 0.01', 'goods receipt posts to wrong valuation class', 'ATP confirms quantity beyond safety stock', 'payment run selects blocked invoices', 'depreciation run skips assets acquired mid-month', 'inbound ASN creates duplicate handling units', 'confirmation from MES fails for rework orders', 'RL-1 box 14 miscalculated for Quebec employees', 'dunning letter uses wrong language for Quebec customers', 'IDoc status 51 on customer master replication', 'batch determination ignores shelf life', 'credit check blocks intercompany orders', 'cost center hierarchy missing plant 1200 nodes', 'Fiori tile shows stale inventory figures', 'EDI 856 missing pallet level', 'bank statement posts to suspense account', 'MRP creates planned orders in closed periods', 'usage decision does not release stock', 'variant configuration price not recalculated']
const WRICEF = ['Report', 'Interface', 'Conversion', 'Enhancement', 'Form', 'Workflow']

// ---------- generation ----------
const VARIANTS = ['plant 1100 Guelph', 'plant 1200 Mississauga', 'company code 2000 (US)', 'sales org 2000', 'cycle 2 rework']
/** Above scale 1, objects are repeated per plant/company code, which is how multi-site ERP scope really grows. */
function scaled(objs) {
  const target = Math.max(3, Math.round(objs.length * SCALE))
  if (target <= objs.length) return pickN(objs, target)
  const out = [...objs]
  let v = 0
  while (out.length < target) {
    out.push(`${objs[(out.length - objs.length) % objs.length]} for ${VARIANTS[v % VARIANTS.length]}`)
    if ((out.length - objs.length) % objs.length === 0) v++
  }
  return out
}
const allItems = [] // {project, key, ...}
const byProject = new Map()
const configIndex = new Map() // module code -> configure item keys (for cross deps)
const loadIndex = [] // MIG mock-load keys
let danglingCounter = 9000

function newProject(ws) {
  const p = { ...ws, items: [], people: [], seq: 0, prof: PROFILES[ws.profile] }
  for (let i = 0; i < ws.team; i++) p.people.push(person('Consultant'))
  p.people.push(SHARED.pmo)
  if (ws.key === 'ERPINT') p.people.push(SHARED.intArch, SHARED.basis)
  if (ws.key === 'ERPMIG') p.people.push(SHARED.dataLead)
  if (['ERPFIN', 'ERPSCM', 'ERPMFG'].includes(ws.key)) p.people.push(SHARED.testLead)
  // heavy people get more work (natural overallocation)
  p.heavy = pickN(p.people, p.prof.wipHeavy)
  byProject.set(ws.key, p)
  return p
}

function assignee(p, status) {
  if (status === 'in_progress' && chance(p.prof.unassignedWip)) return undefined
  if (status === 'todo' && chance(0.55)) return undefined
  if (status === 'done' && chance(0.04)) return undefined
  return chance(0.35) && p.heavy.length ? pick(p.heavy) : pick(p.people)
}

function estimate(p, item) {
  if (item.type === 'epic') return undefined
  if (item.statusCategory !== 'done' && chance(p.prof.missingEstimate)) return undefined
  if (item.statusCategory === 'done' && chance(0.03)) return undefined
  return weighted([[1, 8], [2, 14], [3, 20], [5, 22], [8, 16], [13, 8]])
}

/** Decide status from planned window vs NOW, applying the workstream's schedule adherence. */
function statusFor(p, start, end) {
  if (end <= addDays(NOW, -7)) return chance(p.prof.onTrack) ? 'done' : chance(0.6) ? 'in_progress' : 'todo'
  if (start <= NOW) return weighted([['in_progress', 55], ['done', 15], ['todo', 30]])
  return chance(0.03) ? 'in_progress' : 'todo'
}

function timestamps(p, item, start, end, epicCreated) {
  const created = withTime(maxD(epicCreated, minD(addDays(start, -between(0, 30)), NOW)))
  let updated
  let resolved
  if (item.statusCategory === 'done') {
    resolved = withTime(minD(maxD(addDays(end, between(-5, 10)), addDays(created, 1)), NOW))
    updated = addDays(resolved, rnd() * 2)
    if (chance(p.prof.mismatch)) resolved = undefined // done without resolution date
  } else if (item.statusCategory === 'in_progress') {
    const gap = chance(p.prof.staleWip) ? between(15, 70) : between(0, 12)
    updated = maxD(withTime(addDays(NOW, -gap)), created)
    if (chance(p.prof.mismatch / 2)) resolved = withTime(addDays(updated, -3)) // reopened without clearing resolution
  } else {
    const gap = chance(p.prof.staleOpen) ? between(91, 240) : between(0, 85)
    updated = maxD(withTime(addDays(NOW, -gap)), created)
    if (chance(p.prof.mismatch / 2)) resolved = withTime(addDays(updated, -1))
  }
  if (updated > NOW) updated = NOW
  return { created, updated, resolved }
}

function nextKey(p) {
  p.seq += 1
  return `${p.key}-${p.seq}`
}

function addItem(p, partial) {
  const item = { project: p.key, key: nextKey(p), dependsOn: [], labels: [], ...partial }
  p.items.push(item)
  allItems.push(item)
  return item
}

function addEpic(p, title, phase, labels, opts = {}) {
  const win = PHASES[phase]
  const start = addDays(win.start, between(-5, 10))
  const end = addDays(win.end, between(-7, 14))
  const created = withTime(addDays(win.start, -between(20, 45)))
  const open = end > NOW || chance(0.25)
  const statusCategory = opts.placeholder ? 'todo' : open ? (start <= NOW ? 'in_progress' : 'todo') : 'done'
  const epic = addItem(p, {
    title,
    type: 'epic',
    statusCategory,
    status: statusName(statusCategory),
    createdAt: isoT(created),
    updatedAt: isoT(statusCategory === 'done' ? addDays(end, 2) : opts.placeholder ? created : addDays(NOW, -between(0, 20))),
    resolvedAt: statusCategory === 'done' ? isoT(addDays(end, 2)) : undefined,
    dueDate: chance(p.prof.epicNoDue) || opts.placeholder ? undefined : iso(end),
    startDate: iso(start),
    labels,
    assigneeId: chance(0.8) ? pick(p.people).id : undefined,
  })
  epic._win = { start, end, created }
  return epic
}

function statusName(cat) {
  if (cat === 'done') return pick(['Done', 'Closed'])
  if (cat === 'in_progress') return pick(['In Progress', 'In Progress', 'In Review', 'Blocked'])
  return pick(['To Do', 'To Do', 'Backlog', 'Ready'])
}

/** Adds a non-epic item under an epic inside a slice of the epic's window. */
function addChild(p, epic, title, type, frac, labels, opts = {}) {
  const win = epic._win
  const span = win.end.getTime() - win.start.getTime()
  const start = new Date(win.start.getTime() + span * Math.max(0, frac - 0.08 + rnd() * 0.05))
  const end = new Date(win.start.getTime() + span * Math.min(1, frac + 0.12 + rnd() * 0.08))
  const statusCategory = opts.status ?? statusFor(p, start, end)
  const item = { title, type, statusCategory, status: statusName(statusCategory), labels: [...labels] }
  const ts = timestamps(p, item, start, end, win.created)
  item.createdAt = isoT(ts.created)
  item.updatedAt = isoT(ts.updated)
  if (ts.resolved) item.resolvedAt = isoT(ts.resolved)
  item.parentKey = chance(p.prof.orphan) ? undefined : epic.key
  const a = assignee(p, statusCategory)
  if (a) item.assigneeId = a.id
  const est = estimate(p, item)
  if (est !== undefined) item.estimate = est
  if (chance(p.prof.dueRate)) item.dueDate = iso(end)
  if (chance(0.3)) item.startDate = iso(start)
  return addItem(p, item)
}

function dep(item, other) {
  if (!other || other.key === item.key) return
  if (!item.dependsOn.includes(other.key)) item.dependsOn.push(other.key)
}

function danglingDep(p, item) {
  if (chance(p.prof.dangling)) item.dependsOn.push(`${p.key}-${danglingCounter++}`)
}

// --- module workstreams (FIN, SCM, MFG, HCM) share the same shape ---
function buildModuleWorkstream(ws) {
  const p = newProject(ws)
  for (const m of ws.modules) {
    const L = [m.code.toLowerCase(), 'wave1']
    const useObjs = scaled(m.objects)

    // Explore
    const ex = addEpic(p, `${m.code}: fit-gap and process design`, 'explore', [...L, 'explore'])
    const proc = pick(PROCESSES)
    useObjs.forEach((o, i) => {
      const w = addChild(p, ex, `Fit-gap workshop: ${o}`, 'task', i / useObjs.length, [...L, 'explore'])
      if (chance(0.5)) {
        const doc = addChild(p, ex, `Process design document: ${o}`, 'story', i / useObjs.length + 0.1, [...L, 'explore'])
        dep(doc, w)
      }
    })
    addChild(p, ex, `Decision log and sign-off: ${m.code} design (${proc})`, 'task', 0.95, [...L, 'explore'])

    // Realize: configuration + unit tests
    const re = addEpic(p, `${m.code}: configuration and unit test`, 'realize', [...L, 'realize'])
    const cfgKeys = []
    useObjs.forEach((o, i) => {
      const f = i / useObjs.length
      const cfg = addChild(p, re, `Configure ${o}`, 'story', f, [...L, 'realize', 'config'])
      cfgKeys.push(cfg)
      const ut = addChild(p, re, `Unit test: ${o}`, 'task', f + 0.15, [...L, 'realize'])
      dep(ut, cfg)
      danglingDep(p, ut)
      if (chance(0.35)) {
        const fs = addChild(p, re, `Functional spec: ${o}`, 'task', f - 0.05, [...L, 'realize'])
        dep(cfg, fs)
      }
      if (chance(0.25)) {
        const role = addChild(p, re, `Authorization role for ${o}`, 'task', f + 0.2, [...L, 'realize', 'security'])
        dep(role, cfg)
      }
    })
    configIndex.set(m.code, cfgKeys)

    // WRICEF developments
    const wr = addEpic(p, `${m.code}: developments (WRICEF)`, 'realize', [...L, 'wricef'])
    const nDev = Math.round(between(3, 6) * SCALE)
    for (let i = 0; i < nDev; i++) {
      const t = pick(WRICEF)
      const o = pick(useObjs)
      const f = i / nDev
      const fs = addChild(p, wr, `Functional spec ${t}: ${o}`, 'task', f, [...L, 'wricef'])
      const ts = addChild(p, wr, `Technical spec ${t}: ${o}`, 'task', f + 0.08, [...L, 'wricef'])
      const build = addChild(p, wr, `Build ${t}: ${o}`, 'story', f + 0.18, [...L, 'wricef'])
      const ut = addChild(p, wr, `Unit test ${t}: ${o}`, 'task', f + 0.3, [...L, 'wricef'])
      dep(ts, fs)
      dep(build, ts)
      dep(ut, build)
      dep(build, pick(cfgKeys))
      if (p.prof.outliers > 0 && chance(0.06)) build.estimate = pick([40, 60, 100]) // hours typed into a points field
    }

    // SIT
    const sit = addEpic(p, `${m.code}: SIT cycles 1 and 2`, 'sit', [...L, 'sit'])
    const sitProcs = pickN(PROCESSES, 3)
    const sit1 = []
    sitProcs.forEach((pr, i) => {
      const scen = Math.round(between(2, 4) * SCALE)
      for (let k = 1; k <= scen; k++) {
        const s1 = addChild(p, sit, `SIT-1 ${pr} scenario ${k} (${m.code})`, 'task', 0.05 + i * 0.1, [...L, 'sit'])
        pickN(cfgKeys, between(1, 3)).forEach((c) => dep(s1, c))
        sit1.push(s1)
        const s2 = addChild(p, sit, `SIT-2 ${pr} scenario ${k} (${m.code})`, 'task', 0.55 + i * 0.1, [...L, 'sit'])
        dep(s2, s1)
        if (chance(0.5)) {
          const bug = addChild(p, sit, `Defect: ${pick(DEFECTS)} (${m.code})`, 'bug', 0.3 + i * 0.1, [...L, 'sit', 'defect'])
          dep(s2, bug)
          danglingDep(p, bug)
        }
      }
    })
    p._sit1 = [...(p._sit1 ?? []), ...sit1]
    configIndex.set(m.code + ':sit', sit1)
  }

  // UAT per process
  const uat = addEpic(p, `${ws.key.slice(3)}: UAT and key user sign-off`, 'uat', ['uat', 'wave1'])
  for (const pr of PROCESSES) {
    for (let k = 1; k <= 2; k++) {
      const u = addChild(p, uat, `UAT script ${pr} ${k}`, 'task', 0.1 + k * 0.2, ['uat', 'wave1'])
      pickN(p._sit1 ?? [], between(1, 2)).forEach((s) => dep(u, s))
    }
  }
  addChild(p, uat, 'Key user sign-off and exit criteria review', 'task', 0.95, ['uat', 'wave1'])

  // Training and hypercare
  const hc = addEpic(p, `${ws.key.slice(3)}: cutover readiness and hypercare`, 'hypercare', ['hypercare', 'wave1'])
  ;['runbook', 'hypercare rota', 'known issues list', 'ticket triage process', 'week 1 daily stand-up', 'exit criteria'].forEach((t, i) =>
    addChild(p, hc, `Hypercare ${t} (${ws.key.slice(3)})`, 'task', i / 6, ['hypercare', 'wave1']),
  )
  ;['end-user training materials', 'train-the-trainer sessions', 'classroom sessions plants'].forEach((t, i) =>
    addChild(p, hc, `${t} (${ws.key.slice(3)})`, 'task', 0.1 + i * 0.2, ['training', 'wave1']),
  )

  // Wave 2 placeholders
  const w2 = ['Wave 2: Brazil localization (NF-e, SPED)', 'Wave 2: Mexico plant rollout', 'Wave 2: Advanced ATP', 'Wave 2: Central Finance for group reporting', 'Wave 2: Predictive MRP']
  pickN(w2, p.prof.emptyEpic).forEach((t) => addEpic(p, t, 'wave2', ['wave2'], { placeholder: true }))
  return p
}

function buildIntegrations(ws) {
  const p = newProject(ws)
  const moduleCodes = [...configIndex.keys()].filter((k) => !k.includes(':'))
  for (const m of ws.modules) {
    const L = [m.code.toLowerCase(), 'wave1']
    const design = addEpic(p, `${m.code}: interface design and mapping`, 'explore', [...L, 'explore'])
    const build = addEpic(p, `${m.code}: build and connectivity`, 'realize', [...L, 'realize'])
    const test = addEpic(p, `${m.code}: interface testing`, 'sit', [...L, 'sit'])
    const objsI = scaled(m.objects)
    objsI.forEach((o, i) => {
      const f = i / objsI.length
      const spec = addChild(p, design, `Interface spec: ${o}`, 'task', f, [...L, 'explore'])
      const map = addChild(p, design, `Field mapping: ${o}`, 'task', f + 0.1, [...L, 'explore'])
      dep(map, spec)
      const dev = addChild(p, build, `Develop iFlow: ${o}`, 'story', f, [...L, 'realize'])
      const conn = addChild(p, build, `Connectivity and certificates: ${o}`, 'task', f - 0.05, [...L, 'realize'])
      const ut = addChild(p, build, `Unit test iFlow: ${o}`, 'task', f + 0.15, [...L, 'realize'])
      dep(dev, map)
      dep(dev, conn)
      dep(ut, dev)
      // cross-project: depends on a module configuration item (lives in another project)
      const cfg = pick(configIndex.get(pick(moduleCodes)) ?? [])
      if (cfg) dep(dev, cfg)
      danglingDep(p, dev)
      const e2e = addChild(p, test, `End-to-end test: ${o}`, 'task', f, [...L, 'sit'])
      dep(e2e, ut)
      const vol = addChild(p, test, `Volume and error handling test: ${o}`, 'task', f + 0.3, [...L, 'sit'])
      dep(vol, e2e)
      if (chance(0.4)) {
        const bug = addChild(p, test, `Defect: ${o} ${pick(['times out above 5k records', 'drops decimals in amounts', 'duplicate messages on retry', 'wrong partner profile', 'missing mandatory segment'])}`, 'bug', f + 0.2, [...L, 'sit', 'defect'])
        dep(vol, bug)
      }
      if (i % 3 === 0) {
        const build2 = addChild(p, build, `Build ${pick(WRICEF)}: ${o} extension`, 'story', f + 0.1, [...L, 'wricef'])
        dep(build2, dev)
        if (chance(0.15)) build2.estimate = pick([40, 80])
      }
    })
  }
  const cut = addEpic(p, 'INT: cutover and go-live support', 'cutover', ['cutover', 'wave1'])
  ;['freeze interface changes', 'switch EDI partners to S/4 endpoints', 'reprocess queued IDocs', 'go-live monitoring room', 'rollback plan for bank interface'].forEach((t, i) =>
    addChild(p, cut, `Cutover: ${t}`, 'task', i / 5, ['cutover', 'wave1']),
  )
  pickN(['Wave 2: Brazil NF-e integration', 'Wave 2: Mexico CFDI'], p.prof.emptyEpic).forEach((t) => addEpic(p, t, 'wave2', ['wave2'], { placeholder: true }))
  return p
}

function buildMigration(ws) {
  const p = newProject(ws)
  const mdCfg = { 'customer master to Business Partner': 'FI-AR', 'vendor master to Business Partner': 'FI-AP', 'material master': 'PP', BOMs: 'PP', routings: 'PP', 'pricing conditions': 'SD', 'cost centers and profit centers': 'CO-PC', 'bank master': 'TR', 'equipment and functional locations': 'PM', 'employee master': 'EC', 'open purchase orders': 'MM-PUR', 'open sales orders': 'SD', 'GL balances': 'FI-GL', 'open AP items': 'FI-AP', 'open AR items': 'FI-AR', 'fixed assets': 'FI-AA', 'inventory balances': 'MM-IM', 'open production orders': 'PP' }
  for (const m of ws.modules) {
    const L = [m.code.toLowerCase(), 'wave1']
    const prep = addEpic(p, `${m.code}: extract, cleanse and map`, 'realize', [...L, 'realize'])
    const mocks = [1, 2, 3].map((n) => addEpic(p, `${m.code}: mock load ${n}`, n === 3 ? 'sit' : 'realize', [...L, `mock${n}`]))
    const final = addEpic(p, `${m.code}: final load and cutover`, 'cutover', [...L, 'cutover'])
    const objsM = scaled(m.objects)
    objsM.forEach((o, i) => {
      const f = i / objsM.length
      const ext = addChild(p, prep, `Extract ${o} from JDE`, 'task', f * 0.5, [...L, 'realize'])
      const cln = addChild(p, prep, `Cleanse ${o} (dedupe, mandatory fields)`, 'story', f * 0.5 + 0.2, [...L, 'realize'])
      const map = addChild(p, prep, `Map ${o} to S/4 structure`, 'task', f * 0.5 + 0.3, [...L, 'realize'])
      const tmpl = addChild(p, prep, `Build migration cockpit template: ${o}`, 'task', f * 0.5 + 0.4, [...L, 'realize'])
      dep(cln, ext)
      dep(map, ext)
      dep(tmpl, map)
      const cfg = pick(configIndex.get(mdCfg[o] ?? 'FI-GL') ?? [])
      if (cfg) dep(map, cfg) // cross-project
      let prev = tmpl
      mocks.forEach((mk, n) => {
        const load = addChild(p, mk, `Mock load ${n + 1}: ${o}`, 'task', f, [...L, `mock${n + 1}`])
        const rec = addChild(p, mk, `Reconcile mock ${n + 1}: ${o} counts and values`, 'task', f + 0.3, [...L, `mock${n + 1}`])
        dep(load, prev)
        dep(load, cln)
        dep(rec, load)
        if (chance(0.3)) {
          const bug = addChild(p, mk, `Defect: ${o} ${pick(['rejected by mandatory field check', 'wrong currency on 12% of records', 'duplicate keys after dedupe', 'unit of measure mismatch', 'tax jurisdiction blank'])}`, 'bug', f + 0.2, [...L, 'defect'])
          dep(rec, bug)
        }
        prev = rec
        if (n === 2) loadIndex.push(rec)
      })
      const fl = addChild(p, final, `Final load: ${o}`, 'task', f, [...L, 'cutover'])
      const so = addChild(p, final, `Business sign-off: ${o} data quality`, 'task', f + 0.4, [...L, 'cutover'])
      dep(fl, prev)
      dep(so, fl)
      danglingDep(p, fl)
    })
  }
  const run = addEpic(p, 'Cutover runbook and rehearsals', 'cutover', ['cutover', 'wave1'])
  ;['freeze JDE transactions', 'dress rehearsal 1', 'dress rehearsal 2', 'final go/no-go checkpoint', 'switch users to S/4', 'legacy read-only mode', 'post-load reconciliation sign-off'].forEach((t, i) => {
    const c = addChild(p, run, `Cutover: ${t}`, 'task', i / 7, ['cutover', 'wave1'])
    if (i > 0) dep(c, p.items[p.items.length - 2])
  })
  pickN(['Wave 2: Brazil legal entities data migration'], p.prof.emptyEpic).forEach((t) => addEpic(p, t, 'wave2', ['wave2'], { placeholder: true }))
  return p
}

function buildBI(ws) {
  const p = newProject(ws)
  for (const m of ws.modules) {
    const L = [m.code.toLowerCase(), 'wave1']
    const design = addEpic(p, `${m.code}: requirements and data model`, 'explore', [...L, 'explore'])
    const build = addEpic(p, `${m.code}: build and validation`, 'realize', [...L, 'realize'])
    const objsB = scaled(m.objects)
    objsB.forEach((o, i) => {
      const f = i / objsB.length
      const req = addChild(p, design, `Requirements: ${o}`, 'task', f, [...L, 'explore'])
      const dm = addChild(p, design, `Data model: ${o}`, 'task', f + 0.15, [...L, 'explore'])
      dep(dm, req)
      const cds = addChild(p, build, `Build: ${o}`, 'story', f, [...L, 'realize'])
      const val = addChild(p, build, `Validate ${o} against JDE figures`, 'task', f + 0.25, [...L, 'realize'])
      dep(cds, dm)
      dep(val, cds)
      const load = pick(loadIndex)
      if (load) dep(val, load) // cross-project (MIG)
      if (chance(0.3)) {
        const bug = addChild(p, build, `Defect: ${o} ${pick(['totals off by rounding', 'missing plant 1200', 'slow above 1M rows', 'currency conversion date wrong'])}`, 'bug', f + 0.2, [...L, 'defect'])
        dep(val, bug)
      }
    })
  }
  const go = addEpic(p, 'BI: go-live dashboards and hypercare KPIs', 'hypercare', ['hypercare', 'wave1'])
  ;['hypercare KPI dashboard', 'ticket volume report', 'data quality scorecard', 'benefits tracker baseline'].forEach((t, i) => addChild(p, go, t, 'task', i / 4, ['hypercare', 'wave1']))
  return p
}

function buildPMO(ws) {
  const p = newProject(ws)
  for (const m of ws.modules) {
    const L = [m.code.toLowerCase()]
    // ops-like: few epics, lots of recurring tasks, many without parent
    const epics = ['explore', 'realize', 'sit', 'uat', 'cutover'].map((ph) => addEpic(p, `${m.code}: ${ph} phase governance`, ph, [...L, ph]))
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']
    m.objects.forEach((o) => {
      months.forEach((mo, i) => {
        const epic = epics[Math.min(epics.length - 1, Math.floor(i / 2.2))]
        addChild(p, epic, `${o} (${mo} 2026)`, chance(0.8) ? 'task' : 'story', (i % 3) / 3, [...L, 'recurring'])
      })
    })
  }
  const w2 = ['Wave 2: change strategy LATAM', 'Wave 2: training localisation pt-BR']
  pickN(w2, p.prof.emptyEpic).forEach((t) => addEpic(p, t, 'wave2', ['wave2'], { placeholder: true }))
  return p
}

// Build order matters: module workstreams first so INT/MIG/BI can reference their config items.
for (const ws of WS) {
  if (ws.key === 'ERPINT') buildIntegrations(ws)
  else if (ws.key === 'ERPMIG') buildMigration(ws)
  else if (ws.key === 'ERPBI') buildBI(ws)
  else if (ws.key === 'ERPPMO') buildPMO(ws)
  else buildModuleWorkstream(ws)
}

// Random intra-project "blocks" links for extra chaining (5%), plus a few random cross-project ones
for (const p of byProject.values()) {
  const nonEpics = p.items.filter((i) => i.type !== 'epic')
  for (const it of nonEpics) {
    if (chance(0.05)) dep(it, pick(nonEpics))
  }
}

// Renumber keys by creation date inside each project so keys look like a real Jira sequence.
for (const p of byProject.values()) {
  const sorted = [...p.items].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
  const remap = new Map()
  sorted.forEach((it, i) => remap.set(it.key, `${p.key}-${i + 1}`))
  p._remap = remap
}
const globalRemap = new Map()
for (const p of byProject.values()) for (const [k, v] of p._remap) globalRemap.set(k, v)
for (const it of allItems) {
  it.key = globalRemap.get(it.key) ?? it.key
  if (it.parentKey) it.parentKey = globalRemap.get(it.parentKey) ?? it.parentKey
  it.dependsOn = it.dependsOn.map((k) => globalRemap.get(k) ?? k)
}

// ---------- CSV ----------
const peopleById = new Map()
for (const p of byProject.values()) for (const person of p.people) peopleById.set(person.id, person)
const HEADER = ['project_key', 'project_name', 'key', 'title', 'type', 'status', 'status_category', 'assignee_id', 'assignee_name', 'estimate', 'estimate_unit', 'start_date', 'due_date', 'parent_key', 'depends_on', 'created_at', 'updated_at', 'resolved_at', 'labels']
const esc = (v) => {
  if (v === undefined || v === null) return ''
  const str = String(v)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}
const rows = [HEADER.join(',')]
for (const p of byProject.values()) {
  const sorted = [...p.items].sort((a, b) => Number(a.key.split('-')[1]) - Number(b.key.split('-')[1]))
  for (const it of sorted) {
    rows.push(
      [
        p.key,
        p.name,
        it.key,
        it.title,
        it.type,
        it.status,
        it.statusCategory,
        it.assigneeId ?? '',
        it.assigneeId ? peopleById.get(it.assigneeId)?.name : '',
        it.estimate ?? '',
        'points',
        it.startDate ?? '',
        it.dueDate ?? '',
        it.parentKey ?? '',
        it.dependsOn.join(';'),
        it.createdAt,
        it.updatedAt,
        it.resolvedAt ?? '',
        it.labels.join(';'),
      ]
        .map(esc)
        .join(','),
    )
  }
}
writeFileSync(OUT, rows.join('\n') + '\n')

// ---------- summary ----------
const summary = []
let total = 0
let deps = 0
let cross = 0
for (const p of byProject.values()) {
  const epics = p.items.filter((i) => i.type === 'epic').length
  const st = { todo: 0, in_progress: 0, done: 0 }
  let pd = 0
  let pc = 0
  for (const it of p.items) {
    st[it.statusCategory]++
    pd += it.dependsOn.length
    pc += it.dependsOn.filter((k) => !k.startsWith(p.key + '-')).length
  }
  total += p.items.length
  deps += pd
  cross += pc
  summary.push(`${p.key.padEnd(7)} ${String(p.items.length).padStart(5)} items  ${String(epics).padStart(3)} epics  todo ${st.todo}  wip ${st.in_progress}  done ${st.done}  deps ${pd} (cross-project ${pc})  people ${p.people.length}  profile ${p.profile}`)
}
console.log(summary.join('\n'))
console.log(`total ${total} items, ${deps} dependency links (${cross} cross-project), ${peopleById.size} people, seed ${SEED}, now ${iso(NOW)} -> ${OUT}`)
