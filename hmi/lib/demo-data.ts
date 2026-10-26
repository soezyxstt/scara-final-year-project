import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Run, Sample, TrajectoryPoint } from './db/schema'
import type { ExperimentRun, ExperimentMetric, ExperimentSample } from './db/schema/experiment'
import ids from './demo-run-ids.json'

const FILES: Record<string, string> = {
  'EXP-1': 'exp1_tracking_differentiator.csv',
  'EXP-2': 'exp2_inertia_compensation.csv',
  'EXP-3': 'exp3_coriolis_compensation.csv',
  'EXP-4': 'exp4_gravity_compensation.csv',
  'EXP-5': 'exp5_trapezoidal_profile.csv',
}
const LABELS: Record<string, string> = {
  'EXP-1': 'TD Filter', 'EXP-2': 'Inertia Comp', 'EXP-3': 'Coriolis Comp',
  'EXP-4': 'Gravity Comp', 'EXP-5': 'Trap Profile',
}

type UnavailableRunFields = 'kp1' | 'ki1' | 'kd1' | 'kp2' | 'ki2' | 'kd2' | 'createdAt'
  | 'tdEnabled' | 'trapEnabled' | 'ffiEnabled' | 'ffcEnabled' | 'ffgEnabled'
export type DemoExperimentRun = Omit<ExperimentRun, UnavailableRunFields> & {
  [K in UnavailableRunFields]: number | null
} & { demoProvenance: DemoProvenance }
export interface DemoProvenance {
  source: string
  sourceRunId: string
  metrics: 'recomputed-from-exported-samples'
  missingFields: string[]
}
export interface DemoExperimentData {
  runs: DemoExperimentRun[]
  metrics: ExperimentMetric[]
  samples: ExperimentSample[]
}
export interface DemoRunData {
  run: Run & { demoProvenance: DemoProvenance }
  samples: Sample[]
  trajectoryPoints: TrajectoryPoint[]
}
type CsvRow = Record<string, string>
interface Group { rows: CsvRow[]; run: DemoExperimentRun; metric: ExperimentMetric; samples: ExperimentSample[] }

// The bundled exports are the public dataset. Account data and new database runs
// are never queried or made public by this module.
export const demoExperimentRunIds = [...new Set([...ids.experiments, ...ids.runs])]
export const isDemoRun = (id: string) => demoExperimentRunIds.includes(id)
export const isDemoExperimentRun = isDemoRun

export function publicDemoRun<T extends { userId: string; aiSuggestion: string | null }>(run: T): T {
  return { ...run, userId: '', aiSuggestion: null }
}

// RFC 4180 quoting, including quoted commas/newlines; no CSV values are evaluated.
function parseCsv(source: string): CsvRow[] {
  const records: string[][] = []
  let record: string[] = [], field = '', quoted = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) { record.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index++
      record.push(field); field = ''
      if (record.some(value => value !== '')) records.push(record)
      record = []
    } else field += char
  }
  if (quoted) throw new Error('Malformed thesis CSV: unclosed quoted field')
  if (field || record.length) { record.push(field); records.push(record) }
  const header = records.shift()
  if (!header?.includes('run_id')) throw new Error('Invalid thesis CSV header')
  return records.map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])))
}
const n = (row: CsvRow, key: string): number | null => {
  if (row[key] === undefined || row[key].trim() === '') return null
  const value = Number(row[key]); return Number.isFinite(value) ? value : null
}
const values = (rows: CsvRow[], key: string) => rows.flatMap(row => { const value = n(row, key); return value === null ? [] : [value] })
const mean = (xs: number[]) => xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : null
const rms = (xs: number[]) => { const squareMean = mean(xs.map(x => x * x)); return squareMean === null ? null : Math.sqrt(squareMean) }
const max = (xs: number[]) => xs.length ? Math.max(...xs) : null
const min = (xs: number[]) => xs.length ? Math.min(...xs) : null
const jointErrors = (rows: CsvRow[], joint: number) => rows.flatMap(row => {
  const actual = n(row, `theta${joint}_actual_rad`), desired = n(row, `theta${joint}_reference_rad`)
  return actual === null || desired === null ? [] : [actual - desired]
})

