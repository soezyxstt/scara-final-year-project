'use client'

import { useEffect, useState } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function Header() {
  const { state, serial } = useHMISlow()
  const { serialStatus, portName, online, estopped } = state

  // Available ports from Web Serial API (re-queried on status change)
  const [availablePorts, setAvailablePorts] = useState<{ id: string; label: string }[]>([])
  const [selectedPort, setSelectedPort] = useState<string>('__last__')

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return
    navigator.serial.getPorts().then(ports => {
      const items = ports.map((p, i) => {
        const info = p.getInfo()
        return {
          id: String(i),
          label: `Port ${i + 1} (${info.usbVendorId?.toString(16) ?? '?'}:${info.usbProductId?.toString(16) ?? '?'})`,
        }
      })
      setAvailablePorts(items)
    }).catch(() => { /* no-op if serial not supported */ })
  }, [serialStatus])

  const lastPort = portName ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('hmi_lastPort') : null) ?? ''


  return (
    <header className="sticky top-0 z-50 bg-hmi-panel border-b border-hmi-grid px-4 h-12 flex items-center shrink-0">

      {/* ── LEFT: Logo + Tabs ─────────────────────────────────────────── */}
      <span className="text-sm font-bold text-hmi-text shrink-0 mr-4 tracking-wide">SCARA HMI</span>

      <TabsList className="bg-transparent p-0 h-12 gap-0 shrink-0">
        <TabsTrigger
          value="monitor"
          className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text"
        >
          Monitor
        </TabsTrigger>
        <TabsTrigger
          value="analysis"
          className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text"
        >
          Analysis
        </TabsTrigger>
      </TabsList>

      {/* ── CENTER: Connection group (passive, utility-level) ─────────── */}
      <div className="flex items-center gap-2 mx-auto">


        <Badge className={`${online ? 'bg-hmi-ok text-white' : 'bg-hmi-off text-hmi-muted'} text-[10px] px-1.5 py-0 font-normal`}>
          {online ? '● Online' : '○ Offline'}
        </Badge>

        {/* Connect / Disconnect — secondary action */}
        {serialStatus === 'connected' ? (
          <Button variant="outline" size="sm" className="h-6 px-2.5 text-[11px]" onClick={() => serial.disconnect()}>
            Disconnect
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-6 px-2.5 text-[11px]" onClick={() => serial.connect()}>
            Connect
          </Button>
        )}
      </div>

      {/* ── FAR RIGHT: E-STOP — isolated, dominant ────────────────────── */}
      <div className="flex items-center pl-4 border-l border-hmi-grid/60 shrink-0">
        {estopped ? (
          <Button
            variant="resume"
            size="sm"
            className="h-8 px-4 text-sm font-bold tracking-wide animate-pulse"
            onClick={() => serial.sendCommand('resume')}
          >
            🔄 RESUME
          </Button>
        ) : (
          <Button
            variant="estop"
            size="sm"
            className="h-8 px-4 text-sm font-bold tracking-wide"
            onClick={() => serial.sendCommand('estop')}
          >
            🛑 E-STOP
          </Button>
        )}
      </div>

    </header>
  )
}

