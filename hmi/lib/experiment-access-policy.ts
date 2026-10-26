/** Check existing ownership and distinguish creating a run from changing one. */
export function assertExperimentOwnerAccess({
  userId, existing, ownerId, allowCreate = false,
}: {
  userId: string
  existing: boolean
  ownerId: string | null
  allowCreate?: boolean
}) {
  if ((ownerId && ownerId !== userId) || (existing && !ownerId)) throw new Error('Forbidden')
  if (!existing && !allowCreate) throw new Error('Run not found')
}
