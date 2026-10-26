import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { experimentRuns } from '@/lib/db/schema/experiment'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { ResultsClient } from './results-client'

import { readableExperimentIds } from '@/lib/experiment-access'
import { listDemoExperimentRuns } from '@/lib/demo-data'

export const dynamic = 'force-dynamic'

export default async function HasilEksperimenPage() {
  const session = await auth()
  const isDemo = !session?.user?.googleId
  if (isDemo) return <ResultsClient isDemo initialRuns={await listDemoExperimentRuns()} />
  let runs: (typeof experimentRuns.$inferSelect)[] = []
  let initialLoadError: string | null = null

  try {
    const allowed = await readableExperimentIds()
    runs = allowed.length ? await db
      .select()
      .from(experimentRuns)
      .where(and(eq(experimentRuns.status, 'ok'), inArray(experimentRuns.id, allowed)))
      .orderBy(desc(experimentRuns.createdAt)) : []
  } catch (error) {
    console.error('Failed to load experiment results:', error)
    initialLoadError = 'Database tidak dapat dijangkau. Data yang sudah tertangkap tetap aman di outbox perangkat eksperimen dan akan disinkronkan saat koneksi pulih.'
  }

  return <ResultsClient isDemo={isDemo} initialRuns={runs} initialLoadError={initialLoadError} />
}
