'use client'

import { useState, useEffect, useRef } from 'react'
import { Copy, Check, BookOpen, Cpu, Eye, BarChart2, Book, ChevronDown, ChevronRight, TrendingUp, Compass, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Custom Syntax Highlighting for C++/Arduino & Serial Logs ────────────────
// Helper to convert index to letters to prevent matching numbers inside token placeholders
const toAlpha = (num: number): string => {
  return String.fromCharCode(65 + (num % 26)) + (num >= 26 ? toAlpha(Math.floor(num / 26) - 1) : '')
}

function highlightCpp(code: string) {
  // 1. Escape HTML
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const stringMap = new Map<string, string>()
  const commentMap = new Map<string, string>()

  // 2. Extract double quoted strings to placeholders (using alphabet key)
  html = html.replace(/("(?:[^"\\]|\\.)*")/g, (_, m) => {
    const key = `TOKENSTR${toAlpha(stringMap.size)}KEY`
    stringMap.set(key, m)
    return key
  })

  // 3. Extract block comments to placeholders
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, (_, m) => {
    const key = `TOKENCOM${toAlpha(commentMap.size)}KEY`
    commentMap.set(key, m)
    return key
  })

  // 4. Extract line comments to placeholders
  html = html.replace(/(\/\/.*)/g, (_, m) => {
    const key = `TOKENCOM${toAlpha(commentMap.size)}KEY`
    commentMap.set(key, m)
    return key
  })

  // 5. Highlight numbers with placeholder tag
  html = html.replace(/\b(\d+(?:\.\d+)?f?)\b/g, 'TOKENNUM$1KEY')

  // 6. Highlight keywords (control structures & types)
  const keywords = [
    'void', 'float', 'int', 'bool', 'char', 'double', 'const', 'unsigned', 'long',
    'if', 'else', 'for', 'while', 'return', 'switch', 'case', 'break', 'class', 'struct', 'true', 'false'
  ]
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b(${kw})\\b`, 'g')
    html = html.replace(regex, 'TOKENKW$1KEY')
  })

  // 7. Highlight predefined functions / API identifiers
  const builtins = [
    'Serial', 'print', 'println', 'available', 'readStringUntil', 'startsWith',
    'substring', 'indexOf', 'lastIndexOf', 'toFloat', 'toInt', 'trim',
    'cos', 'sin', 'delay', 'millis', 'setup', 'loop', 'String'
  ]
  builtins.forEach(bi => {
    const regex = new RegExp(`\\b(${bi})\\b`, 'g')
    html = html.replace(regex, 'TOKENBI$1KEY')
  })

  // 8. Convert intermediate placeholders to final HTML span tags
  // Replace keywords placeholder
  html = html.replace(/TOKENKW([a-zA-Z]+)KEY/g, '<span class="text-pink-400 font-semibold">$1</span>')

  // Replace builtins placeholder
  html = html.replace(/TOKENBI([a-zA-Z]+)KEY/g, '<span class="text-sky-400 font-medium">$1</span>')

  // Replace numbers placeholder
  html = html.replace(/TOKENNUM([0-9.f]+)KEY/g, '<span class="text-amber-500 font-medium">$1</span>')

  // Restore string placeholders
  stringMap.forEach((val, key) => {
    html = html.replace(key, `<span class="text-emerald-400 font-medium">${val}</span>`)
  })

  // Restore comment placeholders
  commentMap.forEach((val, key) => {
    html = html.replace(key, `<span class="text-zinc-500 italic">${val}</span>`)
  })

  return (
    <pre className="m-0 font-mono text-[11.5px] leading-relaxed text-zinc-300 overflow-x-auto whitespace-pre">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}

// ─── Inline components for docs ──────────────────────────────────────────────

function CodeBlock({ filename, code }: { filename?: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <div className="my-5 rounded-xl overflow-hidden border border-zinc-800 bg-hmi-bg shadow-lg shadow-black/30">
      <div className="flex items-center justify-between px-4 py-2 bg-hmi-panel border-b border-zinc-800/80">
        <span className="text-[11px] font-mono text-zinc-400 font-medium">
          {filename || 'Source Code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800/30 hover:bg-zinc-800/70 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all font-sans text-[10px] font-medium active:scale-95"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400 animate-in fade-in zoom-in-75 duration-200" />
              <span className="text-emerald-400 font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        {highlightCpp(code)}
      </div>
    </div>
  )
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[11px] font-semibold bg-zinc-800/60 border border-zinc-800 rounded px-1.5 py-0.5 text-sky-400 mx-0.5">
      {children}
    </code>
  )
}

function Callout({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warn' | 'tip' | 'danger'
  children: React.ReactNode
}) {
  const styles = {
    info: 'border-sky-500 bg-sky-50/50 text-sky-800 dark:border-sky-500/50 dark:bg-sky-500/5 dark:text-sky-300',
    warn: 'border-amber-500 bg-amber-50/50 text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/5 dark:text-amber-300',
    tip: 'border-emerald-500 bg-emerald-50/50 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/5 dark:text-emerald-300',
    danger: 'border-red-500 bg-red-50/50 text-red-800 dark:border-red-500/50 dark:bg-red-500/5 dark:text-red-300',
  }
  const icons = {
    info: 'ℹ',
    warn: '⚠',
    tip: '💡',
    danger: '🛑',
  }
  const titles = {
    info: 'Information',
    warn: 'Warning',
    tip: 'Pro Tip',
    danger: 'Important / Danger',
  }
  return (
    <div className={cn('my-5 flex gap-3.5 rounded-lg border-l-4 p-4 text-xs leading-relaxed shadow-sm shadow-black/10', styles[type])}>
      <span className="text-sm shrink-0 select-none mt-0.5">{icons[type]}</span>
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-[11px] uppercase tracking-wider text-zinc-200">{titles[type]}</span>
        <div className="text-zinc-300/90">{children}</div>
      </div>
    </div>
  )
}

function PropertyList({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl overflow-hidden bg-hmi-panel/30 shadow-md">
      {children}
    </div>
  )
}

function Property({ name, type, description }: { name: string; type?: string; description: React.ReactNode }) {
  return (
    <div className="p-4 flex flex-col md:flex-row md:items-start gap-2 md:gap-6 hover:bg-zinc-800/10 transition-colors">
      <div className="w-52 shrink-0 flex flex-col gap-1">
        <span className="font-mono text-[11.5px] font-bold text-zinc-100 break-words">{name}</span>
        {type && (
          <span className="text-[9.5px] font-mono font-semibold text-sky-400/85 uppercase tracking-wider">{type}</span>
        )}
      </div>
      <div className="flex-1 text-xs text-zinc-400 leading-relaxed font-sans">{description}</div>
    </div>
  )
}

// ─── Navigation links ────────────────────────────────────────────────────────

interface SidebarLink {
  href: string
  label: string
}

interface SidebarGroup {
  title: string
  icon: React.ReactNode
  links: SidebarLink[]
}

export function ReadmeTabEn() {
  const [activeId, setActiveId] = useState<string>('connect')
  const contentRef = useRef<HTMLDivElement>(null)

  // Sidebar grouping structure
  const navigationGroups = [
    {
      id: 'connect',
      title: 'Getting started',
      icon: <BookOpen className="h-3.5 w-3.5" />,
      links: [
        { href: '#overview', label: 'Quick Start Overview' },
        { href: '#connect', label: '1. Connecting the HMI' },
        { href: '#move', label: '2. Sending a Move' },
        { href: '#modes', label: '3. Operating Modes' },
      ],
    },
    {
      id: 'pages',
      title: 'Pages & navigation',
      icon: <Compass className="h-3.5 w-3.5" />,
      links: [
        { href: '#pages-nav', label: 'App Routes & Navigation' },
        { href: '#zn-page', label: 'ZN Tuner Page (/zn)' },
        { href: '#test-page', label: 'Test Page (/test)' },
        { href: '#pcb-page', label: 'PCB Viewer Page (/pcb)' },
        { href: '#dashboard-page', label: 'Saved Runs Dashboard (/dashboard)' },
        { href: '#experiment-page', label: 'Automation & Results' },
      ],
    },
    {
      id: 'xy-trace',
      title: 'Monitor tab',
      icon: <Eye className="h-3.5 w-3.5" />,
      links: [
        { href: '#xy-trace', label: 'XY Trace Canvas' },
        { href: '#charts', label: 'Telemetry Charts' },
        { href: '#metrics', label: 'Run Metrics Panel' },
        { href: '#control-panel', label: 'Control Panel' },
      ],
    },
    {
      id: 'performance',
      title: 'Analysis tab',
      icon: <BarChart2 className="h-3.5 w-3.5" />,
      links: [
        { href: '#advanced', label: 'Advanced Analysis' },
        { href: '#comparison-table', label: 'Data Table & CSV' },
      ],
    },
    {
      id: 'rest-analysis',
      title: 'Step & Noise tab',
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      links: [
        { href: '#rest-about', label: 'About Step & Noise' },
        { href: '#rest-interface', label: 'Workspace Controls' },
        { href: '#rest-calipers', label: 'Caliper Analyzer' },
      ],
    },
    {
      id: 'tools',
      title: 'Tools & settings',
      icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
      links: [
        { href: '#serial-monitor', label: 'Serial Monitor' },
        { href: '#settings-menu', label: 'Settings Menu (☰)' },
        { href: '#keyboard-shortcuts', label: 'Keyboard Shortcuts' },
      ],
    },
    {
      id: 'terms-control',
      title: 'Key terms',
      icon: <Book className="h-3.5 w-3.5" />,
      links: [
        { href: '#terms-control', label: 'Control & Motion' },
        { href: '#terms-cte', label: 'CTE & ATE Errors' },
        { href: '#terms-pid', label: 'PID Gain Tuning' },
        { href: '#terms-motion', label: 'Kinematics Terms' },
      ],
    },
    {
      id: 'esp-telemetry',
      title: 'ESP32 integration',
      icon: <Cpu className="h-3.5 w-3.5" />,
      links: [
        { href: '#esp-telemetry', label: 'Sending Telemetry' },
        { href: '#esp-commands', label: 'Command Dictionary' },
        { href: '#esp-example', label: 'Arduino Sketch Example' },
      ],
    },
  ]

  // Flattened links for scroll spy
  const allLinks = navigationGroups.flatMap((g) => g.links)

  // Determine active category based on active scroll ID
  const getActiveCategory = (id: string) => {
    if (['overview', 'connect', 'move', 'modes'].includes(id)) return 'connect'
    if (['pages-nav', 'zn-page', 'test-page', 'pcb-page', 'dashboard-page', 'experiment-page'].includes(id)) return 'pages'
    if (['xy-trace', 'charts', 'metrics', 'control-panel'].includes(id)) return 'xy-trace'
    if (['advanced', 'comparison-table'].includes(id)) return 'performance'
    if (['rest-about', 'rest-interface', 'rest-calipers'].includes(id)) return 'rest-analysis'
    if (['serial-monitor', 'settings-menu', 'keyboard-shortcuts'].includes(id)) return 'tools'
    if (['terms-control', 'terms-cte', 'terms-pid', 'terms-motion'].includes(id)) return 'terms-control'
    if (['esp-telemetry', 'esp-commands', 'esp-example'].includes(id)) return 'esp-telemetry'
    return 'connect'
  }
  const activeCategory = getActiveCategory(activeId)

  // Manage open/closed state for grouping accordions
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    connect: true,
    pages: false,
    'xy-trace': false,
    performance: false,
    'rest-analysis': false,
    tools: false,
    'terms-control': false,
    'esp-telemetry': false,
  })

  // Auto-expand active group when active section changes
  useEffect(() => {
    setOpenGroups((prev) => ({
      ...prev,
      [activeCategory]: true,
    }))
  }, [activeCategory])

  // Scroll spy effect using IntersectionObserver
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    const sections = container.querySelectorAll('section[id]')
    const observerOptions = {
      root: container,
      rootMargin: '-80px 0px -60% 0px',
      threshold: [0, 0.1, 0.2, 0.5, 1.0],
    }

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const visible = entries.filter((e) => e.isIntersecting)
      if (visible.length > 0) {
        const topVisible = visible.reduce((prev, curr) => {
          return curr.boundingClientRect.top < prev.boundingClientRect.top ? curr : prev
        })
        setActiveId(topVisible.target.id)
      }
    }

    const observer = new IntersectionObserver(handleIntersection, observerOptions)
    sections.forEach((s) => observer.observe(s))

    return () => observer.disconnect()
  }, [])

  // Smooth scroll handler
  const handleScrollTo = (href: string) => {
    const container = contentRef.current
    if (!container) return

    const targetId = href.slice(1)
    const targetElement = container.querySelector(`section[id="${targetId}"]`)

    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveId(targetId)
    }
  }

  // Toggle category open/close, and scroll to its first child
  const handleToggleGroup = (groupId: string, firstLinkHref: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
    handleScrollTo(firstLinkHref)
  }

  return (
    <div className="flex flex-row h-full overflow-hidden bg-hmi-bg readme-tab-container">
      {/* ── Left Navigation Sidebar ────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-hmi-grid bg-hmi-panel/30 flex flex-col px-4 py-6 overflow-y-auto">
        <div className="px-2 mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Documentation</p>
          <p className="text-xs text-zinc-400 font-medium mt-1">SCARA Robot Guide</p>
        </div>

        <nav className="flex flex-col gap-3">
          {navigationGroups.map((group, groupIdx) => {
            const isOpen = openGroups[group.id]
            const isGroupActive = activeCategory === group.id

            return (
              <div key={groupIdx} className="flex flex-col gap-1">
                {/* Group Header Button */}
                <button
                  onClick={() => handleToggleGroup(group.id, group.links[0].href)}
                  className={cn(
                    'flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-left transition-all hover:bg-zinc-800/40 select-none active:scale-[0.98]',
                    isGroupActive ? 'text-hmi-ideal font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                    {group.icon}
                    <span>{group.title}</span>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-zinc-500 shrink-0" />
                  )}
                </button>

                {/* Sub-links (only shown if group is open) */}
                {isOpen && (
                  <div className="flex flex-col pl-2 border-l border-zinc-800/85 ml-3.5 mt-0.5 gap-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {group.links.map((link, linkIdx) => {
                      const targetId = link.href.slice(1)
                      const isActive = activeId === targetId
                      return (
                        <button
                          key={linkIdx}
                          onClick={() => handleScrollTo(link.href)}
                          className={cn(
                            'text-left text-xs py-1.5 px-2.5 rounded-md transition-all font-sans leading-relaxed active:scale-[0.98]',
                            isActive
                              ? 'bg-hmi-ideal/10 text-hmi-ideal font-semibold border-l-2 border-hmi-ideal pl-2 rounded-l-none'
                              : 'text-zinc-500 hover:text-zinc-300'
                          )}
                        >
                          {link.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      {/* ── Center Main Content Column ────────────────────────────────────── */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto scroll-smooth px-8 lg:px-12 py-10"
      >
        <article className="max-w-3xl mx-auto">
          {/* Document Header */}
          <div className="pb-8 border-b border-hmi-grid mb-8">
            <h1 className="text-3xl font-extrabold text-hmi-text tracking-tight leading-none mb-3">
              SCARA HMI — User Guide
            </h1>
            <p className="text-sm text-hmi-muted leading-relaxed max-w-2xl font-normal">
              Real-time monitoring and control interface for the 2-DOF planar SCARA robot, developed for the Dynamic System Control (MS3201) course at Mechanical Engineering ITB.
            </p>
          </div>

          {/* Project Context & Evolution */}
          <div className="p-5 border border-hmi-grid bg-hmi-panel/50 rounded-xl mb-10 text-xs text-hmi-muted space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-hmi-text block mb-1">Project Objective</span>
                <p className="leading-relaxed">
                  Modify the control algorithm of the 2-DOF SCARA robot by adding **dynamic compensation** (inertia, gravity, Coriolis, and centrifugal forces) and provide real-time HMI tools for parameter tuning (<InlineCode>Kp, Ki, Kd</InlineCode>).
                </p>
              </div>
              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-200 block mb-1">Design Evolution (ITB Mechanical Engineering)</span>
                <ul className="list-disc pl-4 space-y-0.5 mt-0.5 leading-relaxed">
                  <li><strong className="text-zinc-300">Pandeka (2021)</strong>: Initial mechanical design</li>
                  <li><strong className="text-zinc-300">Abdul (2023)</strong>: Drive system modification</li>
                  <li><strong className="text-zinc-300">Al-Farabi (2024)</strong>: Portability (miniaturization)</li>
                  <li><strong className="text-zinc-300">Mubarok (2025)</strong>: Basic control integration</li>
                  <li><strong className="text-zinc-300">Adi Haditya (2026)</strong>: Dynamic compensation &amp; advanced diagnostic HMI</li>
                </ul>
              </div>
            </div>
            
            <div className="pt-3 border-t border-zinc-800/80 text-[10.5px] italic text-zinc-500 font-serif leading-relaxed">
              &ldquo;In the Mechanical Engineering curriculum at ITB, the Dynamic Systems Control course (MS3201) plays a vital role... This research aims to modify the control algorithm by incorporating dynamic compensation and developing a more comprehensive HMI feature to improve the quality of independent practical learning.&rdquo;
            </div>
          </div>

          {/* 💡 SECTION: OVERVIEW */}
          <section id="overview" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Quick Start Overview</span>
              <a href="#overview" onClick={(e) => { e.preventDefault(); handleScrollTo('#overview') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              This HMI is a browser-based dashboard for monitoring and tuning a 2-DOF planar SCARA robot. It talks to the ESP32 directly over USB — no extra drivers or bridge software required.
            </p>
            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">First-time workflow</h3>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-zinc-400 mb-5 leading-relaxed">
              <li>Flash the firmware to the ESP32 (see <InlineCode>docs/firmware/readme.md</InlineCode>).</li>
              <li>Open the live hosted HMI dashboard at <strong className="text-zinc-300">tugasakhir.adihnursyam.com</strong> (or run <InlineCode>npm run dev</InlineCode> locally and open <strong className="text-zinc-300">http://localhost:3000</strong>) in Chrome or Edge.</li>
              <li>Plug in the ESP32, click <InlineCode>Connect</InlineCode>, and select the COM port.</li>
              <li>Confirm the <strong className="text-zinc-300">Mode Badge</strong> shows <InlineCode>SCARA</InlineCode> (the HMI switches modes automatically per page).</li>
              <li>Go to the <strong className="text-zinc-300">Monitor</strong> tab, enter a target coordinate in the Control Panel, and click <InlineCode>Send Move</InlineCode>.</li>
              <li>After the move finishes, check <strong className="text-zinc-300">Run Metrics</strong> below the charts and open the <strong className="text-zinc-300">Analysis</strong> tab for deeper diagnostics.</li>
            </ol>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 my-4">
              {[
                { tab: 'Monitor', desc: 'Live XY trace, charts, metrics, Run+Save, and control panel' },
                { tab: 'Analysis', desc: 'Post-run phase portrait, CTC torques, and data table' },
                { tab: 'Step & Noise', desc: 'Step-response and rest-state telemetry analysis' },
                { tab: 'README', desc: 'This guide — you are here' },
              ].map((item, idx) => (
                <div key={idx} className="p-3 border border-zinc-800 rounded-lg bg-hmi-elevated">
                  <p className="text-[11px] font-bold text-hmi-ideal font-mono">{item.tab}</p>
                  <p className="text-[9.5px] text-zinc-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
            <Callout type="tip">
              Use the <strong>Command Palette (<kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">Ctrl + K</kbd> or <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">Cmd + K</kbd>)</strong> to switch between the Home dashboard, ZN Tuner (<InlineCode>/zn</InlineCode>), and Test Page (<InlineCode>/test</InlineCode>) without disconnecting serial.
            </Callout>
          </section>

          {/* 💡 SECTION: CONNECT */}
          <section id="connect" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>1. Connecting the HMI</span>
              <a href="#connect" onClick={(e) => { e.preventDefault(); handleScrollTo('#connect') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The HMI communicates with your microcontroller (ESP32) directly over USB serial using the modern **Web Serial API** built into compatible web browsers. This provides a plug-and-play experience without installing extra bridge software.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Step-by-step Connection Guide</h3>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-zinc-400 mb-5 leading-relaxed">
              <li>Connect your ESP32 to your workstation via a standard micro-USB or USB-C cable.</li>
              <li>Ensure you are running the HMI in <strong className="text-zinc-300">Google Chrome</strong> or <strong className="text-zinc-300">Microsoft Edge</strong>, as Safari and Firefox do not currently support the Web Serial protocol.</li>
              <li>Click the <InlineCode>Connect</InlineCode> button located on the right side of the main header bar.</li>
              <li>Select your microcontroller's COM port in the browser popup (often labeled <span className="italic">USB-to-UART Bridge</span> or <span className="italic">COMx</span>) and click **Connect**.</li>
              <li>Upon connection, the HMI sends <InlineCode>getgains</InlineCode> and <InlineCode>getparams</InlineCode>, then starts sending <InlineCode>ping</InlineCode> to keep the firmware watchdog alive.</li>
              <li>The <strong className="text-zinc-300">Mode Badge</strong> in the header shows the current firmware mode. The HMI auto-sends <InlineCode>mode,scara</InlineCode> when you are on the home page.</li>
            </ol>

            <Callout type="tip">
              <strong>Auto-Reconnect Mechanism:</strong> If the connection is broken due to a cable slip, the HMI will show an amber <InlineCode>⚠ Reconnecting…</InlineCode> state and automatically poll every 2 seconds to restore the serial stream once the device is re-plugged.
            </Callout>

            <Callout type="warn">
              The communication baud rate is hardcoded to <strong>921600</strong>. Your firmware must call <InlineCode>Serial.begin(921600)</InlineCode> to match this rate.
            </Callout>

            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Status Badges Reference</h3>
            <PropertyList>
              <Property
                name="● COM (10c4:ea60)"
                type="ACTIVE CONNECTION"
                description="The serial interface is connected successfully. Live data is actively streaming to the panels."
              />
              <Property
                name="⚠ Reconnecting…"
                type="RETRYING STATUS"
                description="The USB cable was disconnected. The system is scanning to auto-resume connection without requiring a page refresh."
              />
              <Property
                name="○ Not connected"
                type="INACTIVE"
                description="No serial link is open. Click the Connect button to launch the browser prompt."
              />
              <Property
                name="● Online / ○ Offline"
                type="NETWORK STATE"
                description="Indicates the workstation's internet connectivity. Since Web Serial runs purely locally, HMI tracking works perfectly offline."
              />
            </PropertyList>
          </section>

          {/* 💡 SECTION: MOVE */}
          <section id="move" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>2. Sending Your First Move</span>
              <a href="#move" onClick={(e) => { e.preventDefault(); handleScrollTo('#move') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              With a serial connection active, you can command the SCARA robot to move its end-effector (EEF) to target X and Y coordinate points.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Execution Protocol</h3>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-zinc-400 mb-5 leading-relaxed">
              <li>Navigate to the **Control Panel** pinned to the bottom of the Monitor tab.</li>
              <li>Under the **Move target** card, enter the final coordinate targets <InlineCode>Xf</InlineCode> and <InlineCode>Yf</InlineCode> in millimetres.</li>
              <li>Specify the Elbow direction. <InlineCode>Right (+1)</InlineCode> represents the standard elbow-up kinematics configuration; <InlineCode>Left (-1)</InlineCode> sets elbow-down.</li>
              <li>Click <InlineCode>Send Move</InlineCode> or press <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">Enter</kbd> to transmit the command.</li>
              <li>Alternatively, use the <strong>Run + Save</strong> button in the header to capture the current target coordinates, trigger the move, and save the full telemetry to the Turso database (requires Google sign-in).</li>
              <li>The canvas will update, tracing the planned path in blue and recording actual position data as it arrives.</li>
            </ol>

            <Callout type="info">
              <strong>Geometric Workspace Envelope:</strong> The robot is constrained by physical linkages to an annular sector: radial distance <strong className="text-zinc-200">70.7 mm to 170 mm</strong> and angular limits <strong className="text-zinc-200">-30° to 210°</strong>. Coordinates outside this region will fail inverse kinematics calculations on the ESP32.
            </Callout>

            <Callout type="danger">
              <strong>Trajectory Safety Validation:</strong> The HMI includes a safety layer checking all straight-line moves. If a path crosses the inner singularity circle (R &lt; 70.7 mm), exceeds the outer reach (R &gt; 170 mm), or goes below the horizontal plane (Y &lt; 0), the HMI disables the move command, displays validation warning details in the Control Panel, and overlays a red warning path on the canvas.
            </Callout>
          </section>

          {/* 💡 SECTION: MODES */}
          <section id="modes" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>3. Operating Modes</span>
              <a href="#modes" onClick={(e) => { e.preventDefault(); handleScrollTo('#modes') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The ESP32 firmware has four operating modes. The HMI switches modes automatically when you navigate between pages, but you can also send mode commands manually from the serial monitor.
            </p>
            <PropertyList>
              <Property name="IDLE" type="SAFE DEFAULT" description="All motors off. The firmware returns here after 8 seconds of serial silence unless ping is sent." />
              <Property name="SCARA" type="HOME PAGE" description="Full Cartesian operation. Send move,X,Y from the Control Panel. Used on the home page (/)." />
              <Property name="ZN" type="ZN PAGE" description="Joint-level tuning. Send t1,deg or t2,deg step commands. Used on /zn." />
              <Property name="TEST" type="TEST PAGE" description="Like SCARA but all 33 runtime parameters are adjustable live. Used on /test." />
            </PropertyList>
            <Callout type="warn">
              If the robot stops responding, check whether the mode badge shows <InlineCode>IDLE</InlineCode>. Click <InlineCode>Connect</InlineCode> or navigate to the correct page to restore the expected mode.
            </Callout>
          </section>

          {/* 💡 SECTION: PAGES NAV */}
          <section id="pages-nav" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>App Routes &amp; Navigation</span>
              <a href="#pages-nav" onClick={(e) => { e.preventDefault(); handleScrollTo('#pages-nav') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The HMI features multiple routes sharing a single Web Serial connection and state context. Switch between pages by searching the Command Palette (<InlineCode>Ctrl + K</InlineCode> or <InlineCode>Cmd + K</InlineCode>).
            </p>
            <PropertyList>
              <Property name="/  (Home)" type="SCARA MODE" description="Monitor, Analysis, Step & Noise, and README tabs. Primary dashboard for Cartesian moves and post-run diagnostics." />
              <Property name="/zn" type="ZN MODE" description="Dedicated Ziegler-Nichols tuning page with per-joint step commands and caliper analyzer." />
              <Property name="/test" type="TEST MODE" description="Engineering test bench with Monitor, Analysis (+ raw signals), Step & Noise, and Params Tuner tabs." />
              <Property name="/pcb" type="PUBLIC ROUTE" description="Interactive PCB details viewer with layout SVG placement lookup, schematic viewer, and 3D structural CAD assembly viewer." />
              <Property name="/login" type="PUBLIC ROUTE" description="Authentication portal using NextAuth.js to sign in via Google. Unlocks database saving and dashboard histories." />
              <Property name="/dashboard" type="PROTECTED ROUTE" description="Saved runs history comparison dashboard. Select multiple runs to compare trajectories, velocities, feedforward values, and performance metrics." />
            </PropertyList>
          </section>

          <section id="zn-page" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>ZN Tuner Page (/zn)</span>
              <a href="#zn-page" onClick={(e) => { e.preventDefault(); handleScrollTo('#zn-page') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Navigate to <InlineCode>/zn</InlineCode> for classical Ziegler-Nichols joint tuning. The page sends <InlineCode>mode,zn</InlineCode> automatically and provides gain increment controls, <InlineCode>t1</InlineCode>/<InlineCode>t2</InlineCode> step commands, and a live target-vs-actual chart in degrees.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Use the caliper drag tool on the chart to measure ultimate period (<InlineCode>Tu</InlineCode>) and generate recommended P, PI, and PID gains from the ZN rules table.
            </p>
          </section>

          <section id="test-page" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Test Page (/test)</span>
              <a href="#test-page" onClick={(e) => { e.preventDefault(); handleScrollTo('#test-page') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The Test page adds engineering tools on top of the home feature set:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li><strong>Params Tuner</strong> — adjust all 33 runtime parameters (velocity limits, filter bandwidths, deadbands, trajectory flags, VFF gains) live with sync status LEDs.</li>
              <li><strong>Raw Signal Section</strong> — overlay unfiltered ADC readings on top of filtered position data to diagnose sensor noise.</li>
              <li>Same Monitor, Analysis, and Step & Noise tabs as the home page.</li>
            </ul>
          </section>

          <section id="pcb-page" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>PCB Viewer Page (/pcb)</span>
              <a href="#pcb-page" onClick={(e) => { e.preventDefault(); handleScrollTo('#pcb-page') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Navigate to <InlineCode>/pcb</InlineCode> for interactive hardware diagnostics and board schematics reference:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li><strong>Interactive Layout SVG</strong> — click components on the PCB graphic to view details about their role, reference designators, and hardware functions.</li>
              <li><strong>Schematic Viewer</strong> — view high-resolution circuit diagrams directly in-app.</li>
              <li><strong>3D CAD Viewer</strong> — explore the 3D structural CAD assembly of the controller board.</li>
              <li><strong>GPIO Assignments</strong> — look up ESP32 microcontroller pin mappings to stepper configurations, limit switches, and DC motor PWM outputs.</li>
            </ul>
          </section>

          <section id="dashboard-page" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Saved Runs Dashboard (/dashboard)</span>
              <a href="#dashboard-page" onClick={(e) => { e.preventDefault(); handleScrollTo('#dashboard-page') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              After signing in via Google, users can view their runs history. When you send a move using the <strong>Run + Save</strong> mode on the Home page, the full trajectory, feedback sample logs, gains, and parameter states are stored in the Turso database.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              In the history dashboard, you can:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li><strong>Select Runs</strong> — choose up to 4 runs on the sidebar to compare.</li>
              <li><strong>Compare Trajectories</strong> — overlay multiple actual trajectories on the XY canvas with distinct colors.</li>
              <li><strong>Analyze Control Response</strong> — compare joint speeds, feedback effort, tracking errors, and feedforward forces using specialized tabs (Trajectory, Velocity, PID, Feedforward, Metrics, Advanced).</li>
              <li><strong>Delete Runs</strong> — click the delete button in the sidebar list to clear runs from the cloud database.</li>
            </ul>
          </section>
          {/* 💡 SECTION: XY TRACE */}
          <section id="xy-trace" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>3D Workspace Visualizer</span>
              <a href="#xy-trace" onClick={(e) => { e.preventDefault(); handleScrollTo('#xy-trace') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Positioned on the left of the Monitor tab, the **3D Workspace Visualizer** renders a real-time WebGL visualization (powered by React Three Fiber and Three.js) of the SCARA arm's workspace envelope, joint configuration, and trajectories.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Visual Indicator Elements</h3>
            <PropertyList>
              <Property
                name="Ideal Trajectory"
                type="DASHED BLUE LINE"
                description="The reference path generated by the trajectory generator on the ESP32 representing mathematical movement targets (#2563EB)."
              />
              <Property
                name="Actual Feedback Path"
                type="SOLID RED LINE"
                description="The real-time position of the end-effector calculated via forward kinematics from actual encoder and potentiometer angles (#DC2626)."
              />
              <Property
                name="3D CAD Link Overlay"
                type="SOLID BLUE & ORANGE LINKS"
                description="3D solid-shaded models of physical linkages: J1 base is solid blue (#3B82F6) mounted at Z=35 mm height; J2 outer is solid orange (#F97316) mounted at Z=5 mm height."
              />
              <Property
                name="Reachable Workspace"
                type="ELECTRIC BLUE / CYAN SECTOR"
                description="Annular operating sector matching inner dead-zone singularity (70.7 mm) and outer reach (170 mm). Renders in vibrant electric blue (#00e5ff) in dark mode, and cyan in light mode."
              />
              <Property
                name="Ghost Trail"
                type="FADED OVERLAY"
                description="The pathway of the previous motion run, allowing immediate visual side-by-side comparison of successive tuning adjustments."
              />
            </PropertyList>

            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Workspace Controls & State Badges</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
              <div className="p-4 rounded-xl border border-zinc-800 bg-[#141418]/20">
                <p className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-2">Workspace Controls</p>
                <ul className="space-y-1.5 text-xs text-zinc-400 leading-relaxed list-disc pl-4">
                  <li><strong>OrbitControls:</strong> Left-click and drag to rotate, right-click and drag to pan, and scroll to zoom.</li>
                  <li><strong>Reset:</strong> Snaps camera back to a perfect top-down view centered on the workspace, using a tiny Z-axis offset (-0.074999) to avoid gimbal lock/polar singularity.</li>
                  <li><strong>Ghost:</strong> Toggle the previous trajectory overlay visibility.</li>
                  <li><strong>Arms:</strong> Hide/show the 3D physical arm CAD models.</li>
                  <li><strong>Focus (⊕):</strong> Opens full-screen view. Press <kbd className="text-[10px] px-1 bg-zinc-800 rounded border border-zinc-700">ESC</kbd> to return.</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800 bg-[#141418]/20">
                <p className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-2">State Indicators</p>
                <ul className="space-y-1.5 text-xs text-zinc-400 leading-relaxed list-disc pl-4">
                  <li><strong>⏺ REC:</strong> Active motion is running; incoming buffer is writing.</li>
                  <li><strong>⏹ IDLE:</strong> Trajectory has ended. Statistics are locked and analyzed.</li>
                  <li><strong>⏸ WAITING:</strong> Linked, waiting for the first motion trigger.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 💡 SECTION: TELEMETRY CHARTS */}
          <section id="charts" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Telemetry Charts</span>
              <a href="#charts" onClick={(e) => { e.preventDefault(); handleScrollTo('#charts') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The chart panel provides seven interactive sub-tabs tracking control system variables over time. Click <strong className="text-zinc-300">Focus (⊕)</strong> on any chart to open the Advanced Analyzer with calipers, zoom, and pan tools. Graphs freeze when a run ends.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Available Visualizations</h3>
            <PropertyList>
              <Property name="CTE (mm)" type="CROSS-TRACK ERROR" description="Lateral deviation from the ideal path — perpendicular distance from actual position to the planned trajectory segment." />
              <Property name="ATE (mm)" type="ALONG-TRACK ERROR" description="Lead/lag error along the path direction. Positive means the robot is ahead; negative means it is behind." />
              <Property name="Position" type="JOINT ANGLES" description="θ1 and θ2 versus desired references. Unit follows the global radians/degrees setting." />
              <Property name="Velocity" type="JOINT SPEEDS" description="Joint angular velocities versus desired references." />
              <Property name="PID" type="J1 BREAKDOWN" description="Joint 1 proportional, integral, and derivative term contributions over time." />
              <Property name="J1 Ctrl" type="COMBINED SIGNAL" description="Total Joint 1 control signal including feedforward and feedback components." />
              <Property name="J2 Vel" type="STEPPER COMMAND" description="Stepper motor commanded angular velocity." />
            </PropertyList>
          </section>

          {/* 💡 SECTION: METRICS PANEL */}
          <section id="metrics" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Run Metrics Panel</span>
              <a href="#metrics" onClick={(e) => { e.preventDefault(); handleScrollTo('#metrics') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Below the charts on the Monitor tab, the <strong className="text-zinc-300">Run Metrics</strong> grid summarizes the last completed trajectory. Hover any cell for a tooltip explanation.
            </p>
            <PropertyList>
              <Property name="AI" description="Accuracy Index — 1 minus mean CTE divided by path length. 100% means perfect tracking." />
              <Property name="εmax / MCTE" description="Peak and mean cross-tracking error in millimetres." />
              <Property name="RMS ATE" description="Root-mean-square along-track error without sign cancellation." />
              <Property name="Rε" description="Error bias ratio — whether error is dominated by delay (>50%) or shape distortion." />
              <Property name="RMSE J1/J2/EEF" description="Per-joint and end-effector position RMSE." />
              <Property name="Ctrl Var / Jitter" description="PWM variance and mean step-to-step change — indicators of control chatter." />
              <Property name="Settle" description="Time until the end-effector stays within 2 mm of the target." />
            </PropertyList>
          </section>

          {/* 💡 SECTION: CONTROL PANEL */}
          <section id="control-panel" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Control Panel Pinned Bar</span>
              <a href="#control-panel" onClick={(e) => { e.preventDefault(); handleScrollTo('#control-panel') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Pinned to the bottom of the Monitor page, the control panel organizes physical interaction controls. Enter key-press triggers immediate dispatch.
            </p>

            <PropertyList>
              <Property
                name="Move target inputs"
                type="COORDINATES"
                description="Fields to set Xf, Yf, and Elbow direction (-1 or +1). Invokes a 'move,X,Y' serial string."
              />
              <Property
                name="J1 — DC PID (Blue)"
                type="PARAMETER GAINS"
                description="Controls Joint 1 proportional (Kp1), integral (Ki1), and derivative (Kd1) terms. The fields feature a solid blue left-border indicator. Clicking Apply sends gains immediately."
              />
              <Property
                name="J2 — Stepper PID (Orange)"
                type="PARAMETER GAINS"
                description="Controls Joint 2 stepper gains. Wrapped with an orange left-border indicator to prevent mixups."
              />
              <Property
                name="Microstep divisor"
                type="DRIVER CONFIG"
                description="Configures step subdivisions (Full, Half, 1/4, 1/8, 1/16) for the stepper driver. Divisor selection sends 'mstep,N' over serial."
              />
              <Property
                name="Feedforward blends"
                type="CTC CONFIG"
                description="Inertia (ffi), Coriolis (ffc), and gravity (ffg) feedforward blend factors from 0.0 (pure PID) to 1.0 (full model assist)."
              />
            </PropertyList>
            <Callout type="danger">
              The header <strong>🛑 Stop</strong> button sends <InlineCode>estop</InlineCode> instantly. After an E-STOP, the button changes to <strong>🔄 RESUME</strong> which sends <InlineCode>resume</InlineCode> to re-enable motor outputs without moving.
            </Callout>
          </section>

          {/* 💡 SECTION: ADVANCED ANALYSIS */}
          <section id="advanced" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Advanced Analysis Plots</span>
              <a href="#advanced" onClick={(e) => { e.preventDefault(); handleScrollTo('#advanced') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Expand the **Advanced Analysis** sub-panel on the Analysis tab to view system analysis tools:
            </p>

            <PropertyList>
              <Property name="Phase Portrait" type="STATE-SPACE" description="Joint position vs velocity for both joints. Stable systems spiral inward; loops indicate limit-cycle oscillations." />
              <Property name="EEF Error & Velocity" type="CARTESIAN" description="End-effector Cartesian error and velocity profiles from the frozen trajectory run." />
              <Property name="PWM & Control Effort" type="ACTUATOR WORK" description="Motor drive signal and integrated control effort (∫|PWM|dt)." />
              <Property name="CTC Feedforward Torques" type="MODEL-BASED" description="Inertia, Coriolis, and gravity feedforward components per joint from the computed torque model." />
              <Property name="Control Internal" type="INTEGRATOR" description="J1 integrator buffer tracking — shows integral windup recovery." />
              <Property name="Stepper Velocity" type="COMMAND SPEED" description="Command speeds of the stepper drive (J2)." />
              <Property name="PID Breakdown" type="P, I, D TERMS" description="Joint 1 proportional, integral, and derivative term splits over the run." />
              <Property name="Loop Duration" type="TIMING" description="Microcontroller control loop execution time in microseconds (~80 µs)." />
            </PropertyList>
          </section>

          <section id="comparison-table" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Data Table &amp; CSV Export</span>
              <a href="#comparison-table" onClick={(e) => { e.preventDefault(); handleScrollTo('#comparison-table') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Expand the <strong className="text-zinc-300">Ideal vs Actual Data Table</strong> section at the bottom of the Analysis tab for a paginated sample-by-sample view. Export the full dataset as CSV from the table or via the ☰ settings menu ZIP packager.
            </p>
          </section>

          {/* 💡 SECTION: REST ANALYSIS */}
          <section id="rest-about" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Step & Noise Tab</span>
              <a href="#rest-about" onClick={(e) => { e.preventDefault(); handleScrollTo('#rest-about') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The <strong className="text-zinc-300">Step & Noise</strong> tab on the home page provides a continuous high-rate telemetry workspace for step-response and rest-state study. Unlike the Monitor tab (which records per-move buffers), this tab accumulates data continuously and supports caliper-based analysis.
            </p>
            <Callout type="info">
              For dedicated Ziegler-Nichols joint tuning with gain increment controls, use the separate <strong>ZN Tuner page</strong> at <InlineCode>/zn</InlineCode> (see Pages &amp; Navigation above).
            </Callout>
          </section>

          <section id="rest-interface" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Step & Noise Workspace</span>
              <a href="#rest-interface" onClick={(e) => { e.preventDefault(); handleScrollTo('#rest-interface') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The workspace has a control sidebar and a continuous chart stream. Data persists across page refreshes in local storage.
            </p>
            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Workspace Controls</h3>
            <PropertyList>
              <Property name="Joint Selector" description="Toggle between Joint 1 (DC motor) and Joint 2 (stepper) for analysis." />
              <Property name="View Modes" description="Position, Raw ADC, Compare (filtered vs raw), Velocity, and FFT spectrum views." />
              <Property name="Step Target" description="Send t1,deg or t2,deg commands to trigger step responses on the active joint." />
              <Property name="Freeze / Scroll" description="Pause the live chart to inspect a segment, or lock the viewport while data continues buffering." />
              <Property name="CSV Export" description="Export the full buffer, a caliper selection, last 10/20 seconds, or a run bookmark window." />
            </PropertyList>
          </section>

          <section id="rest-calipers" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Caliper Analyzer</span>
              <a href="#rest-calipers" onClick={(e) => { e.preventDefault(); handleScrollTo('#rest-calipers') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              To analyze transient characteristics or oscillation periods, click and drag on the live timeline graph to define an analysis window. This locks the timeline and populates three analyzer tabs:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 mb-6 leading-relaxed">
              <li><strong>ZN Method:</strong> Scans the selected segment for oscillation peaks to compute <InlineCode>Tu</InlineCode>, <InlineCode>fu</InlineCode>, peak-to-peak amplitude, and RMS tracking error. It generates a recommended gains table for P, PI, PID, Some Overshoot, and No Overshoot rules.</li>
              <li><strong>Step Response:</strong> Automatically detects command transitions to calculate Rise Time (10-90% and 0-100%), Settling Time (within 2% and 5% bands), Overshoot percentage, Damping Ratio ($\zeta$), and natural frequency ($f_n$).</li>
              <li><strong>Rest Statistics:</strong> Displays tracking mean, standard deviation, peak-to-peak deviation, and signal-to-noise ratio (SNR) indicators to assess rest jitter.</li>
            </ul>
            
            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Ziegler-Nichols Parameter Rules</h3>
            <div className="overflow-x-auto my-3 border border-zinc-850 rounded-xl">
              <table className="min-w-full divide-y divide-zinc-850 bg-hmi-elevated/50 text-[11px] font-sans text-zinc-400">
                <thead className="bg-hmi-panel text-zinc-300">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Tuning Rule</th>
                    <th className="px-4 py-2 text-left font-semibold">Kp (Proportional)</th>
                    <th className="px-4 py-2 text-left font-semibold">Ki (Integral)</th>
                    <th className="px-4 py-2 text-left font-semibold">Kd (Derivative)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60">
                  <tr>
                    <td className="px-4 py-2 font-medium text-zinc-200">P Control</td>
                    <td className="px-4 py-2 font-mono">0.50 × Ku</td>
                    <td className="px-4 py-2 font-mono">—</td>
                    <td className="px-4 py-2 font-mono">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-zinc-200">PI Control</td>
                    <td className="px-4 py-2 font-mono">0.45 × Ku</td>
                    <td className="px-4 py-2 font-mono">0.54 × Ku / Tu</td>
                    <td className="px-4 py-2 font-mono">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-zinc-200">Classic PID</td>
                    <td className="px-4 py-2 font-mono">0.60 × Ku</td>
                    <td className="px-4 py-2 font-mono">1.20 × Ku / Tu</td>
                    <td className="px-4 py-2 font-mono">0.075 × Ku × Tu</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-zinc-200">Some Overshoot</td>
                    <td className="px-4 py-2 font-mono">0.33 × Ku</td>
                    <td className="px-4 py-2 font-mono">0.66 × Ku / Tu</td>
                    <td className="px-4 py-2 font-mono">0.110 × Ku × Tu</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-zinc-200">No Overshoot</td>
                    <td className="px-4 py-2 font-mono">0.20 × Ku</td>
                    <td className="px-4 py-2 font-mono">0.40 × Ku / Tu</td>
                    <td className="px-4 py-2 font-mono">0.066 × Ku × Tu</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 💡 SECTION: SERIAL MONITOR */}
          <section id="serial-monitor" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Serial Monitor</span>
              <a href="#serial-monitor" onClick={(e) => { e.preventDefault(); handleScrollTo('#serial-monitor') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Click the <strong className="text-zinc-300">Serial Monitor</strong> button in the header to open a VS Code–style bottom-sheet log panel. High-frequency <InlineCode>T</InlineCode> and <InlineCode>D</InlineCode> packets are filtered out; status lines appear with color-coded badges (<InlineCode>MOVE</InlineCode>, <InlineCode>DONE</InlineCode>, <InlineCode>GAINS</InlineCode>). Press <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">ESC</kbd> or click the button again to close. Drag the top edge to resize.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li><strong>Clear Log</strong> — removes local console entries.</li>
              <li><strong>Clear Graph</strong> — erases chart buffers and sends <InlineCode>clrgraph</InlineCode> to the firmware (keyboard shortcut: <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">c</kbd>).</li>
            </ul>
            <Callout type="info">
              Firmware messages prefixed with <InlineCode>INFO:</InlineCode>, <InlineCode>WARN:</InlineCode>, or <InlineCode>ERR:</InlineCode> also appear as toast notifications in the bottom-right corner.
            </Callout>
          </section>

          <section id="settings-menu" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Settings Menu (☰)</span>
              <a href="#settings-menu" onClick={(e) => { e.preventDefault(); handleScrollTo('#settings-menu') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The ☰ button in the header opens the settings sidebar with four sections:
            </p>
            <PropertyList>
              <Property name="Dashboard Preferences" description="Toggle angular units (radians/degrees) and adjust ghost trail opacity on the 3D visualizer." />
              <Property name="Help &amp; Onboarding" description="Re-launch the interactive step-by-step onboarding tour guide at any time." />
              <Property name="Graph Exports" description="Download individual charts as PNG/JPEG at 1×, 2×, or 3× DPI, or package all graphs + CSV + params report into a ZIP." />
              <Property name="Keyboard Shortcuts" description="View and rebind hotkeys for tab switching, E-STOP, ghost toggle, serial connect, and more." />
            </PropertyList>
          </section>

          <section id="keyboard-shortcuts" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Keyboard Shortcuts</span>
              <a href="#keyboard-shortcuts" onClick={(e) => { e.preventDefault(); handleScrollTo('#keyboard-shortcuts') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Shortcuts are disabled while typing in input fields. Rebind any key in the ☰ settings menu.
            </p>
            <div className="overflow-x-auto my-3 border border-zinc-850 rounded-xl">
              <table className="min-w-full divide-y divide-zinc-850 bg-hmi-elevated/50 text-[11px] font-sans text-zinc-400">
                <thead className="bg-hmi-panel text-zinc-300">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Key</th>
                    <th className="px-4 py-2 text-left font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60">
                  {[
                    ['1', 'Switch to Monitor tab'],
                    ['2', 'Switch to Analysis tab'],
                    ['3', 'Switch to README tab'],
                    ['Backspace', 'Emergency Stop'],
                    ['p', 'Toggle pick-point mode on 3D visualizer'],
                    ['x / y', 'Focus Xf / Yf input fields'],
                    ['g', 'Toggle ghost trail'],
                    ['a', 'Toggle arm link overlay'],
                    ['c', 'Clear graph & buffers'],
                    ['m', 'Toggle settings menu'],
                    ['s', 'Connect / Disconnect serial'],
                    ['r', 'Reconnect last port'],
                    ['d', 'Download graph(s)'],
                  ].map(([key, action]) => (
                    <tr key={key}>
                      <td className="px-4 py-2 font-mono text-hmi-ideal">{key}</td>
                      <td className="px-4 py-2">{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 💡 SECTION: TERMS CONTROL */}
          <section id="terms-control" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Key Terms: Control & Motion</span>
              <a href="#terms-control" onClick={(e) => { e.preventDefault(); handleScrollTo('#terms-control') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Standard definitions of control system terms used throughout the HMI:
            </p>

            <PropertyList>
              <Property
                name="Computed Torque Control (CTC)"
                description="A model-based feedforward control scheme compensating for SCARA dynamics: M(q)·ddq + C(q,dq)·dq + G(q) = torque, blending inertia, Coriolis, and gravity calculations."
              />
              <Property
                name="Tracking Differentiator (TD)"
                description="A second-order nonlinear filter estimating clean angular positions (v1) and angular velocities (v2) from raw noisy ADC potentiometer signals."
              />
              <Property
                name="End-Effector (EEF)"
                description="The tool tip point of the SCARA arm. The HMI tracks movement in the Cartesian coordinates (X, Y) of this point."
              />
              <Property
                name="Trajectory Profile"
                description="The planned path calculated by the firmware to move from the starting point to the destination coordinate, specifying planned position and speed at each point in time."
              />
              <Property
                name="Error / Deviation"
                description="The Euclidean distance error (in millimetres) between where the end-effector is supposed to be and where it actually is: √((xi - xa)² + (yi - ya)²)."
              />
              <Property
                name="Rise Time"
                description="The time or number of samples the robot takes to first reach the target value (typically measured from 10% to 90% of the movement range)."
              />
              <Property
                name="Overshoot"
                description="The amount by which the robot overshoot its target position, expressed as a percentage of the total movement range."
              />
              <Property
                name="Settling Time"
                description="The time needed for the robot to settle down and stay within a small error window (±2% or ±5%) around the target."
              />
              <Property
                name="Steady-State Error"
                description="The persistent error remaining after the robot has stopped moving and settled."
              />
            </PropertyList>
          </section>

          <section id="terms-cte" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Key Terms: CTE &amp; ATE Errors</span>
              <a href="#terms-cte" onClick={(e) => { e.preventDefault(); handleScrollTo('#terms-cte') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <PropertyList>
              <Property name="CTE (Cross Tracking Error)" description="Perpendicular distance from the actual end-effector position to the nearest point on the ideal path segment. Measures how far off-path the robot is." />
              <Property name="ATE (Along Tracking Error)" description="Signed error along the path direction. Positive = ahead of schedule; negative = lagging behind." />
              <Property name="MCTE" description="Mean CTE integrated over path length — the primary tracking accuracy metric in Run Metrics." />
              <Property name="Accuracy Index (AI)" description="1 − MCTE/D where D is total path length. 100% = perfect tracking." />
              <Property name="Error Bias (Rε)" description="Ratio indicating whether tracking error is dominated by delay (>50%) or shape distortion (<50%)." />
            </PropertyList>
          </section>

          {/* 💡 SECTION: TERMS PID */}
          <section id="terms-pid" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Key Terms: PID Tuning Gains</span>
              <a href="#terms-pid" onClick={(e) => { e.preventDefault(); handleScrollTo('#terms-pid') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              A breakdown of Proportional-Integral-Derivative parameters:
            </p>

            <PropertyList>
              <Property
                name="Kp — Proportional Gain"
                description="Determines how hard the motor drives proportional to the current position error. Higher values speed up the response but cause overshoot and oscillations if set too high."
              />
              <Property
                name="Ki — Integral Gain"
                description="Corrects for small, persistent errors that accumulate over time. Higher values eliminate steady-state error but can cause slow oscillations or overshoot."
              />
              <Property
                name="Kd — Derivative Gain"
                description="Damps the movement by responding to the rate of change of the position error. Helps reduce overshoot and damp oscillations, but can amplify sensor noise if set too high."
              />
              <Property
                name="Microstepping (Joint 2)"
                description="Subdivides a full motor step into smaller increments (up to 1/16). Smooths out the stepper motor's motion and reduces mechanical noise, but slightly reduces torque."
              />
            </PropertyList>

            <Callout type="tip">
              Tuning workflow: Start with <strong>Kp only</strong> until the system responds quickly. Next, add <strong>Kd</strong> to reduce overshoot and oscillations. Finally, add a small <strong>Ki</strong> to eliminate any remaining steady-state error.
            </Callout>
          </section>

          {/* 💡 SECTION: TERMS MOTION */}
          <section id="terms-motion" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Key Terms: Kinematics & Configuration</span>
              <a href="#terms-motion" onClick={(e) => { e.preventDefault(); handleScrollTo('#terms-motion') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Kinematics parameters used to convert Cartesian space to joint space:
            </p>

            <PropertyList>
              <Property
                name="θ1 (Joint 1 angle)"
                description="The rotation angle of the inner arm link, driven by the DC motor and measured by the potentiometer."
              />
              <Property
                name="θ2 (Joint 2 angle)"
                description="The angle of the outer arm link relative to the inner link, driven by the stepper motor."
              />
              <Property
                name="Inverse Kinematics (IK)"
                description="The mathematical formulas used to convert desired X, Y Cartesian coordinates into the matching joint angles θ1 and θ2."
              />
              <Property
                name="Forward Kinematics (FK)"
                description="The equations used to calculate the physical X, Y coordinates of the end-effector from the measured joint angles."
              />
              <Property
                name="Elbow Right (+1) / Left (-1)"
                description="Specifies which of the two mathematical solutions to use for a target coordinate (representing an elbow-up or elbow-down arm configuration)."
              />
            </PropertyList>
          </section>

          {/* 💡 SECTION: ESP TELEMETRY */}
          <section id="esp-telemetry" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>ESP32 → HMI: Sending Telemetry</span>
              <a href="#esp-telemetry" onClick={(e) => { e.preventDefault(); handleScrollTo('#esp-telemetry') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The HMI processes comma-separated values (CSV) received over serial. Every message packet must start with a single-character **identification tag**, followed by data fields, and end with a newline character (<InlineCode>\n</InlineCode>).
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Required Serial Packets</h3>

            <div className="space-y-6 mt-4">
              <div>
                <p className="text-xs font-bold text-zinc-200 mb-1">M / MC — Move start / continuation (sent at trajectory start)</p>
                <p className="text-xs text-zinc-400 mb-2"><InlineCode>M</InlineCode> informs the HMI to reset buffers and prepare to record telemetry. <InlineCode>MC</InlineCode> is used for the second leg of an L-shaped split path and does <em>not</em> reset HMI buffers.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// is_continuation = true for L-shape second leg -> MC, else M
Serial.print(is_continuation ? "MC," : "M,");
Serial.print(x0, 3);  // start X mm (float)
Serial.print(",");
Serial.print(y0, 3);  // start Y mm (float)
Serial.print(",");
Serial.print(xf, 3);  // target X mm (float)
Serial.print(",");
Serial.println(yf, 3); // target Y mm (float)`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>M,0.000,120.000,100.000,80.000</InlineCode> / <InlineCode>MC,100.000,80.000,150.000,50.000</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">S — Move done (sent once when the robot stops)</p>
                <p className="text-xs text-zinc-400 mb-2">Signals the HMI that the move has finished. The HMI then freezes the charts and runs post-run metrics.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.println("S");`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">T — Trajectory sample (sent every control tick, ~10–50 ms)</p>
                <p className="text-xs text-zinc-400 mb-2">Sends the target and actual end-effector coordinates to plot on the 3D Workspace Visualizer.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// xi, yi = ideal target position (mm)
// xa, ya = actual position (mm)
Serial.print("T,");
Serial.print(xi, 2);
Serial.print(",");
Serial.print(yi, 2);
Serial.print(",");
Serial.print(xa, 2);
Serial.print(",");
Serial.println(ya, 2);`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>T,100.00,80.00,99.85,80.12</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">D — Dynamics sample (500 Hz from firmware, downsampled to 50 Hz in HMI)</p>
                <p className="text-xs text-zinc-400 mb-2">Joint-level sensor data with velocity feedforward and raw ADC readings. Joint errors are computed by the HMI.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// t        = timestamp (ms)
