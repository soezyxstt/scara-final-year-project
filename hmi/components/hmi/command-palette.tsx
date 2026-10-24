'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, Monitor, LineChart, BookOpen, Settings, ArrowRight, RotateCcw, Unplug, Plug, Square, X, Activity, Sliders, FolderClock, Cpu, FlaskConical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useHMISlow } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CommandItem {
  id: string
  title: string
  icon: ReactNode
  action: () => void
  keywords: string[]
  actionItem?: boolean
  disabled?: boolean
}

export function CommandPalette() {
  const t = useTranslations('CommandPalette')
  const consoleText = useTranslations('Console')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { state, serial } = useHMISlow()
  const connected = state.serialStatus === 'connected'

  const changeOpen = (next: boolean) => {
    if (next) { setQuery(''); setSelectedIndex(0) }
    setOpen(next)
  }

  useEffect(() => {
    const toggle = () => { setQuery(''); setSelectedIndex(0); setOpen(previous => !previous) }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('toggle-command-palette', toggle)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('toggle-command-palette', toggle)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const navigateTo = (path: string) => {
    setOpen(false)
    startTransition(() => router.push(path))
  }
  const navigate = (id: string, title: string, path: string, icon: ReactNode, keywords: string[]): CommandItem => ({ id, title, icon, keywords, action: () => navigateTo(path) })
  const commands: CommandItem[] = [
    navigate('monitor', consoleText('monitor'), '/?tab=monitor', <Monitor />, ['monitor', 'hmi', 'home', 'xy', 'trace', 'trajectory']),
    navigate('analysis', consoleText('analysis'), '/?tab=analysis', <LineChart />, ['analysis', 'analisis', 'error', 'cte', 'ate']),
    navigate('rest', consoleText('stepResponse'), '/?tab=rest', <Activity />, ['step', 'response', 'respons', 'rest']),
    navigate('zn', consoleText('tuning'), '/zn', <Sliders />, ['zn', 'tuner', 'tuning', 'pid', 'ziegler', 'nichols']),
    navigate('test', consoleText('testBench'), '/test', <Settings />, ['test', 'testing', 'pengujian', 'params']),
    navigate('experiments', consoleText('experiments'), '/eksperimen', <FlaskConical />, ['experiment', 'eksperimen']),
    navigate('results', consoleText('results'), '/hasil-eksperimen', <LineChart />, ['results', 'hasil', 'experiment', 'eksperimen']),
    navigate('dashboard', consoleText('savedRuns'), '/dashboard', <FolderClock />, ['saved', 'run', 'history', 'riwayat', 'tersimpan', 'dashboard', 'replay']),
    navigate('pcb', consoleText('hardware'), '/pcb', <Cpu />, ['pcb', 'hardware', 'perangkat', 'esp32', 'wiring', 'schematic']),
    navigate('readme', consoleText('guide'), '/?tab=readme', <BookOpen />, ['readme', 'manual', 'guide', 'panduan', 'help', 'bantuan', 'document']),
    {
      id: 'action-connect', title: t('commands.action-connect.title'), icon: <Plug />, keywords: ['connect', 'hubungkan', 'serial', 'port'], actionItem: true, disabled: connected,
      action: () => { setOpen(false); serial.connect().then(() => toast.success(t('attemptConnect'))).catch(() => toast.error(t('connectFailed'))) },
    },
    {
      id: 'action-disconnect', title: t('commands.action-disconnect.title'), icon: <Unplug />, keywords: ['disconnect', 'putuskan', 'serial', 'port'], actionItem: true, disabled: !connected,
      action: () => { setOpen(false); serial.disconnect().then(() => toast.info(t('portDisconnected'))).catch(() => toast.error(t('disconnectFailed'))) },
    },
    {
      id: 'action-estop', title: t('commands.action-estop.title'), icon: <Square />, keywords: ['estop', 'stop', 'emergency', 'darurat', 'halt'], actionItem: true, disabled: !connected,
      action: () => { setOpen(false); serial.sendCommand('estop').then(() => toast.error(t('estopSent'))).catch(() => toast.error(t('estopFailed'))) },
    },
    {
      id: 'action-resume', title: t('commands.action-resume.title'), icon: <RotateCcw />, keywords: ['resume', 'pulihkan', 'reset', 'clear', 'estop'], actionItem: true, disabled: !connected,
      action: () => { setOpen(false); serial.sendCommand('resume').then(() => toast.success(t('statusRecovered'))).catch(() => toast.error(t('statusRecoverFailed'))) },
    },
  ]
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const filtered = commands.filter(command => {
    const text = `${command.title} ${command.keywords.join(' ')}`.toLocaleLowerCase()
    return terms.every(term => text.includes(term))
  })
  const activeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1))
  const active = filtered[activeIndex]

  useEffect(() => {
    if (open) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, query])

  const move = (direction: number) => {
    if (!filtered.length) return
    for (let offset = 1; offset <= filtered.length; offset++) {
      const next = (activeIndex + direction * offset + filtered.length) % filtered.length
      if (!filtered[next].disabled) { setSelectedIndex(next); return }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="command-search-overlay fixed inset-0 z-[100] bg-black/45" />
        <Dialog.Content className="command-search fixed z-[101] flex flex-col overflow-hidden border border-hmi-grid bg-hmi-panel text-hmi-text focus:outline-none" onOpenAutoFocus={event => { event.preventDefault(); inputRef.current?.focus() }}>
          <Dialog.Title className="sr-only">{consoleText('search')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('searchPlaceholder')}</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-hmi-grid px-4">
            <Search className="size-4 shrink-0 text-hmi-muted" aria-hidden="true" />
            <input ref={inputRef} type="text" role="combobox" aria-label={consoleText('search')} aria-autocomplete="list" aria-expanded="true" aria-controls="command-search-listbox" aria-activedescendant={active && !active.disabled ? `command-search-${active.id}` : undefined} autoComplete="off" spellCheck={false} placeholder={t('searchPlaceholder')} value={query} onChange={event => { setQuery(event.target.value); setSelectedIndex(0) }} onKeyDown={event => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'ArrowDown') { event.preventDefault(); move(1) }
              else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
              else if (event.key === 'Enter') { event.preventDefault(); if (active && !active.disabled) active.action() }
            }} className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hmi-muted" />
            <Dialog.Close asChild><Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t('closeKey')}><X className="size-4" /></Button></Dialog.Close>
          </div>
          <div ref={listRef} id="command-search-listbox" role="listbox" aria-label={consoleText('search')} className="min-h-0 overflow-y-auto p-2">
            {filtered.length === 0 ? <p role="status" className="px-3 py-8 text-center text-sm text-hmi-muted">{t('noResults', { query: query.trim() })}</p> : filtered.map((item, index) => (
              <button key={item.id} id={`command-search-${item.id}`} role="option" aria-selected={index === activeIndex && !item.disabled} aria-disabled={item.disabled || undefined} disabled={item.disabled} tabIndex={-1} onClick={item.action} onPointerMove={() => { if (!item.disabled) setSelectedIndex(index) }} className={cn('command-search-option flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-40', index === activeIndex && !item.disabled ? 'bg-hmi-elevated text-hmi-text' : 'text-hmi-text-secondary', item.actionItem && !filtered[index - 1]?.actionItem && index > 0 && 'mt-2 border-t border-hmi-grid pt-2')}>
                <span className={cn('command-search-icon shrink-0', item.id === 'action-estop' && 'text-hmi-estop')}>{item.icon}</span>
                <span className="min-w-0 flex-1">{item.title}</span>
                {index === activeIndex && !item.disabled && <ArrowRight className="size-4 shrink-0 text-hmi-muted" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function CommandPaletteTrigger() {
  const t = useTranslations('CommandPalette')
  return <Button variant="ghost" size="icon" aria-label={t('triggerTitle')} title={t('triggerTitle')} onClick={() => window.dispatchEvent(new CustomEvent('toggle-command-palette'))}><Search className="size-4" /></Button>
}
