import { useState } from 'react'
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
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

// Wrapper that adds an expand-to-fullscreen button to any chart card.
// Children renders in the card normally; when expanded, renders fullscreen overlay instead.
function ExpandableChartCard({
  title,
  hasData,
  noDataMsg = 'No telemetry. Run a move to capture data.',
  chartHeight = 240,
  children,
}: {
  title: string
  hasData: boolean
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
            <CardTitle className="text-sm font-semibold text-slate-200">{title}</CardTitle>
            {hasData && (
              <Tooltip content="Expand to fullscreen. Press ESC to exit." align="center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0 border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-800"
                  onClick={() => setExpanded(true)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {!hasData ? (
            <p className="text-xs text-hmi-muted italic">{noDataMsg}</p>
          ) : (
            <div style={{ height: chartHeight }}>{children}</div>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen overlay — only renders children here when expanded */}
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

// Expandable wrapper for sections that already render their own Card (advanced-analysis sections)
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
            className="h-6 w-6 p-0 border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-800"
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

      {/* ── Advanced Analysis (collapsible) ──────────────────── */}
      <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2 text-xs uppercase tracking-widest font-semibold border-hmi-grid">
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
          <Button variant="outline" className="w-full justify-start gap-2 text-xs uppercase tracking-widest font-semibold">
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
