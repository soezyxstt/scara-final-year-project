'use client'

import { useTranslations } from 'next-intl'
import { useTheme } from './theme-provider'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'

export function ThemeToggle() {
  const t = useTranslations('ThemeToggle')
  const { theme, toggleTheme } = useTheme()

  return (
    <Tooltip content={theme === 'dark' ? t('tooltipLight') : t('tooltipDark')} align="right">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={toggleTheme}
        className="console-theme-control size-8 p-0"
        aria-label={t('ariaLabel')}
        aria-pressed={theme === 'light'}
      >
        {theme === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </Tooltip>
  )
}
