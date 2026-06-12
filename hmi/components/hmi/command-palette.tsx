'use client'

import React, { useEffect, useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useHMISlow } from '@/lib/hmi-context'
import {
  Search,
  Monitor,
  LineChart,
  BookOpen,
  Settings,
  ArrowRight,
  Link as LinkIcon,
  Play,
  RotateCcw,
  Zap,
  ZapOff,
  AlertOctagon,
  X,
  Activity,
  Sliders,
  FolderClock,
  PlayCircle,
  BarChart3
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface CommandItem {
  id: string
  title: string
  subtitle: string
  category: 'Page Navigation' | 'HMI Quick Actions'
  icon: React.ReactNode
  action: () => void
  keywords?: string[]
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { state, serial } = useHMISlow()
  const { serialStatus, estopped } = state

  // Global event listener to toggle palette
  useEffect(() => {
    const handleToggle = () => {
      setOpen(prev => !prev)
    }
    window.addEventListener('toggle-command-palette', handleToggle)
    return () => window.removeEventListener('toggle-command-palette', handleToggle)
  }, [])

  // Keyboard shortcut listener (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [open])

  // Helper to change page with transition
  const navigateTo = (path: string) => {
    setOpen(false)
    startTransition(() => {
      router.push(path)
    })
  }

  // List of all command items
  const commands: CommandItem[] = [
    // --- NAVIGASI HALAMAN ---
    {
      id: 'nav-monitor',
      title: 'HMI Monitor',
      subtitle: 'Monitor telemetry, trajectory motion, and 2D XY trace.',
      category: 'Page Navigation',
      icon: <Monitor className="w-4 h-4 text-sky-400" />,
      action: () => navigateTo('/?tab=monitor'),
      keywords: ['monitor', 'hmi', 'home', 'main', 'xy', 'trace', 'trajectory']
    },
    {
      id: 'nav-analysis',
      title: 'Trajectory Analysis',
      subtitle: 'Detailed error charts (CTE, ATE, and joint position errors).',
      category: 'Page Navigation',
      icon: <LineChart className="w-4 h-4 text-emerald-400" />,
      action: () => navigateTo('/?tab=analysis'),
      keywords: ['analysis', 'error', 'cte', 'ate', 'gains']
    },
    {
      id: 'nav-rest',
      title: 'Ziegler-Nichols Step Response (Rest)',
      subtitle: 'Step response charts and PID tuning suggestions.',
      category: 'Page Navigation',
      icon: <Activity className="w-4 h-4 text-amber-400" />,
      action: () => navigateTo('/?tab=rest'),
      keywords: ['rest', 'step', 'response', 'zn', 'tuning', 'advisor']
    },
    {
      id: 'nav-readme',
      title: 'Documentation & README',
      subtitle: 'SCARA robot kinematics guide, parameters, and wiring.',
      category: 'Page Navigation',
      icon: <BookOpen className="w-4 h-4 text-indigo-400" />,
      action: () => navigateTo('/?tab=readme'),
      keywords: ['readme', 'manual', 'guide', 'help', 'document']
    },
    {
      id: 'nav-zn',
      title: 'ZN Tuner Workspace',
      subtitle: 'Real-time PID tuning with ZN visualization.',
      category: 'Page Navigation',
      icon: <Sliders className="w-4 h-4 text-purple-400" />,
      action: () => navigateTo('/zn'),
      keywords: ['zn', 'tuner', 'tuning', 'pid', 'ziegler', 'nichols']
    },
    {
      id: 'nav-test',
      title: 'Testing & Parameter Playground',
      subtitle: 'Manual motion test, control signals, and Advanced Tuner.',
      category: 'Page Navigation',
      icon: <Settings className="w-4 h-4 text-teal-400" />,
      action: () => navigateTo('/test'),
      keywords: ['testing', 'test', 'playground', 'advanced', 'tuner', 'params']
    },
    {
      id: 'nav-dashboard',
      title: 'Run History Dashboard',
      subtitle: 'Performance comparison of past runs and trajectory data.',
      category: 'Page Navigation',
      icon: <FolderClock className="w-4 h-4 text-pink-400" />,
      action: () => navigateTo('/dashboard'),
      keywords: ['dashboard', 'history', 'run', 'gains']
    },
    {
      id: 'nav-eksperimen',
      title: 'Experiment Automation',
      subtitle: 'Run automated test sequences from EXP-1 to EXP-6.',
      category: 'Page Navigation',
      icon: <PlayCircle className="w-4 h-4 text-rose-400" />,
      action: () => navigateTo('/eksperimen'),
      keywords: ['experiment', 'automation', 'run', 'turso']
    },
    {
      id: 'nav-hasil',
      title: 'Experiment Results Visualization',
      subtitle: 'Average, standard deviation charts, and database statistics.',
      category: 'Page Navigation',
      icon: <BarChart3 className="w-4 h-4 text-fuchsia-400" />,
      action: () => navigateTo('/hasil-eksperimen'),
      keywords: ['results', 'data', 'statistics', 'charts', 'recharts']
    },

    // --- AKSI CEPAT HMI ---
    {
      id: 'action-estop',
      title: '🚨 EMERGENCY STOP (E-STOP)',
      subtitle: 'Immediately stop all robot trajectory motion.',
      category: 'HMI Quick Actions',
      icon: <AlertOctagon className="w-4 h-4 text-hmi-estop" />,
      action: () => {
        setOpen(false)
        serial.sendCommand('estop')
          .then(() => toast.error('🛑 E-STOP Sent!'))
          .catch(() => toast.error('Failed to send E-STOP'))
      },
      keywords: ['estop', 'stop', 'emergency', 'kill', 'halt']
    },
    {
      id: 'action-resume',
      title: '🔄 Resume Motors',
      subtitle: 'Recover the robot and clear E-STOP status.',
      category: 'HMI Quick Actions',
      icon: <RotateCcw className="w-4 h-4 text-hmi-pwm-pos" />,
      action: () => {
        setOpen(false)
        serial.sendCommand('resume')
          .then(() => toast.success('🔄 Status recovered.'))
          .catch(() => toast.error('Failed to recover status'))
      },
      keywords: ['resume', 'start', 'reset', 'clear', 'estop']
    },
    {
      id: 'action-connect',
      title: '🔌 Connect Serial Port',
      subtitle: 'Initialize Web Serial connection with the robot.',
      category: 'HMI Quick Actions',
      icon: <Zap className="w-4 h-4 text-hmi-pwm-pos" />,
      action: () => {
        setOpen(false)
        serial.connect()
          .then(() => toast.success('🔌 Attempting to connect...'))
          .catch(() => toast.error('Failed to connect port'))
      },
      keywords: ['connect', 'serial', 'port', 'webserial', 'baudrate']
    },
    {
      id: 'action-disconnect',
      title: '🔌 Disconnect Serial Port',
      subtitle: 'Close the currently active serial connection.',
      category: 'HMI Quick Actions',
      icon: <ZapOff className="w-4 h-4 text-hmi-muted" />,
      action: () => {
        setOpen(false)
        serial.disconnect()
          .then(() => toast.info('🔌 Port disconnected.'))
          .catch(() => toast.error('Failed to disconnect port'))
      },
      keywords: ['disconnect', 'serial', 'port', 'close']
    }
  ]

  // Filter commands by query search
  const filtered = commands.filter(cmd => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.subtitle.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.keywords?.some(k => k.includes(q))
    )
  })

  // Ensure index is within range after filtering
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector('[data-active="true"]') as HTMLDivElement
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Key navigation when palette is open
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  // Render group list
  const renderItemsByCategory = (category: 'Page Navigation' | 'HMI Quick Actions') => {
    const items = filtered.filter(item => item.category === category)
    if (items.length === 0) return null

    return (
      <div className="py-2">
        <h3 className="px-4 py-1 text-[10px] font-bold text-hmi-muted uppercase tracking-wider">
          {category}
        </h3>
        <div className="mt-1 space-y-0.5">
          {items.map(item => {
            const index = filtered.indexOf(item)
            const isActive = index === selectedIndex
            return (
              <div
                key={item.id}
                data-active={isActive}
                onClick={() => item.action()}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 cursor-pointer border-l-2 transition-all duration-150',
                  isActive
                    ? 'bg-hmi-grid/40 border-l-hmi-ideal text-hmi-text'
                    : 'border-l-transparent text-hmi-muted hover:text-hmi-text hover:bg-hmi-grid/10'
                )}
              >
                <div className={cn(
                  'w-7 h-7 rounded border flex items-center justify-center shrink-0 transition-colors',
                  isActive ? 'border-hmi-ideal/40 bg-hmi-bg' : 'border-hmi-grid bg-transparent'
                )}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{item.title}</div>
                  <div className="text-[10px] truncate">{item.subtitle}</div>
                </div>
                {isActive && (
                  <div className="text-[9px] px-1.5 py-0.5 rounded bg-hmi-bg border border-hmi-grid text-hmi-muted font-mono flex items-center gap-0.5">
                    <span>Enter</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        {/* Backdrop overlay */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md transition-opacity duration-300 animate-fade-in" />
        
        {/* Modal content container */}
        <DialogPrimitive.Content
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-[15vh] z-50 w-full max-w-xl -translate-x-1/2 rounded-xl border border-hmi-grid bg-hmi-panel shadow-2xl overflow-hidden focus:outline-none flex flex-col max-h-[60vh] animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <DialogPrimitive.Title className="sr-only">HMI Navigation & Actions</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search navigation pages and HMI quick actions</DialogPrimitive.Description>

          {/* Search Input Bar */}
          <div className="flex items-center gap-3 px-4 border-b border-hmi-grid bg-hmi-bg shrink-0 relative">
            <Search className="w-5 h-5 text-hmi-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Type to search pages or robot actions... (e.g. 'monitor', 'estop')"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full h-14 bg-transparent text-xs text-hmi-text placeholder-hmi-muted focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="w-5 h-5 rounded hover:bg-hmi-grid flex items-center justify-center text-hmi-muted hover:text-hmi-text transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Results List */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto divide-y divide-hmi-grid/30 min-h-0"
          >
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-xs text-hmi-muted italic">
                No search results for "{query}"
              </div>
            ) : (
              <>
                {renderItemsByCategory('Page Navigation')}
                {renderItemsByCategory('HMI Quick Actions')}
              </>
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-4 py-2 border-t border-hmi-grid bg-hmi-bg/50 flex items-center justify-between text-[9px] text-hmi-muted font-mono shrink-0">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5 border border-hmi-grid bg-hmi-bg px-1 rounded">↑↓</span>
              <span>Navigation</span>
              <span className="w-1.5 h-1.5 rounded-full bg-hmi-grid mx-1" />
              <span className="flex items-center gap-0.5 border border-hmi-grid bg-hmi-bg px-1 rounded">Esc</span>
              <span>Close</span>
            </div>
            <div className="flex items-center gap-1">
              <span>Connection Status:</span>
              <span className={cn(
                'w-2 h-2 rounded-full inline-block',
                serialStatus === 'connected' ? 'bg-hmi-ok' : 'bg-hmi-off'
              )} />
              <span className="capitalize text-[8px] font-bold">{serialStatus}</span>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function CommandPaletteTrigger() {
  const [shortcutText, setShortcutText] = useState('Ctrl+K')
  
  useEffect(() => {
    if (typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)) {
      setShortcutText('⌘K')
    }
  }, [])

  const handleOpen = () => {
    window.dispatchEvent(new CustomEvent('toggle-command-palette'))
  }

  return (
    <button
      onClick={handleOpen}
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-hmi-muted hover:text-hmi-text hover:bg-hmi-grid/30 rounded-md transition-colors cursor-pointer group shrink-0"
      title="Open Command Palette"
    >
      <Search className="w-4 h-4 group-hover:text-hmi-ideal transition-colors shrink-0" />
      <kbd className="text-[9px] px-1 py-0.5 rounded bg-hmi-panel border border-hmi-grid font-mono text-hmi-muted select-none shrink-0">
        {shortcutText}
      </kbd>
    </button>
  )
}
