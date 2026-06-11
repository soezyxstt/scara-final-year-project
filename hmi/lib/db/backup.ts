import fs from 'fs'
import path from 'path'

function getBackupDir(): string {
  // process.cwd() returns the hmi project root.
  // We'll create local-backup directory there.
  return path.join(process.cwd(), 'local-backup')
}

/**
 * Appends a run entry to local-backup/runs.jsonl.
 * Fire-and-forget: returns immediately, handles its own errors.
 */
export function backupRun(runData: any) {
  ;(async () => {
    try {
      const dir = getBackupDir()
      await fs.promises.mkdir(dir, { recursive: true })
      const filePath = path.join(dir, 'runs.jsonl')
      await fs.promises.appendFile(filePath, JSON.stringify(runData) + '\n', 'utf8')
    } catch (err) {
      console.error('[Backup Error] Failed to write run backup:', err)
    }
  })()
}

/**
 * Appends metrics entry to local-backup/metrics.jsonl.
 * Fire-and-forget: returns immediately, handles its own errors.
 */
export function backupMetrics(metricsData: any) {
  ;(async () => {
    try {
      const dir = getBackupDir()
      await fs.promises.mkdir(dir, { recursive: true })
      const filePath = path.join(dir, 'metrics.jsonl')
      await fs.promises.appendFile(filePath, JSON.stringify(metricsData) + '\n', 'utf8')
    } catch (err) {
      console.error('[Backup Error] Failed to write metrics backup:', err)
    }
  })()
}

/**
 * Appends raw samples to local-backup/samples-{runId}.jsonl.
 * Fire-and-forget: returns immediately, handles its own errors.
 */
export function backupSamples(runId: string, samplesData: any[]) {
  ;(async () => {
    try {
      if (!samplesData || samplesData.length === 0) return
      const dir = getBackupDir()
      await fs.promises.mkdir(dir, { recursive: true })
      const filePath = path.join(dir, `samples-${runId}.jsonl`)
      const lines = samplesData.map((s) => JSON.stringify(s)).join('\n') + '\n'
      await fs.promises.appendFile(filePath, lines, 'utf8')
    } catch (err) {
      console.error(`[Backup Error] Failed to write samples backup for run ${runId}:`, err)
    }
  })()
}
