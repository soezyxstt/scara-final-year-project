'use server'

import { db } from '../db'
import { experimentRuns, experimentMetrics, experimentSamples } from '../db/schema/experiment'
import { backupRun, backupMetrics, backupSamples } from '../db/backup'
import { SHARED_BASELINE_ID, usesSharedBaseline } from '../experiment-protocol'

export async function saveExperimentRun(payload: {
  run: typeof experimentRuns.$inferInsert
  metrics: Omit<typeof experimentMetrics.$inferInsert, 'id' | 'runId'>
  samples: Omit<typeof experimentSamples.$inferInsert, 'id' | 'runId'>[]
}) {
  try {
    const runId = payload.run.id

    // 1. Insert experiment run row
    await db.insert(experimentRuns).values(payload.run)

    // 2. Insert experiment metrics row
    const metricId = `MET-${runId}`
    const metricsInsert = {
      ...payload.metrics,
      id: metricId,
      runId,
    }
    await db.insert(experimentMetrics).values(metricsInsert)

    // 3. Insert samples in chunks to avoid SQLite parameter limits
    const samplesWithRunId = payload.samples.map(s => ({
      ...s,
      runId,
    }))

    const CHUNK_SIZE = 25
    for (let i = 0; i < samplesWithRunId.length; i += CHUNK_SIZE) {
      const chunk = samplesWithRunId.slice(i, i + CHUNK_SIZE)
      await db.insert(experimentSamples).values(chunk)
    }

    // 4. Run local backups (non-blocking fire-and-forget handled inside backup.ts functions)
    backupRun(payload.run)
    backupMetrics(metricsInsert)
    backupSamples(runId, samplesWithRunId)

    return { success: true, runId }
  } catch (error) {
    console.error('Failed to save experiment run to database:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

import { and, eq, like, inArray, or } from 'drizzle-orm'

export async function markExperimentRunsAsBaseline(runIds: string[]): Promise<{ ok: boolean; updatedCount: number; error?: string }> {
  const uniqueIds = [...new Set(runIds)]
  if (uniqueIds.length === 0) return { ok: false, updatedCount: 0, error: 'Pilih minimal satu run.' }

  try {
    const selectedRuns = await db
      .select()
      .from(experimentRuns)
      .where(and(inArray(experimentRuns.id, uniqueIds), eq(experimentRuns.status, 'ok')))

    if (selectedRuns.length !== uniqueIds.length) {
      return { ok: false, updatedCount: 0, error: 'Sebagian run tidak ditemukan atau belum berstatus OK.' }
    }

    const invalid = selectedRuns.filter(run => run.ffiEnabled !== 0 || run.ffcEnabled !== 0 || run.ffgEnabled !== 0 || run.alphaDeg !== 0)
    if (invalid.length > 0) {
      return { ok: false, updatedCount: 0, error: `Run ${invalid.map(run => run.id).join(', ')} bukan baseline: FFI, FFC, FFG harus OFF dan alpha harus 0°.` }
    }

    await db.transaction(async tx => {
      for (const run of selectedRuns) {
        await tx
          .update(experimentRuns)
          .set({
            experimentId: SHARED_BASELINE_ID,
            experimentName: `Shared Baseline (from ${run.experimentId})`,
          })
          .where(eq(experimentRuns.id, run.id))
      }
    })

    return { ok: true, updatedCount: selectedRuns.length }
  } catch (error) {
    console.error('Failed to mark experiment runs as baseline:', error)
    return { ok: false, updatedCount: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Delete a single experiment run and all its associated metrics and samples.
 */
export async function deleteExperimentRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1. Delete samples first (FK dependency)
    await db.delete(experimentSamples).where(eq(experimentSamples.runId, runId))
    // 2. Delete metrics
    await db.delete(experimentMetrics).where(eq(experimentMetrics.runId, runId))
    // 3. Delete the run itself
    await db.delete(experimentRuns).where(eq(experimentRuns.id, runId))
    return { ok: true }
  } catch (error) {
    console.error(`Failed to delete run ${runId}:`, error)
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Delete all runs for a given experimentId (EXP-4 uses an angle suffix).
 * Performs cascade delete: samples → metrics → runs.
 */
export async function deleteExperiment(experimentId: string): Promise<{ ok: boolean; deletedCount: number; error?: string }> {
  try {
    // Find all matching run IDs
    let runsList
    if (experimentId === 'EXP-4') {
      runsList = await db
        .select({ id: experimentRuns.id })
        .from(experimentRuns)
        .where(like(experimentRuns.experimentId, `${experimentId}%`))
    } else {
      runsList = await db
        .select({ id: experimentRuns.id })
        .from(experimentRuns)
        .where(eq(experimentRuns.experimentId, experimentId))
    }

    if (runsList.length === 0) return { ok: true, deletedCount: 0 }

    const runIds = runsList.map(r => r.id)

    // Cascade delete in FK-safe order
    await db.delete(experimentSamples).where(inArray(experimentSamples.runId, runIds))
    await db.delete(experimentMetrics).where(inArray(experimentMetrics.runId, runIds))
    await db.delete(experimentRuns).where(inArray(experimentRuns.id, runIds))

    return { ok: true, deletedCount: runIds.length }
  } catch (error) {
    console.error(`Failed to delete experiment ${experimentId}:`, error)
    return { ok: false, deletedCount: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function getExperimentRunDetails(runId: string) {
  try {
    const run = await db.select().from(experimentRuns).where(eq(experimentRuns.id, runId)).limit(1)
    const metrics = await db.select().from(experimentMetrics).where(eq(experimentMetrics.runId, runId)).limit(1)
    
    // We can count samples by selecting all and getting length
    const samplesList = await db.select().from(experimentSamples).where(eq(experimentSamples.runId, runId))

    return {
      run: run[0] ?? null,
      metrics: metrics[0] ?? null,
      sampleCount: samplesList.length,
    }
  } catch (error) {
    console.error('Failed to fetch experiment run details:', error)
    return null
  }
}

export async function getExperimentData(experimentId: string) {
  try {
    let runsList
    if (experimentId === 'EXP-4') {
      runsList = await db
        .select()
        .from(experimentRuns)
        .where(and(
          or(like(experimentRuns.experimentId, `${experimentId}%`), eq(experimentRuns.experimentId, SHARED_BASELINE_ID)),
          eq(experimentRuns.status, 'ok'),
        ))
        .orderBy(experimentRuns.createdAt)
    } else if (usesSharedBaseline(experimentId)) {
      runsList = await db
        .select()
        .from(experimentRuns)
        .where(and(
          or(eq(experimentRuns.experimentId, experimentId), eq(experimentRuns.experimentId, SHARED_BASELINE_ID)),
          eq(experimentRuns.status, 'ok'),
        ))
        .orderBy(experimentRuns.createdAt)
    } else {
      runsList = await db
        .select()
        .from(experimentRuns)
        .where(and(eq(experimentRuns.experimentId, experimentId), eq(experimentRuns.status, 'ok')))
        .orderBy(experimentRuns.createdAt)
    }

    if (runsList.length === 0) {
      return { runs: [], metrics: [], samples: [] }
    }

    const runIds = runsList.map((r) => r.id)

    // Fetch metrics for these runs
    const metricsList = await db
      .select()
      .from(experimentMetrics)
      .where(inArray(experimentMetrics.runId, runIds))

    // Fetch samples for these runs
    const samplesList = await db
      .select()
      .from(experimentSamples)
      .where(inArray(experimentSamples.runId, runIds))
      .orderBy(experimentSamples.id) // keep them in sequence

    return {
      runs: runsList,
      metrics: metricsList,
      samples: samplesList,
    }
  } catch (error) {
    console.error(`Failed to fetch experiment data for ${experimentId}:`, error)
    return null
  }
}
