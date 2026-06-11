import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Maximize2, Minimize2, Brain, Bot, Sparkles, Loader2 } from 'lucide-react'
import { ComparisonTable } from './comparison-table'
import { ControlEffortSection, CTCTorqueSection, LoopDurationSection } from './advanced-analysis'
import { PhasePortrait } from './phase-portrait'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'
import { EEFErrChart, EEFVelocityChart, PWMChart } from './chart-panel'
import { useHMISlow } from '@/lib/hmi-context'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Helper to format inline bold text **text** to HTML tags in React
function parseInlineBold(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/)
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-bold text-hmi-text">{part}</strong>
    }
    return part
  })
}

// Sanitize LaTeX math notation to readable plain text characters
function sanitizeMath(text: string) {
  return text
    // Replace $$formula$$ block math wrappers
    .replace(/\$\$(.*?)\$\$/g, '$1')
    // Replace $formula$ inline math wrappers
    .replace(/\$(.*?)\$/g, '$1')
    // Replace common LaTeX characters
    .replace(/\\approx/g, '≈')
    .replace(/\\ge/g, '≥')
    .replace(/\\le/g, '≤')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\degree/g, '°')
    .replace(/\\text\{\s*(.*?)\s*\}/g, '$1')
    .replace(/\\%/g, '%')
}

// Custom Markdown renderer designed specifically for Copilot layout structure
function MarkdownRenderer({ text }: { text: string }) {
  if (!text) return null

  // If the text has a JSON block at the end, slice it out of the displayed content so it remains clean
  let cleanText = text
  const jsonIdx = text.indexOf('```json')
  if (jsonIdx !== -1) {
    cleanText = text.substring(0, jsonIdx).trim()
  }

  cleanText = sanitizeMath(cleanText)

  const lines = cleanText.split('\n')
  return (
    <div className="space-y-2 text-xs leading-relaxed font-sans text-hmi-text-secondary">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        
        // Heading 3
        if (line.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-xs font-bold text-hmi-ideal mt-4 mb-2 uppercase tracking-wider border-b border-hmi-grid/45 pb-1">
              {line.substring(4)}
            </h4>
          )
        }
        // Heading 2 / Heading 1
        if (line.startsWith('## ') || line.startsWith('# ')) {
          const content = line.replace(/^[#]+\s+/, '')
          return (
            <h3 key={idx} className="text-sm font-extrabold text-hmi-ideal mt-5 mb-2">
              {content}
            </h3>
          )
        }
        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.substring(2)
          return (
            <div key={idx} className="flex gap-2 ml-3 items-start my-1 text-hmi-text-secondary">
              <span className="text-hmi-ideal select-none shrink-0 mt-1">•</span>
              <span>{parseInlineBold(content)}</span>
            </div>
          )
        }
        // Ordered List
        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+(.*)/)
          const num = match?.[1] || '1'
          const content = match?.[2] || ''
          return (
            <div key={idx} className="flex gap-2 ml-3 items-start my-1 text-hmi-text-secondary">
              <span className="text-hmi-ideal font-bold select-none shrink-0">{num}.</span>
              <span>{parseInlineBold(content)}</span>
            </div>
          )
        }
        // Empty line
        if (!trimmed) return <div key={idx} className="h-1" />

        // Default paragraph line
        return (
          <p key={idx} className="my-1">
            {parseInlineBold(line)}
          </p>
        )
      })}
    </div>
  )
}