// th1/th2  = actual joint angles (rad)
// th1d/th2d = desired joint angles (rad)
// v1/v2    = actual velocities (rad/s)
// v1d/v2d  = desired velocities (rad/s)
// pwm1     = J1 control output (-255 to 255)
// vff1     = velocity feedforward contribution (V)
// th1raw/th2raw = unfiltered ADC angles (rad)
// u1_total = total J1 control voltage (V)
Serial.print("D,");
Serial.print(t);         Serial.print(",");
Serial.print(th1, 3);    Serial.print(",");
Serial.print(th2, 3);    Serial.print(",");
Serial.print(th1d, 3);   Serial.print(",");
Serial.print(th2d, 3);   Serial.print(",");
Serial.print(v1, 3);     Serial.print(",");
Serial.print(v2, 3);     Serial.print(",");
Serial.print(v1d, 3);    Serial.print(",");
Serial.print(v2d, 3);    Serial.print(",");
Serial.print(pwm1);      Serial.print(",");
Serial.print(vff1, 3);   Serial.print(",");
Serial.print(th1raw, 3); Serial.print(",");
Serial.print(th2raw, 3); Serial.print(",");
Serial.println(u1_total, 4);`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>D,125,0.785,0.524,0.790,0.526,0.120,0.080,0.140,0.090,180,0.050,0.784,0.522,2.4500</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">G — Gains report (sent on gains change or query)</p>
                <p className="text-xs text-zinc-400 mb-2">Reports PID values, microstep divisor, and feedforward blend factors.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.print("G,");
Serial.print(kp1, 3); Serial.print(",");
Serial.print(ki1, 3); Serial.print(",");
Serial.print(kd1, 3); Serial.print(",");
Serial.print(kp2, 3); Serial.print(",");
Serial.print(ki2, 3); Serial.print(",");
Serial.print(kd2, 3); Serial.print(",");
Serial.print(mstep);  Serial.print(",");
Serial.print(ffi, 2); Serial.print(",");  // inertia FF blend
Serial.print(ffc, 2); Serial.print(",");  // coriolis FF blend
Serial.println(ffg, 2);                   // gravity FF blend`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>G,0.600,0.030,0.020,4.000,0.005,0.100,16,0.50,0.30,0.80</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">F — Feedforward breakdown (50 Hz)</p>
                <p className="text-xs text-zinc-400 mb-2">Per-joint inertia, Coriolis, and gravity feedforward torques plus control signals.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.print("F,");
