import { db } from './index'
import { users, runs, samples, trajectoryPoints } from './schema'
import { eq, desc, inArray } from 'drizzle-orm'
import type { NewRun, NewSample, NewTrajectoryPoint } from './schema'

export async function upsertUser(opts: {
  googleId: string
  email: string
  name: string
  picture?: string | null
}) {
  const existing = await db.select().from(users).where(eq(users.googleId, opts.googleId)).limit(1)
  if (existing.length > 0) return existing[0]
  const id = crypto.randomUUID()
  await db.insert(users).values({
    id,
    googleId: opts.googleId,
    email: opts.email,
    name: opts.name,
    picture: opts.picture ?? null,
    createdAt: Date.now(),
  })
  return { id, ...opts }
}

export async function getUserByGoogleId(googleId: string) {
  const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1)
  return result[0] ?? null
}

export async function listRuns(userId: string) {
  return db.select().from(runs).where(eq(runs.userId, userId)).orderBy(desc(runs.startedAt))
}

export async function getRun(id: string) {
  const result = await db.select().from(runs).where(eq(runs.id, id)).limit(1)
  return result[0] ?? null
}

export async function getRunWithData(id: string) {
  const [run, sampleRows, trajectoryRows] = await Promise.all([
    db.select().from(runs).where(eq(runs.id, id)).limit(1),
    db.select().from(samples).where(eq(samples.runId, id)).orderBy(samples.t),
    db.select().from(trajectoryPoints).where(eq(trajectoryPoints.runId, id)).orderBy(trajectoryPoints.seq),
  ])
  if (!run[0]) return null
  return { run: run[0], samples: sampleRows, trajectoryPoints: trajectoryRows }
}

export async function getRunsWithData(ids: string[]) {
  if (ids.length === 0) return []
  const [runRows, sampleRows, trajectoryRows] = await Promise.all([
    db.select().from(runs).where(inArray(runs.id, ids)),
    db.select().from(samples).where(inArray(samples.runId, ids)).orderBy(samples.t),
    db.select().from(trajectoryPoints).where(inArray(trajectoryPoints.runId, ids)).orderBy(trajectoryPoints.seq),
  ])
  return runRows.map(run => ({
    run,
    samples: sampleRows.filter(s => s.runId === run.id),
    trajectoryPoints: trajectoryRows.filter(t => t.runId === run.id),
  }))
}

export interface SaveRunPayload {
  userId: string
  name: string
  startedAt: number
  endedAt: number
  moveInfo: { x0: number; y0: number; xf: number; yf: number }
  stats: {
    accuracy_idx?: number; max_err?: number; mean_err?: number; final_err?: number
    MATE?: number; MCTE?: number; RMS_ATE?: number; error_ratio?: number
    pwm_max?: number; elapsed_time?: number; n?: number
  }
  gainsJson: string
  paramsJson: string
  sampleList: NewSample[]
  trajectoryList: NewTrajectoryPoint[]
}

export async function saveRun(payload: SaveRunPayload) {
  const id = crypto.randomUUID()
  const { userId, name, startedAt, endedAt, moveInfo, stats, gainsJson, paramsJson, sampleList, trajectoryList } = payload

  // Stats: compute RMSE from raw samples if needed (passed pre-computed)
  const run: NewRun = {
    id,
    userId,
    name,
    startedAt,
    endedAt,
    x0: moveInfo.x0,
    y0: moveInfo.y0,
    xf: moveInfo.xf,
    yf: moveInfo.yf,
    accuracyIdx: stats.accuracy_idx ?? null,
    maxErr: stats.max_err ?? null,
    meanErr: stats.mean_err ?? null,
    finalErr: stats.final_err ?? null,
    mate: stats.MATE ?? null,
    mcte: stats.MCTE ?? null,
    rmsAte: stats.RMS_ATE ?? null,
    errorRatio: stats.error_ratio ?? null,
    pwmMax: stats.pwm_max ?? null,
    elapsedTime: stats.elapsed_time ?? null,
    rmseJ1: null,
    rmseJ2: null,
    rmseEef: null,
    ctrlVariance: null,
    jitter: null,
    gainsJson,
    paramsJson,
    sampleCount: sampleList.length,
  }

  await db.insert(runs).values(run)

  // Populate the runId for samples and trajectory points
  const samplesWithRunId = sampleList.map(s => ({ ...s, runId: id }))
  const trajectoryWithRunId = trajectoryList.map(t => ({ ...t, runId: id }))

  // Batch-insert samples in chunks to avoid SQLite param limits
  const CHUNK = 200
  for (let i = 0; i < samplesWithRunId.length; i += CHUNK) {
    await db.insert(samples).values(samplesWithRunId.slice(i, i + CHUNK))
  }
  for (let i = 0; i < trajectoryWithRunId.length; i += CHUNK) {
    await db.insert(trajectoryPoints).values(trajectoryWithRunId.slice(i, i + CHUNK))
  }

  return id
}

export async function deleteRun(id: string, userId: string) {
  const run = await getRun(id)
  if (!run || run.userId !== userId) return false
  await db.delete(samples).where(eq(samples.runId, id))
  await db.delete(trajectoryPoints).where(eq(trajectoryPoints.runId, id))
  await db.delete(runs).where(eq(runs.id, id))
  return true
}

export async function updateRunAiSuggestion(runId: string, aiSuggestion: string) {
  await db.update(runs).set({ aiSuggestion }).where(eq(runs.id, runId))
}
