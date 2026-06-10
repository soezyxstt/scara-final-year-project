'use client'

import { useState } from 'react'
import type { Run } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

// Distinct colors for multi-run comparison
export const RUN_COLORS = [
  '#2196F3', '#FF9800', '#4CAF50', '#E91E63',
  '#9C27B0', '#00BCD4', '#FF5722', '#8BC34A',
]

interface Props {
  runs: Run[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onRunDeleted: (id: string) => void
}

export function RunSelector({ runs, selectedIds, onSelectionChange, onRunDeleted }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function toggleRun(id: string) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(s => s !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete run "${name}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/runs/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onRunDeleted(id)
      onSelectionChange(selectedIds.filter(s => s !== id))
      toast.success(`Run "${name}" deleted.`)
    } catch {
      toast.error('Failed to delete run.')
    } finally {
      setDeletingId(null)
    }
  }

  if (runs.length === 0) {
    return (
      <div className="p-4 text-xs text-hmi-muted text-center">
        No runs saved yet.<br />
        Use <span className="text-hmi-ideal">Run + Save</span> in the HMI to save your first run.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto">
      <div className="px-3 py-2 text-[10px] text-hmi-muted font-semibold uppercase tracking-wider border-b border-hmi-grid">
        {runs.length} run{runs.length !== 1 ? 's' : ''} • select to compare
      </div>
      {runs.map((run, idx) => {
        const isSelected = selectedIds.includes(run.id)
        const colorIdx = selectedIds.indexOf(run.id)
        const color = colorIdx >= 0 ? RUN_COLORS[colorIdx % RUN_COLORS.length] : '#4B5563'
        const date = new Date(run.startedAt)
        const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

        return (
          <div
            key={run.id}
            className={cn(
              'group flex items-start gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors text-xs',
              isSelected
                ? 'bg-hmi-grid/30 text-hmi-text'
                : 'border-transparent text-hmi-muted hover:bg-hmi-grid/20 hover:text-hmi-text'
            )}
            style={{ borderLeftColor: isSelected ? color : 'transparent' }}
            onClick={() => toggleRun(run.id)}
          >
            {/* Color dot */}
            <span
              className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 border"
              style={{
                backgroundColor: isSelected ? color : 'transparent',
                borderColor: isSelected ? color : '#4B5563',
              }}
            />

            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-[11px]" title={run.name}>{run.name}</p>
              <p className="text-[10px] text-hmi-muted">{dateStr} {timeStr}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-hmi-muted/70">
                {run.elapsedTime != null && (
                  <span>{run.elapsedTime.toFixed(2)}s</span>
                )}
                {run.accuracyIdx != null && (
                  <span>AI={( run.accuracyIdx * 100).toFixed(1)}%</span>
                )}
                {run.sampleCount != null && (
                  <span>{run.sampleCount} pts</span>
                )}
              </div>
            </div>

            <button
              className={cn(
                'shrink-0 p-0.5 rounded text-hmi-muted opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400',
                deletingId === run.id && 'opacity-100 animate-pulse'
              )}
              onClick={e => { e.stopPropagation(); handleDelete(run.id, run.name) }}
              title="Delete run"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
