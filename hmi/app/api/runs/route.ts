import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listRuns, saveRun, getUserByGoogleId } from '@/lib/db/queries'
import type { NewSample, NewTrajectoryPoint } from '@/lib/db/schema'

export async function GET() {
  const session = await auth()
  if (!session?.user?.googleId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = await getUserByGoogleId(session.user.googleId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const runList = await listRuns(user.id)
  return NextResponse.json(runList)
}

function findClosest<T extends { t: number }>(arr: T[] | undefined | null, targetT: number): T | null {
  if (!arr || arr.length === 0) return null
  let closest = arr[0]
  let minDiff = Math.abs(arr[0].t - targetT)
  for (let i = 1; i < arr.length; i++) {
    const diff = Math.abs(arr[i].t - targetT)
    if (diff < minDiff) {
      minDiff = diff
      closest = arr[i]
    } else if (arr[i].t > targetT + minDiff) {
      break
    }
  }
  if (minDiff > 500) return null // Discard matches with latency > 500ms
  return closest
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.googleId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = await getUserByGoogleId(session.user.googleId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json()
  const {
    name,
    startedAt,
    endedAt,
    moveInfo,
    stats,
    gains,
    params,
    frozenD,
    frozenF,
    frozenE,
    frozenT,
  } = body

  // Merge D + F + E by aligning timestamps (t)
  const sampleList: NewSample[] = (frozenD as any[] ?? []).map((d: any) => {
    const f = findClosest(frozenF as any[], d.t)
    const e = findClosest(frozenE as any[], d.t)
    return {
      runId: '',
      t: d.t,
      th1: d.th1 ?? null,
      th2: d.th2 ?? null,
      th1d: d.th1d ?? null,
      th2d: d.th2d ?? null,
      dth1: d.dth1 ?? null,
      dth2: d.dth2 ?? null,
      dth1d: d.dth1d ?? null,
      dth2d: d.dth2d ?? null,
      pwm1: d.pwm1 ?? null,
      vff1: d.vff1 ?? null,
      u1Total: d.u1Total ?? null,
      th1Raw: d.th1raw ?? null,
      th2Raw: d.th2raw ?? null,
      e1: d.e1 ?? null,
      e2: d.e2 ?? null,
      inertia1: f?.inertia1 ?? null,
      coriolis1: f?.coriolis1 ?? null,
      gravity1: f?.gravity1 ?? null,
      inertia2: f?.inertia2 ?? null,
      coriolis2: f?.coriolis2 ?? null,
      gravity2: f?.gravity2 ?? null,
      ff1Contrib: f?.ff1Contrib ?? null,
      fU1Total: f?.u1Total ?? null,
      integral1: f?.integral1 ?? null,
      deltaOmegaFf: f?.deltaOmegaFf ?? null,
      omega2Raw: f?.omega2Raw ?? null,
      integral2: f?.integral2 ?? null,
      p1Out: e?.p1_out ?? null,
      i1Out: e?.i1_out ?? null,
      d1Out: e?.d1_out ?? null,
      loopDurationUs: e?.loop_duration_us ?? null,
    }
  })

  const trajectoryList: NewTrajectoryPoint[] = (frozenT ?? []).map(
    (pt: { xi: number; yi: number; xa: number; ya: number }, seq: number) => ({
      runId: '',
      seq,
      xi: pt.xi,
      yi: pt.yi,
      xa: pt.xa,
      ya: pt.ya,
    })
  )

  const id = await saveRun({
    userId: user.id,
    name,
    startedAt,
    endedAt,
    moveInfo,
    stats,
    gainsJson: JSON.stringify(gains),
    paramsJson: JSON.stringify(params),
    sampleList,
    trajectoryList,
  })

  return NextResponse.json({ id }, { status: 201 })
}
