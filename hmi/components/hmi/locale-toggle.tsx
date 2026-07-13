'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { setUserLocale } from '@/lib/locale'
import { Tooltip } from '@/components/ui/tooltip'
import { Languages } from 'lucide-react'

export function LocaleToggle() {
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const toggleLocale = () => {
    const nextLocale = locale === 'en' ? 'id' : 'en'
    startTransition(async () => {
      await setUserLocale(nextLocale)
      router.refresh()
    })
  }

  return (
    <Tooltip content={locale === 'en' ? 'Switch to Indonesian' : 'Ubah ke Bahasa Inggris'} align="right">
      <button
        type="button"
        onClick={toggleLocale}
        disabled={isPending}
        className="w-8 h-8 rounded-lg border border-hmi-grid bg-hmi-btn hover:bg-hmi-btn-hover text-hmi-text flex items-center justify-center transition-all duration-200 focus:outline-none cursor-pointer focus-visible:ring-1 focus-visible:ring-hmi-ideal font-mono text-[10px] font-bold"
        aria-label="Toggle Language"
      >
        <span className="flex items-center gap-0.5">
          <Languages className="w-3.5 h-3.5" />
          <span className="uppercase text-[9px] font-semibold">{locale}</span>
        </span>
      </button>
    </Tooltip>
  )
}
