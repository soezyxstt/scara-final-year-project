import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export function generateNanoid(size = 21): string {
  const alphabet = 'useand-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  let id = ''
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length]
  }
  return id
}

export const experimentRuns = sqliteTable('experiment_runs', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id').notNull(),
  experimentName: text('experiment_name').notNull(),
  runNumber: integer('run_number').notNull(),
  direction: text('direction').notNull(),
  alphaDeg: real('alpha_deg').notNull(),
  ffgEnabled: integer('ffg_enabled').notNull(),
  ffiEnabled: integer('ffi_enabled').notNull(),
  ffcEnabled: integer('ffc_enabled').notNull(),
  tdEnabled: integer('td_enabled').notNull(),
  trapEnabled: integer('trap_enabled').notNull(),
  kp1: real('kp1').notNull(),
  ki1: real('ki1').notNull(),
  kd1: real('kd1').notNull(),
  kp2: real('kp2').notNull(),
  ki2: real('ki2').notNull(),
  kd2: real('kd2').notNull(),
  p0X: real('p0_x').notNull(),
  p0Y: real('p0_y').notNull(),
  pfX: real('pf_x').notNull(),
  pfY: real('pf_y').notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status').notNull(), // 'ok' | 'retrying' | 'failed'
})

export const experimentMetrics = sqliteTable('experiment_metrics', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => experimentRuns.id),
  mateMean: real('mate_mean'),
  mateMax: real('mate_max'),
  mateRms: real('mate_rms'),
  mcteMean: real('mcte_mean'),
  mcteMax: real('mcte_max'),
  mcteRms: real('mcte_rms'),
  eefErrorMean: real('eef_error_mean'),
  eefErrorMax: real('eef_error_max'),
  eefErrorRms: real('eef_error_rms'),
  joint1ErrorMax: real('joint1_error_max'),
  joint1ErrorRms: real('joint1_error_rms'),
  joint1ErrorMin: real('joint1_error_min'),
  joint2ErrorMax: real('joint2_error_max'),
  joint2ErrorRms: real('joint2_error_rms'),
  joint2ErrorMin: real('joint2_error_min'),
  settleTimeMs: real('settle_time_ms'),
  finalEefError: real('final_eef_error'),
  // σ_θ1 (rad) over the 2 s pre-move hold window — noise floor (EXP-1)
  sigmaTheta1Hold: real('sigma_theta1_hold'),
  // Mean EEF error (mm) over the 2 s post-settle window (EXP-4 e_ss)
  eSs: real('e_ss'),
  // Trajectory duration M→S in firmware clock (ms)
  moveDurationMs: real('move_duration_ms'),
})

export const experimentSamples = sqliteTable('experiment_samples', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => experimentRuns.id),
  tMs: real('t_ms'),
  theta1: real('theta1'),
  theta2: real('theta2'),
  theta1D: real('theta1_d'),
  theta2D: real('theta2_d'),
  dtheta1: real('dtheta1'),
  dtheta2: real('dtheta2'),
  dtheta1D: real('dtheta1_d'),
  dtheta2D: real('dtheta2_d'),
  pwm1: real('pwm1'),
  theta1Raw: real('theta1_raw'),
  theta2Raw: real('theta2_raw'),
  xActual: real('x_actual'),
  yActual: real('y_actual'),
  xDesired: real('x_desired'),
  yDesired: real('y_desired'),
  u1Total: real('u1_total'),
  ff1Contrib: real('ff1_contrib'),
  p1Out: real('p1_out'),
  i1Out: real('i1_out'),
  d1Out: real('d1_out'),
  ctcInertia1: real('ctc_inertia1'),
  ctcCoriolis1: real('ctc_coriolis1'),
  ctcGravity1: real('ctc_gravity1'),
  ctcInertia2: real('ctc_inertia2'),
  ctcCoriolis2: real('ctc_coriolis2'),
  ctcGravity2: real('ctc_gravity2'),
  omega2Raw: real('omega2_raw'),
  deltaOmegaFf: real('delta_omega_ff'),
  phase: text('phase'), // 'hold' | 'move' | 'settle'
})

export type ExperimentRun = typeof experimentRuns.$inferSelect
export type NewExperimentRun = typeof experimentRuns.$inferInsert
export type ExperimentMetric = typeof experimentMetrics.$inferSelect
export type NewExperimentMetric = typeof experimentMetrics.$inferInsert
export type ExperimentSample = typeof experimentSamples.$inferSelect
export type NewExperimentSample = typeof experimentSamples.$inferInsert
