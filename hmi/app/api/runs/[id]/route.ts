import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getRunWithData, deleteRun, getUserByGoogleId } from '@/lib/db/queries'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.googleId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const data = await getRunWithData(id)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
