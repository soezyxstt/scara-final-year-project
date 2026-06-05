'use client'

import { HMIProvider } from '@/lib/hmi-context'
import { ModeRouter } from '@/components/hmi/mode-router'
import { KeybindingsHandler } from '@/components/hmi/keybindings-handler'
import type { ReactNode } from 'react'

/**
 * Client-side providers wrapper.
 * Diletakkan di app/layout.tsx agar HMIProvider (dan serial port-nya)
 * hidup sepanjang session — tidak unmount saat navigasi antar route.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <HMIProvider>
      <ModeRouter />
      <KeybindingsHandler />
      {children}
    </HMIProvider>
  )
}
