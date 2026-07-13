'use client'

import { useTranslations } from 'next-intl'
import { useTheme } from './theme-provider'
import { Sun, Moon } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'

export function ThemeToggle() {
  const t = useTranslations('ThemeToggle')
  const { theme, toggleTheme } = useTheme()

  return (
    <Tooltip content={theme === 'dark' ? t('tooltipLight') : t('tooltipDark')} align="right">
      <button
        type="button"
        onClick={toggleTheme}
        className="relative w-8 h-8 rounded-lg border border-hmi-grid bg-hmi-btn hover:bg-hmi-btn-hover text-hmi-text flex items-center justify-center transition-all duration-200 focus:outline-none cursor-pointer focus-visible:ring-1 focus-visible:ring-hmi-ideal group"
        aria-label={t('ariaLabel')}
      >
        <div className="relative w-4 h-4 flex items-center justify-center">
          {/* Sun Icon */}
          <Sun className={`w-4 h-4 transition-all duration-500 ease-out transform group-hover:rotate-45 ${
            theme === 'light' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'
          }`} />
          {/* Moon Icon */}
          <Moon className={`w-4 h-4 absolute transition-all duration-500 ease-out transform group-hover:-rotate-12 ${
            theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
          }`} />
        </div>
      </button>
    </Tooltip>
  )
}
