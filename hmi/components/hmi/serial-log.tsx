'use client'

import { useEffect, useRef, useState } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Trash2, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function tagBadge(line: string) {
  const tag = line.split(',')[0]
  if (tag === 'M') return <Badge className="bg-hmi-ideal text-white text-[9px] mr-1">MOVE</Badge>
  if (tag === 'S') return <Badge className="bg-hmi-ok text-white text-[9px] mr-1">DONE</Badge>
  if (tag === 'G') return <Badge className="bg-hmi-muted text-black text-[9px] mr-1">GAINS</Badge>
  return null
}

export function SerialLog() {
  const { state, dispatch, serial } = useHMISlow()
  const endRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.logLines, isFocused])

  // Listen for Escape key to close focus
  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFocused(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  function clearLog() {
    dispatch({ type: 'CLEAR_LOGS' })
  }

  function clearGraph() {
    serial.sendCommand('clrgraph')
    dispatch({ type: 'FLUSH_BUFFERS' })
  }

  return (
    <div className={cn(
      "bg-hmi-panel border border-hmi-grid rounded-lg flex flex-col h-full w-full transition-all duration-300",
      isFocused 
        ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
        : "relative"
    )}>
      <div className="flex items-center justify-between px-2 py-1 border-b border-hmi-grid shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-hmi-muted">
            Serial Log
          </p>
          {isFocused && (
            <span className="text-xs text-hmi-muted font-normal">(Press ESC to exit focus)</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip content="Clear Log: Clears all log entries from the serial terminal display." align="center">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearLog} 
              className="h-5 px-1.5 text-[10px] text-hmi-target border-hmi-target/30 hover:bg-hmi-target/10 hover:text-hmi-target"
            >
              <Trash2 className="h-3 w-3 text-hmi-target" />
              Clear Log
            </Button>
          </Tooltip>
          <Tooltip content="Clear Graph: Resets current trajectory data buffers and clears all chart plots." align="center">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearGraph} 
              className="h-5 px-1.5 text-[10px] text-hmi-actual border-hmi-actual/30 hover:bg-hmi-actual/10 hover:text-hmi-actual"
            >
              <Trash2 className="h-3 w-3 text-hmi-actual" />
              Clear Graph
            </Button>
          </Tooltip>
          <Tooltip content={isFocused ? "Collapse: Restores the panel to normal size." : "Expand: Maximizes the serial log terminal."} align="center">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); setIsFocused(!isFocused); }} 
              className="h-5 px-1.5 text-[10px] text-slate-300 border-slate-700/60 hover:bg-slate-800/80 hover:text-white"
            >
              {isFocused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              {isFocused ? 'Collapse' : 'Expand'}
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {state.logLines.slice(isFocused ? -100 : -15).map((line, i) => (
          <div key={i} className="flex items-center font-mono text-xs text-[#86efac] leading-5">
            {tagBadge(line)}
            <span className="truncate">{line}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
