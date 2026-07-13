'use client'

import { useHMISlow } from '@/lib/hmi-context'
import { cn } from '@/lib/utils'
import type { ESPMode } from '@/lib/hmi-types'

interface ModeBadgeConfig {
  dot: string
  label: string
  badge: string
  pulse: boolean
}

const MODE_CONFIG: Record<ESPMode | 'null', ModeBadgeConfig> = {
  null: {
    dot: 'bg-red-500',
    label: 'Not Connected',
    badge: 'bg-red-500/10 text-hmi-text-error border-red-500/20',
    pulse: false,
  },
  IDLE: {
    dot: 'bg-zinc-400',
    label: 'IDLE',
    badge: 'bg-zinc-500/10 text-hmi-text-neutral border-zinc-500/20',
    pulse: true,
  },
  SCARA: {
    dot: 'bg-emerald-500',
    label: 'SCARA',
    badge: 'bg-emerald-500/10 text-hmi-text-success border-emerald-500/20',
    pulse: false,
  },
  ZN: {
    dot: 'bg-amber-500',
    label: 'ZN',
    badge: 'bg-amber-500/10 text-hmi-text-warning border-amber-500/20',
    pulse: false,
  },
  TEST: {
    dot: 'bg-indigo-500',
    label: 'TEST',
    badge: 'bg-indigo-500/10 text-hmi-text-violet border-indigo-500/20',
    pulse: false,
  },
}

/**
 * Badge kecil yang menampilkan mode ESP32 saat ini.
 * Membaca `currentMode` dari HMIContext — tidak perlu props.
 *
 * Letakkan di navbar/header setelah badge serial status.
 */
export function ModeBadge({ className }: { className?: string }) {
  const { state } = useHMISlow()
  const mode = state.currentMode

  const cfg = MODE_CONFIG[mode ?? 'null']

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium border select-none',
        cfg.badge,
        className
      )}
      title={`ESP32 Mode: ${mode ?? 'Not Connected'}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {cfg.pulse && (
          <span
            className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              cfg.dot
            )}
          />
        )}
        <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', cfg.dot)} />
      </span>
      {cfg.label}
    </span>
  )
}
