'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { setUserLocale } from '@/lib/locale'
import { Tooltip } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Languages } from 'lucide-react'

export function LocaleToggle({ showLabel = false }: { showLabel?: boolean }) {
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
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={toggleLocale}
        disabled={isPending}
        className={showLabel ? 'console-language-control' : 'size-8 p-0'}
        aria-label={locale === 'en' ? 'Switch to Indonesian' : 'Ubah ke Bahasa Inggris'}
      >
        <Languages className="size-4" />
        {showLabel ? <span className="flex items-center gap-1 text-xs"><span className={cn(locale === 'id' ? 'font-semibold text-hmi-text' : 'text-hmi-muted')}>ID</span><span className="text-hmi-muted">/</span><span className={cn(locale === 'en' ? 'font-semibold text-hmi-text' : 'text-hmi-muted')}>EN</span></span> : <span className="text-[10px]">{locale.toUpperCase()}</span>}
      </Button>
    </Tooltip>
  )
}