function summarize(rows: CsvRow[]): ExperimentMetric {
  const moving = rows.filter(row => row.phase === 'move')
  const analysis = moving.length ? moving : rows
  const ate = values(analysis, 'along_track_error_mm'), cte = values(analysis, 'cross_track_error_mm')
  const eef = values(analysis, 'eef_error_mm'), j1 = jointErrors(analysis, 1), j2 = jointErrors(analysis, 2)
  const hold = rows.filter(row => row.phase === 'hold')
  const holdEnd = max(values(hold, 'time_s'))
  const held = holdEnd === null ? [] : values(hold.filter(row => (n(row, 'time_s') ?? -Infinity) >= holdEnd - 2), 'theta1_actual_rad')
  const holdMean = mean(held)
  const moveTimes = values(moving, 'time_s')
  return {
    id: `DEMO-MET-${rows[0].run_id}`, runId: rows[0].run_id,
    mateMean: mean(ate), mateMax: max(ate), mateRms: rms(ate),
    mcteMean: mean(cte), mcteMax: max(cte), mcteRms: rms(cte),
    eefErrorMean: mean(eef), eefErrorMax: max(eef), eefErrorRms: rms(eef),
    joint1ErrorMax: max(j1.map(Math.abs)), joint1ErrorRms: rms(j1), joint1ErrorMin: min(j1.map(Math.abs)),
    joint2ErrorMax: max(j2.map(Math.abs)), joint2ErrorRms: rms(j2), joint2ErrorMin: min(j2.map(Math.abs)),
    settleTimeMs: null,
    finalEefError: n(rows[rows.length - 1], 'eef_error_mm'),
    sigmaTheta1Hold: holdMean === null ? null : rms(held.map(x => x - holdMean)),
    eSs: mean(values(rows.filter(row => row.phase === 'settle'), 'eef_error_mm')),
    moveDurationMs: moveTimes.length > 1 ? (Math.max(...moveTimes) - Math.min(...moveTimes)) * 1000 : null,
  }
}

function projectSample(row: CsvRow, index: number): ExperimentSample {
  return {
    id: index, runId: row.run_id, tMs: n(row, 'time_s') === null ? null : n(row, 'time_s')! * 1000,
    theta1: n(row, 'theta1_actual_rad'), theta2: n(row, 'theta2_actual_rad'),
    theta1D: n(row, 'theta1_reference_rad'), theta2D: n(row, 'theta2_reference_rad'),
    dtheta1: null, dtheta2: null, dtheta1D: null, dtheta2D: null,
    pwm1: n(row, 'pwm1'), theta1Raw: null, theta2Raw: null,
    xActual: n(row, 'x_actual_mm'), yActual: n(row, 'y_actual_mm'),
    xDesired: n(row, 'x_reference_mm'), yDesired: n(row, 'y_reference_mm'),
    u1Total: n(row, 'control_effort_j1'), ff1Contrib: null,
    p1Out: null, i1Out: null, d1Out: null,
    ctcInertia1: null, ctcCoriolis1: null, ctcGravity1: null,
    ctcInertia2: null, ctcCoriolis2: null, ctcGravity2: null,
    omega2Raw: null, deltaOmegaFf: null, phase: row.phase || null,
  }
}

const groupCache = new Map<string, Promise<Group[]>>()
async function loadGroups(experimentId: string): Promise<Group[]> {
  if (!FILES[experimentId]) return []
  let promise = groupCache.get(experimentId)
  if (!promise) {
    promise = (async () => {
      // npm workspace commands run from hmi; root commands may retain repo cwd.
      const root = path.basename(process.cwd()) === 'hmi' ? path.resolve(process.cwd(), '..') : process.cwd()
      const filename = FILES[experimentId]
      const rows = parseCsv(await readFile(path.join(root, 'data', 'experiments', filename), 'utf8'))
      const byId = new Map<string, CsvRow[]>()
      for (const row of rows) {
        if (!isDemoRun(row.run_id)) throw new Error('Thesis CSV contains a run outside the public allowlist')
        const group = byId.get(row.run_id)
        // EXP-4 exports the same physical shared baseline twice (off/on).
        // Keep each physical sample once; it remains one baseline in the HMI.
        if (group && group.some(previous => previous.sample_index === row.sample_index)) continue
        if (group) group.push(row)
        else byId.set(row.run_id, [row])
      }
      return [...byId.values()].map(groupRows => {
        const first = groupRows[0], last = groupRows[groupRows.length - 1]
        const baseline = first.shared_baseline === '1'
        const on = first.condition === 'on' ? 1 : 0
        const provenance: DemoProvenance = {
          source: `data/experiments/${filename}`, sourceRunId: first.run_id,
          metrics: 'recomputed-from-exported-samples',
          missingFields: [
            'originalDate', 'pidGains', 'velocities', 'rawAngles', 'pidTerms', 'feedforwardTerms', 'settleTime',
            ...(first.source_table === 'trajectory_points' ? ['sampleTimestamps', 'jointAngles', 'controlEffort', 'pwm', 'capturePhase'] : []),
          ],
        }
        const run: DemoExperimentRun = {
          id: first.run_id, experimentId: baseline ? 'BASELINE' : experimentId,
          experimentName: baseline ? `Shared baseline · ${LABELS[experimentId]}` : LABELS[experimentId],
          runNumber: Number(first.repetition), direction: first.direction,
          alphaDeg: Number(first.tilt_deg),
          tdEnabled: experimentId === 'EXP-1' ? on : null,
          ffiEnabled: experimentId === 'EXP-2' ? on : null,
          ffcEnabled: experimentId === 'EXP-3' ? on : null,
          ffgEnabled: experimentId === 'EXP-4' ? on : null,
          trapEnabled: experimentId === 'EXP-5' ? on : null,
          kp1: null, ki1: null, kd1: null, kp2: null, ki2: null, kd2: null,
          p0X: n(first, 'x_reference_mm')!, p0Y: n(first, 'y_reference_mm')!,
          pfX: n(last, 'x_reference_mm')!, pfY: n(last, 'y_reference_mm')!,
          createdAt: null, status: 'ok', demoProvenance: provenance,
        }
        return { rows: groupRows, run, metric: summarize(groupRows), samples: groupRows.map(projectSample) }
      })
    })()
    groupCache.set(experimentId, promise)
    promise.catch(() => groupCache.delete(experimentId))
  }
  return promise
}

