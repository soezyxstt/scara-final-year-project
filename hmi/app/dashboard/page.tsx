import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { listRuns, getUserByGoogleId } from '@/lib/db/queries'
import { DashboardContent } from './dashboard-content'
import { listDemoRuns } from '@/lib/demo-data'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.googleId) {
    return <DashboardContent initialRuns={await listDemoRuns()} userName="" userEmail="" isDemo />
  }

  const user = await getUserByGoogleId(session.user.googleId)
  if (!user) redirect('/login?callbackUrl=/dashboard')

  const runs = await listRuns(user.id)

  return (
    <DashboardContent
      initialRuns={runs}
      userName={user.name}
      userEmail={user.email}
    />
  )
}
