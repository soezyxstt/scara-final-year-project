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
    badge: 'bg-red-950/60 text-red-400 border-red-800/50',
    pulse: false,
  },
  IDLE: {
    dot: 'bg-zinc-400',
    label: 'IDLE',
    badge: 'bg-zinc-900/60 text-zinc-400 border-zinc-700/50',
    pulse: true,
  },
  SCARA: {
    dot: 'bg-emerald-400',
    label: 'SCARA',
    badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50',
    pulse: false,
  },
  ZN: {
    dot: 'bg-amber-400',
    label: 'ZN',
    badge: 'bg-amber-950/60 text-amber-400 border-amber-800/50',
    pulse: false,
  },
  TEST: {
    dot: 'bg-indigo-400',
    label: 'TEST',
    badge: 'bg-indigo-950/60 text-indigo-400 border-indigo-800/50',
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
