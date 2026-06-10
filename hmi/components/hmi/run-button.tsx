'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useHMISlow } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import { SaveRunDialog } from './save-run-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { checkStraightLineTrajectory, getCurrentPosition } from '@/lib/trajectory-safety'
import { ChevronDown } from 'lucide-react'

type RunMode = 'run' | 'run-save'
const LS_KEY = 'hmi_run_mode'

function loadMode(): RunMode {
  if (typeof window === 'undefined') return 'run'
  return (localStorage.getItem(LS_KEY) as RunMode) ?? 'run'
}

export function RunButton() {
  const { state, serial, dispatch } = useHMISlow()
  const { data: session } = useSession()
  const [mode, setMode] = useState<RunMode>('run')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load persisted mode on mount
  useEffect(() => {
    setMode(loadMode())
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  // Watch recordingState: when REC → IDLE and pendingSave is set, save to DB
  const prevRecording = useRef(state.recordingState)
  const saveInProgress = useRef(false)

  const saveRunToDb = useCallback(async () => {
    if (saveInProgress.current) return
    const { pendingSave, frozenD, frozenF, frozenE, frozenT, stats, gains, params, currentMove } = state
    if (!pendingSave) return

    saveInProgress.current = true
    const toastId = toast.loading(`Saving run "${pendingSave.name}"…`)

    try {
      const body = {
        name: pendingSave.name,
        startedAt: pendingSave.startedAt,
        endedAt: Date.now(),
        moveInfo: currentMove ?? { x0: 0, y0: 0, xf: 0, yf: 0 },
        stats,
        gains,
        params,
        frozenD,
        frozenF,
        frozenE,
        frozenT,
      }
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
      toast.success(`Run "${pendingSave.name}" saved to database`, { id: toastId })
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`, { id: toastId })
    } finally {
      dispatch({ type: 'CLEAR_PENDING_SAVE' })
      saveInProgress.current = false
    }
  }, [state, dispatch])

  useEffect(() => {
    if (prevRecording.current === 'REC' && state.recordingState === 'IDLE' && state.pendingSave) {
      saveRunToDb()
    }
    prevRecording.current = state.recordingState
  }, [state.recordingState, state.pendingSave, saveRunToDb])

  const { serialStatus, targetInputX, targetInputY } = state
  const isConnected = serialStatus === 'connected'
  const hasTarget = targetInputX !== null && targetInputY !== null

  function selectMode(m: RunMode) {
    setMode(m)
    localStorage.setItem(LS_KEY, m)
    setDropdownOpen(false)
  }

  async function executeRun(x: number, y: number) {
    // Workspace validation
    const r2 = x * x + y * y
    if (r2 < 45 * 45 || r2 > 170 * 170 || y < 0) {
      toast.error(`Target (${x}, ${y}) is outside the reachable workspace.`)
      return
    }
    const currentPos = getCurrentPosition(state)
    const safety = checkStraightLineTrajectory(currentPos, { x, y }, 45, 170)
    if (!safety.isValid) {
      if (safety.reason === 'inner_violation') {
        const minD = safety.minDistance?.toFixed(1) ?? 'unknown'
        toast.error(`Path passes through inner dead zone (min ${minD} mm, required ≥ 45 mm).`)
      } else {
        toast.error('Trajectory path is unsafe or out of bounds.')
      }
      return
    }
    await serial.sendCommand(`move,${x},${y}`)
  }

  async function handleRun() {
    if (!hasTarget || !isConnected) return
    const x = targetInputX!
    const y = targetInputY!

    if (mode === 'run') {
      await executeRun(x, y)
    } else {
      // run-save: check auth first
      if (!session) {
        toast.error('Please sign in to save runs to the database.', {
          action: { label: 'Sign in', onClick: () => { window.location.href = '/login' } },
        })
        return
      }
      setSaveDialogOpen(true)
    }
  }

  async function handleConfirmSave(name: string) {
    setSaveDialogOpen(false)
    if (!hasTarget || !isConnected) return
    const x = targetInputX!
    const y = targetInputY!
    // Set pending save BEFORE sending move command
    dispatch({ type: 'SET_PENDING_SAVE', name, startedAt: Date.now() })
    await executeRun(x, y)
  }

  const modeLabel = mode === 'run' ? 'Run' : 'Run + Save'

  return (
    <>
      <div ref={dropdownRef} className="relative flex items-center">
        {/* Main run button */}
        <Button
          size="sm"
          variant="outline"
          onClick={handleRun}
          disabled={!isConnected || !hasTarget}
          className={cn(
            'h-7 text-xs rounded-r-none border-r-0 min-w-[88px] transition-colors',
            mode === 'run-save'
              ? 'border-hmi-ideal/60 text-hmi-ideal hover:bg-hmi-ideal/10'
              : ''
          )}
        >
          ▶ {modeLabel}
        </Button>

        {/* Chevron toggle */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDropdownOpen(v => !v)}
          className="h-7 w-6 rounded-l-none px-0 text-hmi-muted hover:text-hmi-text"
          aria-label="Choose run mode"
        >
          <ChevronDown className="w-3 h-3" />
        </Button>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-1 w-44 bg-hmi-panel border border-hmi-grid rounded-md shadow-lg z-50 overflow-hidden">
            <button
              className={cn(
                'w-full text-left px-3 py-2 text-xs hover:bg-hmi-grid/50 transition-colors flex items-center gap-2',
                mode === 'run' ? 'text-hmi-text font-semibold' : 'text-hmi-muted'
              )}
              onClick={() => selectMode('run')}
            >
              <span className="w-2 h-2 rounded-full bg-hmi-ok shrink-0" />
              Run
              <span className="ml-auto text-hmi-muted/60 text-[10px]">no save</span>
            </button>
            <button
              className={cn(
                'w-full text-left px-3 py-2 text-xs hover:bg-hmi-grid/50 transition-colors flex items-center gap-2',
                mode === 'run-save' ? 'text-hmi-ideal font-semibold' : 'text-hmi-muted'
              )}
              onClick={() => selectMode('run-save')}
            >
              <span className="w-2 h-2 rounded-full bg-hmi-ideal shrink-0" />
              Run + Save to DB
              <span className="ml-auto text-hmi-muted/60 text-[10px]">auth req.</span>
            </button>
          </div>
        )}
      </div>

      <SaveRunDialog
        open={saveDialogOpen}
        onConfirm={handleConfirmSave}
        onCancel={() => setSaveDialogOpen(false)}
      />
    </>
  )
}