export async function getDemoExperimentData(experimentId: string): Promise<DemoExperimentData> {
  const groups = await loadGroups(experimentId)
  return { runs: groups.map(group => group.run), metrics: groups.map(group => group.metric), samples: groups.flatMap(group => group.samples) }
}

export async function listDemoExperimentRuns(): Promise<DemoExperimentRun[]> {
  const all = await Promise.all(Object.keys(FILES).map(loadGroups))
  // The same run can be a baseline for another experiment. Preserve its primary
  // identity in the list; the per-experiment loader preserves comparison context.
  const unique = new Map<string, DemoExperimentRun>()
  for (const group of all.flat()) if (!unique.has(group.run.id)) unique.set(group.run.id, group.run)
  return [...unique.values()]
}

async function findGroup(id: string): Promise<Group | null> {
  if (!isDemoRun(id)) return null
  for (const experimentId of Object.keys(FILES)) {
    const found = (await loadGroups(experimentId)).find(group => group.run.id === id)
    if (found) return found
  }
  return null
}

export async function getDemoExperimentRunDetails(id: string) {
  const group = await findGroup(id)
  return group ? { run: group.run, metrics: group.metric, sampleCount: group.rows.length } : null
}

function savedRun(group: Group): DemoRunData {
  const { run: source, metric, rows, samples: experimentSamples } = group
  const times = values(rows, 'time_s')
  const duration = times.length > 1 ? Math.max(...times) - Math.min(...times) : null
  const run: DemoRunData['run'] = {
    id: source.id, userId: '', name: `${source.experimentId} · ${rows[0].run_name} · ${rows[0].condition.toUpperCase()}`,
    // No wall-clock date exists in the CSV; 0 is a compatibility sentinel. Demo
    // UI must label the recording rather than format this value as a date.
    startedAt: 0, endedAt: duration === null ? null : duration * 1000,
    x0: source.p0X, y0: source.p0Y, xf: source.pfX, yf: source.pfY,
    accuracyIdx: null, maxErr: metric.mcteMax, meanErr: metric.mcteMean,
    finalErr: n(rows[rows.length - 1], 'cross_track_error_mm'),
    mate: metric.mateMean, mcte: metric.mcteMean, rmsAte: metric.mateRms, errorRatio: null,
    pwmMax: max(values(rows, 'pwm1').map(Math.abs)), elapsedTime: duration,
    rmseJ1: metric.joint1ErrorRms, rmseJ2: metric.joint2ErrorRms, rmseEef: metric.eefErrorRms,
    ctrlVariance: null, jitter: null, gainsJson: null, paramsJson: null,
    sampleCount: rows.length, aiSuggestion: null, demoProvenance: source.demoProvenance,
  }
  const samples: Sample[] = experimentSamples.flatMap((sample, index) => sample.tMs === null ? [] : [{
    id: index, runId: source.id, t: sample.tMs,
    th1: sample.theta1, th2: sample.theta2, th1d: sample.theta1D, th2d: sample.theta2D,
    dth1: null, dth2: null, dth1d: null, dth2d: null,
    pwm1: sample.pwm1, vff1: null, u1Total: sample.u1Total,
    th1Raw: null, th2Raw: null,
    e1: sample.theta1D === null || sample.theta1 === null ? null : sample.theta1D - sample.theta1,
    e2: sample.theta2D === null || sample.theta2 === null ? null : sample.theta2D - sample.theta2,
    inertia1: null, coriolis1: null, gravity1: null, inertia2: null, coriolis2: null, gravity2: null,
    ff1Contrib: null, fU1Total: null, integral1: null, deltaOmegaFf: null, omega2Raw: null, integral2: null,
    p1Out: null, i1Out: null, d1Out: null, loopDurationUs: null,
  }])
  const trajectoryPoints = experimentSamples.map((sample, index): TrajectoryPoint => ({
    id: index, runId: source.id, seq: index,
    xi: sample.xDesired, yi: sample.yDesired, xa: sample.xActual, ya: sample.yActual,
  }))
  return { run, samples, trajectoryPoints }
}

export async function getDemoRunWithData(id: string): Promise<DemoRunData | null> {
  const group = await findGroup(id)
  return group ? savedRun(group) : null
}

export async function listDemoRuns(): Promise<DemoRunData['run'][]> {
  const all = await Promise.all(Object.keys(FILES).map(loadGroups))
  const unique = new Map<string, DemoRunData['run']>()
  for (const group of all.flat()) if (!unique.has(group.run.id)) unique.set(group.run.id, savedRun(group).run)
  // EXP-1 comes first and contains recorded timestamps and joint telemetry.
  return [...unique.values()]
}