Serial.print(t); Serial.print(",");
Serial.print(inertia1, 3); Serial.print(",");
Serial.print(coriolis1, 3); Serial.print(",");
Serial.print(gravity1, 3); Serial.print(",");
Serial.print(inertia2, 3); Serial.print(",");
Serial.print(coriolis2, 3); Serial.print(",");
Serial.print(gravity2, 3); Serial.print(",");
Serial.print(ff1_contrib, 3); Serial.print(",");
Serial.print(u1_total, 3); Serial.print(",");
Serial.print(integral1, 3); Serial.print(",");
Serial.print(delta_omega_ff, 3); Serial.print(",");
Serial.print(omega2_raw, 3); Serial.print(",");
Serial.println(integral2, 3);`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">K — Runtime parameters (33 fields, sent on request/boot)</p>
                <p className="text-xs text-zinc-400 mb-2">Velocity/acceleration limits, filter bandwidths, deadbands, trajectory flags, VFF gains, and hold mode coefficients.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// K,vmax,amax,cfreq,u1max,fzt,fztk,kspen,pwm_db,dbmen,dbens,
//   td1r,td2r,td1h,ddth,dben,dbrel,dbvel,hskp,hskd,idecay,
//   taunom,m22ref,alpha_tilt_deg,td_enabled,trap_enabled,
//   ki2_gate_rad,db2en,db2rel,err_dz,integral_freeze_thresh,
//   kv_vel,vff_max_frac,vff_dv_max
Serial.print("K,");
Serial.print(vmax, 3);    Serial.print(","); // velocity limit (m/s)
Serial.print(amax, 3);    Serial.print(","); // acceleration limit (m/s²)
Serial.print(cfreq);      Serial.print(","); // control frequency (Hz)
Serial.print(u1max, 2);   Serial.print(","); // max control output (V)
// ... (all 33 parameters CSV)`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">P — Position heartbeat (sent on demand via getgains/getparams)</p>
                <p className="text-xs text-zinc-400 mb-2">Reports current end-effector FK position and joint angles.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// x, y    = end-effector position (mm)
