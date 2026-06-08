'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SerialLog } from './serial-log'

// ── Bottom-sheet terminal (VS Code–style) ────────────────────────────────────

interface SerialTerminalSheetProps {
  open: boolean
  onClose: () => void
}

export function SerialTerminalSheet({ open, onClose }: SerialTerminalSheetProps) {
  const [height, setHeight] = useState(260)
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)
  const startH = useRef(0)

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    startY.current = e.clientY
    startH.current = height
    setDragging(true)
    e.preventDefault()
  }, [height])

  useEffect(() => {
    if (!dragging) return
    const onMouseMove = (e: MouseEvent) => {
      const delta = startY.current - e.clientY
      setHeight(Math.max(120, Math.min(Math.round(window.innerHeight * 0.75), startH.current + delta)))
    }
    const onMouseUp = () => setDragging(false)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[55] overflow-hidden border-t border-hmi-grid bg-hmi-bg shadow-[0_-8px_32px_rgba(0,0,0,0.65)] flex flex-col"
      style={{
        height: open ? height : 0,
        transitionProperty: 'height',
        transitionDuration: dragging ? '0ms' : '300ms',
        transitionTimingFunction: 'cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Drag-to-resize handle */}
      <div
        onMouseDown={onHandleMouseDown}
        className={cn(
          "h-2 w-full shrink-0 flex items-center justify-center group select-none",
          dragging
            ? "cursor-row-resize bg-hmi-ideal/20"
            : "cursor-row-resize bg-slate-900/70 hover:bg-hmi-ideal/10 transition-colors"
        )}
        title="Drag to resize"
      >
        <div className={cn(
          "w-10 h-0.5 rounded-full transition-colors",
          dragging ? "bg-hmi-ideal" : "bg-slate-600 group-hover:bg-hmi-ideal/60"
        )} />
      </div>

      {/* Log content */}
      <div className="flex-1 min-h-0">
        <SerialLog />
      </div>
    </div>
  )
}

// ── Navbar toggle button ──────────────────────────────────────────────────────

interface SerialMonitorButtonProps {
  open: boolean
  onToggle: () => void
  serialConnected: boolean
}

export function SerialMonitorButton({ open, onToggle, serialConnected }: SerialMonitorButtonProps) {
  return (
    <Tooltip
      content={open
        ? 'Serial Monitor: Click to close the terminal panel. (ESC also closes it.)'
        : 'Serial Monitor: Opens a live serial log panel at the bottom of the screen.'}
      align="right"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className={cn(
          "relative gap-1.5 text-[12px]",
          open
            ? "border-hmi-ideal text-hmi-ideal bg-hmi-ideal/10 hover:bg-hmi-ideal/20"
            : "text-slate-300 hover:text-white"
        )}
      >
        {/* Terminal / serial monitor icon */}
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1.5" y="2" width="13" height="9" rx="1.5" />
          <path d="M3.5 5.5 5.5 7.5 3.5 9.5" />
          <path d="M7.5 9.5h4" />
          <path d="M5.5 13.5h5" />
          <path d="M8 11v2.5" />
        </svg>
        Serial
        {serialConnected && (
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-hmi-ok" />
        )}
      </Button>
    </Tooltip>
  )
}
