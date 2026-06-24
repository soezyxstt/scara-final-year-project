'use client'

import { useEffect, useState, Suspense } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { MonitorTab } from './monitor-tab'
import { ReadmeTab } from './readme-tab'
import { AnalysisTab } from './analysis-tab'
import { ZNAnalysisTab } from './zn-analysis-tab'
import { HMITutorial } from './hmi-tutorial'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { CaptureMenu } from './capture-menu'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { ModeBadge } from '@/components/mode-badge'
import { SerialMonitorButton, SerialTerminalSheet } from './serial-terminal'
import { RunButton } from './run-button'
import { CommandPaletteTrigger } from './command-palette'
import { ThemeToggle } from './theme-toggle'


type TopTab = 'monitor' | 'analysis' | 'rest' | 'readme'

function TabLink({
  label,
  active,
  href,
}: {
  label: string
  active: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'h-12 px-4 flex items-center text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-hmi-ideal text-hmi-text'
          : 'border-transparent text-hmi-muted hover:text-hmi-text'
      )}
    >
      {label}
    </Link>
  )
}

function HMIShell() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const tab = (['monitor', 'analysis', 'rest', 'readme'].includes(tabParam ?? '')
    ? tabParam
    : 'monitor') as TopTab

  const { state, serial } = useHMISlow()
  const { serialStatus, portName, online, estopped } = state

  // ── Mode state machine hooks ─────────────────────────────────────────────
  useHeartbeat(serialStatus === 'connected')

  useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      const next = customEvent.detail
      if (next && ['monitor', 'analysis', 'rest', 'readme'].includes(next)) {
        if (next !== tab) {
          router.push(`/?tab=${next}`)
        }
      }
    }
    window.addEventListener('hmi_switch_tab', handleSwitchTab)
    return () => window.removeEventListener('hmi_switch_tab', handleSwitchTab)
  }, [router, tab])


  const [serialLogOpen, setSerialLogOpen] = useState(false)

  const [lastPort, setLastPort] = useState('')
  useEffect(() => {
    const val = localStorage.getItem('hmi_lastPort') ?? ''
    requestAnimationFrame(() => {
      setLastPort(val)
    })
  }, [portName])


  return (
    <div className="flex flex-col h-screen min-w-[1280px] bg-hmi-bg text-hmi-text">

      {/* ── Header bar ── */}
      <header className="sticky top-0 z-50 bg-hmi-panel border-b border-hmi-grid px-4 h-12 flex items-center gap-4 shrink-0">
        <span className="text-sm font-bold text-hmi-text shrink-0 tracking-wide uppercase">
          SCARA HMI
        </span>

        {/* Sub-tabs for current page */}
        <nav className="flex h-12 shrink-0 border-l border-hmi-grid/50 pl-4 ml-2">
          <TabLink label="Monitor" active={tab === 'monitor'} href="/?tab=monitor" />
          <TabLink label="Analysis" active={tab === 'analysis'} href="/?tab=analysis" />
          <TabLink label="Step & Noise" active={tab === 'rest'} href="/?tab=rest" />
          <TabLink label="README" active={tab === 'readme'} href="/?tab=readme" />
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          <ThemeToggle />
          <CommandPaletteTrigger />
          <ModeBadge />
          <Tooltip content="Network Status: Indicates if the web page is currently connected to the network." align="right">
            <Badge className={cn("cursor-help font-bold", online ? 'bg-hmi-ok text-white' : 'bg-hmi-off text-hmi-muted')}>
              {online ? '●' : '○'}
            </Badge>
          </Tooltip>

          {serialStatus === 'connected' ? (
            <Tooltip content="Disconnect: Closes the serial communication channel." align="right">
              <Button id="hmi-connect-button" variant="outline" size="sm" onClick={() => serial.disconnect()}>
                Disconnect
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content="Connect: Opens the serial communication channel using the Web Serial API." align="right">
              <Button id="hmi-connect-button" variant="outline" size="sm" onClick={() => serial.connect()}>
                Connect
              </Button>
            </Tooltip>
          )}

          <RunButton />

          <SerialMonitorButton
            id="hmi-serial-button"
            open={serialLogOpen}
            onToggle={() => setSerialLogOpen(v => !v)}
            serialConnected={serialStatus === 'connected'}
          />

          {estopped ? (
            <Tooltip content="RESUME: Clears the E-STOP state and re-enables motor outputs." align="right">
              <Button id="hmi-estop-button" variant="resume" size="sm" className="animate-pulse" onClick={() => serial.sendCommand('resume')}>
                🔄 RESUME
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content="EMERGENCY STOP: Instantly halts all trajectory movements and cuts power to the joint motors." align="right">
              <Button id="hmi-estop-button" variant="estop" size="sm" onClick={() => serial.sendCommand('estop')}>
                🛑 Stop
              </Button>
            </Tooltip>
          )}
          <CaptureMenu />
        </div>
      </header>

      <SerialTerminalSheet open={serialLogOpen} onClose={() => setSerialLogOpen(false)} />

      {/* ── Tab content ── */}
      <div className={cn('flex flex-col flex-1 min-h-0', tab !== 'monitor' && 'hidden')}>
        <MonitorTab />
      </div>
      {tab === 'analysis' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AnalysisTab />
        </div>
      )}
      {tab === 'rest' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ZNAnalysisTab isActive={true} />
        </div>
      )}
      {tab === 'readme' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ReadmeTab />
        </div>
      )}

      {/* Onboarding Guide Overlay */}
      <HMITutorial />

    </div>
  )
}

export function HMIRoot() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-hmi-bg text-hmi-text animate-pulse">
        <span className="text-sm font-medium">Loading HMI...</span>
      </div>
    }>
      <HMIShell />
    </Suspense>
  )
}
