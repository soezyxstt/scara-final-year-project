'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { useTranslations } from 'next-intl'

const ZNPageContent = dynamic(
  () => import('./zn-page-content'),
  { ssr: false }
)

export default function ZNPage() {
  const t = useTranslations('ZNTuner')
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-hmi-bg text-hmi-text animate-pulse">
        <span className="text-sm font-medium">{t('loading')}</span>
      </div>
    }>
      <ZNPageContent />
    </Suspense>
  )
}
