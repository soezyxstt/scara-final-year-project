'use client'

import { SessionProvider } from 'next-auth/react'
import { HMIProvider } from '@/lib/hmi-context'
import { ThemeProvider, useTheme } from '@/components/hmi/theme-provider'
import { ModeRouter } from '@/components/hmi/mode-router'
import { KeybindingsHandler } from '@/components/hmi/keybindings-handler'
import { CaptureChartsHost } from '@/components/hmi/capture-charts-host'
import { ConsoleShell } from '@/components/hmi/console-shell'
import { CommandPalette } from '@/components/hmi/command-palette'
import { Toaster } from 'sonner'
import type { ReactNode } from 'react'

function ToasterWrapper() {
  const { theme } = useTheme()
  return <Toaster theme={theme} richColors closeButton position="bottom-right" />
}

/**
 * Client-side providers wrapper.
 * Diletakkan di app/layout.tsx agar HMIProvider (dan serial port-nya)
 * hidup sepanjang session — tidak unmount saat navigasi antar route.
 */
export function Providers({ children, defaultSidebarOpen = true }: { children: ReactNode; defaultSidebarOpen?: boolean }) {
  return (
    <SessionProvider>
      <HMIProvider>
        <ThemeProvider>
          <ModeRouter />
          <KeybindingsHandler />
          <CaptureChartsHost />
          <ConsoleShell defaultOpen={defaultSidebarOpen}>{children}</ConsoleShell>
          <CommandPalette />
          <ToasterWrapper />
        </ThemeProvider>
      </HMIProvider>
    </SessionProvider>
  )
}
