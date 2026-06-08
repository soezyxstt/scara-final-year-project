'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useHMI } from '@/lib/hmi-context'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const { state } = useHMI()
  const pathname = usePathname()
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

      const boundLabel = keybindings.find(b => b.action === targetAction)?.label ?? 'Action'
      setSuccessMsg(`Rebound "${boundLabel}" to "${targetKey === ' ' ? 'Space' : targetKey}"`)
      setTimeout(() => setSuccessMsg(null), 1500)
    }

    window.addEventListener('keydown', handleRebindKeyDown, true)
    return () => window.removeEventListener('keydown', handleRebindKeyDown, true)
  }, [rebindingAction, keybindings])

  const handleResetKeybindings = () => {
    const defaults = resetKeybindings()
    setKeybindings(defaults)
    setSuccessMsg('Keybindings reset to defaults')
    setTimeout(() => setSuccessMsg(null), 1500)
  }


  // Handler for units toggle
  const handleUnitToggle = (unit: 'radians' | 'degrees') => {
    setAngularUnit(unit)
    localStorage.setItem('hmi_angular_unit', unit)
    window.dispatchEvent(new Event('hmi_config_updated'))
    
    setSuccessMsg(`Charts switched to ${unit === 'degrees' ? 'Degrees' : 'Radians'}`)
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
      setExportState(`Capturing ${name}...`)
      await downloadSingleGraph(type, name, state)
      setExportState(null)
      setSuccessMsg('Download initiated!')
      setTimeout(() => setSuccessMsg(null), 1500)
    } catch (err: any) {
      console.error(err)
      alert(`Export failed: ${err.message || err}`)
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
      setSuccessMsg('Zip download initiated!')
      setTimeout(() => setSuccessMsg(null), 1500)
    } catch (err: any) {
      console.error(err)
      alert(`Zip packaging failed: ${err.message || err}`)
      setExportState(null)
    }
  }

  return (
    <>
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 flex items-center justify-center"
          title="Menu"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex flex-col h-full text-slate-100 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-hmi-ideal" />
            HMI Control Panel
          </SheetTitle>
          <SheetDescription className="text-slate-400">
            Configure angular units, manage workspace overlays, and customize diagnostic exporters.
          </SheetDescription>
        </SheetHeader>

        {/* Status notification banner for exporting or config changes */}
        {(exportState || successMsg) && (
          <div className={cn(
            "border p-3 rounded-lg flex items-center gap-3 text-xs font-medium font-mono shrink-0 transition-all duration-300 mb-4",
            successMsg 
              ? "bg-emerald-950/40 border-emerald-500/35 text-emerald-400" 
              : "bg-slate-900 border-hmi-ideal/30 text-hmi-ideal animate-pulse"
          )}>
            {successMsg ? (
              <>
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
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
          {/* ── Page Navigation Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <Compass className="h-4 w-4 text-slate-400" />
              Page Navigation
            </div>

            <div className="bg-slate-900/20 border border-slate-800 p-2.5 rounded-lg flex flex-col gap-1.5">
              <Link
                href="/"
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold transition-all border",
                  pathname === '/'
                    ? "bg-hmi-ideal border-hmi-ideal text-white shadow-sm font-bold"
                    : "bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-800"
                )}
              >
                <Activity className="h-4 w-4 text-emerald-500" />
                <span>SCARA Dashboard</span>
              </Link>
              <Link
                href="/zn"
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold transition-all border",
                  pathname === '/zn'
                    ? "bg-hmi-ideal border-hmi-ideal text-white shadow-sm font-bold"
                    : "bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-800"
                )}
              >
                <Gauge className="h-4 w-4 text-sky-400" />
                <span>Ziegler-Nichols Tuner</span>
              </Link>
              <Link
                href="/test"
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold transition-all border",
                  pathname === '/test'
                    ? "bg-hmi-ideal border-hmi-ideal text-white shadow-sm font-bold"
                    : "bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-800"
                )}
              >
                <TestTube className="h-4 w-4 text-amber-500" />
                <span>Test Page</span>
              </Link>
            </div>
          </div>

          {/* ── Dashboard Settings Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <SlidersHorizontal className="h-4 w-4 text-slate-400" />
              Dashboard Preferences
            </div>

            <div className="bg-slate-900/20 border border-slate-800 p-3.5 rounded-lg flex flex-col gap-4">
              {/* Radians vs Degrees Toggle */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Angular Display Units</span>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-md border border-slate-900">
                  <button
                    onClick={() => handleUnitToggle('radians')}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded transition-all",
                      angularUnit === 'radians'
                        ? "bg-hmi-ideal text-white shadow-md"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    Radians (rad)
                  </button>
                  <button
                    onClick={() => handleUnitToggle('degrees')}
                    className={cn(
                      "py-1.5 text-xs font-semibold rounded transition-all",
                      angularUnit === 'degrees'
                        ? "bg-hmi-ideal text-white shadow-md"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    Degrees (°)
                  </button>
                </div>
                <span className="text-[9px] text-slate-500 leading-normal">
                  Sets the angular position and velocity unit mappings across both Chart dashboards.
                </span>
              </div>

              {/* Ghost Trail Opacity Slider */}
              <div className="flex flex-col gap-1.5 border-t border-slate-900 pt-3">
                <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ghost Trail Opacity</span>
                  <span className="font-mono text-hmi-ideal font-semibold">{ghostOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={ghostOpacity}
                  onChange={handleOpacityChange}
                  className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-hmi-ideal border border-slate-850"
                />
                <span className="text-[9px] text-slate-500 leading-normal">
                  Adjusts the canvas transparency for previous run trajectory overlays.
                </span>
              </div>
            </div>
          </div>

          {/* ── Captures Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <FolderArchive className="h-4 w-4 text-slate-400" />
              Diagnostics & Captures
            </div>

            {!hasData && (
              <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-lg flex gap-3 text-xs leading-relaxed text-slate-500">
                <Info className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
                <p>
                  No trajectory data is loaded. Run a coordinate move command on the dashboard first to unlock diagnostics packaging.
                </p>
              </div>
            )}

            <div className={cn("flex flex-col gap-2", !hasData && "opacity-45 pointer-events-none")}>
              {/* Capture Specific Graph Collapsible */}
              <Collapsible open={isGraphsOpen} onOpenChange={setIsGraphsOpen} className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/30">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 text-sm font-semibold hover:bg-slate-900/60 transition-colors text-slate-200">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-hmi-ideal" />
                      <span>Capture Specific Graph</span>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform duration-200", isGraphsOpen && "transform rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-slate-900 bg-slate-950/20 p-2 flex flex-col gap-1">
                  {[
                    { id: 'xy', label: 'XY Workspace Trace' },
                    { id: 'cte', label: 'CTE Cross-Track Error' },
                    { id: 'ate', label: 'ATE Along-Track Error' },
                    { id: 'eef', label: 'End-Effector Error Chart' },
                    { id: 'eef-vel', label: 'End-Effector Velocity Chart' },
                    { id: 'pwm', label: 'PWM Command Chart' },
                    { id: 'pos', label: 'Joint Position Chart' },
                    { id: 'vel', label: 'Joint Velocity Chart' },
                    { id: 'phase', label: 'Phase Portrait' },
                    { id: 'fft-eef', label: 'FFT: EEF Error' },
                    { id: 'fft-th1', label: 'FFT: Joint 1' },
                    { id: 'fft-th2', label: 'FFT: Joint 2' },
                    { id: 'effort', label: 'Control Effort Proxy' },
                    { id: 'ctc', label: 'CTC Feedforward Torques' },
                    { id: 'internal', label: 'J1 Internal Control Signals' },
                    { id: 'stepper', label: 'J2 Stepper Velocity Commands' },
                    { id: 'pid-breakdown', label: 'J1 PID Control Effort Breakdown' },
                    { id: 'loop', label: 'Microcontroller Loop Execution Time' },
                    { id: 'params', label: 'System Parameters Report' },
                    { id: 'metrics', label: 'Run Metrics Report' },
                  ].map((graph) => (
                    <button
                      key={graph.id}
                      onClick={() => handleCaptureSingle(graph.id, graph.label)}
                      disabled={exportState !== null}
                      className="w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded hover:bg-slate-900 text-slate-400 hover:text-white transition-colors"
                    >
                      <span>{graph.label}</span>
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
                className="w-full flex items-center justify-start gap-2.5 h-10 text-slate-200 bg-slate-900 border border-slate-800 hover:bg-slate-800 font-semibold shadow-md"
              >
                <FolderArchive className="h-4.5 w-4.5 text-amber-500" />
                <div className="text-left flex flex-col">
                  <span className="text-xs leading-none">Capture All Graphs</span>
                  <span className="text-[9px] text-slate-500 font-normal">Bundles 20 images into ZIP archive</span>
                </div>
              </Button>

              {/* Capture All Graphs + Table CSV Button */}
              <Button
                variant="default"
                disabled={exportState !== null || zipPrompt !== null}
                onClick={() => handleRequestZip(true)}
                className="w-full flex items-center justify-start gap-2.5 h-10 text-slate-200 bg-slate-900 border border-slate-800 hover:bg-slate-850 font-semibold shadow-md"
              >
                <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-500" />
                <div className="text-left flex flex-col">
                  <span className="text-xs leading-none">Capture All + Table CSV</span>
                  <span className="text-[9px] text-slate-500 font-normal">Bundles 20 images and raw spreadsheet CSV</span>
                </div>
              </Button>
            </div>
          </div>

          {/* ── Exporter Customization Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <FileImage className="h-4 w-4 text-slate-400" />
              Exporter Preferences
            </div>

            <div className="bg-slate-900/20 border border-slate-800 p-3.5 rounded-lg flex flex-col gap-3">
              {/* Image Export Format */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Image File Format</span>
                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded border border-slate-900">
                  <button
                    onClick={() => handleFormatChange('image/png')}
                    className={cn(
                      "py-1 text-[11px] font-medium rounded transition-all",
                      exportFormat === 'image/png'
                        ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                        : "text-slate-500 hover:text-slate-400"
                    )}
                  >
                    PNG (Lossless)
                  </button>
                  <button
                    onClick={() => handleFormatChange('image/jpeg')}
                    className={cn(
                      "py-1 text-[11px] font-medium rounded transition-all",
                      exportFormat === 'image/jpeg'
                        ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                        : "text-slate-500 hover:text-slate-400"
                    )}
                  >
                    JPEG (Compressed)
                  </button>
                </div>
              </div>

              {/* Resolution Multiplier Scale */}
              <div className="flex flex-col gap-1 border-t border-slate-900 pt-2.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">DPI Export Resolution</span>
                <div className="grid grid-cols-3 gap-1 bg-slate-950 p-0.5 rounded border border-slate-900">
                  {[
                    { val: 1, label: '1x (Standard)' },
                    { val: 2, label: '2x (Retina)' },
                    { val: 3, label: '3x (Print DPI)' },
                  ].map((s) => (
                    <button
                      key={s.val}
                      onClick={() => handleScaleChange(s.val)}
                      className={cn(
                        "py-1 text-[10px] font-medium rounded transition-all",
                        resolutionScale === s.val
                          ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                          : "text-slate-500 hover:text-slate-400"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Filename Prefix */}
              <div className="flex flex-col gap-1 border-t border-slate-900 pt-2.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Filename Prefix</span>
                <Input
                  type="text"
                  value={filenamePrefix}
                  onChange={(e) => handlePrefixChange(e.target.value)}
                  placeholder="scara_hmi"
                  className="h-8 bg-slate-950 border-slate-800 text-xs text-white placeholder-slate-700 font-mono outline-none focus-visible:ring-1 focus-visible:ring-hmi-ideal/40"
                />
                <span className="text-[8px] text-slate-500 mt-0.5">
                  Letters, numbers, dashes, and underscores only.
                </span>
              </div>
            </div>
          </div>

          {/* ── Keybindings Settings Section ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <Keyboard className="h-4 w-4 text-slate-400" />
              Keyboard Shortcuts
            </div>

            <div className="bg-slate-900/20 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
              <Collapsible open={isKeybindingsOpen} onOpenChange={setIsKeybindingsOpen} className="w-full">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3.5 text-sm font-semibold hover:bg-slate-900/60 transition-colors text-slate-200">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-hmi-ideal" />
                      <span>Customize Keybindings</span>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform duration-200", isKeybindingsOpen && "transform rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-slate-900 bg-slate-950/20 p-3.5 flex flex-col gap-3">
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {keybindings.map((binding) => {
                      const isRebindingThis = rebindingAction === binding.action
                      return (
                        <div key={binding.action} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-900/60 last:border-0">
                          <span className="text-slate-400 font-medium">{binding.label}</span>
                          <div className="flex items-center gap-2">
                            <kbd className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-mono border font-bold transition-all shadow-sm min-w-[32px] text-center",
                              isRebindingThis
                                ? "bg-amber-500/20 border-amber-400 text-amber-400 animate-pulse"
                                : "bg-slate-950 border-slate-800 text-hmi-ideal"
                            )}>
                              {isRebindingThis ? 'Press key...' : binding.key === ' ' ? 'Space' : binding.key}
                            </kbd>
                            <button
                              onClick={() => setRebindingAction(binding.action)}
                              disabled={rebindingAction !== null && !isRebindingThis}
                              className={cn(
                                "px-2 py-1 rounded text-[10px] border transition-all font-semibold cursor-pointer",
                                isRebindingThis
                                  ? "bg-amber-500/30 border-amber-400/50 text-amber-400"
                                  : "bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                              )}
                            >
                              Rebind
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 border-t border-slate-900 pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetKeybindings}
                      className="w-full text-[11px] h-8 border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white"
                    >
                      Reset to Defaults
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>


        {/* Footer info */}
        <div className="border-t border-hmi-grid pt-3 text-[10px] text-slate-500 font-mono text-center shrink-0">
          SCARA Diagnostics Tool v1.0.0
        </div>
      </SheetContent>

    </Sheet>

    {/* Portaled above all UI layers — avoids header/sheet z-index stacking traps */}
    {zipPrompt && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[300] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setZipPrompt(null)} />
        <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6 w-80 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-bold text-white">Name your ZIP file</h2>
            <p className="text-[11px] text-slate-400">
              {zipPrompt.includeCSV ? 'Images + CSV' : 'Images only'} · 19 charts
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
              className="h-9 bg-slate-950 border-slate-700 text-sm text-white font-mono focus-visible:ring-1 focus-visible:ring-hmi-ideal/50"
            />
            <span className="text-[10px] text-slate-500 font-mono">
              → <span className="text-slate-300">{zipCustomName || 'scara_hmi'}.zip</span>
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleExportZip(zipPrompt.includeCSV, zipCustomName)}
              className="flex-1 h-9 text-sm bg-hmi-ideal hover:bg-hmi-ideal/80 text-white font-semibold"
            >
              Download
            </Button>
            <Button
              variant="outline"
              onClick={() => setZipPrompt(null)}
              className="h-9 px-4 text-sm border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
  )
}
