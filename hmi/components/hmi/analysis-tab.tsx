'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { StepMetrics } from './step-metrics'
import { ComparisonTable } from './comparison-table'
import { FFTSection, ControlEffortSection, CTCTorqueSection, ControlInternalSection, StepperVelocitySection, PIDBreakdownSection, LoopDurationSection } from './advanced-analysis'
import { PhasePortrait } from './phase-portrait'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'

export function AnalysisTab() {
  const [advOpen, setAdvOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6 p-4 overflow-y-auto">

      {/* ── 1. Control Performance Summary ──────────────────────── */}
      <StepMetrics />

      {/* ── 2. Advanced Analysis (collapsible) ──────────────────── */}
      <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2 text-xs uppercase tracking-widest font-semibold">
            {advOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Advanced Analysis
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 flex flex-col gap-6">

          {/* Phase Portrait — HERO: tallest, most cognitively distinct */}
          <div className="h-[320px] rounded-xl border border-hmi-grid overflow-hidden">
            <PhasePortrait />
          </div>

          {/* Two-column row: FFT (wide) + Control Effort (narrower) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

            {/* FFT — medium height, 3 of 5 columns */}
            <div className="lg:col-span-3">
              <FFTSection />
            </div>

            {/* Control Effort — compact, 2 of 5 columns */}
            <div className="lg:col-span-2">
              <ControlEffortSection />
            </div>
          </div>

          {/* Two-column row: CTC Torques (equal) + Internal Control Effort Breakdown (equal) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CTCTorqueSection />
            <ControlInternalSection />
          </div>

          {/* Full-width Stepper Velocity command graph */}
          <div className="grid grid-cols-1 gap-4">
            <StepperVelocitySection />
          </div>

          {/* Two-column row: J1 PID Breakdown (equal) + Microcontroller Loop duration (equal) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PIDBreakdownSection />
            <LoopDurationSection />
          </div>

        </CollapsibleContent>
      </Collapsible>

      {/* ── 3. Ideal vs Actual data table ───────────────────────── */}
      <ComparisonTable />
    </div>
  )
}
