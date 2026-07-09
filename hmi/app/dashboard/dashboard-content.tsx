'use client'

import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { RunSelector, RUN_COLORS } from '@/components/dashboard/run-selector'
import { TrajectoryTab } from '@/components/dashboard/trajectory-tab'
import { VelocityTab } from '@/components/dashboard/velocity-tab'
import { PidTab } from '@/components/dashboard/pid-tab'
import { FeedforwardTab } from '@/components/dashboard/feedforward-tab'
import { MetricsTab } from '@/components/dashboard/metrics-tab'
import { AdvancedTab } from '@/components/dashboard/advanced-tab'
import { GroupCompareTab } from '@/components/dashboard/group-compare-tab'
import type { Run, Sample, TrajectoryPoint } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CommandPaletteTrigger } from '@/components/hmi/command-palette'
import { ThemeToggle } from '@/components/hmi/theme-toggle'

type TabId = 'trajectory' | 'velocity' | 'pid' | 'feedforward' | 'metrics' | 'advanced' | 'groupCompare'

const TABS: { id: TabId; label: string }[] = [
  { id: 'trajectory', label: 'Trajectory' },
  { id: 'velocity', label: 'Velocity & Control' },
  { id: 'pid', label: 'PID, CTE & ATE' },
  { id: 'feedforward', label: 'Feedforward' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'groupCompare', label: 'Group Compare' },
]

interface LoadedRun {
  run: Run
  samples: Sample[]
  trajectoryPoints: TrajectoryPoint[]
}

interface Props {
  initialRuns: Run[]
  userName: string
  userEmail: string
}

export function DashboardContent({ initialRuns, userName, userEmail }: Props) {
  const [runs, setRuns] = useState<Run[]>(initialRuns)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loadedData, setLoadedData] = useState<Record<string, LoadedRun>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<TabId>('trajectory')

  // Load run data when selection changes
  useEffect(() => {
    const toLoad = selectedIds.filter(id => !loadedData[id] && !loadingIds.has(id))
    if (toLoad.length === 0) return

    setLoadingIds(prev => new Set([...prev, ...toLoad]))

    Promise.all(
      toLoad.map(async id => {
        try {
          const res = await fetch(`/api/runs/${id}`)
          if (!res.ok) throw new Error('Failed to load run')
          return { id, data: await res.json() as LoadedRun }
        } catch {
          toast.error(`Failed to load run ${id}`)
          return null
        }
      })
    ).then(results => {
      const newData: Record<string, LoadedRun> = {}
      for (const r of results) {
        if (r) newData[r.id] = r.data
      }
      setLoadedData(prev => ({ ...prev, ...newData }))
      setLoadingIds(prev => {
        const next = new Set(prev)
        toLoad.forEach(id => next.delete(id))
        return next
      })
    })
  }, [selectedIds, loadedData, loadingIds])

  const handleRunDeleted = useCallback((id: string) => {
    setRuns(prev => prev.filter(r => r.id !== id))
    setLoadedData(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // Build datasets for current selection
  const activeRunData = selectedIds
    .map((id, idx) => {
      const data = loadedData[id]
      if (!data) return null
      return {
        runId: id,
        runName: data.run.name,
        color: RUN_COLORS[idx % RUN_COLORS.length],
        run: data.run,
        samples: data.samples,
        trajectoryPoints: data.trajectoryPoints,
      }
    })
    .filter(Boolean) as Array<{
      runId: string; runName: string; color: string;
      run: Run; samples: Sample[]; trajectoryPoints: TrajectoryPoint[]
    }>

  const isLoading = selectedIds.some(id => loadingIds.has(id))

  return (
    <div className="flex h-screen bg-hmi-bg text-hmi-text overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-hmi-grid bg-hmi-panel flex flex-col">
        {/* Sidebar header */}
        <div className="px-3 py-3 border-b border-hmi-grid">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-hmi-bg border border-hmi-grid flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
                <path d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z" stroke="#2196F3" strokeWidth={1.5} strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold text-hmi-text">SCARA HMI</p>
              <p className="text-[10px] text-hmi-muted">Dashboard</p>
            </div>
          </div>
        </div>

        {/* Run list */}
        <div className="flex-1 overflow-y-auto">
          <RunSelector
            runs={runs}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRunDeleted={handleRunDeleted}
          />
        </div>

        {/* User info + actions */}
        <div className="border-t border-hmi-grid px-3 py-2 flex flex-col gap-1.5">
          <div className="text-[10px] text-hmi-muted truncate" title={userEmail}>{userName}</div>
          <div className="flex items-center gap-1.5">
            <a
              href="/"
              className="flex-1 text-center text-[10px] py-1 rounded border border-hmi-grid text-hmi-muted hover:text-hmi-text hover:border-hmi-grid/80 transition-colors"
            >
              ← HMI
            </a>
            <button
              className="flex-1 text-[10px] py-1 rounded border border-hmi-grid text-hmi-muted hover:text-red-400 hover:border-red-400/50 transition-colors"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-hmi-panel border-b border-hmi-grid px-4 h-12 flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-bold text-hmi-text uppercase tracking-wide">Dashboard</span>
            {isLoading && (
              <span className="text-[10px] text-hmi-muted animate-pulse">loading…</span>
            )}
          </div>



          {/* Tab nav */}
          <div className="ml-auto flex items-center gap-4 h-full">
            <ThemeToggle />
            <CommandPaletteTrigger />
            <nav className="flex h-12">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'h-12 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                    tab === t.id
                      ? 'border-hmi-ideal text-hmi-text'
                      : 'border-transparent text-hmi-muted hover:text-hmi-text'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'trajectory' && <TrajectoryTab runs={activeRunData} />}
          {tab === 'velocity' && <VelocityTab runs={activeRunData} />}
          {tab === 'pid' && <PidTab runs={activeRunData} />}
          {tab === 'feedforward' && <FeedforwardTab runs={activeRunData} />}
          {tab === 'metrics' && (
            <MetricsTab runs={activeRunData.map(r => ({ run: r.run, color: r.color }))} />
          )}
          {tab === 'advanced' && <AdvancedTab runs={activeRunData} />}
          {tab === 'groupCompare' && (
            <GroupCompareTab
              runs={activeRunData}
              allRuns={runs}
              onSelectRuns={setSelectedIds}
              selectedIds={selectedIds}
            />
          )}

        </div>
      </div>
    </div>
  )
}
