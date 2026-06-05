'use client'

import { useState, useEffect, useRef } from 'react'
import { Copy, Check, BookOpen, Cpu, Eye, BarChart2, Book, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
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
    <div className="my-5 rounded-xl overflow-hidden border border-zinc-800 bg-[#0e0e11] shadow-lg shadow-black/30">
      <div className="flex items-center justify-between px-4 py-2 bg-[#141418] border-b border-zinc-800/80">
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
    info: 'border-sky-500/50 bg-sky-500/5 text-sky-300',
    warn: 'border-amber-500/50 bg-amber-500/5 text-amber-300',
    tip: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-300',
    danger: 'border-red-500/50 bg-red-500/5 text-red-300',
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
    <div className="my-5 divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl overflow-hidden bg-[#141418]/30 shadow-md">
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

export function ReadmeTab() {
  const [activeId, setActiveId] = useState<string>('connect')
  const contentRef = useRef<HTMLDivElement>(null)

  // Sidebar grouping structure
  const navigationGroups = [
    {
      id: 'connect',
      title: 'Getting started',
      icon: <BookOpen className="h-3.5 w-3.5" />,
      links: [
        { href: '#connect', label: '1. Connecting the HMI' },
        { href: '#move', label: '2. Sending a Move' },
      ],
    },
    {
      id: 'xy-trace',
      title: 'Monitor tab',
      icon: <Eye className="h-3.5 w-3.5" />,
      links: [
        { href: '#xy-trace', label: 'XY Trace Canvas' },
        { href: '#charts', label: 'Telemetry Charts' },
        { href: '#control-panel', label: 'Control Panel Pinned' },
        { href: '#serial-log', label: 'Serial Log Terminal' },
      ],
    },
    {
      id: 'performance',
      title: 'Analysis tab',
      icon: <BarChart2 className="h-3.5 w-3.5" />,
      links: [
        { href: '#performance', label: 'Performance Metrics' },
        { href: '#advanced', label: 'Advanced Analysis' },
        { href: '#pid-advisor', label: 'PID Advisor Rules' },
      ],
    },
    {
      id: 'zn-tuner',
      title: 'ZN Tuner page',
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      links: [
        { href: '#zn-about', label: '1. About ZN Tuning' },
        { href: '#zn-interface', label: '2. Tuner Workspace' },
        { href: '#zn-calipers', label: '3. Caliper Analyzer' },
      ],
    },
    {
      id: 'terms-control',
      title: 'Key terms',
      icon: <Book className="h-3.5 w-3.5" />,
      links: [
        { href: '#terms-control', label: 'Control & Motion' },
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
    if (['connect', 'move'].includes(id)) return 'connect'
    if (['xy-trace', 'charts', 'control-panel', 'serial-log'].includes(id)) return 'xy-trace'
    if (['performance', 'advanced', 'pid-advisor'].includes(id)) return 'performance'
    if (['zn-about', 'zn-interface', 'zn-calipers'].includes(id)) return 'zn-tuner'
    if (['terms-control', 'terms-pid', 'terms-motion'].includes(id)) return 'terms-control'
    if (['esp-telemetry', 'esp-commands', 'esp-example'].includes(id)) return 'esp-telemetry'
    return 'connect'
  }
  const activeCategory = getActiveCategory(activeId)

  // Manage open/closed state for grouping accordions
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    connect: true,
    'xy-trace': false,
    performance: false,
    'zn-tuner': false,
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
    <div className="flex flex-row h-full overflow-hidden bg-hmi-bg">
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
          <div className="pb-8 border-b border-zinc-800/80 mb-8">
            <h1 className="text-3xl font-extrabold text-zinc-100 tracking-tight leading-none mb-3">
              SCARA HMI — User Guide
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl font-normal">
              Real-time monitoring and control interface for the 2-DOF planar SCARA robot, developed for the Dynamic System Control (MS3201) course at Mechanical Engineering ITB.
            </p>
          </div>

          {/* Project Context & Evolution */}
          <div className="p-5 border border-zinc-800 bg-[#141418]/40 rounded-xl mb-10 text-xs text-zinc-400 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-200 block mb-1">Project Objective</span>
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
              &ldquo;Dalam kurikulum Program Studi Teknik Mesin ITB, mata kuliah Kendali Sistem Dinamik (MS3201) memegang peranan vital... Penelitian ini bertujuan untuk memodifikasi algoritma kontrol dengan memasukkan kompensasi dinamik serta mengembangkan fitur HMI yang lebih komprehensif guna meningkatkan kualitas pembelajaran praktikum mandiri.&rdquo;
            </div>
          </div>

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
              <li>Upon connection, the port badge will display green with the COM name, and the HMI will automatically trigger a <InlineCode>getgains</InlineCode> command to request current PID parameters.</li>
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
              <li>The canvas will update, tracing the planned path in blue and recording actual position data as it arrives.</li>
            </ol>

            <Callout type="info">
              <strong>Geometric Workspace Envelope:</strong> The robot is constrained by physical linkages to an annular sector: radial distance <strong className="text-zinc-200">45mm to 170mm</strong> and angular limits <strong className="text-zinc-200">0° to 180°</strong>. Coordinates outside this region will fail inverse kinematics calculations on the ESP32.
            </Callout>

            <Callout type="danger">
              <strong>Trajectory Safety Validation:</strong> The HMI includes a safety layer checking all straight-line moves. If a path crosses the inner singularity circle (R &lt; 45 mm), exceeds the outer reach (R &gt; 170 mm), or goes below the horizontal plane (Y &lt; 0), the HMI disables the move command, displays validation warning details in the Control Panel, and overlays a red warning path on the canvas.
            </Callout>
          </section>

          {/* 💡 SECTION: XY TRACE */}
          <section id="xy-trace" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>XY Trace Canvas</span>
              <a href="#xy-trace" onClick={(e) => { e.preventDefault(); handleScrollTo('#xy-trace') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Positioned on the left of the Monitor tab, the **XY Trace Canvas** renders a high-precision graphic visualization of the SCARA arm's workspace, showing ideal trajectory calculations alongside physical feedback paths.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Visual Indicator Elements</h3>
            <PropertyList>
              <Property
                name="Ideal Trajectory"
                type="DASHED BLUE LINE"
                description="The reference path generated by the trajectory generator on the ESP32 representing mathematical movement targets."
              />
              <Property
                name="Actual Feedback Path"
                type="SOLID RED LINE"
                description="The real-time position of the end-effector calculated via forward kinematics from actual encoder and potentiometer angles."
              />
              <Property
                name="Link Overlay"
                type="BLUE & ORANGE GLOW"
                description="A visual representation of the physical SCARA robot skeleton (Inner Link Joint 1 in Blue, Outer Link Joint 2 in Orange)."
              />
              <Property
                name="Workspace Boundaries"
                type="CYAN ARCS & PATTERNED RED"
                description="The annular operating sector. The blue dashed arcs show the boundaries, and the red patterned area represents kinematically unreachable territory."
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
                <p className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-2">Canvas Buttons</p>
                <ul className="space-y-1.5 text-xs text-zinc-400 leading-relaxed list-disc pl-4">
                  <li><strong>Ghost:</strong> Toggle the previous trajectory overlay visibility.</li>
                  <li><strong>Arm Links:</strong> Hide/show the joint link skeleton overlay.</li>
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
              The chart panel provides five interactive sub-tabs tracking control system variables over time. Graphs freeze at the end of a run to support static telemetry inspection.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Available Visualizations</h3>
            <PropertyList>
              <Property
                name="EEF error (mm)"
                type="AMBER AREA PLOT"
                description="Euclidean distance error between ideal and actual end-effector coordinates. Shows error accumulation and convergence."
              />
              <Property
                name="EEF vel (mm/s)"
                type="DUAL LINE CHART"
                description="Ideal versus actual tool-tip velocity profiles, illustrating acceleration spikes and deceleration behavior."
              />
              <Property
                name="PWM Output"
                type="SOLID GREEN PLOT"
                description="The Pulse-Width Modulation command signal written to Joint 1's DC motor driver (range -255 to +255). Shows controller effort saturation."
              />
              <Property
                name="Position (rad)"
                type="DUAL SUBPLOTS"
                description="Joint angles θ1 and θ2 versus desired reference values (Dashed lines indicate references; solid lines show sensor readings)."
              />
              <Property
                name="Velocity (rad/s)"
                type="SPEED PLOTS"
                description="Joint angular velocity values showing high-frequency motor chattering and compliance lag."
              />
            </PropertyList>

            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Post-Run Statistics</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              Once a run completes (transition to `IDLE`), the statistical summary card computes:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-3">
              {[
                { title: 'Samples', desc: 'Total data count' },
                { title: 'Max Error', desc: 'Peak deviation' },
                { title: 'Mean Error', desc: 'Average error' },
                { title: 'Final Error', desc: 'Steady-state offset' },
                { title: 'Max PWM', desc: 'Peak motor drive' },
              ].map((item, idx) => (
                <div key={idx} className="p-3 border border-zinc-800 rounded-lg bg-[#101014] text-center">
                  <p className="text-[11px] font-bold text-zinc-200 font-mono">{item.title}</p>
                  <p className="text-[9.5px] text-zinc-500 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
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
            </PropertyList>
          </section>

          {/* 💡 SECTION: SERIAL LOG */}
          <section id="serial-log" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Serial Log Terminal</span>
              <a href="#serial-log" onClick={(e) => { e.preventDefault(); handleScrollTo('#serial-log') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The terminal logging panel shows raw command responses. High-frequency telemetry lines (<InlineCode>T</InlineCode> and <InlineCode>D</InlineCode> packets) are automatically filtered out to keep the terminal readable, while specific key transitions are highlighted with distinct badges.
            </p>

            <div className="p-4 rounded-xl border border-zinc-800 bg-[#0e0e11] font-mono text-[11px] space-y-2 mb-4">
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-bold">MOVE</span> <span className="text-zinc-400">M,0.00,120.00,100.00,80.00 (Trajectory initialization)</span></div>
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold">DONE</span> <span className="text-zinc-400">S (Robot successfully arrived at target)</span></div>
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-zinc-850 text-zinc-300 border border-zinc-700 text-[9px] font-bold">GAINS</span> <span className="text-zinc-400">G,2.500,0.010,0.050,1.200,0.005,0.030,8 (Gains query return)</span></div>
              <div className="flex items-center gap-2"><span className="text-sky-400 font-bold">[DEBUG]</span> <span className="text-zinc-500">Free heap: 218402 bytes</span></div>
            </div>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Terminal Execution Controls</h3>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 mb-4 leading-relaxed">
              <li><strong>Clear Log:</strong> Clear local console logs and resets the persisted browser store.</li>
              <li><strong>Clear Graph:</strong> Erases the trace plot paths and transmits a <InlineCode>clrgraph</InlineCode> command over serial to clear local arrays on the microcontroller.</li>
            </ul>
          </section>

          {/* 💡 SECTION: PERFORMANCE SUMMARY */}
          <section id="performance" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Control Performance Metrics</span>
              <a href="#performance" onClick={(e) => { e.preventDefault(); handleScrollTo('#performance') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Located at the top of the **Analysis** tab, these cards calculate control parameters for transient response and steady-state accuracy:
            </p>

            <PropertyList>
              <Property
                name="Rise Time (tr)"
                type="TRANSIENT RESPONSE"
                description="The time interval (measured in samples) required for the feedback signal to rise from 10% to 90% of its final value. Lower samples indicate faster response speeds."
              />
              <Property
                name="Overshoot (%OS)"
                type="DAMPING INDICATOR"
                description="The peak value of the actual path relative to the final settled value, expressed as a percentage. Excessive overshoot (>20%) suggests that derivative damping (Kd) is too low or proportional gain (Kp) is set too high."
              />
              <Property
                name="Settling Time (ts)"
                type="SYSTEM STABILITY"
                description="The sample index after which the feedback signal enters and remains within a narrow band (default ±2% or ±5%) around the target value. Measures how quickly oscillations damp out."
              />
              <Property
                name="Steady-State Error (ESS)"
                type="ACCURACY METRIC"
                description="The average error over the last 10% of samples. Tells you if the joint stopped short of the target. Corrected by increasing the integral gain (Ki)."
              />
            </PropertyList>
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
              <Property
                name="Phase Portrait (J1 & J2)"
                type="STATE-SPACE PLOT"
                description="Plots joint error (horizontal) vs. rate of change of joint error (vertical) for both joints on a single grid. A stable system spirals inward and terminates at the origin. Loop trajectories indicate limit-cycle oscillations."
              />
              <Property
                name="Frequency Content (FFT)"
                type="FAST FOURIER TRANSFORM"
                description="Computes frequency spectrum analysis of the position error. Low-frequency peaks show planned tracking, while high-frequency spikes suggest mechanical resonance or encoder noise."
              />
              <Property
                name="Control Effort Proxy"
                type="INTEGRATED WORK"
                description="Calculates the running integral of absolute PWM signals: ∫|PWM| dt. Lower values indicate more energy-efficient trajectories, helping you evaluate whether your PID parameters consume excess power."
              />
              <Property
                name="Ideal vs. Actual Table"
                type="TELEMETRY ARCHIVE"
                description="A scrollable, spreadsheet-style table listing raw position values for every control tick. This data is available for troubleshooting and manual export."
              />
            </PropertyList>
          </section>

          {/* 💡 SECTION: PID ADVISOR */}
          <section id="pid-advisor" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>PID Advisor Rules</span>
              <a href="#pid-advisor" onClick={(e) => { e.preventDefault(); handleScrollTo('#pid-advisor') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Upon a move's completion, the rule-based **PID Advisor** analyzes the telemetry log and provides tuning recommendations:
            </p>

            <PropertyList>
              <Property
                name="Critical (Red Alert)"
                type="STABILITY WARNING"
                description="Indicates severe issues such as undamped oscillations, joint saturation, or no movement response. Reduce gains immediately before mechanical damage occurs."
              />
              <Property
                name="Suggestion (Amber)"
                type="TUNING ADVICE"
                description="Recommends gain adjustments (e.g., 'Overshoot exceeds 15%, try increasing Kd1 or reducing Kp1 by 10%')."
              />
              <Property
                name="Info (Blue)"
                type="SYSTEM NOTE"
                description="Confirming stable behavior, like validating that steady-state error is within acceptable limits."
              />
              <Property
                name="Success (Green)"
                type="OPTIMAL BEHAVIOR"
                description="Indicates that both joint trajectories converged within target thresholds with minimal overshoot."
              />
            </PropertyList>

            <Callout type="tip">
              Tuning workflow: Adjust only <strong>one parameter at a time</strong>. Run a test move, check the PID Advisor suggestions, and make iterative adjustments.
            </Callout>
          </section>

          {/* 💡 SECTION: ZN TUNER */}
          <section id="zn-about" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Ziegler-Nichols Tuning Page</span>
              <a href="#zn-about" onClick={(e) => { e.preventDefault(); handleScrollTo('#zn-about') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Accessible via the **ZN** navigation link in the header, this dedicated page provides client-side estimators and calculator rules implementing the heuristic **Ziegler-Nichols closed-loop tuning method**. It operates on a decoupled high-speed telemetry feed where coordinates and commands are processed in degrees.
            </p>
            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">The Ziegler-Nichols Heuristic</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The tuning procedure is carried out by setting the integral gain (<InlineCode>Ki</InlineCode>) and derivative gain (<InlineCode>Kd</InlineCode>) to zero, then increasing the proportional gain (<InlineCode>Kp</InlineCode>) until the joint response exhibits **sustained (ultimate) oscillations** under a step reference.
            </p>
            <PropertyList>
              <Property
                name="Ultimate Gain (Ku)"
                description="The value of proportional gain Kp at which the control loop begins to oscillate continuously with a constant amplitude."
              />
              <Property
                name="Ultimate Period (Tu)"
                description="The time period (seconds) of one complete oscillation cycle at the ultimate gain. Measured between consecutive peaks."
              />
            </PropertyList>
          </section>

          <section id="zn-interface" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>ZN Tuner Workspace Details</span>
              <a href="#zn-interface" onClick={(e) => { e.preventDefault(); handleScrollTo('#zn-interface') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              The page contains a custom control sidebar on the left and a continuous Recharts rendering stream on the right.
            </p>
            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Workspace Controls</h3>
            <PropertyList>
              <Property
                name="Joint Selector Toggle"
                description="Toggle between tuning Joint 1 (DC motor + potentiometer feedback) and Joint 2 (stepper motor)."
              />
              <Property
                name="Gains & Increments"
                description="Input fields for Kp, Ki, Kd, and deadband offsets, equipped with increment/decrement caliper controls to adjust parameters by configurable step sizes."
              />
              <Property
                name="Step Move Command"
                description="Send immediate target position changes in degrees (e.g. t1 or t2 commands) to trigger step response cycles on the device."
              />
              <Property
                name="Plotting Serialization"
                description="Entering this page automatically sends 'plot,1' to request raw controller logging from the ESP32. Navigating away restores default 'plot,0'."
              />
            </PropertyList>
          </section>

          <section id="zn-calipers" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Caliper Analyzer & Tuning Table</span>
              <a href="#zn-calipers" onClick={(e) => { e.preventDefault(); handleScrollTo('#zn-calipers') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
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
              <table className="min-w-full divide-y divide-zinc-850 bg-[#101014]/50 text-[11px] font-sans text-zinc-400">
                <thead className="bg-[#141418] text-zinc-300">
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
                <p className="text-xs font-bold text-zinc-200 mb-1">M — Move start (sent once when a trajectory begins)</p>
                <p className="text-xs text-zinc-400 mb-2">Informs the HMI to reset buffers and prepare to record telemetry.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.print("M,");
Serial.print(x0);   // start X mm (float)
Serial.print(",");
Serial.print(y0);   // start Y mm (float)
Serial.print(",");
Serial.print(xf);   // target X mm (float)
Serial.print(",");
Serial.println(yf); // target Y mm (float)`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>M,0.00,120.00,100.00,80.00</InlineCode></span></div>
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
                <p className="text-xs text-zinc-400 mb-2">Sends the target and actual end-effector coordinates to plot on the XY Trace canvas.</p>
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
                <p className="text-xs font-bold text-zinc-200 mb-1">D — Dynamics sample (sent every control tick, same rate as T)</p>
                <p className="text-xs text-zinc-400 mb-2">Sends detailed system dynamics parameters for the live telemetry graphs.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// t      = time since move start (ms)
// th1    = actual joint 1 angle (rad)
// th2    = actual joint 2 angle (rad)
// th1d   = desired joint 1 angle (rad)
// th2d   = desired joint 2 angle (rad)
// e1     = joint 1 error = th1d - th1 (rad)
// e2     = joint 2 error = th2d - th2 (rad)
// v1     = actual joint 1 speed (rad/s)
// v2     = actual joint 2 speed (rad/s)
// v1d    = desired joint 1 speed (rad/s)
// v2d    = desired joint 2 speed (rad/s)
// pwm1   = command PWM output written to joint 1, -255 to 255 (int)
Serial.print("D,");
Serial.print(t);       Serial.print(",");
Serial.print(th1, 4);  Serial.print(",");
Serial.print(th2, 4);  Serial.print(",");
Serial.print(th1d, 4); Serial.print(",");
Serial.print(th2d, 4); Serial.print(",");
Serial.print(e1, 4);   Serial.print(",");
Serial.print(e2, 4);   Serial.print(",");
Serial.print(v1, 4);   Serial.print(",");
Serial.print(v2, 4);   Serial.print(",");
Serial.print(v1d, 4);  Serial.print(",");
Serial.print(v2d, 4);  Serial.print(",");
Serial.println(pwm1);`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>D,125,0.7854,0.5236,0.7900,0.5260,0.0046,0.0024,0.12,0.08,0.14,0.09,180</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">G — Gains report (sent on gains change or query)</p>
                <p className="text-xs text-zinc-400 mb-2">Reports the current PID values, microstep settings, and Computed Torque Control blends back to the HMI.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// Send this on startup, when gains change, or in response to a "getgains" command
Serial.print("G,");
Serial.print(kp1, 3); Serial.print(",");
Serial.print(ki1, 3); Serial.print(",");
Serial.print(kd1, 3); Serial.print(",");
Serial.print(kp2, 3); Serial.print(",");
Serial.print(ki2, 3); Serial.print(",");
Serial.print(kd2, 3); Serial.print(",");
Serial.print(mstep);  Serial.print(",");  // Stepper microstep divisor (int)
Serial.print(ff1, 2); Serial.print(",");  // J1 CTC Blend (float 0.0-1.0)
Serial.println(ff2, 2);                   // J2 CTC Blend (float 0.0-1.0)`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>G,2.500,0.010,0.050,1.200,0.000,0.030,8,0.50,0.80</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">F — Forces and Control Internal (sent at 10 Hz)</p>
                <p className="text-xs text-zinc-400 mb-2">Streams the analytical Computed Torque Control torques and feedback errors breakdown.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// t               = time since move start (ms)
// ctc_ff1, ctc_ff2 = Joint analytical CTC torques (N·m)
// ff1_contrib     = Joint 1 CTC torque contribution
// u1_total        = Combined torque signal applied to DC J1
// integral1       = Integral term of Joint 1
// delta_omega_ff  = Stepper speed error correction (rad/s)
// omega2_raw      = Stepper command velocity (rad/s)
Serial.print("F,");
Serial.print(t);              Serial.print(",");
Serial.print(ctc_ff1, 3);     Serial.print(",");
Serial.print(ctc_ff2, 3);     Serial.print(",");
Serial.print(ff1_contrib, 3); Serial.print(",");
Serial.print(u1_total, 3);    Serial.print(",");
Serial.print(integral1, 3);   Serial.print(",");
Serial.print(delta_omega_ff, 3); Serial.print(",");
Serial.println(omega2_raw, 3);`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Example: <InlineCode>F,125,0.452,0.180,0.226,1.450,0.012,0.005,0.420</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">K — Constants and System Params (sent on request/boot)</p>
                <p className="text-xs text-zinc-400 mb-2">Provides the 18 constant parameters for velocity limits, deadbands, smoothing alphas, and hold modes.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// Prints K, vmax, amax, cfreq, u1max, fzt, pwm_db, apos, adpos, aacc, ddth, dben, dbrel, dbvel, hskp, hskd, idecay, taunom, m22ref
Serial.print("K,");
Serial.print(vmax, 3);   Serial.print(","); // ... (etc. all 18 parameters CSV)`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">Q — Trajectory Queue Status (sent on queue state changes)</p>
                <p className="text-xs text-zinc-400 mb-2">Streams active trajectory queue target information.</p>
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
              <Property
                name="estop"
                type="EMERGENCY SHUTDOWN"
                description="Emergency stop. Halts all active trajectories and shuts off motor driver outputs immediately."
              />
              <Property
                name="getgains"
                type="QUERY TRIGGER"
                description="Requests that the ESP32 send a G packet containing its current PID parameters. Sent by the HMI immediately on connect."
              />
              <Property
                name="getparams"
                type="QUERY TRIGGER"
                description="Requests that the ESP32 send a K packet containing its current tuning constants and limit values. Sent by the HMI immediately on connect."
              />
              <Property
                name="clrgraph"
                type="BUFFER CLEAR"
                description="Informs the firmware that the HMI graph has been cleared, allowing it to reset internal data buffers if needed."
              />
              <Property
                name="<param_name>,val"
                type="PARAM ADJUST"
                description="Sets any of the 18 system tuning constants (e.g. vmax, val) directly. Supported parameters: vmax, amax, cfreq, u1max, fzt, db, apos, adpos, aacc, dben, dbrel, dbvel, ddth, hskp, hskd, idecay, taunom, m22ref."
              />
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
    Serial.print(xi, 2); Serial.print(",");
    Serial.print(yi, 2); Serial.print(",");
    Serial.print(xa, 2); Serial.print(",");
    Serial.println(ya, 2);

    // ── D Line: Send detailed dynamics logs
    Serial.print("D,");
    Serial.print(t);        Serial.print(",");
    Serial.print(th1, 4);   Serial.print(",");
    Serial.print(th2, 4);   Serial.print(",");
    Serial.print(th1d, 4);  Serial.print(",");
    Serial.print(th2d, 4);  Serial.print(",");
    Serial.print(e1, 4);    Serial.print(",");
    Serial.print(e2, 4);    Serial.print(",");
    Serial.print(v1, 4);    Serial.print(",");
    Serial.print(v2, 4);    Serial.print(",");
    Serial.print(v1d, 4);   Serial.print(",");
    Serial.print(v2d, 4);   Serial.print(",");
    Serial.println(pwm1);

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
