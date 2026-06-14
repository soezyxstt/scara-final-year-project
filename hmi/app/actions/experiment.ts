'use server'

import { eq } from 'drizzle-orm'
import { db } from '../../lib/db'
import { experimentRuns, experimentMetrics, experimentSamples } from '../../lib/db/schema/experiment'
import { backupRun, backupMetrics, backupSamples } from '../../lib/db/backup'

export type ExperimentRunInsert = typeof experimentRuns.$inferInsert
export type MetricsInsert = Omit<typeof experimentMetrics.$inferInsert, 'id' | 'runId'>
export type SampleInsert = Omit<typeof experimentSamples.$inferInsert, 'id' | 'runId'>

export async function saveRun(
  run: ExperimentRunInsert,
  metrics: MetricsInsert,
  samples: SampleInsert[],
  backupOnly = false
): Promise<{ ok: boolean; runId: string }> {
  const runId = run.id
  try {
    const metricId = `MET-${runId}`
    const metricsInsert = {
      ...metrics,
      id: metricId,
      runId,
    }

    if (!backupOnly) {
      // 0. Idempotency: a previous attempt may have partially succeeded
      //    (e.g. runs row inserted, metrics insert failed). Clear any rows
      //    for this runId so retries don't hit the UNIQUE constraint.
      await db.delete(experimentSamples).where(eq(experimentSamples.runId, runId))
      await db.delete(experimentMetrics).where(eq(experimentMetrics.runId, runId))
      await db.delete(experimentRuns).where(eq(experimentRuns.id, runId))

      // 1. Insert experiment_runs row
      await db.insert(experimentRuns).values(run)

      // 2. Insert experiment_metrics row
      await db.insert(experimentMetrics).values(metricsInsert)

      // 3. Batch-insert experiment_samples rows (chunked by 500 rows)
      const samplesWithRunId = samples.map(s => ({
        ...s,
        runId,
      }))

      const CHUNK_SIZE = 500
      for (let i = 0; i < samplesWithRunId.length; i += CHUNK_SIZE) {
        const chunk = samplesWithRunId.slice(i, i + CHUNK_SIZE)
        await db.insert(experimentSamples).values(chunk)
      }
    }

    // 4. Write to local backup files (fire-and-forget, wrapped in try/catch)
    try {
      backupRun(run)
      backupMetrics(metricsInsert)
      const samplesWithRunId = samples.map(s => ({
        ...s,
        runId,
      }))
      backupSamples(runId, samplesWithRunId)
    } catch (backupError) {
      console.error('Failed to write local backup:', backupError)
    }

    return { ok: true, runId }
  } catch (error) {
    console.error(`Failed to save run ${runId} (backupOnly=${backupOnly}):`, error)
    return { ok: false, runId: "" }
  }
}
