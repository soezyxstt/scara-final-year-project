'use client'

import { useState, useEffect, useRef } from 'react'
import { useHMISlow, defaultParams } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Sliders, RefreshCw, Activity, ArrowRight, Play, Square } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

// --- Status Indicator LED ---
function StatusLED({ status }: { status: 'clean' | 'dirty' | 'waiting' | 'timeout' }) {
  const t = useTranslations('ControlPanel')
  let ledClass = ''
  let statusTooltipText = ''

  switch (status) {
    case 'clean':
      ledClass = 'bg-emerald-500 shadow-[0_0_6px_#10B981]'
      statusTooltipText = t('statusSynced')
      break
    case 'dirty':
      ledClass = 'bg-amber-500 shadow-[0_0_6px_#F59E0B]'
      statusTooltipText = t('statusModified')
      break
    case 'waiting':
      ledClass = 'bg-blue-500 animate-pulse shadow-[0_0_6px_#3B82F6]'
      statusTooltipText = t('statusApplying')
      break
    case 'timeout':
      ledClass = 'bg-red-500 shadow-[0_0_6px_#EF4444]'
      statusTooltipText = t('statusTimeout')
      break
  }

  return (
    <Tooltip content={statusTooltipText}>
      <span className={cn("w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0", ledClass)} />
    </Tooltip>
  )
}

