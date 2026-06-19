import { useEffect, useRef } from 'react'
import { useHMI } from '@/lib/hmi-context'

/**
 * Kirim "ping\n" ke ESP32 setiap 750ms selama hook aktif.
 * Mencegah watchdog ESP32 (SERIAL_WATCHDOG_MS = 2000ms) me-reset mode ke IDLE.
 *
 * Interval harus jauh lebih kecil dari timeout watchdog: kalau keduanya sama
 * (2000ms vs 2000ms), jitter normal bisa membuat watchdog expire beberapa ms
 * sebelum ping berikutnya tiba → robot drop ke MODE_IDLE di tengah gerakan.
 * 750ms memberi ~2.6x margin sehingga butuh 2 ping berturut-turut hilang baru
 * watchdog menyala.
 *
 * @param isActive - true saat serial sedang connected dan page aktif.
 *                   Gunakan: useHeartbeat(serialStatus === 'connected')
 */
const HEARTBEAT_MS = 750
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
    }, HEARTBEAT_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isActive, serial])
}
