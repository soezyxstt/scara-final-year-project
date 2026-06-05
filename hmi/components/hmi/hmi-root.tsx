'use client'

import { useEffect, useState, Suspense, memo } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { MonitorTab } from './monitor-tab'
import { ReadmeTab } from './readme-tab'
import Link from 'next/link'  
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { CaptureMenu } from './capture-menu'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { useModeActivation } from '@/hooks/use-mode-activation'
import { ModeBadge } from '@/components/mode-badge'

import {
  EEFErrChart,
  EEFVelocityChart,
  PWMChart,
  PositionChart,
  VelocityChart,
} from './chart-panel'

import { PhasePortrait } from './phase-portrait'
import {
  FFTSection,
  ControlEffortSection,
  CTCTorqueSection,
  ControlInternalSection,
  StepperVelocitySection,
  PIDBreakdownSection,
  LoopDurationSection,
} from './advanced-analysis'

import { ParamsReportChart } from './params-report'

type TopTab = 'monitor' | 'readme'

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
  const tab = (tabParam === 'readme' ? 'readme' : 'monitor') as TopTab

  const { state, serial } = useHMISlow()
  const { serialStatus, portName, online } = state

  // ── Mode state machine hooks ─────────────────────────────────────────────
  useHeartbeat(serialStatus === 'connected')
  useModeActivation('SCARA')

  useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent<TopTab>
      if (customEvent.detail) {
        router.push(`/?tab=${customEvent.detail}`)
      }
    }
    window.addEventListener('hmi_switch_tab', handleSwitchTab)
    return () => window.removeEventListener('hmi_switch_tab', handleSwitchTab)
  }, [router])


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
    <div className="flex flex-col h-screen min-w-[1280px] bg-hmi-bg text-hmi-text">

      {/* ── Header bar ── */}
      <header className="sticky top-0 z-50 bg-hmi-panel border-b border-hmi-grid px-4 h-12 flex items-center gap-4 shrink-0">
        <span className="text-sm font-bold text-hmi-text shrink-0 tracking-wide uppercase">SCARA HMI</span>

        {/* Sub-tabs for current page */}
        <nav className="flex h-12 shrink-0 border-l border-hmi-grid/50 pl-2">
          <TabLink label="Monitor" active={tab === 'monitor'} href="/?tab=monitor" />
          <TabLink label="README" active={tab === 'readme'} href="/?tab=readme" />
        </nav>

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

      {/* ── Tab content ── */}
      <div className={cn('flex flex-col flex-1 min-h-0', tab !== 'monitor' && 'hidden')}>
        <MonitorTab />
      </div>
      {tab === 'readme' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ReadmeTab />
        </div>
      )}

      <CaptureCharts frozenD={state.frozenD} frozenT={state.frozenT} />
    </div>
  )
}

// Memoized: only re-renders when frozen buffers change (i.e. after a move ends),
// NOT on every 10 Hz BATCH_SAMPLES tick. This eliminates ~14 off-screen Recharts
// instances from the hot re-render path.
const CaptureCharts = memo(function CaptureCharts({
  frozenD, frozenT,
}: {
  frozenD: import('@/lib/hmi-types').DSample[]
  frozenT: import('@/lib/hmi-types').TPoint[]
}) {
  return (
    <div
      style={{ position: 'absolute', top: -9999, left: -9999, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <div id="capture-chart-eef">
        <EEFErrChart tBuf={frozenT} dBuf={frozenD} width={800} height={400} />
      </div>
      <div id="capture-chart-eef-vel">
        <EEFVelocityChart dBuf={frozenD} width={800} height={400} />
      </div>
      <div id="capture-chart-pwm">
        <PWMChart dBuf={frozenD} width={800} height={400} />
      </div>
      <div id="capture-chart-pos">
        <PositionChart dBuf={frozenD} width={800} height={400} />
      </div>
      <div id="capture-chart-vel">
        <VelocityChart dBuf={frozenD} width={800} height={400} />
      </div>
      <div id="capture-chart-phase">
        <PhasePortrait width={800} height={400} />
      </div>
      <div id="capture-chart-fft-eef">
        <FFTSection defaultSignal="eef" width={800} height={400} />
      </div>
      <div id="capture-chart-fft-th1">
        <FFTSection defaultSignal="th1" width={800} height={400} />
      </div>
      <div id="capture-chart-fft-th2">
        <FFTSection defaultSignal="th2" width={800} height={400} />
      </div>
      <div id="capture-chart-effort">
        <ControlEffortSection width={800} height={400} />
      </div>
      <div id="capture-chart-ctc">
        <CTCTorqueSection width={800} height={400} />
      </div>
      <div id="capture-chart-internal">
        <ControlInternalSection width={800} height={400} />
      </div>
      <div id="capture-chart-stepper">
        <StepperVelocitySection width={800} height={400} />
      </div>
      <div id="capture-chart-pid-breakdown">
        <PIDBreakdownSection width={800} height={400} />
      </div>
      <div id="capture-chart-loop">
        <LoopDurationSection width={800} height={400} />
      </div>
      <div id="capture-chart-params">
        <ParamsReportChart width={800} height={600} />
      </div>
    </div>
  )
})

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
