import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { listRuns, getUserByGoogleId } from '@/lib/db/queries'
import { DashboardContent } from './dashboard-content'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.googleId) redirect('/login')

  const user = await getUserByGoogleId(session.user.googleId)
  if (!user) redirect('/login')

  const runs = await listRuns(user.id)

  return (
    <DashboardContent
      initialRuns={runs}
      userName={user.name}
      userEmail={user.email}
    />
  )
}
