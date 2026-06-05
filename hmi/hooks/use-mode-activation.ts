import { useEffect } from 'react'
import { useHMI } from '@/lib/hmi-context'
import type { ESPMode } from '@/lib/hmi-types'

type ActivatableMode = Exclude<ESPMode, 'IDLE'>

/**
 * Kirim "mode,<targetMode>\n" saat component mount.
 * Tidak mengirim apapun saat unmount — biarkan watchdog ESP32 handle timeout.
 *
 * Harus dipanggil di root component setiap page yang memiliki mode aktif:
 *   - app/(dashboard)/page.tsx → useModeActivation('SCARA')
 *   - app/(dashboard)/zn/page.tsx → useModeActivation('ZN')
 *
 * @param targetMode - Mode yang harus diaktifkan saat page ini di-mount.
 */
export function useModeActivation(targetMode: ActivatableMode): void {
  const { state, serial } = useHMI()
  const { serialStatus } = state

  useEffect(() => {
    if (serialStatus !== 'connected') return

    serial
      .sendCommand(`mode,${targetMode.toLowerCase()}`)
      .catch(() => { /* fire-and-forget */ })

    // Unmount: tidak kirim apapun — biarkan watchdog ESP32 yang handle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialStatus]) // re-kirim jika reconnect saat page masih terbuka
}
