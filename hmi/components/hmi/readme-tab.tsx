'use client'

import { useLocale } from 'next-intl'
import { ReadmeTabEn } from './readme-tab-en'
import { ReadmeTabId } from './readme-tab-id'

export function ReadmeTab() {
  const locale = useLocale()
  if (locale === 'id') {
    return <ReadmeTabId />
  }
  return <ReadmeTabEn />
}
