'use client'

import { useEffect, useState, useCallback } from 'react'
import { useHMI } from '@/lib/hmi-context'
import { MonitorTab } from '@/components/hmi/monitor-tab'
import { AnalysisTab } from '@/components/hmi/analysis-tab'
import { ZNAnalysisTab } from '@/components/hmi/zn-analysis-tab'
import { AdvTunerTab } from '@/components/hmi/adv-tuner-tab'
import { RawSignalSection } from '@/components/hmi/raw-signal-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { CaptureMenu } from '@/components/hmi/capture-menu'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { ModeBadge } from '@/components/mode-badge'
import { SerialMonitorButton, SerialTerminalSheet } from '@/components/hmi/serial-terminal'
import { RunButton } from '@/components/hmi/run-button'
import { CommandPaletteTrigger } from '@/components/hmi/command-palette'
import { ThemeToggle } from '@/components/hmi/theme-toggle'

type TestTab = 'monitor' | 'analysis' | 'rest' | 'params'

function TestTunerShell() {
  const { state, serial } = useHMI()
  const { serialStatus, portName, online, estopped } = state

  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const [activeTab, setActiveTabState] = useState<TestTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return (params.get('tab') as TestTab) || 'monitor'
    }
    return 'monitor'
  })

  const setActiveTab = useCallback((newTab: TestTab) => {
    setActiveTabState(newTab)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      params.set('tab', newTab)
      const newUrl = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState(null, '', newUrl)
    }
  }, [])

  useHeartbeat(serialStatus === 'connected')

  // plot,1/0 is managed centrally by HMIProvider (pathname effect).
  // Do NOT send plot,0 here — the cleanup caused a race condition that
  // silenced D-packets on the rest tab every time deps changed.

  useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      const newTab = customEvent.detail
      if (newTab === 'monitor' || newTab === 'analysis') {
        setActiveTab(newTab as TestTab)
      } else if (newTab === 'readme') {
        router.push('/?tab=readme')
      }
    }
    window.addEventListener('hmi_switch_tab', handleSwitchTab)
    return () => window.removeEventListener('hmi_switch_tab', handleSwitchTab)
  }, [router, setActiveTab])

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
        <span className="text-sm font-bold text-hmi-text shrink-0 tracking-wide uppercase">Testing</span>

        {/* Tab Selector */}
        <nav className="flex h-12 shrink-0 gap-1 border-l border-hmi-grid/50 pl-2">
          <button
            onClick={() => setActiveTab('monitor')}
            className={cn(
              "h-12 px-4 flex items-center text-sm font-medium border-b-2 transition-all cursor-pointer",
              activeTab === 'monitor'
                ? "border-hmi-ideal text-hmi-text font-bold"
                : "border-transparent text-hmi-muted hover:text-hmi-text"
            )}
          >
            Monitor
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={cn(
              "h-12 px-4 flex items-center text-sm font-medium border-b-2 transition-all cursor-pointer",
              activeTab === 'analysis'
                ? "border-hmi-ideal text-hmi-text font-bold"
                : "border-transparent text-hmi-muted hover:text-hmi-text"
            )}
          >
            Analysis
          </button>
          <button
            onClick={() => setActiveTab('rest')}
            className={cn(
              "h-12 px-4 flex items-center text-sm font-medium border-b-2 transition-all cursor-pointer",
              activeTab === 'rest'
                ? "border-hmi-ideal text-hmi-text font-bold"
                : "border-transparent text-hmi-muted hover:text-hmi-text"
            )}
          >
            Step & Noise
          </button>
          <button
            onClick={() => setActiveTab('params')}
            className={cn(
              "h-12 px-4 flex items-center text-sm font-medium border-b-2 transition-all cursor-pointer",
              activeTab === 'params'
                ? "border-hmi-ideal text-hmi-text font-bold"
                : "border-transparent text-hmi-muted hover:text-hmi-text"
            )}
          >
            Params Tuner
          </button>
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

          <RunButton />

          <SerialMonitorButton
            open={serialLogOpen}
            onToggle={() => setSerialLogOpen(v => !v)}
            serialConnected={serialStatus === 'connected'}
          />

          {estopped ? (
            <Tooltip content="RESUME: Clears the E-STOP state and re-enables motor outputs." align="right">
              <Button variant="resume" size="sm" className="animate-pulse" onClick={() => serial.sendCommand('resume')}>
                🔄 RESUME
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content="EMERGENCY STOP: Instantly halts all trajectory movements and cuts power to the joint motors." align="right">
              <Button variant="estop" size="sm" onClick={() => serial.sendCommand('estop')}>
                🛑 Stop
              </Button>
            </Tooltip>
          )}
          <CaptureMenu />
        </div>
      </header>

      <SerialTerminalSheet open={serialLogOpen} onClose={() => setSerialLogOpen(false)} />

      {/* ── Page content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'monitor' && (
          <div className="h-full flex flex-col min-h-0">
            <MonitorTab />
          </div>
        )}
        {activeTab === 'analysis' && (
          <div className="flex flex-col gap-6 p-4">
            <AnalysisTab />
            <RawSignalSection />
          </div>
        )}
        {activeTab === 'rest' && (
          <ZNAnalysisTab isActive={true} />
        )}
        {activeTab === 'params' && (
          <AdvTunerTab />
        )}
      </div>
    </div>
  )
}

export default function TestPageContent() {
  return <TestTunerShell />
}
