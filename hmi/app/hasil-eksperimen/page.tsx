import { db } from '@/lib/db'
import { experimentRuns } from '@/lib/db/schema/experiment'
import { desc, eq } from 'drizzle-orm'
import { ResultsClient } from './results-client'

export const dynamic = 'force-dynamic'

export default async function HasilEksperimenPage() {
  let runs: (typeof experimentRuns.$inferSelect)[] = []
  let initialLoadError: string | null = null

  try {
    runs = await db
      .select()
      .from(experimentRuns)
      .where(eq(experimentRuns.status, 'ok'))
      .orderBy(desc(experimentRuns.createdAt))
  } catch (error) {
    console.error('Failed to load experiment results:', error)
    initialLoadError = 'Database tidak dapat dijangkau. Data yang sudah tertangkap tetap aman di outbox perangkat eksperimen dan akan disinkronkan saat koneksi pulih.'
  }

  return <ResultsClient initialRuns={runs} initialLoadError={initialLoadError} />
}
