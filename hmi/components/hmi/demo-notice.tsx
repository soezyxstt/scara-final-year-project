'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export function DemoNotice() {
  const t = useTranslations('Demo')
  return <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-hmi-grid bg-hmi-panel px-4 py-2 text-xs text-hmi-muted"><div className="min-w-0"><p>{t('notice')}</p><p className="mt-1 text-[11px]">{t('provenance')}</p></div><div className="flex flex-wrap gap-4"><Link href="/dashboard" className="text-hmi-ideal underline underline-offset-4">{t('browse')}</Link><Link href="/login" className="text-hmi-ideal underline underline-offset-4">{t('signIn')}</Link></div></div>
}
