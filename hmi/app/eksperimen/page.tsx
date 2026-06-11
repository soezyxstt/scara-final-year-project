import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ExperimentClient } from './experiment-client'

export default async function EksperimenPage() {
  const session = await auth()
  if (!session?.user?.googleId) redirect('/login')

  return <ExperimentClient />
}
