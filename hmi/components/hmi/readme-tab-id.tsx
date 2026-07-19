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

export function ReadmeTabId() {
  const [activeId, setActiveId] = useState<string>('connect')
  const contentRef = useRef<HTMLDivElement>(null)

  // Sidebar grouping structure
  const navigationGroups = [
    {
      id: 'connect',
      title: 'Panduan awal',
      icon: <BookOpen className="h-3.5 w-3.5" />,
      links: [
        { href: '#overview', label: 'Ringkasan Mulai Cepat' },
        { href: '#connect', label: '1. Menghubungkan HMI' },
        { href: '#move', label: '2. Mengirim Perintah Gerak' },
        { href: '#modes', label: '3. Mode Operasi' },
      ],
    },
    {
      id: 'pages',
      title: 'Halaman & navigasi',
      icon: <Compass className="h-3.5 w-3.5" />,
      links: [
        { href: '#pages-nav', label: 'Route & Navigasi Aplikasi' },
        { href: '#zn-page', label: 'Halaman ZN Tuner (/zn)' },
        { href: '#test-page', label: 'Halaman Pengujian (/test)' },
        { href: '#pcb-page', label: 'Halaman PCB Viewer (/pcb)' },
        { href: '#dashboard-page', label: 'Dashboard Run Tersimpan (/dashboard)' },
        { href: '#experiment-page', label: 'Otomasi & Hasil Eksperimen' },
      ],
    },
    {
      id: 'xy-trace',
      title: 'Tab Monitor',
      icon: <Eye className="h-3.5 w-3.5" />,
      links: [
        { href: '#xy-trace', label: 'Kanvas XY Trace' },
        { href: '#charts', label: 'Grafik Telemetri' },
        { href: '#metrics', label: 'Panel Metrik Run' },
        { href: '#control-panel', label: 'Panel Kontrol' },
      ],
    },
    {
      id: 'performance',
      title: 'Tab Analisis',
      icon: <BarChart2 className="h-3.5 w-3.5" />,
      links: [
        { href: '#advanced', label: 'Analisis Lanjutan' },
        { href: '#comparison-table', label: 'Tabel Data & CSV' },
      ],
    },
    {
      id: 'rest-analysis',
      title: 'Tab Step & Noise',
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      links: [
        { href: '#rest-about', label: 'Tentang Step & Noise' },
        { href: '#rest-interface', label: 'Kontrol Workspace' },
        { href: '#rest-calipers', label: 'Penganalisis Kaliper' },
      ],
    },
    {
      id: 'tools',
      title: 'Alat & pengaturan',
      icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
      links: [
        { href: '#serial-monitor', label: 'Monitor Serial' },
        { href: '#settings-menu', label: 'Menu Pengaturan (☰)' },
        { href: '#keyboard-shortcuts', label: 'Shortcut Keyboard' },
      ],
    },
    {
      id: 'terms-control',
      title: 'Istilah kunci',
      icon: <Book className="h-3.5 w-3.5" />,
      links: [
        { href: '#terms-control', label: 'Kontrol & Gerakan' },
        { href: '#terms-cte', label: 'Error CTE & ATE' },
        { href: '#terms-pid', label: 'Tuning Gain PID' },
        { href: '#terms-motion', label: 'Istilah Kinematika' },
      ],
    },
    {
      id: 'esp-telemetry',
      title: 'Integrasi ESP32',
      icon: <Cpu className="h-3.5 w-3.5" />,
      links: [
        { href: '#esp-telemetry', label: 'Mengirim Telemetri' },
        { href: '#esp-commands', label: 'Kamus Perintah' },
        { href: '#esp-example', label: 'Contoh Arduino Sketch' },
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
              SCARA HMI — Panduan Pengguna
            </h1>
            <p className="text-sm text-hmi-muted leading-relaxed max-w-2xl font-normal">
              Antarmuka monitoring dan kontrol real-time untuk robot SCARA planar 2-DOF, dikembangkan untuk mata kuliah Pengendalian Sistem Dinamik (MS3201) Teknik Mesin ITB.
            </p>
          </div>

          {/* Project Context & Evolution */}
          <div className="p-5 border border-hmi-grid bg-hmi-panel/50 rounded-xl mb-10 text-xs text-hmi-muted space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-hmi-text block mb-1">Tujuan Proyek</span>
                <p className="leading-relaxed">
                  Memodifikasi algoritma kontrol robot SCARA 2-DOF dengan menambahkan **kompensasi dinamik** (inersia, gravitasi, Coriolis, dan gaya sentrifugal) serta menyediakan alat HMI real-time untuk tuning parameter (<InlineCode>Kp, Ki, Kd</InlineCode>).
                </p>
              </div>
              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-200 block mb-1">Evolusi Desain (Teknik Mesin ITB)</span>
                <ul className="list-disc pl-4 space-y-0.5 mt-0.5 leading-relaxed">
                  <li><strong className="text-zinc-300">Pandeka (2021)</strong>: Desain mekanik awal</li>
                  <li><strong className="text-zinc-300">Abdul (2023)</strong>: Modifikasi sistem penggerak</li>
                  <li><strong className="text-zinc-300">Al-Farabi (2024)</strong>: Portabilitas (miniaturisasi)</li>
                  <li><strong className="text-zinc-300">Mubarok (2025)</strong>: Integrasi kontrol dasar</li>
                  <li><strong className="text-zinc-300">Adi Haditya (2026)</strong>: Kompensasi dinamik &amp; HMI diagnostik lanjutan</li>
                </ul>
              </div>
            </div>
            
            <div className="pt-3 border-t border-zinc-800/80 text-[10.5px] italic text-zinc-500 font-serif leading-relaxed">
              &ldquo;Dalam kurikulum Teknik Mesin ITB, mata kuliah Pengendalian Sistem Dinamik (MS3201) memainkan peran penting... Penelitian ini bertujuan untuk memodifikasi algoritma kontrol dengan menggabungkan kompensasi dinamik dan mengembangkan fitur HMI yang lebih komprehensif guna meningkatkan kualitas pembelajaran praktikum mandiri.&rdquo;
            </div>
          </div>

          {/* 💡 SECTION: OVERVIEW */}
          <section id="overview" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Ringkasan Mulai Cepat</span>
              <a href="#overview" onClick={(e) => { e.preventDefault(); handleScrollTo('#overview') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              HMI ini adalah dashboard berbasis browser untuk memantau dan melakukan tuning robot SCARA planar 2-DOF. HMI ini berkomunikasi dengan ESP32 secara langsung melalui USB — tidak memerlukan driver tambahan atau perangkat lunak perantara.
            </p>
            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Alur kerja pertama kali</h3>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-zinc-400 mb-5 leading-relaxed">
              <li>Unggah firmware ke ESP32 (lihat <InlineCode>docs/firmware/readme.md</InlineCode>).</li>
              <li>Buka dashboard HMI di <strong className="text-zinc-300">tugasakhir.adihnursyam.com</strong> (atau jalankan <InlineCode>npm run dev</InlineCode> secara lokal dan buka <strong className="text-zinc-300">http://localhost:3000</strong>) di Chrome atau Edge.</li>
              <li>Hubungkan ESP32 ke komputer, klik <InlineCode>Connect</InlineCode> (Hubungkan), dan pilih port COM.</li>
              <li>Pastikan <strong className="text-zinc-300">Mode Badge</strong> menampilkan <InlineCode>SCARA</InlineCode> (HMI akan mengganti mode secara otomatis sesuai halaman).</li>
              <li>Buka tab <strong className="text-zinc-300">Monitor</strong>, masukkan koordinat target di Panel Kontrol, dan klik <InlineCode>Send Move</InlineCode> (Kirim Gerakan).</li>
              <li>Setelah gerakan selesai, periksa <strong className="text-zinc-300">Metrik Run</strong> di bawah grafik dan buka tab <strong className="text-zinc-300">Analisis</strong> untuk diagnostik yang lebih mendalam.</li>
            </ol>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 my-4">
              {[
                { tab: 'Monitor', desc: 'Trace XY langsung, grafik, metrik, Run+Save, dan panel kontrol' },
                { tab: 'Analisis', desc: 'Phase portrait pasca-gerakan, torsi CTC, dan tabel data' },
                { tab: 'Step & Noise', desc: 'Analisis telemetri respons-langkah dan keadaan-diam' },
                { tab: 'README', desc: 'Panduan ini — Anda berada di sini' },
              ].map((item, idx) => (
                <div key={idx} className="p-3 border border-zinc-800 rounded-lg bg-hmi-elevated">
                  <p className="text-[11px] font-bold text-hmi-ideal font-mono">{item.tab}</p>
                  <p className="text-[9.5px] text-zinc-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
            <Callout type="tip">
              Gunakan <strong>Command Palette (<kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">Ctrl + K</kbd> atau <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">Cmd + K</kbd>)</strong> untuk berpindah antara dashboard Utama, ZN Tuner (<InlineCode>/zn</InlineCode>), dan Halaman Pengujian (<InlineCode>/test</InlineCode>) tanpa memutuskan koneksi serial.
            </Callout>
          </section>

          {/* 💡 SECTION: CONNECT */}
          <section id="connect" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>1. Menghubungkan HMI</span>
              <a href="#connect" onClick={(e) => { e.preventDefault(); handleScrollTo('#connect') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              HMI berkomunikasi dengan mikrokontroler (ESP32) secara langsung melalui serial USB menggunakan **Web Serial API** modern yang terintegrasi di dalam browser web yang kompatibel. Ini memberikan pengalaman plug-and-play tanpa menginstal perangkat lunak perantara tambahan.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Panduan Koneksi Langkah Demi Langkah</h3>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-zinc-400 mb-5 leading-relaxed">
              <li>Hubungkan ESP32 Anda ke komputer via kabel micro-USB atau USB-C standar.</li>
              <li>Pastikan Anda menjalankan HMI di <strong className="text-zinc-300">Google Chrome</strong> atau <strong className="text-zinc-300">Microsoft Edge</strong>, karena Safari dan Firefox saat ini belum mendukung protokol Web Serial.</li>
              <li>Klik tombol <InlineCode>Connect</InlineCode> yang terletak di sisi kanan bar header utama.</li>
              <li>Pilih port COM mikrokontroler Anda pada popup browser (sering kali berlabel <span className="italic">USB-to-UART Bridge</span> atau <span className="italic">COMx</span>) dan klik **Connect**.</li>
              <li>Setelah terhubung, HMI akan mengirim perintah <InlineCode>getgains</InlineCode> dan <InlineCode>getparams</InlineCode>, kemudian mulai mengirim <InlineCode>ping</InlineCode> untuk menjaga watchdog firmware tetap aktif.</li>
              <li>Status <strong className="text-zinc-300">Mode Badge</strong> di header menunjukkan mode firmware saat ini. HMI secara otomatis mengirimkan <InlineCode>mode,scara</InlineCode> ketika Anda berada di halaman utama.</li>
            </ol>

            <Callout type="tip">
              <strong>Mekanisme Re-koneksi Otomatis:</strong> Jika koneksi terputus karena kabel longgar, HMI akan menampilkan status berwarna amber <InlineCode>⚠ Menghubungkan Kembali…</InlineCode> dan secara otomatis memindai setiap 2 detik untuk memulihkan aliran serial setelah perangkat dicolokkan kembali.
            </Callout>

            <Callout type="warn">
              Baud rate komunikasi diatur tetap pada nilai <strong>921600</strong>. Firmware Anda harus memanggil <InlineCode>Serial.begin(921600)</InlineCode> agar sesuai dengan baud rate ini.
            </Callout>

            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Referensi Badge Status</h3>
            <PropertyList>
              <Property
                name="● COM (10c4:ea60)"
                type="KONEKSI AKTIF"
                description="Antarmuka serial berhasil terhubung. Data langsung mengalir aktif ke panel."
              />
              <Property
                name="⚠ Reconnecting…"
                type="STATUS MENCOBA KEMBALI"
                description="Kabel USB terputus. Sistem sedang memindai untuk secara otomatis memulihkan koneksi tanpa perlu memuat ulang halaman."
              />
              <Property
                name="○ Not connected"
                type="TIDAK TERHUBUNG"
                description="Tidak ada koneksi serial yang terbuka. Klik tombol Connect untuk membuka prompt browser."
              />
              <Property
                name="● Online / ○ Offline"
                type="STATUS JARINGAN"
                description="Menunjukkan konektivitas internet komputer Anda. Karena Web Serial berjalan sepenuhnya secara lokal, pelacakan HMI bekerja dengan sempurna secara offline."
              />
            </PropertyList>
          </section>

          {/* 💡 SECTION: MOVE */}
          <section id="move" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>2. Mengirim Perintah Gerak</span>
              <a href="#move" onClick={(e) => { e.preventDefault(); handleScrollTo('#move') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Dengan koneksi serial yang aktif, Anda dapat menginstruksikan robot SCARA untuk menggerakkan end-effector (EEF) ke koordinat target X dan Y.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Protokol Eksekusi</h3>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-zinc-400 mb-5 leading-relaxed">
              <li>Buka **Control Panel** yang tersemat di bagian bawah tab Monitor.</li>
              <li>Pada kartu **Move target**, masukkan target koordinat akhir <InlineCode>Xf</InlineCode> dan <InlineCode>Yf</InlineCode> dalam milimeter.</li>
              <li>Tentukan arah Elbow (Siku). <InlineCode>Right (+1)</InlineCode> mewakili konfigurasi kinematika siku-ke-atas (elbow-up) standar; <InlineCode>Left (-1)</InlineCode> mengatur siku-ke-bawah (elbow-down).</li>
              <li>Klik <InlineCode>Send Move</InlineCode> atau tekan <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">Enter</kbd> untuk mengirimkan perintah.</li>
              <li>Sebagai alternatif, gunakan tombol <strong>Run + Save</strong> di header untuk menangkap koordinat target saat ini, memicu gerakan, dan menyimpan telemetri lengkap ke basis data Turso (memerlukan masuk Google).</li>
              <li>Kanvas akan diperbarui, melacak jalur yang direncanakan dengan warna biru dan mencatat data posisi aktual saat data tersebut tiba.</li>
            </ol>

            <Callout type="info">
              <strong>Batas Ruang Kerja Geometris:</strong> Robot dibatasi secara fisik oleh link mekaniknya ke sebuah annular sector (sektor melingkar): jarak radial <strong className="text-zinc-200">70.7 mm hingga 170 mm</strong> dan batas sudut <strong className="text-zinc-200">-30° hingga 210°</strong>. Koordinat di luar wilayah ini akan menyebabkan kalkulasi kinematika invers (IK) pada ESP32 gagal.
            </Callout>

            <Callout type="danger">
              <strong>Validasi Keamanan Trajektori:</strong> HMI menyertakan lapisan keamanan yang memeriksa semua gerakan garis lurus. Jika jalur melintasi lingkaran singularitas dalam (R &lt; 70.7 mm), melebihi jangkauan luar (R &gt; 170 mm), atau berada di bawah bidang horizontal (Y &lt; 0), HMI akan menonaktifkan perintah gerakan, menampilkan detail peringatan validasi di Control Panel, dan menampilkan jalur peringatan merah pada kanvas.
            </Callout>
          </section>

          {/* 💡 SECTION: MODES */}
          <section id="modes" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>3. Mode Operasi</span>
              <a href="#modes" onClick={(e) => { e.preventDefault(); handleScrollTo('#modes') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Firmware ESP32 memiliki empat mode operasi. HMI beralih mode secara otomatis saat Anda bernavigasi di antara halaman, tetapi Anda juga dapat mengirimkan perintah mode secara manual dari monitor serial.
            </p>
            <PropertyList>
              <Property name="IDLE" type="DEFAULT AMAN" description="Semua motor mati. Firmware kembali ke status ini setelah 8 detik hening dari serial kecuali ping dikirimkan." />
              <Property name="SCARA" type="HALAMAN UTAMA" description="Operasi Kartesian penuh. Kirim move,X,Y dari Control Panel. Digunakan pada halaman utama (/)." />
              <Property name="ZN" type="HALAMAN ZN" description="Tuning tingkat sendi (joint-level). Kirim perintah langkah t1,deg atau t2,deg. Digunakan pada halaman /zn." />
              <Property name="TEST" type="HALAMAN PENGUJIAN" description="Serupa dengan SCARA tetapi ke-33 parameter runtime dapat disesuaikan secara langsung. Digunakan pada halaman /test." />
            </PropertyList>
            <Callout type="warn">
              Jika robot berhenti merespons, periksa apakah badge mode menampilkan <InlineCode>IDLE</InlineCode>. Klik <InlineCode>Connect</InlineCode> atau navigasikan ke halaman yang benar untuk memulihkan mode yang diharapkan.
            </Callout>
          </section>

          {/* 💡 SECTION: PAGES NAV */}
          <section id="pages-nav" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Rute Aplikasi &amp; Navigasi</span>
              <a href="#pages-nav" onClick={(e) => { e.preventDefault(); handleScrollTo('#pages-nav') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              HMI memiliki beberapa rute yang berbagi satu koneksi Web Serial dan state context yang sama. Beralih antar halaman dengan mencari di Command Palette (<InlineCode>Ctrl + K</InlineCode> atau <InlineCode>Cmd + K</InlineCode>).
            </p>
            <PropertyList>
              <Property name="/ (Beranda)" type="MODE SCARA" description="Tab Monitor, Analisis, Step & Noise, dan README. Dashboard utama untuk gerakan Kartesian dan diagnosis pasca-gerakan." />
              <Property name="/zn" type="MODE ZN" description="Halaman khusus tuning Ziegler-Nichols dengan perintah langkah per sendi dan penganalisis kaliper." />
              <Property name="/test" type="MODE TEST" description="Papan pengujian teknik dengan tab Monitor, Analisis (+ sinyal mentah), Step & Noise, dan Params Tuner." />
              <Property name="/pcb" type="RUTE PUBLIK" description="Penampil detail PCB interaktif dengan pencarian penempatan komponen SVG layout, penampil skematik, dan CAD assembly 3D." />
              <Property name="/login" type="RUTE PUBLIK" description="Portal autentikasi menggunakan NextAuth.js untuk masuk via Google. Membuka fitur penyimpanan ke basis data dan riwayat run." />
              <Property name="/dashboard" type="RUTE TERPROTEKSI" description="Dashboard perbandingan riwayat gerakan yang disimpan. Pilih beberapa run untuk membandingkan trajektori, kecepatan, nilai feedforward, dan metrik performa." />
            </PropertyList>
          </section>

          <section id="zn-page" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Halaman ZN Tuner (/zn)</span>
              <a href="#zn-page" onClick={(e) => { e.preventDefault(); handleScrollTo('#zn-page') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Navigasikan ke <InlineCode>/zn</InlineCode> untuk melakukan tuning Ziegler-Nichols sendi secara klasik. Halaman ini mengirimkan <InlineCode>mode,zn</InlineCode> secara otomatis dan menyediakan kontrol kenaikan gain, perintah langkah <InlineCode>t1</InlineCode>/<InlineCode>t2</InlineCode>, serta grafik live target-vs-aktual dalam derajat.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Gunakan alat geser kaliper pada grafik untuk mengukur ultimate period (<InlineCode>Tu</InlineCode>) dan menghasilkan gain rekomendasi P, PI, dan PID dari tabel aturan ZN.
            </p>
          </section>

          <section id="test-page" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Halaman Pengujian (/test)</span>
              <a href="#test-page" onClick={(e) => { e.preventDefault(); handleScrollTo('#test-page') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Halaman Pengujian menambahkan alat rekayasa di atas rangkaian fitur beranda:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li><strong>Params Tuner</strong> — sesuaikan seluruh 33 parameter runtime (batas kecepatan, batas akselerasi, bandwidth filter, deadband, flag trajektori, gain VFF) secara langsung dengan LED status sinkronisasi.</li>
              <li><strong>Bagian Sinyal Mentah</strong> — tumpuk pembacaan ADC mentah di atas data posisi terfilter untuk mendiagnosis noise sensor.</li>
              <li>Memiliki tab Monitor, Analisis, dan Step & Noise yang sama seperti halaman utama.</li>
            </ul>
          </section>

          <section id="pcb-page" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Halaman Penampil PCB (/pcb)</span>
              <a href="#pcb-page" onClick={(e) => { e.preventDefault(); handleScrollTo('#pcb-page') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Navigasikan ke <InlineCode>/pcb</InlineCode> untuk diagnostik perangkat keras interaktif dan referensi skematik papan:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li><strong>SVG Layout Interaktif</strong> — klik komponen pada grafis PCB untuk melihat detail peran, desainator referensi, dan fungsi perangkat kerasnya.</li>
              <li><strong>Penampil Skematik</strong> — lihat diagram sirkuit resolusi tinggi secara langsung di aplikasi.</li>
              <li><strong>Penampil CAD 3D</strong> — jelajahi perakitan CAD struktural 3D dari papan pengendali.</li>
              <li><strong>Alokasi GPIO</strong> — cari pemetaan pin mikrokontroler ESP32 ke konfigurasi stepper, sakelar pembatas (limit switch), dan output PWM motor DC.</li>
            </ul>
          </section>

          <section id="dashboard-page" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Dashboard Run Tersimpan (/dashboard)</span>
              <a href="#dashboard-page" onClick={(e) => { e.preventDefault(); handleScrollTo('#dashboard-page') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Setelah masuk via Google, pengguna dapat melihat riwayat run mereka. Ketika Anda mengirim gerakan menggunakan mode <strong>Run + Save</strong> di halaman utama, seluruh trajektori, log sampel feedback, gain, dan state parameter akan disimpan di basis data Turso.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Di dashboard riwayat, Anda dapat:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li><strong>Pilih Run</strong> — pilih hingga 4 run di sidebar untuk dibandingkan.</li>
              <li><strong>Bandingkan Trajektori</strong> — tumpuk beberapa trajektori aktual pada kanvas XY dengan warna yang berbeda.</li>
              <li><strong>Analisis Respons Kontrol</strong> — bandingkan kecepatan sendi, effort feedback, error pelacakan, dan gaya feedforward menggunakan tab khusus (Trajectory, Velocity, PID, Feedforward, Metrics, Advanced).</li>
              <li><strong>Hapus Run</strong> — klik tombol hapus di daftar sidebar untuk menghapus run dari basis data cloud.</li>
            </ul>
          </section>
          {/* 💡 SECTION: XY TRACE */}
          <section id="xy-trace" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Visualisasi Ruang Kerja 3D</span>
              <a href="#xy-trace" onClick={(e) => { e.preventDefault(); handleScrollTo('#xy-trace') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Diposisikan di sisi kiri tab Monitor, **Visualisasi Ruang Kerja 3D** merender visualisasi WebGL real-time (didukung oleh React Three Fiber dan Three.js) dari amplop ruang kerja lengan SCARA, konfigurasi sendi, dan trajektori.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Elemen Indikator Visual</h3>
            <PropertyList>
              <Property
                name="Trajektori Ideal"
                type="GARIS BIRU PUTUS-PUTUS"
                description="Jalur referensi yang dihasilkan oleh generator trajektori pada ESP32 yang mewakili target gerakan matematis (#2563EB)."
              />
              <Property
                name="Jalur Feedback Aktual"
                type="GARIS MERAH SOLID"
                description="Posisi real-time dari end-effector yang dihitung melalui kinematika maju (forward kinematics) dari sudut encoder dan potensiometer aktual (#DC2626)."
              />
              <Property
                name="Overlay Link CAD 3D"
                type="BASE NETRAL, LINK BIRU & ORANYE"
                description="Model CAD 3D yang menyesuaikan tema: base statis abu-abu netral dan J1 biru berbagi origin SolidWorks pada Z=62 mm; J2 oranye dipasang pada Z=32 mm."
              />
              <Property
                name="Ruang Kerja Terjangkau"
                type="SEKTOR BIRU ELEKTRIK / CYAN"
                description="Sektor operasi melingkar yang cocok dengan singularitas zona mati dalam (70.7 mm) dan jangkauan luar (170 mm). Dirender dalam warna biru elektrik yang dinamis (#00e5ff) dalam mode gelap, dan cyan dalam mode terang."
              />
              <Property
                name="Ghost Trail"
                type="OVERLAY SAMAR"
                description="Jalur lintasan dari gerakan sebelumnya, memungkinkan perbandingan visual langsung secara berdampingan untuk penyesuaian tuning yang berurutan."
              />
            </PropertyList>

            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Kontrol Ruang Kerja &amp; Badge Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
              <div className="p-4 rounded-xl border border-zinc-800 bg-[#141418]/20">
                <p className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-2">Kontrol Ruang Kerja</p>
                <ul className="space-y-1.5 text-xs text-zinc-400 leading-relaxed list-disc pl-4">
                  <li><strong>OrbitControls:</strong> Klik-kiri dan seret untuk memutar, klik-kanan dan seret untuk menggeser (pan), dan gulir (scroll) untuk memperbesar/memperkecil.</li>
                  <li><strong>Reset:</strong> Mengembalikan kamera kembali ke tampilan atas (top-down) sempurna yang berpusat pada ruang kerja, menggunakan offset sumbu Z kecil (-0.074999) untuk menghindari gimbal lock/singularitas polar.</li>
                  <li><strong>Ghost:</strong> Beralih visibilitas overlay trajektori sebelumnya.</li>
                  <li><strong>Arms:</strong> Sembunyikan/tampilkan model CAD 3D lengan fisik.</li>
                  <li><strong>Focus (⊕):</strong> Membuka tampilan layar penuh. Tekan <kbd className="text-[10px] px-1 bg-zinc-800 rounded border border-zinc-700">ESC</kbd> untuk kembali.</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800 bg-[#141418]/20">
                <p className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-2">Indikator Status</p>
                <ul className="space-y-1.5 text-xs text-zinc-400 leading-relaxed list-disc pl-4">
                  <li><strong>⏺ REC:</strong> Gerakan aktif sedang berjalan; buffer masuk sedang ditulis.</li>
                  <li><strong>⏹ IDLE:</strong> Trajektori telah berakhir. Statistik dikunci dan dianalisis.</li>
                  <li><strong>⏸ WAITING:</strong> Terhubung, menunggu pemicu gerakan pertama.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 💡 SECTION: TELEMETRY CHARTS */}
          <section id="charts" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Grafik Telemetri</span>
              <a href="#charts" onClick={(e) => { e.preventDefault(); handleScrollTo('#charts') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Panel grafik menyediakan tujuh sub-tab interaktif yang melacak variabel sistem kontrol dari waktu ke waktu. Klik <strong className="text-zinc-300">Focus (⊕)</strong> pada grafik apa pun untuk membuka Advanced Analyzer dengan kaliper, zoom, dan alat geser (pan). Grafik membeku ketika gerakan berakhir.
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Visualisasi yang Tersedia</h3>
            <PropertyList>
              <Property name="CTE (mm)" type="CROSS-TRACK ERROR" description="Penyimpangan lateral dari jalur ideal — jarak tegak lurus dari posisi aktual ke segmen trajektori yang direncanakan." />
              <Property name="ATE (mm)" type="ALONG-TRACK ERROR" description="Error mendahului/tertinggal sepanjang arah jalur. Positif berarti robot berada di depan; negatif berarti tertinggal di belakang." />
              <Property name="Position" type="SUDUT SENDI" description="θ1 dan θ2 dibandingkan referensi yang diinginkan. Satuan mengikuti pengaturan global radian/derajat." />
              <Property name="Velocity" type="KECEPATAN SENDI" description="Kecepatan sudut sendi dibandingkan referensi yang diinginkan." />
              <Property name="PID" type="RINCIAN J1" description="Kontribusi komponen proporsional, integral, dan derivatif Sendi 1 dari waktu ke waktu." />
              <Property name="J1 Ctrl" type="SINYAL GABUNGAN" description="Sinyal kontrol total Sendi 1 termasuk komponen feedforward dan feedback." />
              <Property name="J2 Vel" type="PERINTAH STEPPER" description="Kecepatan sudut yang diperintahkan ke motor stepper." />
            </PropertyList>
          </section>

          {/* 💡 SECTION: METRICS PANEL */}
          <section id="metrics" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Panel Metrik Run</span>
              <a href="#metrics" onClick={(e) => { e.preventDefault(); handleScrollTo('#metrics') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Di bawah grafik pada tab Monitor, kisi <strong className="text-zinc-300">Metrik Run</strong> meringkas trajektori terakhir yang selesai. Arahkan kursor ke sel mana pun untuk penjelasan tooltip.
            </p>
            <PropertyList>
              <Property name="AI" description="Indeks Akurasi — 1 dikurangi rata-rata CTE dibagi dengan panjang jalur. 100% berarti pelacakan sempurna." />
              <Property name="εmax / MCTE" description="Error pelacakan silang (cross-tracking) puncak dan rata-rata dalam milimeter." />
              <Property name="RMS ATE" description="Root-mean-square error pelacakan sepanjang jalur tanpa pembatalan tanda (sign cancellation)." />
              <Property name="Rε" description="Rasio bias error — apakah error didominasi oleh penundaan (delay) (>50%) atau distorsi bentuk." />
              <Property name="RMSE J1/J2/EEF" description="RMSE posisi per sendi dan end-effector." />
              <Property name="Ctrl Var / Jitter" description="Variansi PWM dan rata-rata perubahan langkah-ke-langkah — indikator chatter kontrol." />
              <Property name="Settle" description="Waktu hingga end-effector tetap berada di dalam batas 2 mm dari target." />
            </PropertyList>
          </section>

          {/* 💡 SECTION: CONTROL PANEL */}
          <section id="control-panel" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Bar Control Panel Tersemat</span>
              <a href="#control-panel" onClick={(e) => { e.preventDefault(); handleScrollTo('#control-panel') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Tersemat di bagian bawah halaman Monitor, Control Panel mengatur kontrol interaksi fisik. Menekan Enter akan memicu pengiriman segera.
            </p>

            <PropertyList>
              <Property
                name="Input target gerakan"
                type="KOORDINAT"
                description="Kolom untuk mengatur Xf, Yf, dan arah Elbow (-1 atau +1). Mengirimkan string serial 'move,X,Y'."
              />
              <Property
                name="J1 — DC PID (Biru)"
                type="GAIN PARAMETER"
                description="Mengatur komponen proporsional (Kp1), integral (Ki1), dan derivatif (Kd1) Sendi 1. Kolom ini memiliki indikator tepi kiri biru solid. Mengeklik Apply akan langsung mengirimkan gain."
              />
              <Property
                name="J2 — Stepper PID (Oranye)"
                type="GAIN PARAMETER"
                description="Mengatur gain stepper Sendi 2. Dibungkus dengan indikator tepi kiri berwarna oranye untuk mencegah kekeliruan."
              />
              <Property
                name="Pembagi langkah (microstep)"
                type="KONFIGURASI DRIVER"
                description="Mengonfigurasi subdivisi langkah (Full, Half, 1/4, 1/8, 1/16) untuk driver stepper. Memilih pembagi akan mengirimkan 'mstep,N' melalui serial."
              />
              <Property
                name="Pencampuran feedforward"
                type="KONFIGURASI CTC"
                description="Faktor pencampuran feedforward untuk Inersia (ffi), Coriolis (ffc), dan gravitasi (ffg) dari 0.0 (murni PID) hingga 1.0 (bantuan model penuh)."
              />
            </PropertyList>
            <Callout type="danger">
              Tombol <strong>🛑 Stop</strong> pada header mengirimkan <InlineCode>estop</InlineCode> secara instan. Setelah E-STOP, tombol berubah menjadi <strong>🔄 RESUME</strong> yang mengirimkan <InlineCode>resume</InlineCode> untuk mengaktifkan kembali output motor tanpa melakukan gerakan.
            </Callout>
          </section>

          {/* 💡 SECTION: ADVANCED ANALYSIS */}
          <section id="advanced" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Plot Analisis Lanjutan</span>
              <a href="#advanced" onClick={(e) => { e.preventDefault(); handleScrollTo('#advanced') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Buka sub-panel **Analisis Lanjutan** pada tab Analisis untuk melihat alat analisis sistem:
            </p>

            <PropertyList>
              <Property name="Phase Portrait" type="STATE-SPACE" description="Posisi vs kecepatan sendi untuk kedua sendi. Sistem yang stabil berputar spiral ke dalam; loop menunjukkan osilasi limit-cycle." />
              <Property name="EEF Error & Velocity" type="KARTESIAN" description="Profil error Kartesian dan kecepatan end-effector dari run trajektori yang dibekukan." />
              <Property name="PWM & Control Effort" type="KERJA AKTUATOR" description="Sinyal penggerak motor dan effort kontrol terintegrasi (∫|PWM|dt)." />
              <Property name="CTC Feedforward Torques" type="BERBASIS MODEL" description="Komponen feedforward inersia, Coriolis, dan gravitasi per sendi dari model computed torque." />
              <Property name="Control Internal" type="INTEGRATOR" description="Pelacakan buffer integrator J1 — menunjukkan pemulihan dari integral windup." />
              <Property name="Stepper Velocity" type="KECEPATAN PERINTAH" description="Kecepatan perintah dari penggerak stepper (J2)." />
              <Property name="PID Breakdown" type="KOMPONEN P, I, D" description="Pemisahan kontribusi komponen proporsional, integral, dan derivatif Sendi 1 sepanjang run." />
              <Property name="Loop Duration" type="WAKTU" description="Waktu eksekusi loop kontrol mikrokontroler dalam mikrodetik (~80 µs)." />
            </PropertyList>
          </section>

          <section id="comparison-table" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Tabel Data &amp; Ekspor CSV</span>
              <a href="#comparison-table" onClick={(e) => { e.preventDefault(); handleScrollTo('#comparison-table') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Buka bagian <strong className="text-zinc-300">Tabel Data Ideal vs Aktual</strong> di bagian bawah tab Analisis untuk tampilan per sampel yang terpaginasi. Ekspor dataset lengkap sebagai CSV dari tabel atau melalui pengemas ZIP di menu pengaturan ☰.
            </p>
          </section>

          {/* 💡 SECTION: REST ANALYSIS */}
          <section id="rest-about" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Tab Step & Noise</span>
              <a href="#rest-about" onClick={(e) => { e.preventDefault(); handleScrollTo('#rest-about') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Tab <strong className="text-zinc-300">Step & Noise</strong> di halaman utama menyediakan ruang kerja telemetri kontinu berkecepatan tinggi untuk studi respons-langkah dan keadaan-diam. Berbeda dengan tab Monitor (yang mencatat buffer per gerakan), tab ini mengakumulasi data secara kontinu dan mendukung analisis berbasis kaliper.
            </p>
            <Callout type="info">
              Untuk tuning sendi Ziegler-Nichols khusus dengan kontrol kenaikan gain, gunakan halaman <strong>ZN Tuner</strong> terpisah di <InlineCode>/zn</InlineCode> (lihat Rute Aplikasi & Navigasi di atas).
            </Callout>
          </section>

          <section id="rest-interface" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Ruang Kerja Step &amp; Noise</span>
              <a href="#rest-interface" onClick={(e) => { e.preventDefault(); handleScrollTo('#rest-interface') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Ruang kerja ini memiliki sidebar kontrol dan aliran grafik kontinu. Data tetap tersimpan di penyimpanan lokal (local storage) meskipun halaman dimuat ulang.
            </p>
            <h3 className="text-sm font-semibold text-zinc-200 mt-5 mb-2">Kontrol Ruang Kerja</h3>
            <PropertyList>
              <Property name="Selektor Sendi" description="Beralih antara Sendi 1 (motor DC) dan Sendi 2 (stepper) untuk analisis." />
              <Property name="Mode Tampilan" description="Tampilan Posisi, ADC Mentah, Bandingkan (terfilter vs mentah), Kecepatan, dan spektrum FFT." />
              <Property name="Target Langkah" description="Kirim perintah t1,deg atau t2,deg untuk memicu respons langkah pada sendi yang aktif." />
              <Property name="Bekukan / Gulir" description="Jeda grafik langsung untuk memeriksa segmen tertentu, atau kunci viewport sementara data terus di-buffer di latar belakang." />
              <Property name="Ekspor CSV" description="Ekspor seluruh buffer, area pilihan kaliper, 10/20 detik terakhir, atau jendela penanda run." />
            </PropertyList>
          </section>

          <section id="rest-calipers" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Penganalisis Kaliper</span>
              <a href="#rest-calipers" onClick={(e) => { e.preventDefault(); handleScrollTo('#rest-calipers') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Untuk menganalisis karakteristik transien atau periode osilasi, klik dan seret pada grafik timeline langsung untuk menentukan jendela analisis. Tindakan ini akan mengunci timeline dan mengisi tiga tab analisis:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 mb-6 leading-relaxed">
              <li><strong>Metode ZN:</strong> Memindai segmen yang dipilih untuk mendeteksi puncak osilasi guna menghitung <InlineCode>Tu</InlineCode>, <InlineCode>fu</InlineCode>, amplitudo peak-to-peak, dan RMS error pelacakan. Ini menghasilkan tabel rekomendasi gain untuk aturan P, PI, PID, Some Overshoot, dan No Overshoot.</li>
              <li><strong>Respons Langkah:</strong> Mendeteksi transisi perintah secara otomatis untuk menghitung Rise Time (10-90% dan 0-100%), Settling Time (dalam pita ±2% dan ±5%), persentase Overshoot, Rasio Redaman ($\zeta$), dan frekuensi alami ($f_n$).</li>
              <li><strong>Statistik Diam:</strong> Menampilkan nilai rata-rata pelacakan, standar deviasi, deviasi peak-to-peak, dan indikator rasio sinyal-ke-noise (SNR) untuk menilai jitter saat diam.</li>
            </ul>
            
            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Aturan Parameter Ziegler-Nichols</h3>
            <div className="overflow-x-auto my-3 border border-zinc-850 rounded-xl">
              <table className="min-w-full divide-y divide-zinc-850 bg-hmi-elevated/50 text-[11px] font-sans text-zinc-400">
                <thead className="bg-hmi-panel text-zinc-300">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Aturan Tuning</th>
                    <th className="px-4 py-2 text-left font-semibold">Kp (Proporsional)</th>
                    <th className="px-4 py-2 text-left font-semibold">Ki (Integral)</th>
                    <th className="px-4 py-2 text-left font-semibold">Kd (Derivatif)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60">
                  <tr>
                    <td className="px-4 py-2 font-medium text-zinc-200">Kontrol P</td>
                    <td className="px-4 py-2 font-mono">0.50 × Ku</td>
                    <td className="px-4 py-2 font-mono">—</td>
                    <td className="px-4 py-2 font-mono">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-zinc-200">Kontrol PI</td>
                    <td className="px-4 py-2 font-mono">0.45 × Ku</td>
                    <td className="px-4 py-2 font-mono">0.54 × Ku / Tu</td>
                    <td className="px-4 py-2 font-mono">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-zinc-200">PID Klasik</td>
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
              <span>Monitor Serial</span>
              <a href="#serial-monitor" onClick={(e) => { e.preventDefault(); handleScrollTo('#serial-monitor') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Klik tombol <strong className="text-zinc-300">Serial Monitor</strong> pada header untuk membuka panel log bawah bergaya VS Code. Paket berfrekuensi tinggi seperti <InlineCode>T</InlineCode> dan <InlineCode>D</InlineCode> disaring keluar; baris status akan muncul dengan badge berkode warna (<InlineCode>MOVE</InlineCode>, <InlineCode>DONE</InlineCode>, <InlineCode>GAINS</InlineCode>). Tekan <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">ESC</kbd> atau klik tombol itu kembali untuk menutup. Seret tepi atas panel untuk mengubah ukuran.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li><strong>Hapus Log</strong> — menghapus entri konsol lokal.</li>
              <li><strong>Hapus Grafik</strong> — menghapus buffer grafik dan mengirimkan <InlineCode>clrgraph</InlineCode> ke firmware (shortcut keyboard: <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 font-mono">c</kbd>).</li>
            </ul>
            <Callout type="info">
              Pesan firmware dengan awalan <InlineCode>INFO:</InlineCode>, <InlineCode>WARN:</InlineCode>, atau <InlineCode>ERR:</InlineCode> juga akan muncul sebagai notifikasi toast di pojok kanan bawah.
            </Callout>
          </section>

          <section id="settings-menu" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Menu Pengaturan (☰)</span>
              <a href="#settings-menu" onClick={(e) => { e.preventDefault(); handleScrollTo('#settings-menu') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Tombol ☰ di header membuka sidebar pengaturan dengan empat bagian:
            </p>
            <PropertyList>
              <Property name="Preferensi Dashboard" description="Beralih satuan sudut (radian/derajat) dan sesuaikan opasitas ghost trail pada visualisasi 3D." />
              <Property name="Bantuan &amp; Panduan Pengguna" description="Luncurkan kembali panduan tur interaktif langkah-demi-langkah kapan saja." />
              <Property name="Ekspor Grafik" description="Unduh masing-masing grafik sebagai PNG/JPEG pada resolusi DPI 1×, 2×, atau 3×, atau kemas semua grafik + CSV + laporan parameter ke dalam file ZIP." />
              <Property name="Shortcut Keyboard" description="Lihat dan petakan ulang hotkey untuk perpindahan tab, E-STOP, toggle ghost trail, koneksi serial, dan lainnya." />
            </PropertyList>
          </section>

          <section id="keyboard-shortcuts" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Shortcut Keyboard</span>
              <a href="#keyboard-shortcuts" onClick={(e) => { e.preventDefault(); handleScrollTo('#keyboard-shortcuts') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Shortcut dinonaktifkan saat Anda mengetik di kolom input. Petakan ulang tombol apa pun di menu pengaturan ☰.
            </p>
            <div className="overflow-x-auto my-3 border border-zinc-850 rounded-xl">
              <table className="min-w-full divide-y divide-zinc-850 bg-hmi-elevated/50 text-[11px] font-sans text-zinc-400">
                <thead className="bg-hmi-panel text-zinc-300">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Tombol</th>
                    <th className="px-4 py-2 text-left font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60">
                  {[
                    ['1', 'Beralih ke tab Monitor'],
                    ['2', 'Beralih ke tab Analisis'],
                    ['3', 'Beralih ke tab README'],
                    ['Backspace', 'Emergency Stop (Berhenti Darurat)'],
                    ['p', 'Beralih mode pick-point pada visualisasi 3D'],
                    ['x / y', 'Fokuskan kolom input Xf / Yf'],
                    ['g', 'Beralih visibilitas ghost trail'],
                    ['a', 'Beralih visibilitas link lengan'],
                    ['c', 'Hapus grafik & buffer'],
                    ['m', 'Beralih menu pengaturan'],
                    ['s', 'Hubungkan / Putuskan serial'],
                    ['r', 'Hubungkan kembali port terakhir'],
                    ['d', 'Unduh grafik'],
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
              <span>Istilah Kunci: Kontrol &amp; Gerakan</span>
              <a href="#terms-control" onClick={(e) => { e.preventDefault(); handleScrollTo('#terms-control') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Definisi standar dari istilah sistem kontrol yang digunakan di seluruh HMI:
            </p>

            <PropertyList>
              <Property
                name="Computed Torque Control (CTC)"
                description="Skema kontrol feedforward berbasis model untuk mengompensasi dinamika SCARA: M(q)·ddq + C(q,dq)·dq + G(q) = torsi, memadukan perhitungan inersia, Coriolis, dan gravitasi."
              />
              <Property
                name="Tracking Differentiator (TD)"
                description="Filter nonlinier orde dua yang mengestimasi posisi sudut (v1) dan kecepatan sudut (v2) yang bersih dari sinyal potensiometer ADC mentah yang berisik."
              />
              <Property
                name="End-Effector (EEF)"
                description="Ujung lengan robot SCARA. HMI melacak gerakan dalam koordinat Kartesian (X, Y) dari titik ini."
              />
              <Property
                name="Profil Trajektori"
                description="Jalur yang direncanakan dan dihitung oleh firmware untuk bergerak dari titik awal ke koordinat tujuan, menentukan posisi dan kecepatan yang direncanakan pada setiap titik waktu."
              />
              <Property
                name="Error / Penyimpangan"
                description="Jarak Euclidean (dalam milimeter) antara posisi end-effector yang seharusnya dengan posisi aktualnya: √((xi - xa)² + (yi - ya)²)."
              />
              <Property
                name="Rise Time"
                description="Waktu atau jumlah sampel yang dibutuhkan robot untuk pertama kalinya mencapai nilai target (biasanya diukur dari 10% hingga 90% dari rentang gerakan)."
              />
              <Property
                name="Overshoot"
                description="Nilai lonjakan posisi robot yang melebihi posisi target, dinyatakan sebagai persentase dari total rentang gerakan."
              />
              <Property
                name="Settling Time"
                description="Waktu yang dibutuhkan robot untuk menjadi tenang dan tetap berada di dalam jendela error kecil (±2% atau ±5%) di sekitar target."
              />
              <Property
                name="Steady-State Error"
                description="Error persisten yang tersisa setelah robot berhenti bergerak dan tenang."
              />
            </PropertyList>
          </section>

          <section id="terms-cte" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Istilah Kunci: Error CTE &amp; ATE</span>
              <a href="#terms-cte" onClick={(e) => { e.preventDefault(); handleScrollTo('#terms-cte') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <PropertyList>
              <Property name="CTE (Cross Tracking Error)" description="Jarak tegak lurus dari posisi aktual end-effector ke titik terdekat pada segmen jalur ideal. Mengukur seberapa jauh robot keluar dari jalur." />
              <Property name="ATE (Along Tracking Error)" description="Error bertanda sepanjang arah jalur. Positif = mendahului jadwal; negatif = tertinggal di belakang." />
              <Property name="MCTE" description="Rata-rata CTE yang diintegrasikan terhadap panjang jalur — metrik akurasi pelacakan utama di Metrik Run." />
              <Property name="Accuracy Index (AI)" description="1 − MCTE/D di mana D adalah panjang jalur total. 100% = pelacakan sempurna." />
              <Property name="Bias Error (Rε)" description="Rasio yang menunjukkan apakah error pelacakan didominasi oleh penundaan (delay) (>50%) atau distorsi bentuk (<50%)." />
            </PropertyList>
          </section>

          {/* 💡 SECTION: TERMS PID */}
          <section id="terms-pid" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Istilah Kunci: Gain Tuning PID</span>
              <a href="#terms-pid" onClick={(e) => { e.preventDefault(); handleScrollTo('#terms-pid') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Penjelasan parameter Proportional-Integral-Derivative:
            </p>

            <PropertyList>
              <Property
                name="Kp — Proportional Gain"
                description="Menentukan seberapa kuat motor bergerak sebanding dengan error posisi saat ini. Nilai yang lebih tinggi mempercepat respons tetapi menyebabkan overshoot dan osilasi jika terlalu tinggi."
              />
              <Property
                name="Ki — Integral Gain"
                description="Mengoreksi error kecil dan persisten yang terakumulasi dari waktu ke waktu. Nilai yang lebih tinggi menghilangkan steady-state error tetapi dapat menyebabkan osilasi lambat atau overshoot."
              />
              <Property
                name="Kd — Derivative Gain"
                description="Meredam gerakan dengan merespons laju perubahan error posisi. Membantu mengurangi overshoot dan meredam osilasi, tetapi dapat memperkuat noise sensor jika disetel terlalu tinggi."
              />
              <Property
                name="Microstepping (Sendi 2)"
                description="Membagi satu langkah penuh motor menjadi peningkatan yang lebih kecil (hingga 1/16). Menghaluskan gerakan motor stepper dan mengurangi noise mekanis, tetapi sedikit mengurangi torsi."
              />
            </PropertyList>

            <Callout type="tip">
              Alur kerja tuning: Mulai dengan <strong>Kp saja</strong> sampai sistem merespons dengan cepat. Selanjutnya, tambahkan <strong>Kd</strong> untuk mengurangi overshoot dan osilasi. Terakhir, tambahkan sedikit <strong>Ki</strong> untuk menghilangkan steady-state error yang tersisa.
            </Callout>
          </section>

          {/* 💡 SECTION: TERMS MOTION */}
          <section id="terms-motion" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Istilah Kunci: Kinematika &amp; Konfigurasi</span>
              <a href="#terms-motion" onClick={(e) => { e.preventDefault(); handleScrollTo('#terms-motion') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Parameter kinematika yang digunakan untuk mengonversi ruang Kartesian ke ruang sendi:
            </p>

            <PropertyList>
              <Property
                name="θ1 (Sudut Sendi 1)"
                description="Sudut rotasi dari link lengan dalam, digerakkan oleh motor DC dan diukur oleh potensiometer."
              />
              <Property
                name="θ2 (Sudut Sendi 2)"
                description="Sudut link lengan luar relatif terhadap link dalam, digerakkan oleh motor stepper."
              />
              <Property
                name="Kinematika Invers (IK)"
                description="Rumus matematika yang digunakan untuk mengonversi koordinat Kartesian X, Y yang diinginkan menjadi sudut sendi θ1 dan θ2 yang sesuai."
              />
              <Property
                name="Kinematika Maju (FK)"
                description="Persamaan yang digunakan untuk menghitung koordinat fisik X, Y dari end-effector berdasarkan sudut sendi yang diukur."
              />
              <Property
                name="Elbow Right (+1) / Left (-1)"
                description="Menentukan solusi matematika mana yang akan digunakan untuk koordinat target (mewakili konfigurasi lengan siku-ke-atas atau siku-ke-bawah)."
              />
            </PropertyList>
          </section>

          {/* 💡 SECTION: ESP TELEMETRY */}
          <section id="esp-telemetry" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>ESP32 → HMI: Mengirimkan Telemetri</span>
              <a href="#esp-telemetry" onClick={(e) => { e.preventDefault(); handleScrollTo('#esp-telemetry') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              HMI memproses nilai yang dipisahkan koma (CSV) yang diterima melalui serial. Setiap paket pesan harus dimulai dengan satu karakter **tag identifikasi**, diikuti oleh kolom data, dan diakhiri dengan karakter baris baru (<InlineCode>\n</InlineCode>).
            </p>

            <h3 className="text-sm font-semibold text-zinc-200 mt-6 mb-2">Paket Serial yang Diperlukan</h3>

            <div className="space-y-6 mt-4">
              <div>
                <p className="text-xs font-bold text-zinc-200 mb-1">M / MC — Awal gerakan / kelanjutan (dikirim pada awal trajektori)</p>
                <p className="text-xs text-zinc-400 mb-2"><InlineCode>M</InlineCode> menginstruksikan HMI untuk mereset buffer dan bersiap mencatat telemetri. <InlineCode>MC</InlineCode> digunakan untuk bagian kedua dari jalur split berbentuk L dan <em>tidak</em> mereset buffer HMI.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// is_continuation = true untuk bagian kedua bentuk L -> MC, else M
Serial.print(is_continuation ? "MC," : "M,");
Serial.print(x0, 3);  // start X mm (float)
Serial.print(",");
Serial.print(y0, 3);  // start Y mm (float)
Serial.print(",");
Serial.print(xf, 3);  // target X mm (float)
Serial.print(",");
Serial.println(yf, 3); // target Y mm (float)`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Contoh: <InlineCode>M,0.000,120.000,100.000,80.000</InlineCode> / <InlineCode>MC,100.000,80.000,150.000,50.000</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">S — Gerakan selesai (dikirim sekali saat robot berhenti)</p>
                <p className="text-xs text-zinc-400 mb-2">Memberi sinyal kepada HMI bahwa gerakan telah selesai. HMI kemudian membekukan grafik dan menjalankan perhitungan metrik run.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.println("S");`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">T — Sampel trajektori (dikirim setiap tick kontrol, ~10–50 ms)</p>
                <p className="text-xs text-zinc-400 mb-2">Mengirimkan koordinat target ideal dan aktual end-effector untuk diplot pada Visualisasi Ruang Kerja 3D.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// xi, yi = posisi target ideal (mm)
// xa, ya = posisi aktual (mm)
Serial.print("T,");
Serial.print(xi, 2);
Serial.print(",");
Serial.print(yi, 2);
Serial.print(",");
Serial.print(xa, 2);
Serial.print(",");
Serial.println(ya, 2);`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Contoh: <InlineCode>T,100.00,80.00,99.85,80.12</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">D — Sampel dinamika (500 Hz dari firmware, di-downsample menjadi 50 Hz di HMI)</p>
                <p className="text-xs text-zinc-400 mb-2">Data sensor tingkat sendi (joint-level) dengan feedforward kecepatan dan pembacaan ADC mentah. Error sendi dihitung oleh HMI.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// t        = timestamp (ms)
// th1/th2  = sudut sendi aktual (rad)
// th1d/th2d = sudut sendi yang diinginkan (rad)
// v1/v2    = kecepatan aktual (rad/s)
// v1d/v2d  = kecepatan yang diinginkan (rad/s)
// pwm1     = output kontrol J1 (-255 hingga 255)
// vff1     = kontribusi feedforward kecepatan (V)
// th1raw/th2raw = sudut ADC belum terfilter (rad)
// u1_total = tegangan kontrol total J1 (V)
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
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Contoh: <InlineCode>D,125,0.785,0.524,0.790,0.526,0.120,0.080,0.140,0.090,180,0.050,0.784,0.522,2.4500</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">G — Laporan gain (dikirim saat gain berubah atau diminta)</p>
                <p className="text-xs text-zinc-400 mb-2">Melaporkan nilai PID, pembagi langkah microstep, dan faktor pencampuran feedforward.</p>
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
Serial.print(ffi, 2); Serial.print(",");  // blend FF inersia
Serial.print(ffc, 2); Serial.print(",");  // blend FF coriolis
Serial.println(ffg, 2);                   // blend FF gravitasi`}
                />
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Contoh: <InlineCode>G,0.600,0.030,0.020,4.000,0.005,0.100,16,0.50,0.30,0.80</InlineCode></span></div>
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">F — Rincian feedforward (50 Hz)</p>
                <p className="text-xs text-zinc-400 mb-2">Torsi feedforward inersia, Coriolis, dan gravitasi per sendi ditambah sinyal kontrol.</p>
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
                <p className="text-xs font-bold text-zinc-200 mb-1">K — Parameter runtime (33 kolom, dikirim berdasarkan permintaan/boot)</p>
                <p className="text-xs text-zinc-400 mb-2">Batas kecepatan/akselerasi, bandwidth filter, deadband, flag trajektori, gain VFF, dan koefisien mode tahan (hold).</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// K,vmax,amax,cfreq,u1max,fzt,fztk,kspen,pwm_db,dbmen,dbens,
//   td1r,td2r,td1h,ddth,dben,dbrel,dbvel,hskp,hskd,idecay,
//   taunom,m22ref,alpha_tilt_deg,td_enabled,trap_enabled,
//   ki2_gate_rad,db2en,db2rel,err_dz,integral_freeze_thresh,
//   kv_vel,vff_max_frac,vff_dv_max
Serial.print("K,");
Serial.print(vmax, 3);    Serial.print(","); // batas kecepatan (m/s)
Serial.print(amax, 3);    Serial.print(","); // batas akselerasi (m/s²)
Serial.print(cfreq);      Serial.print(","); // frekuensi kontrol (Hz)
Serial.print(u1max, 2);   Serial.print(","); // output kontrol maks (V)
// ... (seluruh 33 parameter CSV)`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">P — Detak posisi (dikirim berdasarkan permintaan via getgains/getparams)</p>
                <p className="text-xs text-zinc-400 mb-2">Melaporkan posisi kinematika maju (FK) end-effector dan sudut sendi saat ini.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// x, y    = posisi end-effector (mm)
// theta1   = sudut Sendi 1 (rad)
// theta2   = sudut Sendi 2 (rad)
Serial.print("P,");
Serial.print(x, 3);      Serial.print(",");
Serial.print(y, 3);      Serial.print(",");
Serial.print(theta1, 4); Serial.print(",");
Serial.println(theta2, 4);`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">Q — Status Antrean Trajektori (dikirim saat status antrean berubah)</p>
                <p className="text-xs text-zinc-400 mb-2">Melaporkan apakah gerakan kedua sedang masuk antrean beserta koordinat targetnya.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// pending_status = 1 jika gerakan masuk antrean, 0 sebaliknya
// pending_x, pending_y = koordinat target tertunda (mm)
Serial.print("Q,");
Serial.print(pending_status); Serial.print(",");
Serial.print(pending_x);      Serial.print(",");
Serial.println(pending_y);`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">ESTOP — Status E-STOP (dikirim berdasarkan permintaan atau perubahan status)</p>
                <p className="text-xs text-zinc-400 mb-2">Menunjukkan apakah latch stop darurat (emergency stop) aktif.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.print("ESTOP,");
Serial.println(estop_active ? "1" : "0");`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">X — Pengidentifikasi mode (dikirim saat boot, perpindahan mode, dan getgains)</p>
                <p className="text-xs text-zinc-400 mb-2">Melaporkan nama mode operasi firmware saat ini.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`Serial.print("X,");
Serial.println(MODE_NAMES[op_mode]);  // misal "IDLE", "SCARA", "ZN", "TEST"`}
                />
              </div>

              <div className="pt-4 border-t border-zinc-800/40">
                <p className="text-xs font-bold text-zinc-200 mb-1">E — Effort PID &amp; Durasi Loop Sendi 1 (dikirim pada 10 Hz)</p>
                <p className="text-xs text-zinc-400 mb-2">Mengalirkan output komponen kontroler untuk Sendi 1 dan durasi loop kontrol mikrokontroler.</p>
                <CodeBlock
                  filename="Arduino Print Output"
                  code={`// p1_out, i1_out, d1_out = output komponen Proporsional, Integral, dan Derivatif Sendi 1 (float)
// loop_duration_us       = waktu eksekusi loop mikrokontroler dalam mikrodetik (int)
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
                <div className="mt-1"><span className="text-[10px] text-zinc-500 font-mono">Contoh: <InlineCode>E,125,0.8524,-0.0210,0.1105,82</InlineCode></span></div>
              </div>

            </div>
          </section>

          {/* 💡 SECTION: ESP COMMANDS */}
          <section id="esp-commands" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>HMI → ESP32: Kamus Perintah</span>
              <a href="#esp-commands" onClick={(e) => { e.preventDefault(); handleScrollTo('#esp-commands') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              HMI mengirimkan parameter teks biasa melalui serial, diakhiri dengan karakter baris baru (<InlineCode>\n</InlineCode>). Firmware Anda harus mengurai pesan-pesan ini dalam loop eksekusi utamanya.
            </p>

            <PropertyList>
              <Property
                name="move,X,Y"
                type="PERINTAH GERAKAN"
                description="Memicu perencana trajektori untuk menghitung jalur ke titik koordinat target X dan Y (float)."
              />
              <Property
                name="elbow,N"
                type="KONFIGURASI"
                description="Mengatur konfigurasi kinematika untuk gerakan berikutnya. N adalah +1 (kanan/elbow-up) atau -1 (kiri/elbow-down)."
              />
              <Property
                name="kp1,V / ki1,V / kd1,V"
                type="PENYESUAIAN GAIN J1"
                description="Memperbarui satu parameter gain kontrol sendi 1 (V adalah nilai float)."
              />
              <Property
                name="kp2,V / ki2,V / kd2,V"
                type="PENYESUAIAN GAIN J2"
                description="Memperbarui satu parameter gain kontrol sendi 2 (V adalah nilai float)."
              />
              <Property
                name="mstep,N"
                type="PEMBAGI DRIVER"
                description="Mengatur pengaturan microstep driver motor stepper. N dapat bernilai 1, 2, 4, 8, atau 16."
              />
              <Property name="estop / resume" type="KEAMANAN" description="Stop darurat memutuskan output motor. Resume menghapus latch E-STOP dan mengaktifkan kembali output tanpa melakukan gerakan." />
              <Property name="ping" type="WATCHDOG" description="Mereset watchdog serial 8-detik dari firmware. Dikirim secara otomatis oleh heartbeat HMI." />
              <Property name="mode,<nama>" type="PERALIHAN MODE" description="Beralih mode firmware: idle, scara, zn, atau test. Dikirim secara otomatis oleh ModeRouter saat navigasi halaman." />
              <Property name="plot,<0|1>" type="PENCATATAN LOG" description="Mengaktifkan/menonaktifkan pencatatan log D berkecepatan tinggi. Dikirim secara otomatis pada rute /zn dan /test." />
              <Property name="getgains / getparams" type="PERMINTAAN DATA" description="Meminta paket G (gain) atau K (parameter runtime). Dikirim saat terhubung." />
              <Property name="ffi,ffc,ffg" type="FEEDFORWARD" description="Mengatur faktor pencampuran feedforward inersia, Coriolis, dan gravitasi (0.0–1.0)." />
              <Property name="clrgraph" type="PEMBERSIHAN BUFFER" description="Membersihkan buffer trajektori pada HMI dan firmware." />
              <Property name="t1,<derajat> / t2,<derajat>" type="LANGKAH ZN" description="Mengatur sudut target sendi dalam derajat (mode ZN dan TEST)." />
              <Property name="<param>,nilai" type="PARAMETER PENGUJIAN" description="Mengatur salah satu dari 33 parameter runtime di halaman Test (vmax, amax, td1r, td2r, kv1, vffmax, vffdv, dll.)." />
            </PropertyList>
          </section>

          {/* 💡 SECTION: ESP EXAMPLE */}
          <section id="esp-example" className="scroll-mt-16 mb-12">
            <h2 className="group text-xl font-bold text-zinc-100 mb-4 pb-2 border-b border-zinc-800/40 flex items-center">
              <span>Contoh Minimal Integrasi ESP32</span>
              <a href="#esp-example" onClick={(e) => { e.preventDefault(); handleScrollTo('#esp-example') }} className="ml-2 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono font-normal text-sm select-none">#</a>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Berikut adalah kerangka kerja Arduino lengkap dan minimal yang mendemonstrasikan penguraian perintah serial dan pemformatan loop feedback telemetri.
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
              Pastikan waktu siklus telemetri tetap di bawah <strong>50 ms</strong> (direkomendasikan 20 ms). Transmisi data yang lebih cepat diperlukan untuk menangkap dinamika sistem yang cepat tanpa adanya kehilangan data (buffer dropouts).
            </Callout>

            <Callout type="danger">
              Pastikan Anda mengimplementasikan pemicu <strong>estop</strong>. Tombol pengaman E-STOP di header HMI mengirimkan string ini secara instan. Perangkat harus mematikan output motor secara langsung alih-alih hanya sekadar keluar dari loop trajektori.
            </Callout>
          </section>

          {/* Document Footer */}
          <div className="mt-16 pt-8 border-t border-zinc-800/80 text-center text-xs text-zinc-500">
            SCARA HMI • Dokumentasi Panduan Pengguna • TA 2 • 2026
          </div>
        </article>
      </div>

    </div>
  )
}
