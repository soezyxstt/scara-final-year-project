'use server'

import { count, eq } from 'drizzle-orm'
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
): Promise<{ ok: boolean; runId: string; sampleCount: number; error?: string }> {
  const runId = run.id
  try {
    const metricId = `MET-${runId}`
    const metricsInsert = {
      ...metrics,
      id: metricId,
      runId,
    }

    const samplesWithRunId = samples.map(s => ({ ...s, runId }))

    if (!backupOnly) {
      // A retry must never expose a half-written run. The former implementation
      // deleted and reinserted three tables outside a transaction, so a network
      // interruption could leave a run without metrics or with partial samples.
      await db.transaction(async tx => {
        await tx.delete(experimentSamples).where(eq(experimentSamples.runId, runId))
        await tx.delete(experimentMetrics).where(eq(experimentMetrics.runId, runId))
        await tx.delete(experimentRuns).where(eq(experimentRuns.id, runId))

        await tx.insert(experimentRuns).values({ ...run, status: 'uploading' })
        await tx.insert(experimentMetrics).values(metricsInsert)

        // Keep each libSQL statement comfortably below request/parameter limits.
        const CHUNK_SIZE = 25
        for (let i = 0; i < samplesWithRunId.length; i += CHUNK_SIZE) {
          await tx.insert(experimentSamples).values(samplesWithRunId.slice(i, i + CHUNK_SIZE))
        }

        const [verification] = await tx
          .select({ value: count() })
          .from(experimentSamples)
          .where(eq(experimentSamples.runId, runId))

        if (verification.value !== samplesWithRunId.length) {
          throw new Error(`Sample verification failed: expected ${samplesWithRunId.length}, stored ${verification.value}.`)
        }

        await tx.update(experimentRuns).set({ status: 'ok' }).where(eq(experimentRuns.id, runId))
      })
    }

    // 4. Write to local backup files (fire-and-forget, wrapped in try/catch)
    try {
      backupRun(run)
      backupMetrics(metricsInsert)
      backupSamples(runId, samplesWithRunId)
    } catch (backupError) {
      console.error('Failed to write local backup:', backupError)
    }

    return { ok: true, runId, sampleCount: samples.length }
  } catch (error) {
    console.error(`Failed to save run ${runId} (backupOnly=${backupOnly}):`, error)
    return {
      ok: false,
      runId,
      sampleCount: 0,
      error: error instanceof Error ? error.message : 'Unknown database error',
    }
  }
}