// theta1   = Joint 1 angle (rad)
// theta2   = Joint 2 angle (rad)
Serial.print("P,");
Serial.print(x, 3);      Serial.print(",");
Serial.print(y, 3);      Serial.print(",");
Serial.print(theta1, 4); Serial.print(",");
Serial.println(theta2, 4);`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">Q — Trajectory Queue Status (sent on queue state changes)</p>
                <p className="text-xs text-zinc-400 mb-2">Reports whether a second move is queued and its target coordinates.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// pending_status = 1 if move is queued, 0 otherwise
// pending_x, pending_y = coordinates of pending target (mm)
Serial.print("Q,");
Serial.print(pending_status); Serial.print(",");
Serial.print(pending_x);      Serial.print(",");
Serial.println(pending_y);`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">ESTOP — E-STOP status (sent on demand or state change)</p>
                <p className="text-xs text-zinc-400 mb-2">Indicates whether the emergency stop latch is active.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.print("ESTOP,");
Serial.println(estop_active ? "1" : "0");`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">X — Mode identifier (sent on boot, mode switch, and getgains)</p>
                <p className="text-xs text-zinc-400 mb-2">Reports the current firmware operating mode name.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.print("X,");
Serial.println(MODE_NAMES[op_mode]);  // e.g. "IDLE", "SCARA", "ZN", "TEST"`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">E — Joint 1 PID Efforts & Loop Duration (sent at 10 Hz)</p>
                <p className="text-xs text-zinc-400 mb-2">Streams the controller term outputs for Joint 1 and the microcontroller control loop duration.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// p1_out, i1_out, d1_out = Joint 1 Proportional, Integral, and Derivative outputs (float)
