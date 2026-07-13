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
import { SerialMonitorButton, SerialTerminalSheet } from '@/components/hmi/serial-terminal'
import { CommandPaletteTrigger } from '@/components/hmi/command-palette'
import { ThemeToggle } from '@/components/hmi/theme-toggle'
import { LocaleToggle } from '@/components/hmi/locale-toggle'
import { useTranslations } from 'next-intl'

function ZNTunerShell() {
  const t = useTranslations('Header')
  const tCommon = useTranslations('Common')
  const { state, serial } = useHMI()
  const { serialStatus, portName, online, estopped } = state

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

  // plot,1/0 is managed centrally by HMIProvider (pathname effect).
  // Do NOT send plot,0 here — the cleanup caused a race condition that
  // silenced D-packets every time deps changed.

  const [serialLogOpen, setSerialLogOpen] = useState(false)
  const [lastPort, setLastPort] = useState('')
  useEffect(() => {
    const val = localStorage.getItem('hmi_lastPort') ?? ''
    requestAnimationFrame(() => {
      setLastPort(val)
    })
  }, [portName])


  return (
    <div className="flex flex-col h-screen min-w-[1280px] bg-hmi-bg text-hmi-text animate-fade-in">
      {/* ── Header bar ── */}
      <header className="sticky top-0 z-50 bg-hmi-panel border-b border-hmi-grid px-4 h-12 flex items-center gap-4 shrink-0">
        <span className="text-sm font-bold text-hmi-text shrink-0 tracking-wide uppercase">ZN Tuner</span>

        <div className="flex items-center gap-2 ml-auto">
          <LocaleToggle />
          <ThemeToggle />
          <CommandPaletteTrigger />
          <ModeBadge />
          <Tooltip content={t('networkStatusTooltip')} align="right">
            <Badge className={cn("cursor-help font-bold", online ? 'bg-hmi-ok text-white' : 'bg-hmi-off text-hmi-muted')}>
              {online ? '●' : '○'}
            </Badge>
          </Tooltip>

          {serialStatus === 'connected' ? (
            <Tooltip content={t('disconnectTooltip')} align="right">
              <Button variant="outline" size="sm" onClick={() => serial.disconnect()}>
                {tCommon('disconnect')}
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content={t('connectTooltip')} align="right">
              <Button variant="outline" size="sm" onClick={() => serial.connect()}>
                {tCommon('connect')}
              </Button>
            </Tooltip>
          )}

          <SerialMonitorButton
            open={serialLogOpen}
            onToggle={() => setSerialLogOpen(v => !v)}
            serialConnected={serialStatus === 'connected'}
          />

          {estopped ? (
            <Tooltip content={t('resumeTooltip')} align="right">
              <Button variant="resume" size="sm" className="animate-pulse" onClick={() => serial.sendCommand('resume')}>
                🔄 {tCommon('resume')}
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content={t('stopTooltip')} align="right">
              <Button variant="estop" size="sm" onClick={() => serial.sendCommand('estop')}>
                🛑 {tCommon('stop')}
              </Button>
            </Tooltip>
          )}
          <CaptureMenu />
        </div>
      </header>

      <SerialTerminalSheet open={serialLogOpen} onClose={() => setSerialLogOpen(false)} />

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