// Regex parser to extract structured JSON recommendations
function extractTuningJSON(text: string) {
  try {
    const match = text.match(/```json\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/)
    if (match) {
      const parsed = JSON.parse(match[1])
      if (parsed && typeof parsed === 'object' && parsed.tuning) {
        return parsed.tuning as Record<string, number>
      }
    }
  } catch (err) {
    // Incomplete stream or invalid syntax
  }
  return null
}

// AI Copilot Section component
export function AICopilotSection() {
  const { state, serial } = useHMISlow()
  const { lastSavedRunId, stats, currentMove } = state
  const [mode, setMode] = useState<'explain' | 'diagnose' | 'recommend'>('diagnose')
  const [output, setOutput] = useState('')
  const [modelUsed, setModelUsed] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset output when switching runs
  useEffect(() => {
    setOutput('')
    setModelUsed('')
  }, [lastSavedRunId])

  const handleConsult = async () => {
    if (!lastSavedRunId) return
    setLoading(true)
    setOutput('')
    setModelUsed('')

    try {
      const response = await fetch(`/api/runs/${lastSavedRunId}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      if (!response.body) {
        throw new Error('Readable stream not supported by browser/runtime.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      let isFirstChunk = true

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          const chunk = decoder.decode(value)
          
          if (isFirstChunk) {
            isFirstChunk = false
            // Check if the chunk contains the model name header
            const match = chunk.match(/^\[MODEL_USED:(.*?)\]\n/)
            if (match) {
              setModelUsed(match[1])
              setOutput(prev => prev + chunk.slice(match[0].length))
              continue
            }
          }

          setOutput(prev => prev + chunk)
        }
      }
    } catch (err: any) {
      toast.error('AI Copilot Error', { description: err.message || 'Consultation failed' })
    } finally {
      setLoading(false)
    }
  }

  const tuningParams = extractTuningJSON(output)
  const isSerialConnected = state.serialStatus === 'connected'

  const handleApplyTuning = async (tuning: Record<string, number>) => {
    const toastId = toast.loading('Applying AI recommendations to hardware...')
    try {
      for (const [cmd, val] of Object.entries(tuning)) {
        await serial.sendCommand(`${cmd},${val}`)
      }
      // Query refresh values from physical device
      await serial.sendCommand('getparams')
      await serial.sendCommand('getgains')
      toast.success('AI recommendations applied successfully!', { id: toastId })
    } catch (err: any) {
      toast.error('Failed to apply gains', { description: err.message || err, id: toastId })
    }
  }

  if (!lastSavedRunId) {
    return (
      <Card className="border border-hmi-grid bg-hmi-panel/30 backdrop-blur shadow-md">
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-hmi-ideal/10 rounded-lg text-hmi-ideal border border-hmi-ideal/20">
              <Brain className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-hmi-text">SCARA AI Copilot Advisor</h3>
              <p className="text-xs text-hmi-muted">Run a move and select <strong>Run + Save to DB</strong> to consult the AI Copilot regarding your controller parameters and telemetry.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-hmi-ideal/40 bg-hmi-panel/40 backdrop-blur shadow-md transition-all duration-300 hover:border-hmi-ideal/60">
      <CardHeader className="p-4 pb-2 border-b border-hmi-grid/35 flex flex-row items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-hmi-ideal/15 rounded-lg text-hmi-ideal border border-hmi-ideal/30">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-hmi-text flex items-center gap-1.5">
              SCARA AI Copilot
              {modelUsed && (
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-hmi-grid/70 text-hmi-muted border border-hmi-grid">
                  via {modelUsed}
                </span>
              )}
            </CardTitle>
            <p className="text-[10px] text-hmi-muted">Senior Control Systems Engineer Persona</p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center bg-hmi-bg/85 border border-hmi-grid p-1 rounded-lg">
          {(['explain', 'diagnose', 'recommend'] as const).map(m => (
            <button
              key={m}
              disabled={loading}
              onClick={() => setMode(m)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all cursor-pointer",
                mode === m
                  ? "bg-hmi-ideal text-white shadow-sm"
                  : "text-hmi-muted hover:text-hmi-text"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </CardHeader>
      
      <CardContent className="p-4 flex flex-col gap-4">
        {/* Run summary badge */}
        <div className="flex flex-wrap gap-4 text-[10px] bg-hmi-bg/40 border border-hmi-grid/30 p-2.5 rounded-lg font-mono">
          <div><span className="text-hmi-muted">Max Err:</span> <span className="text-hmi-text font-bold">{(stats?.max_err ?? 0).toFixed(4)} mm</span></div>
          <div><span className="text-hmi-muted">Mean Err:</span> <span className="text-hmi-text font-bold">{(stats?.mean_err ?? 0).toFixed(4)} mm</span></div>
          <div><span className="text-hmi-muted">Max PWM:</span> <span className="text-hmi-text font-bold">{stats?.pwm_max ?? 0}</span></div>
          {currentMove && (
            <div><span className="text-hmi-muted">Path:</span> <span className="text-hmi-text font-bold">({currentMove.x0},{currentMove.y0}) ➔ ({currentMove.xf},{currentMove.yf})</span></div>
          )}
        </div>

        {/* Output Area */}
        {output ? (
          <div className="flex flex-col gap-3">
            <div className="bg-hmi-bg/60 border border-hmi-grid/40 p-4 rounded-xl max-h-[400px] overflow-y-auto font-sans">
              <MarkdownRenderer text={output} />
            </div>

            {/* One-Click Apply Action Box */}
            {tuningParams && Object.keys(tuningParams).length > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in shadow-sm">
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping shrink-0" />
                    Tuning Recommendations Detected
                  </span>
                  <span className="text-[10px] text-hmi-muted font-mono leading-tight truncate">
                    {Object.entries(tuningParams).map(([cmd, val]) => `${cmd}: ${val}`).join(', ')}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={!isSerialConnected || loading}
                  onClick={() => handleApplyTuning(tuningParams)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold text-[10px] uppercase tracking-wider py-1.5 px-3 h-8 shadow shrink-0 cursor-pointer transition-transform hover:scale-[1.02]"
                >
                  {isSerialConnected ? '✓ Apply to Hardware' : '⚠ Connect Serial to Apply'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-hmi-bg/30 border border-dashed border-hmi-grid/50 p-8 rounded-xl flex flex-col items-center justify-center text-center">
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 text-hmi-ideal animate-spin" />
                <p className="text-xs text-hmi-text-secondary font-medium animate-pulse">Consulting the control engineer copilot...</p>
                <p className="text-[10px] text-hmi-muted italic">Ingesting telemetry logs and history...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 max-w-sm">
                <Sparkles className="h-8 w-8 text-hmi-ideal/65 animate-pulse" />
                <p className="text-xs font-semibold text-hmi-text">Copilot stands ready</p>
                <p className="text-[10px] text-hmi-muted">Choose your mode and click Consult to stream live suggestions, explanation, or root cause diagnoses based on your telemetry.</p>
              </div>
            )}
          </div>
        )}

        {/* Trigger Button */}
        {!loading && (
          <Button
            onClick={handleConsult}
            className="w-full bg-hmi-ideal hover:bg-hmi-ideal/80 text-white font-bold text-xs uppercase tracking-widest gap-2 py-2 h-9 shadow-md transition-all hover:scale-[1.01] cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Consult Copilot ({mode})
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// Wrapper that adds an expand-to-fullscreen button to any chart card.
function ExpandableChartCard({
  title,
  chartHeight = 240,
  children,
}: {
  title: string
  hasData?: boolean
  noDataMsg?: string
  chartHeight?: number
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <Card className="shadow-md transition-all duration-300 hover:border-hmi-ideal/30 flex flex-col">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold text-hmi-text-secondary">{title}</CardTitle>
            <Tooltip content="Expand to fullscreen. Press ESC to exit." align="center">
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0 shrink-0 border-hmi-grid text-hmi-text-secondary hover:text-hmi-text hover:bg-hmi-btn-hover cursor-pointer"
                onClick={() => setExpanded(true)}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div style={{ height: chartHeight }}>{children}</div>
        </CardContent>
      </Card>

      {/* Fullscreen overlay */}
      {expanded && (
        <div className="fixed inset-0 z-[100] bg-hmi-bg flex flex-col p-6">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-base font-bold text-hmi-text">{title}</h2>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setExpanded(false)}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit Focus
            </Button>
          </div>
          <div className="flex-1 min-h-0">{children}</div>
        </div>
      )}
    </>
  )
}

// Expandable wrapper for sections that already render their own Card
function ExpandableSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="relative">
      <div className="absolute top-3 right-3 z-10">
        <Tooltip content="Expand to fullscreen." align="center">
          <Button
            variant="outline"
            size="sm"
            className="h-6 w-6 p-0 border-hmi-grid text-hmi-text-secondary hover:text-hmi-text hover:bg-hmi-btn-hover cursor-pointer"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </div>
      {children}

      {expanded && (
        <div className="fixed inset-0 z-[100] bg-hmi-bg flex flex-col p-6">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-base font-bold text-hmi-text">{title}</h2>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setExpanded(false)}>
              <Minimize2 className="h-3.5 w-3.5" />
              Exit Focus
            </Button>
          </div>
          <div className="flex-1 min-h-0">{children}</div>
        </div>
      )}
    </div>
  )
}

export function AnalysisTab() {
  const { state } = useHMISlow()
  const [advOpen, setAdvOpen] = useState(true)
  const [tableOpen, setTableOpen] = useState(false)

  const { frozenD, frozenT } = state

  return (
    <div className="flex flex-col gap-6 p-4 overflow-y-auto">

      {/* ── AI Copilot Section ──────────────────────────────── */}
      <AICopilotSection />

      {/* ── Advanced Analysis (collapsible) ──────────────────── */}
      <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2 text-xs uppercase tracking-widest font-semibold border-hmi-grid cursor-pointer">
            {advOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Advanced Analysis Details
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 flex flex-col gap-6">

          {/* Row 1: Phase Portrait — full width */}
          <ExpandableSection title="Phase Portrait">
            <div className="h-[320px] rounded-xl border border-hmi-grid overflow-hidden">
              <PhasePortrait />
            </div>
          </ExpandableSection>

          {/* Row 2: EEF Cartesian Error + EEF Velocity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ExpandableChartCard
              title="End-Effector Cartesian Error (Euclidean)"
              hasData={frozenT.length > 0}
            >
              <EEFErrChart tBuf={frozenT} dBuf={frozenD} />
            </ExpandableChartCard>

            <ExpandableChartCard
              title="End-Effector Velocity Profile (Trapezoidal vs Actual)"
              hasData={frozenD.length > 0}
            >
              <EEFVelocityChart dBuf={frozenD} />
            </ExpandableChartCard>
          </div>

          {/* Row 3: PWM Output + Control Effort */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ExpandableChartCard
              title="Actuator PWM Output"
              hasData={frozenD.length > 0}
            >
              <PWMChart dBuf={frozenD} />
            </ExpandableChartCard>

            <ExpandableSection title="Control Effort">
              <ControlEffortSection />
            </ExpandableSection>
          </div>

          {/* Row 4: CTC Feedforward Torques + Loop Duration */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ExpandableSection title="CTC Feedforward Torques">
              <CTCTorqueSection />
            </ExpandableSection>

            <ExpandableSection title="Loop Duration">
              <LoopDurationSection />
            </ExpandableSection>
          </div>

        </CollapsibleContent>
      </Collapsible>

      {/* ── 3. Ideal vs Actual data table (collapsible) ─────────── */}
      <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2 text-xs uppercase tracking-widest font-semibold cursor-pointer">
            {tableOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Ideal vs Actual Data Table
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <ComparisonTable />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
