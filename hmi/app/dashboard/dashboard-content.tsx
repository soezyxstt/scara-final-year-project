'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { DemoNotice } from '@/components/hmi/demo-notice'
import { signOut } from 'next-auth/react'
import { registerSavedRunCaptureSource } from '@/lib/capture-session'
import { useTranslations } from 'next-intl'
import { FolderClock, LogOut, X, RefreshCw } from 'lucide-react'
import { ConsoleTabs } from '@/components/hmi/console-shell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { RunSelector, RUN_COLORS } from '@/components/dashboard/run-selector'
import { TrajectoryTab } from '@/components/dashboard/trajectory-tab'
import { VelocityTab } from '@/components/dashboard/velocity-tab'
import { PidTab } from '@/components/dashboard/pid-tab'
import { FeedforwardTab } from '@/components/dashboard/feedforward-tab'
import { MetricsTab } from '@/components/dashboard/metrics-tab'
import { AdvancedTab } from '@/components/dashboard/advanced-tab'
import { GroupCompareTab } from '@/components/dashboard/group-compare-tab'
import type { SavedRunDataset } from '@/components/dashboard/dashboard-xy-trace'
import type { Run, Sample, TrajectoryPoint } from '@/lib/db/schema'

type TabId = 'trajectory' | 'velocity' | 'pid' | 'feedforward' | 'metrics' | 'advanced' | 'groupCompare'
const TABS: TabId[] = ['trajectory', 'velocity', 'pid', 'feedforward', 'metrics', 'advanced', 'groupCompare']
interface LoadedRun { run: Run; samples: Sample[]; trajectoryPoints: TrajectoryPoint[] }
interface Props { initialRuns: Run[]; userName: string; userEmail: string; isDemo?: boolean }

