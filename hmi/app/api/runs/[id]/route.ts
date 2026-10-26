import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getRunWithData, deleteRun, getUserByGoogleId } from '@/lib/db/queries'
import { getDemoRunWithData } from '@/lib/demo-data'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const { id } = await params
  if (!session?.user?.googleId) {
    const data = await getDemoRunWithData(id)
    return data ? NextResponse.json(data) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const user = await getUserByGoogleId(session.user.googleId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const data = await getRunWithData(id)
  if (!data || data.run.userId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.googleId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = await getUserByGoogleId(session.user.googleId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const { id } = await params
  const ok = await deleteRun(id, user.id)
  if (!ok) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
