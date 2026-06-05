import { useEffect, useRef } from 'react'
import { useHMI } from '@/lib/hmi-context'

/**
 * Kirim "ping\n" ke ESP32 setiap 2000ms selama hook aktif.
 * Mencegah watchdog ESP32 (8s timeout) me-reset mode ke IDLE.
 *
 * @param isActive - true saat serial sedang connected dan page aktif.
 *                   Gunakan: useHeartbeat(serialStatus === 'connected')
 */
export function useHeartbeat(isActive: boolean): void {
  const { serial } = useHMI()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      serial.sendCommand('ping').catch(() => { /* fire-and-forget */ })
    }, 2000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isActive, serial])
}
