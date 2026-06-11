'use client'

import { useEffect, useRef, useState } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Trash2, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Telemetry packet prefixes that generate high-frequency noise in the log
const TELEMETRY_PREFIXES = ['D,', 'T,', 'F,', 'E,', 'B,']

function isTelemetry(line: string) {
  return TELEMETRY_PREFIXES.some(p => line.startsWith(p))
}

function tagBadge(line: string) {
  const tag = line.split(',')[0]
  if (tag === 'M') return <Badge className="bg-hmi-ideal text-white text-[9px] mr-1">MOVE</Badge>
  if (tag === 'S') return <Badge className="bg-hmi-ok text-white text-[9px] mr-1">DONE</Badge>
  if (tag === 'G') return <Badge className="bg-hmi-muted text-black text-[9px] mr-1">GAINS</Badge>
  if (tag === 'X') return <Badge className="bg-hmi-btn text-hmi-text-secondary text-[9px] mr-1">MODE</Badge>
  return null
}

export function SerialLog() {
  const { state, dispatch, serial } = useHMISlow()
  const endRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [filtered, setFiltered] = useState(true)

  const visibleLines = filtered
    ? state.logLines.filter(l => !isTelemetry(l))
    : state.logLines

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleLines.length, isFocused])

  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFocused(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  return (
    <div className={cn(
      "bg-hmi-panel border border-hmi-grid rounded-lg flex flex-col h-full w-full",
      isFocused ? "fixed inset-0 z-[100] m-0 rounded-none bg-hmi-bg" : "relative"
    )}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-hmi-grid shrink-0 bg-hmi-elevated/60">
        {/* Terminal-style title */}
        <span className="text-[11px] font-bold text-hmi-text-secondary uppercase tracking-wider select-none mr-1">
          Serial Monitor
        </span>
        {isFocused && (
          <span className="text-[10px] text-hmi-muted font-normal">ESC to exit</span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Filter toggle */}
          <Tooltip
            content={filtered
              ? 'Filtered: Hiding high-frequency telemetry packets (D/T/F/E/B). Click to show all.'
              : 'Unfiltered: Showing all raw serial data. Click to hide telemetry noise.'}
            align="center"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltered(f => !f)}
              className={cn(
                "h-5 px-1.5 text-[10px] transition-colors",
                filtered
                  ? "text-hmi-ideal border-hmi-ideal/40 hover:bg-hmi-ideal/10"
                  : "text-amber-400 border-amber-500/40 hover:bg-amber-500/10"
              )}
            >
              {filtered ? '⊘ Filtered' : '≡ Raw'}
            </Button>
          </Tooltip>

          <Tooltip content="Clear Log: Removes all entries from the serial terminal display." align="center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch({ type: 'CLEAR_LOGS' })}
              className="h-5 px-1.5 text-[10px] text-hmi-target border-hmi-target/30 hover:bg-hmi-target/10 hover:text-hmi-target"
            >
              <Trash2 className="h-3 w-3 mr-0.5" />
              Clear
            </Button>
          </Tooltip>

          <Tooltip content="Clear Graph: Resets trajectory data buffers and clears all chart plots." align="center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { serial.sendCommand('clrgraph'); dispatch({ type: 'FLUSH_BUFFERS' }) }}
              className="h-5 px-1.5 text-[10px] text-hmi-actual border-hmi-actual/30 hover:bg-hmi-actual/10 hover:text-hmi-actual"
            >
              <Trash2 className="h-3 w-3 mr-0.5" />
              Clear Graph
            </Button>
          </Tooltip>

          <Tooltip content={isFocused ? 'Collapse to panel.' : 'Expand to full screen.'} align="center">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setIsFocused(f => !f) }}
              className="h-5 px-1.5 text-[10px] text-hmi-text-secondary border-hmi-grid/60 hover:bg-hmi-btn"
            >
              {isFocused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto px-2 py-1 font-mono text-xs">
        {visibleLines.length === 0 ? (
          <span className="text-hmi-muted italic text-[11px]">
            {filtered ? 'No non-telemetry messages yet.' : 'No serial data received yet.'}
          </span>
        ) : (
          visibleLines.slice(-200).map((line, i) => (
            <div key={i} className="flex items-center leading-5">
              {tagBadge(line)}
              <span className={cn(
                "truncate",
                isTelemetry(line) ? "text-hmi-muted" : "text-hmi-text-success"
              )}>
                {line}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