export function DashboardContent({ initialRuns, userName, userEmail, isDemo = false }: Props) {
  const t = useTranslations('Dashboard')
  const saved = useTranslations('SavedRuns')
  const [runs, setRuns] = useState(initialRuns)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => initialRuns[0] ? [initialRuns[0].id] : [])
  const [loaded, setLoaded] = useState<Record<string, LoadedRun>>({})
  const cache = useRef<Record<string, LoadedRun>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<string[]>([])
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState<TabId>('trajectory')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [replayRequest, setReplayRequest] = useState<{ runId: string; token: number } | null>(null)

  useEffect(() => {
    const ids = selectedIds.filter(id => !cache.current[id])
    const controller = new AbortController()
    let active = true
    // Selection starts a bounded request batch; failures require an explicit retry.
    void Promise.resolve().then(async () => {
      if (!active) return
      setLoadingIds(new Set(ids))
      setErrors([])
      const results = await Promise.all(ids.map(async id => {
        try {
          const response = await fetch(`/api/runs/${encodeURIComponent(id)}`, { signal: controller.signal })
          if (!response.ok) throw new Error('Run request failed')
          const data: LoadedRun = await response.json()
          if (data.run?.id !== id || !Array.isArray(data.samples) || !Array.isArray(data.trajectoryPoints)) throw new Error('Invalid recording')
          return { id, data }
        } catch { return { id, data: null } }
      }))
      if (!active) return
      const successful: Record<string, LoadedRun> = {}
      for (const result of results) if (result.data) successful[result.id] = result.data
      cache.current = { ...cache.current, ...successful }
      setLoaded(previous => ({ ...previous, ...successful }))
      setErrors(results.filter(result => !result.data).map(result => result.id))
      setLoadingIds(new Set())
    })
    return () => { active = false; controller.abort() }
  }, [selectedIds, retry])

  const handleDeleted = useCallback((id: string) => {
    setRuns(previous => previous.filter(run => run.id !== id))
    setSelectedIds(previous => previous.filter(selected => selected !== id))
    delete cache.current[id]
    setLoaded(previous => { const next = { ...previous }; delete next[id]; return next })
    setReplayRequest(previous => previous?.runId === id ? null : previous)
  }, [])

  const replay = (id: string) => {
    setSelectedIds(previous => [id, ...previous.filter(selected => selected !== id)])
    setReplayRequest(previous => ({ runId: id, token: (previous?.token ?? 0) + 1 }))
    setTab('trajectory')
    setLibraryOpen(false)
  }
  const selectPrimary = (id: string) => {
    setSelectedIds(previous => [id, ...previous.filter(selected => selected !== id)])
    setReplayRequest(null)
  }
  const activeData = useMemo(() => selectedIds.flatMap((id, index): SavedRunDataset[] => {
    const data = loaded[id]
    return data ? [{ ...data, runId: id, runName: data.run.name, color: RUN_COLORS[index % RUN_COLORS.length] }] : []
  }), [selectedIds, loaded])
  useEffect(() => registerSavedRunCaptureSource(activeData), [activeData])
  const primaryLoading = !!selectedIds[0] && !loaded[selectedIds[0]] && !errors.includes(selectedIds[0])
  const isLoading = selectedIds.some(id => loadingIds.has(id))
  const library = <RunSelector readOnly={isDemo} runs={runs} selectedIds={selectedIds} onSelectionChange={ids => { setSelectedIds(ids); setReplayRequest(null) }} onRunDeleted={handleDeleted} onReplay={replay} />
  const account = isDemo ? null : <div className="saved-runs-account"><span className="truncate" title={userEmail}>{userName}</span><Button size="icon" variant="ghost" aria-label={saved('signOut')} title={saved('signOut')} onClick={() => signOut({ callbackUrl: '/login' })} className="size-8 shrink-0"><LogOut size={15} /></Button></div>

  return (
    <div className="saved-runs-page" data-export-group="saved-runs">
      {isDemo && <DemoNotice />}
      <div className="saved-runs-viewbar">
        <ConsoleTabs label="Run views" value={tab} items={TABS.map(id => ({ value: id, label: t(id) }))} onChange={value => { setTab(value as TabId); if (value !== 'trajectory') setReplayRequest(null) }} />
        <Button variant="outline" size="sm" onClick={() => setLibraryOpen(true)} className="saved-runs-open-library"><FolderClock size={15} />{saved('count', { count: runs.length })}</Button>
      </div>
      <div className="saved-runs-body">
        <div className="saved-runs-main">
          {selectedIds.length > 1 && <div className="saved-runs-selection"><span>{saved('selectedCount', { count: selectedIds.length })}</span><Button size="sm" variant="ghost" onClick={() => { setSelectedIds([]); setReplayRequest(null) }}><X size={14} />{saved('clearSelection')}</Button></div>}
          {errors.length > 0 && <div role="alert" className="saved-runs-error"><span>{saved('loadError')}</span><Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} />{saved('retry')}</Button></div>}
          {isLoading && !primaryLoading && <div className="px-4 pt-3 text-xs text-hmi-muted" role="status">{saved('loading')}</div>}
          {primaryLoading ? <div className="p-4" role="status" aria-label={saved('loading')}><Skeleton className="h-[520px] w-full" /></div> : selectedIds.length === 0 ? <div className="saved-runs-empty"><FolderClock size={28} /><p>{saved('noSelection')}</p><Button variant="outline" className="saved-runs-open-library" onClick={() => setLibraryOpen(true)}>{saved('chooseRun')}</Button></div> : <>
            {tab === 'trajectory' && !!loaded[selectedIds[0]] && <TrajectoryTab runs={activeData} replayRequest={replayRequest} onPrimaryChange={selectPrimary} />}
            {tab === 'velocity' && <VelocityTab runs={activeData} />}
            {tab === 'pid' && <PidTab runs={activeData} />}
            {tab === 'feedforward' && <FeedforwardTab runs={activeData} />}
            {tab === 'metrics' && <MetricsTab runs={activeData.map(data => ({ run: data.run, color: data.color }))} />}
            {tab === 'advanced' && <AdvancedTab runs={activeData} />}
            {tab === 'groupCompare' && <GroupCompareTab runs={activeData} allRuns={runs} onSelectRuns={ids => { setSelectedIds(ids); setReplayRequest(null) }} selectedIds={selectedIds} />}
          </>}
        </div>
        <aside className="saved-runs-library" aria-label={saved('run')}>{library}{account}</aside>
      </div>
      <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
        <SheetContent className="p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 mb-0"><SheetTitle>{saved('count', { count: runs.length })}</SheetTitle><SheetDescription className="sr-only">{saved('chooseRun')}</SheetDescription></SheetHeader>
          {library}{account}
        </SheetContent>
      </Sheet>
    </div>
  )
}