// loop_duration_us       = Microcontroller loop execution time in microseconds (int)
Serial.print("E,");
Serial.print(millis());
Serial.print(",");
Serial.print(p1_out, 4);
Serial.print(",");
Serial.print(i1_out, 4);
Serial.print(",");
Serial.print(d1_out, 4);
Serial.print(",");
Serial.println(loop_duration_us);`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>E,125,0.8524,-0.0210,0.1105,82</InlineCode></span></div>
              </div>

            </div>
          </section>

          {/* 💡 SECTION: ESP COMMANDS */}
          <section id="esp-commands" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>HMI → ESP32: Command Dictionary</span>
              <a href="#esp-commands" onClick={(e) => { e.preventDefault(); handleScrollTo('#esp-commands') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The HMI transmits plain-text parameters over serial, terminated with a newline character (<InlineCode>\n</InlineCode>). Your firmware should parse these messages in its main execution loop.
            </p>

            <PropertyList>
              <Property
                name="move,X,Y"
                type="MOTION COMMAND"
                description="Triggers the trajectory planner to calculate a path to target X and Y coordinate points (floats)."
              />
              <Property
                name="elbow,N"
                type="CONFIGURATION"
                description="Sets the kinematic configuration for the next movement. N is +1 (right/elbow-up) or -1 (left/elbow-down)."
              />
              <Property
                name="kp1,V / ki1,V / kd1,V"
                type="J1 GAIN ADJUST"
                description="Updates a single joint 1 control gain parameter (V is a float value)."
              />
              <Property
                name="kp2,V / ki2,V / kd2,V"
                type="J2 GAIN ADJUST"
                description="Updates a single joint 2 control gain parameter (V is a float value)."
              />
              <Property
                name="mstep,N"
                type="DRIVER DIVISOR"
                description="Sets the stepper motor driver microstep setting. N can be 1, 2, 4, 8, or 16."
              />
              <Property name="estop / resume" type="SAFETY" description="Emergency stop cuts motor outputs. Resume clears the E-STOP latch and re-enables outputs without moving." />
              <Property name="ping" type="WATCHDOG" description="Resets the firmware 8-second serial watchdog. Sent automatically by the HMI heartbeat." />
              <Property name="mode,<name>" type="MODE SWITCH" description="Switch firmware mode: idle, scara, zn, or test. Sent automatically by ModeRouter on page navigation." />
              <Property name="plot,<0|1>" type="LOGGING" description="Enable/disable high-rate D logging. Sent automatically on /zn and /test routes." />
              <Property name="getgains / getparams" type="QUERY" description="Request G (gains) or K (runtime params) packets. Sent on connect." />
              <Property name="ffi,ffc,ffg" type="FEEDFORWARD" description="Set inertia, Coriolis, and gravity feedforward blend factors (0.0–1.0)." />
              <Property name="clrgraph" type="BUFFER CLEAR" description="Clear trajectory buffers on the HMI and firmware." />
              <Property name="t1,<deg> / t2,<deg>" type="ZN STEP" description="Set joint target angle in degrees (ZN and TEST modes)." />
              <Property name="<param>,val" type="TEST PARAM" description="Set any of 33 runtime parameters on the Test page (vmax, amax, td1r, td2r, kv1, vffmax, vffdv, etc.)." />
            </PropertyList>
          </section>

          {/* 💡 SECTION: ESP EXAMPLE */}
          <section id="esp-example" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Minimal ESP32 Integration Example</span>
              <a href="#esp-example" onClick={(e) => { e.preventDefault(); handleScrollTo('#esp-example') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Here is a complete, minimal Arduino framework demonstrating serial command parsing and telemetry feedback loop formatting.
            </p>

            <CodeBlock
              filename="SCARA_HMI_Firmware_Skeleton.ino"
              code={`// ─── Minimal SCARA HMI Integration Sketch ───────────────────
