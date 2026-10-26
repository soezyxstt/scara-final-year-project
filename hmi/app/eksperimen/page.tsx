import { auth } from '@/lib/auth'
import { ExperimentClient } from './experiment-client'
import HasilEksperimenPage from '../hasil-eksperimen/page'

export default async function EksperimenPage() {
  const session = await auth()
  if (!session?.user?.googleId) return <HasilEksperimenPage />

  return <ExperimentClient />
}
