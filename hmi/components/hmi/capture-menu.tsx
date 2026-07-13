'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useHMI } from '@/lib/hmi-context'
import { useTranslations } from 'next-intl'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Menu,
  Download,
  Image as ImageIcon,
  FileSpreadsheet,
  FolderArchive,
  ChevronDown,
  Settings,
  RefreshCw,
  Info,
  Check,
  SlidersHorizontal,
  Compass,
  FileImage,
  Keyboard,
  Activity,
  Gauge,
  TestTube,
  Monitor,
  Database,
  Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  downloadSingleGraph,
  downloadAllGraphs,
} from '@/lib/capture-utils'
import {
  loadKeybindings,
  saveKeybindings,
  resetKeybindings,
  type HotkeyBinding,
  type HMIHotkeyAction,
} from '@/lib/keybindings-store'
export function CaptureMenu() {
  const t = useTranslations('CaptureMenu')
  const { state } = useHMI()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [isGraphsOpen, setIsGraphsOpen] = useState(false)
  const [exportState, setExportState] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [zipPrompt, setZipPrompt] = useState<{ includeCSV: boolean } | null>(null)
  const [zipCustomName, setZipCustomName] = useState('')

  // Exporter Preferences
  const [exportFormat, setExportFormat] = useState<'image/png' | 'image/jpeg'>('image/png')
  const [resolutionScale, setResolutionScale] = useState<number>(2)
  const [filenamePrefix, setFilenamePrefix] = useState('scara_hmi')

  // Dashboard Preferences
  const [angularUnit, setAngularUnit] = useState<string>('radians')
  const [ghostOpacity, setGhostOpacity] = useState<number>(20) // in percentage

  const isLive = state.recordingState === 'REC'
  const dBuf = isLive ? state.dBuffer : state.frozenD
  const tBuf = isLive ? state.tBuffer : state.frozenT
  const hasData = dBuf.length > 0

  // Keyboard Shortcuts settings state
  const [keybindings, setKeybindings] = useState<HotkeyBinding[]>([])
  const [rebindingAction, setRebindingAction] = useState<HMIHotkeyAction | null>(null)
  const [isKeybindingsOpen, setIsKeybindingsOpen] = useState(false)


  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUnit = localStorage.getItem('hmi_angular_unit') || 'radians'
      setAngularUnit(storedUnit)

      const storedOpacity = localStorage.getItem('hmi_ghost_opacity')
      if (storedOpacity) {
        setGhostOpacity(Math.round(parseFloat(storedOpacity) * 100))
      }

      const storedFormat = localStorage.getItem('hmi_export_format') as 'image/png' | 'image/jpeg' | null
      if (storedFormat) setExportFormat(storedFormat)

      const storedScale = localStorage.getItem('hmi_export_scale')
      if (storedScale) setResolutionScale(parseInt(storedScale, 10))

      const storedPrefix = localStorage.getItem('hmi_filename_prefix')
      if (storedPrefix) setFilenamePrefix(storedPrefix)

      setKeybindings(loadKeybindings())
    }
  }, [])

  // Listen for custom window event to toggle menu visibility
  useEffect(() => {
    const handleToggleMenu = () => {
      setIsOpen(prev => !prev)
    }
    window.addEventListener('hmi_toggle_menu', handleToggleMenu)
    return () => window.removeEventListener('hmi_toggle_menu', handleToggleMenu)
  }, [])

  // Catch next key pressed for rebind
  useEffect(() => {
    if (!rebindingAction) return

    const handleRebindKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return

      e.preventDefault()
      e.stopPropagation()

      const targetAction = rebindingAction
      const targetKey = e.key

      const updated = keybindings.map(b => {
        if (b.action === targetAction) {
          return { ...b, key: targetKey }
        }
        return b
      })

      setKeybindings(updated)
      saveKeybindings(updated)
      setRebindingAction(null)

      const transLabel = t(`keybindings.${targetAction}`)
      setSuccessMsg(t('reboundSuccess', { label: transLabel, key: targetKey === ' ' ? t('spaceKey') : targetKey }))
      setTimeout(() => setSuccessMsg(null), 1500)
    }

    window.addEventListener('keydown', handleRebindKeyDown, true)
    return () => window.removeEventListener('keydown', handleRebindKeyDown, true)
  }, [rebindingAction, keybindings, t])

  const handleResetKeybindings = () => {
    const defaults = resetKeybindings()
    setKeybindings(defaults)
    setSuccessMsg(t('keybindingsReset'))
    setTimeout(() => setSuccessMsg(null), 1500)
  }


  // Handler for units toggle
  const handleUnitToggle = (unit: 'radians' | 'degrees') => {
    setAngularUnit(unit)
    localStorage.setItem('hmi_angular_unit', unit)
    window.dispatchEvent(new Event('hmi_config_updated'))
    
    setSuccessMsg(t('unitSwitched', { unit: unit === 'degrees' ? t('degrees') : t('radians') }))
    setTimeout(() => setSuccessMsg(null), 1500)
  }

  // Handler for ghost opacity changes
  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valPct = parseInt(e.target.value, 10)
    setGhostOpacity(valPct)
    localStorage.setItem('hmi_ghost_opacity', (valPct / 100).toFixed(2))
    window.dispatchEvent(new Event('hmi_config_updated'))
  }

  // Handler for filename prefix inputs
  const handlePrefixChange = (val: string) => {
    const safeVal = val.replace(/[^a-zA-Z0-9_-]/g, '') // strip special characters
    setFilenamePrefix(safeVal)
    localStorage.setItem('hmi_filename_prefix', safeVal)
  }

  // Handler for format select
  const handleFormatChange = (fmt: 'image/png' | 'image/jpeg') => {
    setExportFormat(fmt)
    localStorage.setItem('hmi_export_format', fmt)
  }

  // Handler for scale select
  const handleScaleChange = (scale: number) => {
    setResolutionScale(scale)
    localStorage.setItem('hmi_export_scale', scale.toString())
  }

  // Capture single graph
  const handleCaptureSingle = async (type: string, name: string) => {
    try {
      setExportState(t('capturingSingle', { name }))
      await downloadSingleGraph(type, name, state)
      setExportState(null)
      setSuccessMsg(t('downloadInitiated'))
      setTimeout(() => setSuccessMsg(null), 1500)
    } catch (err: any) {
      console.error(err)
      alert(t('exportFailed', { message: err.message || err }))
      setExportState(null)
    }
  }

  // Show filename prompt before ZIP download
  const handleRequestZip = (includeCSV: boolean) => {
    setIsOpen(false)
    setZipCustomName(filenamePrefix || 'scara_hmi')
    setZipPrompt({ includeCSV })
  }

  // Compile ZIP with images (and optional CSV)
  const handleExportZip = async (includeCSV: boolean, customName: string) => {
    setZipPrompt(null)
    try {
      await downloadAllGraphs(state, includeCSV, (msg) => setExportState(msg), customName)
      setExportState(null)
      setSuccessMsg(t('zipInitiated'))
      setTimeout(() => setSuccessMsg(null), 1500)
    } catch (err: any) {
      console.error(err)
      alert(t('zipFailed', { message: err.message || err }))
      setExportState(null)
    }
  }

  return (
    <>
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          id="hmi-hamburger-button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-hmi-grid bg-hmi-btn hover:bg-hmi-btn-hover text-hmi-text-secondary hover:text-hmi-text flex items-center justify-center"
          title={t('hmiControlPanel')}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex flex-col h-full text-hmi-text bg-hmi-panel border-l border-hmi-grid overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold tracking-tight text-hmi-text flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-hmi-ideal" />
            {t('hmiControlPanel')}
          </SheetTitle>
          <SheetDescription className="text-hmi-text-secondary">
            {t('panelDesc')}
          </SheetDescription>
        </SheetHeader>

        {/* Status notification banner for exporting or config changes */}
        {(exportState || successMsg) && (
          <div className={cn(
            "border p-3 rounded-lg flex items-center gap-3 text-xs font-medium font-mono shrink-0 transition-all duration-300 mb-4",
            successMsg 
              ? "bg-hmi-text-success/10 border-hmi-text-success/30 text-hmi-text-success" 
              : "bg-hmi-elevated border-hmi-ideal/30 text-hmi-ideal animate-pulse"
          )}>
            {successMsg ? (
              <>
                <Check className="h-4 w-4 text-hmi-text-success shrink-0" />
                <span>{successMsg}</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-hmi-ideal shrink-0" />
                <span>{exportState}</span>
              </>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col gap-6 py-2">
          {/* ── Help & Onboarding Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-hmi-text-secondary uppercase tracking-wider">
              <Compass className="h-4 w-4 text-indigo-400" />
              {t('helpOnboarding')}
            </div>
            <div className="bg-hmi-elevated/40 border border-hmi-grid p-3.5 rounded-lg flex flex-col gap-2">
              <p className="text-[10px] text-hmi-text-secondary leading-normal">
                {t('helpOnboardingDesc')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsOpen(false)
                  // Short delay to allow the Hamburger menu sheet transition to finish closing and release focus locks
                  setTimeout(() => {
                    window.dispatchEvent(new Event('hmi_start_tutorial'))
                  }, 150)
                }}
                className="w-full h-8 text-xs font-semibold border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-500/15 transition-all mt-1"
              >
                {t('startOnboarding')}
              </Button>
            </div>
          </div>

          {/* ── Dashboard Settings Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-hmi-text-secondary uppercase tracking-wider">
              <SlidersHorizontal className="h-4 w-4 text-hmi-muted" />
              {t('dashboardPreferences')}
            </div>

            <div className="bg-hmi-elevated/40 border border-hmi-grid p-3.5 rounded-lg flex flex-col gap-4">
              {/* Radians vs Degrees Toggle */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-hmi-text-secondary uppercase tracking-wider">{t('angularDisplayUnits')}</span>
                <div className="grid grid-cols-2 gap-1.5 bg-hmi-bg p-1 rounded-md border border-hmi-grid">
                  <button
                    onClick={() => handleUnitToggle('radians')}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded transition-all cursor-pointer",
                      angularUnit === 'radians'
                        ? "bg-hmi-ideal text-white shadow-md font-bold"
                        : "text-hmi-muted hover:text-hmi-text"
                    )}
                  >
                    {t('radiansUnit')}
                  </button>
                  <button
                    onClick={() => handleUnitToggle('degrees')}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded transition-all cursor-pointer",
                      angularUnit === 'degrees'
                        ? "bg-hmi-ideal text-white shadow-md font-bold"
                        : "text-hmi-muted hover:text-hmi-text"
                    )}
                  >
                    {t('degreesUnit')}
                  </button>
                </div>
                <span className="text-[9px] text-hmi-muted leading-normal">
                  {t('unitDesc')}
                </span>
              </div>

              {/* Ghost Trail Opacity Slider */}
              <div className="flex flex-col gap-1.5 border-t border-hmi-grid pt-3">
                <div className="flex items-center justify-between text-xs text-hmi-text font-medium">
                  <span className="text-[10px] font-bold text-hmi-text-secondary uppercase tracking-wider">{t('ghostTrailOpacity')}</span>
                  <span className="font-mono text-hmi-ideal font-semibold">{ghostOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={ghostOpacity}
                  onChange={handleOpacityChange}
                  className="w-full h-1.5 bg-hmi-bg rounded-lg appearance-none cursor-pointer accent-hmi-ideal border border-hmi-grid"
                />
                <span className="text-[9px] text-hmi-muted leading-normal">
                  {t('ghostDesc')}
                </span>
              </div>
            </div>
          </div>

          {/* ── Captures Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-hmi-text-secondary uppercase tracking-wider">
              <FolderArchive className="h-4 w-4 text-hmi-text-secondary" />
              {t('diagnosticsCaptures')}
            </div>

            {!hasData && (
              <div className="bg-hmi-elevated/40 border border-hmi-grid p-4 rounded-lg flex gap-3 text-xs leading-relaxed text-hmi-muted">
                <Info className="h-4 w-4 text-hmi-dimmed shrink-0 mt-0.5" />
                <p>
                  {t('noTrajectoryData')}
                </p>
              </div>
            )}

            <div className={cn("flex flex-col gap-2", !hasData && "opacity-45 pointer-events-none")}>
              {/* Capture Specific Graph Collapsible */}
              <Collapsible open={isGraphsOpen} onOpenChange={setIsGraphsOpen} className="border border-hmi-grid rounded-lg overflow-hidden bg-hmi-elevated/30">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 text-sm font-semibold hover:bg-hmi-btn-hover/60 transition-colors text-hmi-text cursor-pointer">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-hmi-ideal" />
                      <span>{t('captureSpecificGraph')}</span>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-hmi-muted transition-transform duration-200", isGraphsOpen && "transform rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-hmi-grid bg-hmi-bg/25 p-2 flex flex-col gap-1">
                  {[
                    { id: 'xy' },
                    { id: 'cte' },
                    { id: 'ate' },
                    { id: 'eef' },
                    { id: 'eef-vel' },
                    { id: 'pwm' },
                    { id: 'pos' },
                    { id: 'vel' },
                    { id: 'phase' },
                    { id: 'fft-eef' },
                    { id: 'fft-th1' },
                    { id: 'fft-th2' },
                    { id: 'effort' },
                    { id: 'ctc' },
                    { id: 'internal' },
                    { id: 'stepper' },
                    { id: 'pid-breakdown' },
                    { id: 'loop' },
                    { id: 'params' },
                    { id: 'metrics' },
                  ].map((graph) => (
                    <button
                      key={graph.id}
                      onClick={() => handleCaptureSingle(graph.id, t(`graphs.${graph.id}`))}
                      disabled={exportState !== null}
                      className="w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded hover:bg-hmi-btn-hover text-hmi-text-secondary hover:text-hmi-text transition-colors cursor-pointer"
                    >
                      <span>{t(`graphs.${graph.id}`)}</span>
                      <Download className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
                    </button>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Capture All Graphs Button */}
              <Button
                variant="default"
                disabled={exportState !== null || zipPrompt !== null}
                onClick={() => handleRequestZip(false)}
                className="w-full flex items-center justify-start gap-2.5 h-10 text-hmi-text bg-hmi-btn border border-hmi-grid hover:bg-hmi-btn-hover font-semibold shadow-md cursor-pointer"
              >
                <FolderArchive className="h-4.5 w-4.5 text-amber-500" />
                <div className="text-left flex flex-col">
                  <span className="text-xs leading-none">{t('captureAllGraphs')}</span>
                  <span className="text-[9px] text-hmi-muted font-normal">{t('captureAllDesc')}</span>
                </div>
              </Button>

              {/* Capture All Graphs + Table CSV Button */}
              <Button
                variant="default"
                disabled={exportState !== null || zipPrompt !== null}
                onClick={() => handleRequestZip(true)}
                className="w-full flex items-center justify-start gap-2.5 h-10 text-hmi-text bg-hmi-btn border border-hmi-grid hover:bg-hmi-btn-hover font-semibold shadow-md cursor-pointer"
              >
                <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-500" />
                <div className="text-left flex flex-col">
                  <span className="text-xs leading-none">{t('captureAllCsv')}</span>
                  <span className="text-[9px] text-hmi-muted font-normal">{t('captureAllCsvDesc')}</span>
                </div>
              </Button>
            </div>
          </div>

          {/* ── Exporter Customization Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-hmi-text-secondary uppercase tracking-wider">
              <FileImage className="h-4 w-4 text-hmi-text-secondary" />
              {t('exporterPreferences')}
            </div>

            <div className="bg-hmi-elevated/40 border border-hmi-grid p-3.5 rounded-lg flex flex-col gap-3">
              {/* Image Export Format */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-hmi-muted uppercase tracking-wide">{t('imageFileFormat')}</span>
                <div className="grid grid-cols-2 gap-1 bg-hmi-bg p-0.5 rounded border border-hmi-grid">
                  <button
                    onClick={() => handleFormatChange('image/png')}
                    className={cn(
                      "py-1 text-[11px] font-medium rounded transition-all cursor-pointer",
                      exportFormat === 'image/png'
                        ? "bg-hmi-btn text-hmi-text shadow-sm border border-hmi-grid"
                        : "text-hmi-muted hover:text-hmi-text-secondary"
                    )}
                  >
                    {t('pngLossless')}
                  </button>
                  <button
                    onClick={() => handleFormatChange('image/jpeg')}
                    className={cn(
                      "py-1 text-[11px] font-medium rounded transition-all cursor-pointer",
                      exportFormat === 'image/jpeg'
                        ? "bg-hmi-btn text-hmi-text shadow-sm border border-hmi-grid"
                        : "text-hmi-muted hover:text-hmi-text-secondary"
                    )}
                  >
                    {t('jpegCompressed')}
                  </button>
                </div>
              </div>

              {/* Resolution Multiplier Scale */}
              <div className="flex flex-col gap-1 border-t border-hmi-grid pt-2.5">
                <span className="text-[10px] font-bold text-hmi-text-secondary uppercase tracking-wide">{t('dpiResolution')}</span>
                <div className="grid grid-cols-3 gap-1 bg-hmi-bg p-0.5 rounded border border-hmi-grid">
                  {[
                    { val: 1, label: t('dpiStandard') },
                    { val: 2, label: t('dpiRetina') },
                    { val: 3, label: t('dpiPrint') },
                  ].map((s) => (
                    <button
                      key={s.val}
                      onClick={() => handleScaleChange(s.val)}
                      className={cn(
                        "py-1 text-[10px] font-medium rounded transition-all cursor-pointer",
                        resolutionScale === s.val
                          ? "bg-hmi-btn text-hmi-text shadow-sm border border-hmi-grid"
                          : "text-hmi-muted hover:text-hmi-text-secondary"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Filename Prefix */}
              <div className="flex flex-col gap-1 border-t border-hmi-grid pt-2.5">
                <span className="text-[10px] font-bold text-hmi-text-secondary uppercase tracking-wide">{t('filenamePrefix')}</span>
                <Input
                  type="text"
                  value={filenamePrefix}
                  onChange={(e) => handlePrefixChange(e.target.value)}
                  placeholder="scara_hmi"
                  className="h-8 bg-hmi-bg border-hmi-grid text-xs text-hmi-text placeholder-hmi-dimmed font-mono outline-none focus-visible:ring-1 focus-visible:ring-hmi-ideal/40"
                />
                <span className="text-[8px] text-hmi-muted mt-0.5">
                  {t('prefixDesc')}
                </span>
              </div>
            </div>
          </div>

          {/* ── Keybindings Settings Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-hmi-text-secondary uppercase tracking-wider">
              <Keyboard className="h-4 w-4 text-hmi-muted" />
              {t('keyboardShortcuts')}
            </div>

            <div className="bg-hmi-elevated/40 border border-hmi-grid rounded-lg overflow-hidden flex flex-col">
              <Collapsible open={isKeybindingsOpen} onOpenChange={setIsKeybindingsOpen} className="w-full">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3.5 text-sm font-semibold hover:bg-hmi-btn-hover/60 transition-colors text-hmi-text cursor-pointer">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-hmi-ideal" />
                      <span>{t('customizeKeybindings')}</span>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-hmi-muted transition-transform duration-200", isKeybindingsOpen && "transform rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-hmi-grid bg-hmi-bg/25 p-3.5 flex flex-col gap-3">
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {keybindings.map((binding) => {
                      const isRebindingThis = rebindingAction === binding.action
                      return (
                        <div key={binding.action} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-hmi-grid/60 last:border-0">
                          <span className="text-hmi-text-secondary font-medium">{t(`keybindings.${binding.action}`)}</span>
                          <div className="flex items-center gap-2">
                            <kbd className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-mono border font-bold transition-all shadow-sm min-w-[32px] text-center",
                              isRebindingThis
                                ? "bg-amber-500/20 border-amber-400 text-amber-400 animate-pulse"
                                : "bg-hmi-bg border-hmi-grid text-hmi-ideal"
                            )}>
                              {isRebindingThis ? t('pressKey') : binding.key === ' ' ? t('spaceKey') : binding.key}
                            </kbd>
                            <button
                              onClick={() => setRebindingAction(binding.action)}
                              disabled={rebindingAction !== null && !isRebindingThis}
                              className={cn(
                                "px-2 py-1 rounded text-[10px] border transition-all font-semibold cursor-pointer",
                                isRebindingThis
                                  ? "bg-amber-500/30 border-amber-400/50 text-amber-400"
                                  : "bg-hmi-btn border-hmi-grid hover:bg-hmi-btn-hover text-hmi-text-secondary hover:text-hmi-text disabled:opacity-40 disabled:cursor-not-allowed"
                              )}
                            >
                              {t('rebind')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 border-t border-hmi-grid pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetKeybindings}
                      className="w-full text-[11px] h-8 border-hmi-grid hover:bg-hmi-btn hover:text-hmi-text text-hmi-text-secondary"
                    >
                      {t('resetToDefaults')}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>


        {/* Footer info */}
        <div className="border-t border-hmi-grid pt-3 text-[10px] text-hmi-muted font-mono text-center shrink-0">
          {t('versionInfo')}
        </div>
      </SheetContent>

    </Sheet>

    {/* Portaled above all UI layers — avoids header/sheet z-index stacking traps */}
    {zipPrompt && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[300] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setZipPrompt(null)} />
        <div className="relative z-10 bg-hmi-elevated border border-hmi-grid rounded-xl shadow-2xl p-6 w-80 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-bold text-hmi-text">{t('nameZipFile')}</h2>
            <p className="text-[11px] text-hmi-text-secondary">
              {zipPrompt.includeCSV ? t('imagesCsv') : t('imagesOnly')} · {t('chartsCount')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Input
              autoFocus
              type="text"
              value={zipCustomName}
              onChange={(e) => setZipCustomName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleExportZip(zipPrompt.includeCSV, zipCustomName)
                if (e.key === 'Escape') setZipPrompt(null)
              }}
              placeholder="scara_hmi"
              className="h-9 bg-hmi-bg border-hmi-grid text-sm text-hmi-text font-mono focus-visible:ring-1 focus-visible:ring-hmi-ideal/50"
            />
            <span className="text-[10px] text-hmi-muted font-mono">
              → <span className="text-hmi-text-secondary">{zipCustomName || 'scara_hmi'}.zip</span>
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleExportZip(zipPrompt.includeCSV, zipCustomName)}
              className="flex-1 h-9 text-sm bg-hmi-ideal hover:bg-hmi-ideal/80 text-white font-semibold cursor-pointer"
            >
              {t('download')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setZipPrompt(null)}
              className="h-9 px-4 text-sm border-hmi-grid text-hmi-text-secondary hover:text-hmi-text hover:bg-hmi-btn-hover cursor-pointer"
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
  )
}
