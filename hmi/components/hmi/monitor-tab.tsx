'use client'

import { XYTrace } from './xy-trace'
import { ChartPanel, MetricsPanel } from './chart-panel'
import { ControlPanel } from './control-panel'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

export function MonitorTab() {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-hmi-bg">
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 p-3">
        {/* Left Column (XYTrace) */}
        <ResizablePanel defaultSize={50} minSize={30} className="flex flex-col min-h-0 pr-1.5">
          <XYTrace />
        </ResizablePanel>

        <ResizableHandle />

        {/* Right Column — chart (70%) + metrics (30%) */}
        <ResizablePanel defaultSize={50} minSize={30} className="flex flex-col min-h-0 pl-1.5">
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={70} minSize={30} className="pb-1.5 flex flex-col min-h-0">
              <ChartPanel />
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={30} minSize={15} className="pt-1.5 flex flex-col min-h-0">
              <MetricsPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <ControlPanel />
    </div>
  )
}
