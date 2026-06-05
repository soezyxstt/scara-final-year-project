'use client'

import { useEffect, useState } from 'react'
import { useHMI } from '@/lib/hmi-context'
import { ZNTunerTab } from '@/components/hmi/zn-tuner-tab'
import { CaptureMenu } from '@/components/hmi/capture-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { useRouter } from 'next/navigation'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { ModeBadge } from '@/components/mode-badge'

function ZNTunerShell() {
  const { state, serial } = useHMI()
  const { serialStatus, portName, online } = state

  const router = useRouter()

  // Clear ZN buffer from localStorage when the shell first renders (on page enter)
  // to prevent duplicate/overlapping signals from previous runs.
  const [hasCleared, setHasCleared] = useState(false)
  if (!hasCleared && typeof window !== 'undefined') {
    localStorage.removeItem('hmi_zn_buffer')
    localStorage.removeItem('hmi_zn_start_ts')
    setHasCleared(true)
  }

  // ── Mode state machine hooks ─────────────────────────────────────────────
  useHeartbeat(serialStatus === 'connected')

  useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      const newTab = customEvent.detail
      if (newTab === 'monitor') {
        router.push('/')
      } else if (newTab === 'readme') {
        router.push('/?tab=readme')
      }
    }
    window.addEventListener('hmi_switch_tab', handleSwitchTab)
    return () => window.removeEventListener('hmi_switch_tab', handleSwitchTab)
  }, [router])

  // Reactively stream ZN plot format on connect and handle cleanup
  useEffect(() => {
    if (serialStatus === 'connected') {
      serial.sendCommand('plot,1').catch(() => {})
    }
    return () => {
      if (serialStatus === 'connected') {
        serial.sendCommand('plot,0').catch(() => {})
      }
    }
  }, [serialStatus, serial])

  const [lastPort, setLastPort] = useState('')
  useEffect(() => {
    const val = localStorage.getItem('hmi_lastPort') ?? ''
    requestAnimationFrame(() => {
      setLastPort(val)
    })
  }, [portName])

  const statusLabel =
    serialStatus === 'connected'
      ? `● ${portName ?? 'COM?'}`
      : serialStatus === 'reconnecting'
        ? '⚠ Reconnecting…'
        : '○ Not connected'

  const statusColor =
    serialStatus === 'connected'
      ? 'bg-hmi-ok text-white'
      : serialStatus === 'reconnecting'
        ? 'bg-hmi-warn text-black'
        : 'bg-hmi-off text-hmi-muted'

  return (
    <div className="flex flex-col h-screen min-w-[1280px] bg-hmi-bg text-hmi-text animate-fade-in">
      {/* ── Header bar ── */}
      <header className="sticky top-0 z-50 bg-hmi-panel border-b border-hmi-grid px-4 h-12 flex items-center gap-4 shrink-0">
        <span className="text-sm font-bold text-hmi-text shrink-0 tracking-wide uppercase">SCARA ZN Tuner</span>

        <div className="flex items-center gap-2 ml-auto">
          <Tooltip content="Serial Status: Shows whether the HMI is connected to the microcontroller's serial port." align="right">
            <Badge className={cn("cursor-help", statusColor)}>{statusLabel}</Badge>
          </Tooltip>
          <ModeBadge />
          <Tooltip content="Network Status: Indicates if the web page is currently connected to the network." align="right">
            <Badge className={cn("cursor-help", online ? 'bg-hmi-ok text-white' : 'bg-hmi-off text-hmi-muted')}>
              {online ? '● Online' : '○ Offline'}
            </Badge>
          </Tooltip>
          {lastPort && (
            <Tooltip content="Last COM Port: Shows the USB Vendor/Product ID information of the last connected serial port." align="right">
              <span className="text-xs text-hmi-muted border border-hmi-grid rounded px-2 py-0.5 font-mono cursor-help">
                {lastPort}
              </span>
            </Tooltip>
          )}

          {serialStatus === 'connected' ? (
            <Tooltip content="Disconnect: Closes the serial communication channel." align="right">
              <Button variant="outline" size="sm" onClick={() => serial.disconnect()}>
                Disconnect
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content="Connect: Opens the serial communication channel using the Web Serial API." align="right">
              <Button variant="outline" size="sm" onClick={() => serial.connect()}>
                Connect
              </Button>
            </Tooltip>
          )}
          <Tooltip content="EMERGENCY STOP: Instantly halts all trajectory movements and cuts power to the joint motors." align="right">
            <Button variant="estop" size="sm" onClick={() => serial.sendCommand('estop')}>
              🛑 E-STOP
            </Button>
          </Tooltip>
          <CaptureMenu />
        </div>
      </header>

      {/* ── Page content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ZNTunerTab isActive={true} />
      </div>
    </div>
  )
}

export default function ZNPageContent() {
  return <ZNTunerShell />
}
