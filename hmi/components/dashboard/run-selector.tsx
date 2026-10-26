'use client'

import { useState } from 'react'
import type { Run } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import { Play, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Distinct colors for multi-run comparison
export const RUN_COLORS = [
  '#2196F3', '#FF9800', '#4CAF50', '#E91E63',
  '#9C27B0', '#00BCD4', '#FF5722', '#8BC34A',
]

interface Props {
  readOnly?: boolean
  runs: Run[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onRunDeleted: (id: string) => void
  onReplay?: (id: string) => void
}

export function RunSelector({ runs, selectedIds, onSelectionChange, onRunDeleted, onReplay, readOnly = false }: Props) {
  const t = useTranslations('SavedRuns')
  const tFeedback = useTranslations('DashboardRunSelector')
  const locale = useLocale()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filteredRuns = runs.filter(run =>
    run.name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale))
  )

  function toggleRun(id: string) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(tFeedback('confirmDelete', { name }))) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/runs/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onRunDeleted(id)
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id))
      toast.success(tFeedback('deleteSuccess', { name }))
    } catch {
      toast.error(tFeedback('deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  if (runs.length === 0) {
    return <div className="p-5 text-center text-[13px] text-hmi-muted">{t('empty')}</div>
  }

  return (
    <div data-run-library className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-hmi-grid p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-hmi-text">{t('compare')}</span>
          <span className="text-[12px] tabular-nums text-hmi-muted">
            {t('count', { count: filteredRuns.length })}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-hmi-muted" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="pl-8"
          />
        </div>
      </div>

      {filteredRuns.length === 0 ? (
        <div className="p-5 text-center text-[13px] text-hmi-muted">{t('empty')}</div>
      ) : (
        <ul className="min-h-0 divide-y divide-hmi-grid overflow-y-auto">
          {filteredRuns.map(run => {
            const isSelected = selectedIds.includes(run.id)
            const colorIndex = selectedIds.indexOf(run.id)
            const color = colorIndex >= 0 ? RUN_COLORS[colorIndex % RUN_COLORS.length] : '#64748B'
            const startedAt = new Date(run.startedAt)
            const dateText = startedAt.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
            const durationText = run.elapsedTime == null
              ? null
              : `${new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', {
                  maximumFractionDigits: 1,
                }).format(run.elapsedTime)} s`

            return (
              <li key={run.id} className="flex items-center gap-2 px-3 py-3 hover:bg-hmi-grid/10">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRun(run.id)}
                    aria-label={run.name}
                    style={{ accentColor: color }}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-hmi-ideal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hmi-ideal focus-visible:ring-offset-2 focus-visible:ring-offset-hmi-bg"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-hmi-text" title={run.name}>
                      {run.name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-hmi-muted">
                      {readOnly ? <span>{t('thesisRecording')}</span> : <time dateTime={startedAt.toISOString()}>{dateText}</time>}
                      {durationText && <span>{durationText}</span>}
                    </span>
                  </span>
                </label>

                <div className="flex shrink-0 items-center gap-1">
                  {onReplay && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onReplay(run.id)}
                      aria-label={`${t('replay')}: ${run.name}`}
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('replay')}
                    </Button>
                  )}
                  {!readOnly && <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={deletingId === run.id}
                    onClick={() => handleDelete(run.id, run.name)}
                    aria-label={`${deletingId === run.id ? t('loading') : t('delete')}: ${run.name}`}
                    title={deletingId === run.id ? t('loading') : t('delete')}
                    className={cn('h-8 w-8 text-hmi-muted hover:text-hmi-estop', deletingId === run.id && 'animate-pulse')}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{deletingId === run.id ? t('loading') : t('delete')}</span>
                  </Button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
