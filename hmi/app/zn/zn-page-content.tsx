'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ZNTunerTab } from '@/components/hmi/zn-tuner-tab'

export default function ZNPageContent() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    localStorage.removeItem('hmi_zn_buffer')
    localStorage.removeItem('hmi_zn_start_ts')
    const frame = requestAnimationFrame(() => setReady(true))
    const onSwitch = (event: Event) => {
      const next = (event as CustomEvent<string>).detail
      if (next === 'monitor' || next === 'readme') router.push(next === 'monitor' ? '/' : '/?tab=readme')
    }
    window.addEventListener('hmi_switch_tab', onSwitch)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hmi_switch_tab', onSwitch) }
  }, [router])
  return <div className="h-full min-h-0 overflow-y-auto">{ready && <ZNTunerTab />}</div>
}
