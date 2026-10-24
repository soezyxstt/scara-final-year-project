'use client'

import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Activity, BookOpen, ChartNoAxesCombined, CircuitBoard, FlaskConical, FolderClock, Gauge, LayoutDashboard, Move3D, Search, Settings2, SlidersHorizontal, Square, RotateCcw, Usb, type LucideIcon } from 'lucide-react'
import { useHMISlow } from '@/lib/hmi-context'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarSeparator, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { CaptureMenu } from './capture-menu'
import { LocaleToggle } from './locale-toggle'
import { ThemeToggle } from './theme-toggle'
import { RunButton } from './run-button'
import { SerialMonitorButton, SerialTerminalSheet } from './serial-terminal'

const NavigationLock = createContext<((locked: boolean) => void) | null>(null)

export function useConsoleNavigationLock(locked: boolean) {
  const setLocked = useContext(NavigationLock)
  useEffect(() => {
    setLocked?.(locked)
    return () => setLocked?.(false)
  }, [locked, setLocked])
}

const destinations: { key: string; href: string; icon: LucideIcon; divider?: boolean }[] = [
  { key: 'monitor', href: '/?tab=monitor', icon: LayoutDashboard },
  { key: 'analysis', href: '/?tab=analysis', icon: ChartNoAxesCombined },
  { key: 'stepResponse', href: '/?tab=rest', icon: Activity },
  { key: 'tuning', href: '/zn', icon: SlidersHorizontal, divider: true },
  { key: 'testBench', href: '/test', icon: Gauge },
  { key: 'experiments', href: '/eksperimen', icon: FlaskConical, divider: true },
  { key: 'results', href: '/hasil-eksperimen', icon: ChartNoAxesCombined },
  { key: 'savedRuns', href: '/dashboard', icon: FolderClock },
  { key: 'hardware', href: '/pcb', icon: CircuitBoard, divider: true },
  { key: 'guide', href: '/?tab=readme', icon: BookOpen },
]

