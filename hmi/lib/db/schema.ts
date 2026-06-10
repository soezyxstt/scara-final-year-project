import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  googleId: text('google_id').unique().notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  picture: text('picture'),
  createdAt: integer('created_at').notNull(),
})

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  x0: real('x0'),
  y0: real('y0'),
  xf: real('xf'),
  yf: real('yf'),
  accuracyIdx: real('accuracy_idx'),
  maxErr: real('max_err'),
  meanErr: real('mean_err'),
  finalErr: real('final_err'),
  mate: real('mate'),
  mcte: real('mcte'),
  rmsAte: real('rms_ate'),
  errorRatio: real('error_ratio'),
  pwmMax: real('pwm_max'),
  elapsedTime: real('elapsed_time'),
  rmseJ1: real('rmse_j1'),
  rmseJ2: real('rmse_j2'),
  rmseEef: real('rmse_eef'),
  ctrlVariance: real('ctrl_variance'),
  jitter: real('jitter'),
  gainsJson: text('gains_json'),
  paramsJson: text('params_json'),
  sampleCount: integer('sample_count'),
})

export const samples = sqliteTable('samples', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => runs.id),
  t: integer('t').notNull(),
  th1: real('th1'),
  th2: real('th2'),
  th1d: real('th1d'),
  th2d: real('th2d'),
  dth1: real('dth1'),
  dth2: real('dth2'),
  dth1d: real('dth1d'),
  dth2d: real('dth2d'),
  pwm1: integer('pwm1'),
  vff1: real('vff1'),
  u1Total: real('u1_total'),
  th1Raw: real('th1_raw'),
  th2Raw: real('th2_raw'),
  e1: real('e1'),
  e2: real('e2'),
  inertia1: real('inertia1'),
  coriolis1: real('coriolis1'),
  gravity1: real('gravity1'),
  inertia2: real('inertia2'),
  coriolis2: real('coriolis2'),
  gravity2: real('gravity2'),
  ff1Contrib: real('ff1_contrib'),
  fU1Total: real('f_u1_total'),
  integral1: real('integral1'),
  deltaOmegaFf: real('delta_omega_ff'),
  omega2Raw: real('omega2_raw'),
  integral2: real('integral2'),
  p1Out: real('p1_out'),
  i1Out: real('i1_out'),
  d1Out: real('d1_out'),
  loopDurationUs: integer('loop_duration_us'),
})

export const trajectoryPoints = sqliteTable('trajectory_points', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => runs.id),
  seq: integer('seq').notNull(),
  xi: real('xi'),
  yi: real('yi'),
  xa: real('xa'),
  ya: real('ya'),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Run = typeof runs.$inferSelect
export type NewRun = typeof runs.$inferInsert
export type Sample = typeof samples.$inferSelect
export type NewSample = typeof samples.$inferInsert
export type TrajectoryPoint = typeof trajectoryPoints.$inferSelect
export type NewTrajectoryPoint = typeof trajectoryPoints.$inferInsert
