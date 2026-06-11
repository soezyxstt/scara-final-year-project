import { db } from '@/lib/db'
import { experimentRuns } from '@/lib/db/schema/experiment'
import { desc } from 'drizzle-orm'
import { ResultsClient } from './results-client'

export const dynamic = 'force-dynamic'

export default async function HasilEksperimenPage() {
  const runs = await db.select().from(experimentRuns).orderBy(desc(experimentRuns.createdAt))

  return <ResultsClient initialRuns={runs} />
}