// Baud rate MUST match: 921600

float kp1 = 1.0, ki1 = 0.0, kd1 = 0.05;
float kp2 = 1.0, ki2 = 0.0, kd2 = 0.05;
int   mstep = 8;
int   elbowDir = 1;
bool  moving = false;
unsigned long moveStart = 0;

void sendGains() {
  Serial.print("G,");
  Serial.print(kp1, 3); Serial.print(",");
  Serial.print(ki1, 3); Serial.print(",");
  Serial.print(kd1, 3); Serial.print(",");
  Serial.print(kp2, 3); Serial.print(",");
  Serial.print(ki2, 3); Serial.print(",");
  Serial.print(kd2, 3); Serial.println(mstep);
}

void parseCommand(String line) {
  line.trim();
  if (line.startsWith("move,")) {
    float xf = line.substring(5, line.indexOf(',', 5)).toFloat();
    float yf = line.substring(line.lastIndexOf(',') + 1).toFloat();
    
    // TODO: Perform IK calculations, configure trajectory planner
    
    // Emit Move start sequence:
    float x0 = 0.0, y0 = 120.0; // Current position readings
    Serial.print("M,"); Serial.print(x0); Serial.print(",");
    Serial.print(y0);   Serial.print(",");
    Serial.print(xf);   Serial.print(","); Serial.println(yf);
    
    moving = true;
    moveStart = millis();
  }
  else if (line.startsWith("kp1,")) kp1 = line.substring(4).toFloat();
  else if (line.startsWith("ki1,")) ki1 = line.substring(4).toFloat();
  else if (line.startsWith("kd1,")) kd1 = line.substring(4).toFloat();
  else if (line.startsWith("kp2,")) kp2 = line.substring(4).toFloat();
  else if (line.startsWith("ki2,")) ki2 = line.substring(4).toFloat();
  else if (line.startsWith("kd2,")) kd2 = line.substring(4).toFloat();
  else if (line.startsWith("mstep,")) mstep = line.substring(6).toInt();
  else if (line.startsWith("elbow,")) elbowDir = line.substring(6).toInt();
  else if (line == "getgains") sendGains();
  else if (line == "estop") {
    moving = false;
    // TODO: Cut motor power, reset physical state
  }
}

