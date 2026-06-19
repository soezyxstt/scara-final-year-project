'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/hmi/theme-toggle'
import { CommandPaletteTrigger } from '@/components/hmi/command-palette'
import { Cpu, ArrowLeft, PanelRightClose, PanelRightOpen } from 'lucide-react'
import pcbData from './pcb-data.json'

// ─── Viewer tab definitions ───────────────────────────────────────────────────

type ViewerTab = 'pcb' | 'schematic' | 'cad'

const VIEWER_TABS: { id: ViewerTab; label: string }[] = [
  { id: 'pcb',       label: 'PCB Layout' },
  { id: 'schematic', label: 'Schematic'  },
  { id: 'cad',       label: '3D View'    },
]

// ─── Sidebar tab definitions ──────────────────────────────────────────────────

type SidebarTab = 'components' | 'gpio'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PCBPageContent() {
  const [activeViewer, setActiveViewer] = useState<ViewerTab>('pcb')
  const [sidebarTab, setSidebarTab]     = useState<SidebarTab>('components')
  const [sidebarOpen, setSidebarOpen]   = useState(true)

  return (
    <div className="flex flex-col h-screen bg-hmi-bg text-hmi-text animate-fade-in">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-hmi-panel border-b border-hmi-grid px-4 h-12 flex items-center gap-4 shrink-0">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-hmi-muted hover:text-hmi-text transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          HMI
        </Link>
        <span className="w-px h-5 bg-hmi-grid shrink-0" />
        <span className="text-sm font-bold text-hmi-text shrink-0 tracking-wide uppercase flex items-center gap-2">
          <Cpu className="w-4 h-4 text-hmi-ideal" />
          Controller PCB
        </span>

        {/* Viewer tab switcher */}
        <nav className="flex h-12 shrink-0 border-l border-hmi-grid/50 pl-4 ml-2">
          {VIEWER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveViewer(t.id)}
              className={cn(
                'h-12 px-4 flex items-center text-sm font-medium border-b-2 transition-colors cursor-pointer',
                activeViewer === t.id
                  ? 'border-hmi-ideal text-hmi-text'
                  : 'border-transparent text-hmi-muted hover:text-hmi-text'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? 'Hide info panel' : 'Show info panel'}
            className="p-1.5 rounded-md text-hmi-muted hover:text-hmi-text hover:bg-hmi-grid/40 transition-colors cursor-pointer"
          >
            {sidebarOpen
              ? <PanelRightClose className="w-4 h-4" />
              : <PanelRightOpen  className="w-4 h-4" />}
          </button>
          <ThemeToggle />
          <CommandPaletteTrigger />
        </div>
      </header>

      {/* ── Body: viewer + optional info sidebar ── */}
      <div className="flex-1 min-h-0 flex">

        {/* Iframe viewer */}
        <div className="flex-1 min-w-0 bg-[#0d0d0f]">
          <iframe
            key={activeViewer}
            src={`/pcb/viewer.html?tab=${activeViewer}`}
            className="w-full h-full border-0"
            title="Interactive PCB Viewer"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>

        {/* Collapsible info sidebar */}
        {sidebarOpen && (
          <aside className="w-72 shrink-0 border-l border-hmi-grid flex flex-col bg-hmi-panel/30">

            {/* Sidebar tab strip */}
            <div className="flex shrink-0 border-b border-hmi-grid">
              {(['components', 'gpio'] as SidebarTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSidebarTab(tab)}
                  className={cn(
                    'flex-1 py-2.5 text-[10.5px] font-bold uppercase tracking-wider transition-colors cursor-pointer',
                    sidebarTab === tab
                      ? 'text-hmi-text border-b-2 border-hmi-ideal -mb-px'
                      : 'text-hmi-muted hover:text-hmi-text'
                  )}
                >
                  {tab === 'components' ? 'Components' : 'GPIO Map'}
                </button>
              ))}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">

              {sidebarTab === 'components' && (
                <div className="flex flex-col divide-y divide-zinc-800/60">
                  {pcbData.components.map((comp) => (
                    <div key={comp.ref} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-hmi-ideal">{comp.ref}</span>
                        <span className="text-[9px] px-1.5 rounded-full bg-zinc-800 text-zinc-500 font-mono border border-zinc-700/40">
                          {comp.type}
                        </span>
                      </div>
                      <p className="text-[10.5px] font-semibold text-zinc-300 mt-0.5">{comp.label}</p>
                      <p className="text-[10px] text-zinc-400 leading-relaxed mt-0.5">{comp.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {sidebarTab === 'gpio' && (
                <div className="flex flex-col gap-2">
                  {pcbData.gpioMap.map((item) => (
                    <div key={item.pin} className="p-2 rounded bg-zinc-900/50 border border-zinc-800/60 text-[10px] flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-zinc-200">{item.signal}</span>
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide',
                          item.type === 'Output'        && 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
                          item.type === 'Analog Input'  && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                          item.type === 'Digital Input' && 'bg-teal-500/10 text-teal-400 border border-teal-500/20',
                          item.type === 'GPIO'          && 'bg-zinc-700/20 text-zinc-400 border border-zinc-700/30',
                        )}>
                          {item.pin}
                        </span>
                      </div>
                      <p className="text-zinc-500 leading-normal text-[9.5px]">{item.purpose}</p>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