export function ConsoleTabs({ items, value, onChange, label }: {
  items: { value: string; label: string; disabled?: boolean }[]
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <Tabs value={value} onValueChange={onChange} className="console-tabs-root">
      <TabsList aria-label={label} className="console-tabs">
        {items.map(item => (
          <TabsTrigger key={item.value} value={item.value} aria-controls={undefined} aria-current={value === item.value ? 'page' : undefined} disabled={item.disabled}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function ConsoleFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('Console')
  const common = useTranslations('Common')
  const login = useTranslations('Login')
  const header = useTranslations('Header')
  const pathname = usePathname()
  const search = useSearchParams()
  const tab = search.get('tab') ?? 'monitor'
  const { state, serial } = useHMISlow()
  const { state: sidebarState, isMobile, openMobile, setOpenMobile } = useSidebar()
  const navigationOpen = isMobile ? openMobile : sidebarState === 'expanded'
  const navigationToggleLabel = isMobile ? t(openMobile ? 'closeNavigation' : 'openNavigation') : t(navigationOpen ? 'hideNavigation' : 'showNavigation')
  const [serialOpen, setSerialOpen] = useState(false)
  const [navigationLocked, setNavigationLocked] = useState(false)
  useHeartbeat(state.serialStatus === 'connected')

  const active = destinations.find(item => {
    if (!item.href.startsWith('/?')) return pathname.startsWith(item.href)
    return pathname === '/' && new URLSearchParams(item.href.split('?')[1]).get('tab') === tab
  })
  const connected = state.serialStatus === 'connected'
  const canRun = (pathname === '/' && tab === 'monitor') || (pathname === '/test' && search.get('tab') === 'monitor')

  if (pathname === '/arm3d-debug') return <>{children}</>

  const closeDrawerThen = (callback: () => void) => {
    if (isMobile) {
      setOpenMobile(false)
      window.setTimeout(callback, 200)
    } else callback()
  }
  const navigationGroups = [destinations.slice(0, 5), destinations.slice(5, 8), destinations.slice(8)]

  return (
    <NavigationLock.Provider value={setNavigationLocked}>
      <>
        <Sidebar collapsible="icon" className="console-sidebar" aria-label={t('navigation')}>
          <SidebarHeader className="console-sidebar-header">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="console-brand" tooltip="SCARA">
                  <Link href="/" aria-label="SCARA home" onClick={event => { if (navigationLocked) event.preventDefault(); else if (isMobile) setOpenMobile(false) }}>
                    <Move3D strokeWidth={1.7} /><span>SCARA</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent id="console-navigation">
            <SidebarGroup className="console-search-group">
              <SidebarMenu><SidebarMenuItem>
                <SidebarMenuButton tooltip={t('search')} aria-label={t('search')} onClick={() => closeDrawerThen(() => window.dispatchEvent(new Event('toggle-command-palette')))}><Search /><span>{t('search')}</span></SidebarMenuButton>
              </SidebarMenuItem></SidebarMenu>
            </SidebarGroup>
            <nav aria-label={t('navigation')} className="console-destinations">
              {navigationGroups.map((items, index) => <div key={items[0].key}>
                {index > 0 && <SidebarSeparator />}
                <SidebarGroup><SidebarGroupContent><SidebarMenu>
                  {items.map(({ key, href, icon: Icon }) => <SidebarMenuItem key={key}>
                    <SidebarMenuButton asChild tooltip={t(key)} isActive={active?.key === key}>
                      <Link href={href} aria-label={t(key)} aria-current={active?.key === key ? 'page' : undefined} aria-disabled={navigationLocked || undefined} onClick={event => { if (navigationLocked) event.preventDefault(); else if (isMobile) setOpenMobile(false) }}>
                        <Icon strokeWidth={1.7} /><span>{t(key)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>)}
                </SidebarMenu></SidebarGroupContent></SidebarGroup>
              </div>)}
            </nav>
          </SidebarContent>
          <SidebarFooter className="console-sidebar-footer">
            <SidebarMenu><SidebarMenuItem>
              <SidebarMenuButton tooltip={t('settings')} aria-label={t('settings')} onClick={() => closeDrawerThen(() => window.dispatchEvent(new Event('hmi_toggle_menu')))}><Settings2 /><span>{t('settings')}</span></SidebarMenuButton>
            </SidebarMenuItem></SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="console-body">
          <header className="console-toolbar">
            <div className="console-page-heading">
              <Tooltip content={`${navigationToggleLabel} (Ctrl+B)`}>
                <SidebarTrigger aria-controls="console-navigation" aria-expanded={navigationOpen} aria-label={navigationToggleLabel} />
              </Tooltip>
              <h1>{active ? t(active.key) : pathname === '/login' ? login('cardTitle') : 'SCARA'}</h1>
            </div>
            <div className="console-display-controls"><LocaleToggle showLabel /><ThemeToggle /></div>
            <div className="console-toolbar-actions">
              <span className="console-connection" title={connected ? `${state.portName ?? 'Serial'} · ${state.currentMode ?? ''}` : header('connectTooltip')}><span className={connected ? 'is-connected' : ''} />{connected ? `${t('connected')}${state.currentMode ? ` · ${state.currentMode}` : ''}` : t('disconnected')}</span>
              {!state.online && <span role="status" className="text-xs text-hmi-warn" title={header('networkStatusTooltip')}>{t('offline')}</span>}
              <Button id="hmi-connect-button" variant="outline" size="sm" aria-label={connected ? common('disconnect') : common('connect')} title={connected ? common('disconnect') : common('connect')} onClick={() => connected ? serial.disconnect() : serial.connect()}><Usb size={15} /><span className="console-connect-label">{connected ? common('disconnect') : common('connect')}</span></Button>
              <SerialMonitorButton id="hmi-serial-button" open={serialOpen} onToggle={() => setSerialOpen(value => !value)} serialConnected={connected} />
              <span className="console-toolbar-divider" />
              {canRun && <RunButton />}
              <Button id="hmi-estop-button" aria-label={state.estopped ? common('resume') : t('emergencyStop')} variant={state.estopped ? 'resume' : 'estop'} size="sm" title={state.estopped ? header('resumeTooltip') : header('stopTooltip')} onClick={() => serial.sendCommand(state.estopped ? 'resume' : 'estop')}>
                {state.estopped ? <RotateCcw size={15} /> : <Square size={15} />}{state.estopped ? common('resume') : <><span className="console-stop-full">{t('emergencyStop')}</span><span className="console-stop-compact">{common('stop')}</span></>}
              </Button>
              <CaptureMenu />
            </div>
          </header>
          <SerialTerminalSheet open={serialOpen} onClose={() => setSerialOpen(false)} />
          <main id="console-content" className="console-content">{children}</main>
        </div>
      </>
    </NavigationLock.Provider>
  )
}

export function ConsoleShell({ children, defaultOpen = true }: { children: ReactNode; defaultOpen?: boolean }) {
  return <SidebarProvider defaultOpen={defaultOpen} className="console-frame"><Suspense fallback={<div className="h-screen bg-hmi-bg" />}><ConsoleFrame>{children}</ConsoleFrame></Suspense></SidebarProvider>
}