void setup() {
  Serial.begin(921600);
  sendGains(); // Send PID status to HMI immediately on boot
}

void loop() {
  // ── 1. Read and parse incoming serial commands ──────────────────────
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    parseCommand(cmd);
  }

  // ── 2. Run active motion feedback loop ──────────────────────────────
  if (moving) {
    unsigned long t = millis() - moveStart;

    // ── Placeholder sensor parameters ─────────────────────────────────
    float th1  = 0.785;   // Actual joint 1 (potentiometer, rad)
    float th2  = 0.524;   // Actual joint 2 (stepper index, rad)
    float th1d = 0.790;   // Desired Joint 1
    float th2d = 0.526;   // Desired Joint 2
    float e1   = th1d - th1;
    float e2   = th2d - th2;
    float v1   = 0.12, v2 = 0.08;    // Actual speed (rad/s)
    float v1d  = 0.14, v2d = 0.09;   // Desired speed (rad/s)
    int   pwm1 = 180;

    // Forward Kinematics (FK): Compute Cartesian (X,Y) coordinates
    float L1 = 100.0, L2 = 70.0; // Link lengths in mm
    float xa = L1*cos(th1) + L2*cos(th1+th2);
    float ya = L1*sin(th1) + L2*sin(th1+th2);
    float xi = L1*cos(th1d) + L2*cos(th1d+th2d); 
    float yi = L1*sin(th1d) + L2*sin(th1d+th2d);

    // ── T Line: Send Trajectory coordinates
    Serial.print("T,");
    Serial.print(xi, 3); Serial.print(",");
    Serial.print(yi, 3); Serial.print(",");
    Serial.print(xa, 3); Serial.print(",");
    Serial.println(ya, 3);

    // ── D Line: Send detailed dynamics logs
    Serial.print("D,");
    Serial.print(t);         Serial.print(",");
    Serial.print(th1, 3);    Serial.print(",");
    Serial.print(th2, 3);    Serial.print(",");
    Serial.print(th1d, 3);   Serial.print(",");
    Serial.print(th2d, 3);   Serial.print(",");
    Serial.print(v1, 3);     Serial.print(",");
    Serial.print(v2, 3);     Serial.print(",");
    Serial.print(v1d, 3);    Serial.print(",");
    Serial.print(v2d, 3);    Serial.print(",");
    Serial.print(pwm1);      Serial.print(",");
    Serial.print(0.0, 3);    Serial.print(",");  // vff1 placeholder
    Serial.print(th1, 3);    Serial.print(",");  // th1raw placeholder
    Serial.print(th2, 3);    Serial.print(",");  // th2raw placeholder
    Serial.println(0.0, 4);                      // u1_total placeholder

    // ── Stop condition: Send S packet to complete run
    if (t > 3000) {  // 3 second trajectory simulation timeout
      moving = false;
      Serial.println("S");
    }
  }

  delay(20); // 50 Hz cycle frequency
}`}
            />

            <Callout type="warn">
              Ensure telemetry cycle times stay under **50 ms** (20 ms recommended). Faster data transmission is required to capture fast system dynamics without buffer dropouts.
            </Callout>

            <Callout type="danger">
              Ensure you implement the **estop** trigger. The E-STOP safety button in the HMI header transmits this string instantly. The device must shut down motor outputs rather than simply exiting the trajectory loop.
            </Callout>
          </section>

          {/* Document Footer */}
          <div className="mt-16 pt-8 border-t border-zinc-800/80 text-center text-xs text-zinc-500">
            SCARA HMI • User Guide Documentation • TA 2 • 2026
          </div>
        </article>
      </div>

    </div>
  )
}
