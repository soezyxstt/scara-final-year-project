import { eq, sql } from 'drizzle-orm'
import { auth } from './auth'
import { db } from './db'
import { getUserByGoogleId } from './db/queries'
import { experimentOwners, experimentRuns } from './db/schema/experiment'
import { demoExperimentRunIds } from './demo-data'
import { assertExperimentOwnerAccess } from './experiment-access-policy'

// Separate ownership table preserves the historical thesis tables as-is.
export async function experimentUser() {
  const session = await auth()
  if (!session?.user?.googleId) return null
  const user = await getUserByGoogleId(session.user.googleId)
  if (!user) throw new Error('User not found')
  await db.run(sql`CREATE TABLE IF NOT EXISTS experiment_run_owners (run_id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL)`)
  return user
}

export async function readableExperimentIds() {
  const user = await experimentUser()
  if (!user) return demoExperimentRunIds
  const rows = await db.select().from(experimentOwners).where(eq(experimentOwners.userId, user.id))
  return rows.map(row => row.runId)
}

export async function requireExperimentOwner(runId?: string, allowCreate = false) {
  const user = await experimentUser()
  if (!user) throw new Error('Unauthorized')
  if (runId) {
    const [[existing], [owner]] = await Promise.all([
      db.select().from(experimentRuns).where(eq(experimentRuns.id, runId)).limit(1),
      db.select().from(experimentOwners).where(eq(experimentOwners.runId, runId)).limit(1),
    ])
    assertExperimentOwnerAccess({ userId: user.id, existing: !!existing, ownerId: owner?.userId ?? null, allowCreate })
  }
  return user
}

type ExperimentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Claim and verify inside the write transaction, before replacing any telemetry. */
export async function claimExperimentRun(tx: ExperimentTransaction, runId: string, userId: string) {
  await tx.insert(experimentOwners).values({ runId, userId }).onConflictDoNothing()
  const [owner] = await tx.select().from(experimentOwners).where(eq(experimentOwners.runId, runId)).limit(1)
  if (owner?.userId !== userId) throw new Error('Forbidden')
}