// --- Parameter Field Component ---
function ParamField({
  label,
  name,
  hwValue,
  tooltip,
  cmd,
  min,
  max,
  step,
  onSend,
  disabled
}: {
  label: string
  name: string
  hwValue: number | undefined
  tooltip: string
  cmd: string
  min?: number
  max?: number
  step?: number
  onSend: (cmd: string, val: string) => Promise<void>
  disabled?: boolean
}) {
  const t = useTranslations('Common')
  const [localValue, setLocalValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [status, setStatus] = useState<'clean' | 'dirty' | 'waiting' | 'timeout'>('clean')
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevHwValue = useRef(hwValue)

  const formatValue = (val: number) => {
    // Determine precision based on step
    if (step && step < 0.1) return val.toFixed(4)
    if (step && step < 1) return val.toFixed(3)
    return val.toString()
  }

  // Sync from hardware value when clean and not focused
  useEffect(() => {
    if (hwValue !== undefined) {
      const formatted = formatValue(hwValue)
      if (status === 'clean' && !isFocused) {
        setLocalValue(formatted)
      } else if (status === 'waiting') {
        const parsed = parseFloat(localValue)
        if (!isNaN(parsed) && Math.abs(hwValue - parsed) < 0.0001) {
          setStatus('clean')
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        }
      }
    }
    prevHwValue.current = hwValue
  }, [hwValue, status, isFocused, localValue])

  // Re-sync on focus change if clean
  useEffect(() => {
    if (!isFocused && status === 'clean' && hwValue !== undefined) {
      setLocalValue(formatValue(hwValue))
    }
  }, [isFocused, status, hwValue])

  const handleChange = (val: string) => {
    // Limit decimal precision
    let limitedVal = val
    if (step && step < 1) {
      const parts = val.split('.')
      if (parts.length > 1) {
        const decimals = step < 0.1 ? 4 : 3
        limitedVal = parts[0] + '.' + parts[1].substring(0, decimals)
      }
    }

    setLocalValue(limitedVal)
    
    const parsed = parseFloat(limitedVal)
    if (isNaN(parsed)) {
      setStatus('dirty')
      return
    }

    if (hwValue !== undefined && Math.abs(hwValue - parsed) < 0.0001) {
      setStatus('clean')
    } else {
      setStatus('dirty')
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handleBlur = () => {
    setIsFocused(false)
    if (status === 'clean' && hwValue !== undefined) {
      setLocalValue(formatValue(hwValue))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status !== 'dirty' || disabled) return

    setStatus('waiting')
    
    // Start timeout
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setStatus('timeout')
      timerRef.current = null
    }, 1500)

    try {
      await onSend(cmd, localValue)
    } catch {
      setStatus('timeout')
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const borderClass =
    status === 'timeout'
      ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-1 focus-visible:ring-red-500'
      : status === 'dirty'
        ? 'border-amber-500 focus-visible:border-amber-500 focus-visible:ring-1 focus-visible:ring-amber-500'
        : status === 'waiting'
          ? 'border-blue-500 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500'
          : 'border-hmi-grid'

  const textClass = 
    status === 'dirty'
      ? 'text-amber-400 font-semibold'
      : status === 'waiting'
        ? 'text-blue-400 font-semibold animate-pulse'
        : ''

  return (
    <form onSubmit={handleSubmit} className="flex items-center justify-between gap-3 p-2 bg-hmi-panel/50 rounded-lg border border-hmi-grid/30 hover:border-hmi-grid/70 transition-colors">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <Tooltip content={tooltip}>
          <label className="text-xs font-semibold text-hmi-muted truncate cursor-help border-b border-dotted border-hmi-muted/30 w-fit">
            {label}
          </label>
        </Tooltip>
        <span className="text-[10px] text-hmi-muted font-mono select-none">
          Cmd: <code className="text-hmi-ideal">{cmd}</code>
        </span>
      </div>
      
      <div className="flex items-center gap-2 shrink-0">
        <StatusLED status={status} />
        
        <Input
          type="number"
          step={step ?? "0.1"}
          min={min}
          max={max}
          value={localValue}
          disabled={disabled || hwValue === undefined}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          className={cn(
            "w-20 h-8 text-xs bg-hmi-bg text-right font-mono",
            borderClass,
            textClass
          )}
        />

        <Button
          type="submit"
          size="sm"
          disabled={status !== 'dirty' || disabled}
          className={cn(
            "h-8 px-2.5 text-xs transition-all",
            status === 'dirty' 
              ? "bg-amber-500 hover:bg-amber-600 text-black font-semibold" 
              : "bg-hmi-btn text-hmi-text-secondary hover:bg-hmi-btn-hover"
          )}
        >
          {t('apply')}
        </Button>
      </div>
    </form>
  )
}

function ToggleField({
  label,
  value,
  tooltip,
  onToggle,
  disabled
}: {
  label: string
  value: boolean
  tooltip: string
  onToggle: () => Promise<void>
  disabled?: boolean
}) {
  const t = useTranslations('Common')
  const [isPending, setIsPending] = useState(false)

  const handleToggle = async () => {
    if (disabled || isPending) return
    setIsPending(true)
    try {
      await onToggle()
    } finally {
      setTimeout(() => setIsPending(false), 500)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 p-2 bg-hmi-panel/50 rounded-lg border border-hmi-grid/30 hover:border-hmi-grid/70 transition-colors">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <Tooltip content={tooltip}>
          <label className="text-xs font-semibold text-hmi-text truncate cursor-help border-b border-dotted border-hmi-muted/30 w-fit">
            {label}
          </label>
        </Tooltip>
      </div>
      
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded-full select-none",
          value ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
        )}>
          {value ? 'ON' : 'OFF'}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={disabled || isPending}
          onClick={handleToggle}
          className={cn(
            "h-8 px-2.5 text-xs transition-all",
            value
              ? "bg-hmi-btn text-hmi-text-secondary hover:bg-hmi-btn-hover"
              : "bg-hmi-ideal hover:bg-hmi-ideal/80 text-white font-semibold"
          )}
        >
          {isPending ? '...' : value ? t('disable') : t('enable')}
        </Button>
      </div>
    </div>
  )
}

// --- Main Advanced Tuner Tab ---
export function AdvTunerTab() {
  const t = useTranslations('AdvTuner')
  const { state, serial } = useHMISlow()
  const { params, queueStatus, serialStatus } = state
  const [isRefreshing, setIsRefreshing] = useState(false)
  const currentParams = params || defaultParams
  const pathname = usePathname()
  const isTestPage = pathname === '/test'

  // Auto request params once connected if they aren't loaded
  useEffect(() => {
    if (serialStatus === 'connected' && !params) {
      serial.sendCommand('getparams').catch(() => {})
    }
  }, [serialStatus, params, serial])

  const handleSendParam = async (cmd: string, val: string) => {
    await serial.sendCommand(`${cmd},${val}`)
    // Request K packet refresh immediately after updating
    await serial.sendCommand('getparams')
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await serial.sendCommand('getparams')
      await serial.sendCommand('getgains')
    } catch (err) {
      console.error(err)
    } finally {
      setTimeout(() => setIsRefreshing(false), 800)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 overflow-y-auto max-w-[1600px] mx-auto w-full">
      
      {/* --- Action bar / Connection warning --- */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-hmi-panel border border-hmi-grid/50 p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <Sliders className="h-5 w-5 text-hmi-ideal" />
          <div>
            <h2 className="text-sm font-bold text-hmi-text">{t('title')}</h2>
            <p className="text-xs text-hmi-muted">{t('subtitle')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {serialStatus !== 'connected' && (
            <span className="text-xs text-amber-500 font-medium bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
              {t('disconnected')}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={serialStatus !== 'connected' || isRefreshing}
            className="gap-2 bg-hmi-btn border-hmi-grid text-hmi-text h-9 font-semibold hover:bg-hmi-btn-hover"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            {isRefreshing ? t('syncing') : t('syncParameters')}
          </Button>
        </div>
      </div>

      {/* --- Sync Warning Banner --- */}
      {!state.hasSyncedParams && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-lg text-amber-400 text-xs">
          <span className="text-sm">⚠️</span>
          <div>
            {t('offlineWarning')}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Column 1: Limits & Controls */}
        <div className="flex flex-col gap-6">
          <Card className="border border-hmi-grid bg-hmi-panel/40 backdrop-blur shadow-md">
            <CardHeader className="border-b border-hmi-grid/35 py-3">
              <CardTitle className="text-xs font-bold text-hmi-text uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-hmi-ideal shrink-0" />
                {t('motionLimits')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-3">
              <ParamField
                label={t('vmaxLabel')}
                name="vmax"
                hwValue={currentParams.vmax}
                tooltip={t('vmaxTooltip')}
                cmd="vmax"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('amaxLabel')}
                name="amax"
                hwValue={currentParams.amax}
                tooltip={t('amaxTooltip')}
                cmd="amax"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('ddthLabel')}
                name="ddth"
                hwValue={currentParams.ddth}
                tooltip={t('ddthTooltip')}
                cmd="ddth"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
            </CardContent>
          </Card>

          <Card className="border border-hmi-grid bg-hmi-panel/40 backdrop-blur shadow-md">
            <CardHeader className="border-b border-hmi-grid/35 py-3">
              <CardTitle className="text-xs font-bold text-hmi-text uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0" />
                {t('controlLoop')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-3">
              <ParamField
                label={t('cfreqLabel')}
                name="cfreq"
                hwValue={currentParams.cfreq}
                tooltip={t('cfreqTooltip')}
                cmd="cfreq"
                min={1}
                step={1}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('idecayLabel')}
                name="idecay"
                hwValue={currentParams.idecay}
                tooltip={t('idecayTooltip')}
                cmd="idecay"
                min={0}
                max={1}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('u1maxLabel')}
                name="u1max"
                hwValue={currentParams.u1max}
                tooltip={t('u1maxTooltip')}
                cmd="u1max"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('kv1Label')}
                name="kv1"
                hwValue={currentParams.kvVel}
                tooltip={t('kv1Tooltip')}
                cmd="kv1"
                min={-1}
                max={1}
                step={0.0001}
                onSend={handleSendParam}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ParamField
                label={t('vffmaxLabel')}
                name="vffmax"
                hwValue={currentParams.vffMaxFrac}
                tooltip={t('vffmaxTooltip')}
                cmd="vffmax"
                min={0}
                max={1}
                step={0.001}
                onSend={handleSendParam}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ParamField
                label={t('vffdvLabel')}
                name="vffdv"
                hwValue={currentParams.vffDvMax}
                tooltip={t('vffdvTooltip')}
                cmd="vffdv"
                min={0}
                max={1}
                step={0.001}
                onSend={handleSendParam}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ParamField
                label={t('taunomLabel')}
                name="taunom"
                hwValue={currentParams.taunom}
                tooltip={t('taunomTooltip')}
                cmd="taunom"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('m22refLabel')}
                name="m22ref"
                hwValue={currentParams.m22ref}
                tooltip={t('m22refTooltip')}
                cmd="m22ref"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
            </CardContent>
          </Card>
        </div>

        {/* Column 2: Filters & Deadband */}
        <div className="flex flex-col gap-6">
          <Card className="border border-hmi-grid bg-hmi-panel/40 backdrop-blur shadow-md">
            <CardHeader className="border-b border-hmi-grid/35 py-3">
              <CardTitle className="text-xs font-bold text-hmi-text uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                {t('tdTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-3">
              <div className="text-[10px] text-hmi-muted px-1.5 py-1 bg-hmi-bg/40 border border-hmi-grid/20 rounded font-sans leading-relaxed">
                {t.rich('tdDesc', { strong: (chunks) => <strong>{chunks}</strong> })}
              </div>
              <ParamField
                label={t('td1rLabel')}
                name="td1r"
                hwValue={currentParams.td1r}
                tooltip={t('td1rTooltip')}
                cmd="td1r"
                min={0}
                step={1}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('td2rLabel')}
                name="td2r"
                hwValue={currentParams.td2r}
                tooltip={t('td2rTooltip')}
                cmd="td2r"
                min={0}
                step={1}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              {/* TD1_H is read-only: h = 3×DT, set by firmware based on cfreq */}
              <div className="flex items-center justify-between gap-3 p-2 bg-hmi-panel/30 rounded-lg border border-hmi-grid/20">
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <Tooltip content={t('tdStepTooltip')}>
                    <label className="text-xs font-semibold text-hmi-muted/60 truncate cursor-help border-b border-dotted border-hmi-muted/20 w-fit">
                      {t('tdStepLabel')}
                    </label>
                  </Tooltip>
                  <span className="text-[10px] text-hmi-muted font-mono select-none">h = 3 × (1/cfreq)</span>
                </div>
                <span className="text-xs font-mono text-hmi-text-secondary bg-hmi-bg/60 border border-hmi-grid/20 px-3 py-1.5 rounded">
                  {currentParams.tdH?.toFixed(4) ?? '--'}
                </span>
              </div>
            </CardContent>
          </Card>


          <Card className="border border-hmi-grid bg-hmi-panel/40 backdrop-blur shadow-md">
            <CardHeader className="border-b border-hmi-grid/35 py-3">
              <CardTitle className="text-xs font-bold text-hmi-text uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-hmi-actual shrink-0" />
                {t('pwmTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-3">
              <ParamField
                label={t('pwmDbLabel')}
                name="pwm_db"
                hwValue={currentParams.pwmDb}
                tooltip={t('pwmDbTooltip')}
                cmd="db"
                min={0}
                max={254}
                step={1}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('errdzLabel')}
                name="errdz"
                hwValue={currentParams.errDz}
                tooltip={t('errdzTooltip')}
                cmd="errdz"
                min={0.001}
                max={0.05}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('ifreezeLabel')}
                name="ifreeze"
                hwValue={currentParams.integralFreezeThresh}
                tooltip={t('ifreezeTooltip')}
                cmd="ifreeze"
                min={0.001}
                max={0.1}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('fztLabel')}
                name="fzt"
                hwValue={currentParams.fzt}
                tooltip={t('fztTooltip')}
                cmd="fzt"
                min={0}
                max={0.5}
                step={0.0001}
                onSend={handleSendParam}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ParamField
                label={t('fztkLabel')}
                name="fztk"
                hwValue={currentParams.fztKickPct}
                tooltip={t('fztkTooltip')}
                cmd="fztk"
                min={0.01}
                max={1}
                step={0.01}
                onSend={handleSendParam}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ToggleField
                label={t('kspenLabel')}
                value={currentParams.kickstartEnabled ?? false}
                tooltip={t('kspenTooltip')}
                onToggle={async () => { await handleSendParam('kspen', currentParams.kickstartEnabled ? '0' : '1') }}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />

              <ToggleField
                label={t('dbmenLabel')}
                value={currentParams.dbMovingEnabled ?? false}
                tooltip={t('dbmenTooltip')}
                onToggle={async () => { await handleSendParam('dbmen', currentParams.dbMovingEnabled ? '0' : '1') }}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ParamField
                label={t('dbensLabel')}
                name="dbens"
                hwValue={currentParams.dbEngageScale}
                tooltip={t('dbensTooltip')}
                cmd="dbens"
                min={0.1}
                max={1}
                step={0.01}
                onSend={handleSendParam}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Hold Mode & Live Queue Status */}
        <div className="flex flex-col gap-6">
          <Card className="border border-hmi-grid bg-hmi-panel/40 backdrop-blur shadow-md">
            <CardHeader className="border-b border-hmi-grid/35 py-3">
              <CardTitle className="text-xs font-bold text-hmi-text uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                {t('j1HoldTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-3">
              <ParamField
                label={t('dbenLabel')}
                name="dben"
                hwValue={currentParams.dben}
                tooltip={t('dbenTooltip')}
                cmd="dben"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('dbrelLabel')}
                name="dbrel"
                hwValue={currentParams.dbrel}
                tooltip={t('dbrelTooltip')}
                cmd="dbrel"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('dbvelLabel')}
                name="dbvel"
                hwValue={currentParams.dbvel}
                tooltip={t('dbvelTooltip')}
                cmd="dbvel"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('hskpLabel')}
                name="hskp"
                hwValue={currentParams.hskp}
                tooltip={t('hskpTooltip')}
                cmd="hskp"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('hskdLabel')}
                name="hskd"
                hwValue={currentParams.hskd}
                tooltip={t('hskdTooltip')}
                cmd="hskd"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
            </CardContent>
          </Card>

          <Card className="border border-hmi-grid bg-hmi-panel/40 backdrop-blur shadow-md">
            <CardHeader className="border-b border-hmi-grid/35 py-3">
              <CardTitle className="text-xs font-bold text-hmi-text uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                {t('j2HoldTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-3">
              <ParamField
                label={t('db2enLabel')}
                name="db2en"
                hwValue={currentParams.db2en}
                tooltip={t('db2enTooltip')}
                cmd="db2en"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
              <ParamField
                label={t('db2relLabel')}
                name="db2rel"
                hwValue={currentParams.db2rel}
                tooltip={t('db2relTooltip')}
                cmd="db2rel"
                min={0}
                step={0.001}
                onSend={handleSendParam}
                disabled={serialStatus !== 'connected'}
              />
            </CardContent>
          </Card>

          {/* Trajectory Queue Dashboard */}
          <Card className="border border-hmi-grid bg-hmi-panel/40 backdrop-blur shadow-md">
            <CardHeader className="border-b border-hmi-grid/35 py-3">
              <CardTitle className="text-xs font-bold text-hmi-text uppercase tracking-widest flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-hmi-start animate-pulse" />
                {t('queueTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4 font-sans">
              
              {/* Status Badge */}
              <div className="flex items-center justify-between border-b border-hmi-grid/40 pb-3">
                <span className="text-xs text-hmi-text-secondary font-semibold">{t('activeState')}</span>
                {queueStatus?.pendingStatus === 1 ? (
                  <span className="text-xs font-bold text-hmi-start bg-hmi-start/10 border border-hmi-start/20 px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse">
                    <Play className="h-2.5 w-2.5 fill-current" /> {t('moveQueued')}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-hmi-muted bg-hmi-btn border border-hmi-grid px-2 py-0.5 rounded-full flex items-center gap-1.5">
                    <Square className="h-2 w-2 fill-current" /> {t('emptyReady')}
                  </span>
                )}
              </div>

              {/* Queue coordinates */}
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 bg-hmi-panel/50 rounded border border-hmi-grid/25 text-center">
                  <span className="text-[10px] text-hmi-muted font-sans block mb-1">{t('pendingTargetX')}</span>
                  <span className="text-hmi-text text-sm font-semibold">
                    {queueStatus?.pendingStatus === 1 ? `${queueStatus.pendingX.toFixed(1)} mm` : '--'}
                  </span>
                </div>
                <div className="p-3 bg-hmi-panel/50 rounded border border-hmi-grid/25 text-center">
                  <span className="text-[10px] text-hmi-muted font-sans block mb-1">{t('pendingTargetY')}</span>
                  <span className="text-hmi-text text-sm font-semibold">
                    {queueStatus?.pendingStatus === 1 ? `${queueStatus.pendingY.toFixed(1)} mm` : '--'}
                  </span>
                </div>
              </div>

              {queueStatus?.pendingStatus === 1 && (
                <div className="flex justify-center items-center gap-1 text-[11px] text-hmi-muted bg-hmi-bg/45 p-2 rounded border border-hmi-grid/10">
                  {t('queueNote')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* TEST Mode Parameters */}
          <Card className="border border-hmi-grid bg-hmi-panel/40 backdrop-blur shadow-md">
            <CardHeader className="border-b border-hmi-grid/35 py-3">
              <CardTitle className="text-xs font-bold text-hmi-text uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                {t('testParams')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-3">
              <ParamField
                label={t('atiltLabel')}
                name="alpha_tilt"
                hwValue={currentParams.alphaTiltDeg}
                tooltip={t('atiltTooltip')}
                cmd="atilt"
                step={0.001}
                onSend={handleSendParam}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ToggleField
                label={t('tdenLabel')}
                value={currentParams.tdEnabled}
                tooltip={t('tdenTooltip')}
                onToggle={async () => {
                  await handleSendParam('tden', currentParams.tdEnabled ? '0' : '1')
                }}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ToggleField
                label={t('trapenLabel')}
                value={currentParams.trapEnabled}
                tooltip={t('trapenTooltip')}
                onToggle={async () => {
                  await handleSendParam('trapen', currentParams.trapEnabled ? '0' : '1')
                }}
                disabled={!isTestPage || serialStatus !== 'connected'}
              />
              <ParamField
                label={t('ki2gLabel')}
                name="ki2_gate"
                hwValue={currentParams.ki2GateRad}
                tooltip={t('ki2gTooltip')}
                cmd="ki2g"
                step={0.001}
                onSend={handleSendParam}
              />
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}

