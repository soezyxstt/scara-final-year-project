'use client'

import { SessionProvider } from 'next-auth/react'
import { HMIProvider } from '@/lib/hmi-context'
import { ModeRouter } from '@/components/hmi/mode-router'
import { KeybindingsHandler } from '@/components/hmi/keybindings-handler'
import { CaptureChartsHost } from '@/components/hmi/capture-charts-host'
import type { ReactNode } from 'react'

/**
 * Client-side providers wrapper.
 * Diletakkan di app/layout.tsx agar HMIProvider (dan serial port-nya)
 * hidup sepanjang session — tidak unmount saat navigasi antar route.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <HMIProvider>
        <ModeRouter />
        <KeybindingsHandler />
        <CaptureChartsHost />
        {children}
      </HMIProvider>
    </SessionProvider>
  )
}
