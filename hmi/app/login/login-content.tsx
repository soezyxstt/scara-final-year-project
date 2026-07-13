'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

interface Props {
  callbackUrl: string
}

export function LoginContent({ callbackUrl }: Props) {
  const t = useTranslations('Login')
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    setLoading(true)
    await signIn('google', { callbackUrl })
  }

  return (
    <div className="min-h-screen bg-hmi-bg flex flex-col items-center justify-center p-6">
      {/* Background grid lines for industrial feel */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(#EAEAEA 1px, transparent 1px), linear-gradient(90deg, #EAEAEA 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm">
        {/* Logo / Title */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-hmi-panel border border-hmi-grid flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" strokeWidth={1.5}>
              <path d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z" stroke="#2196F3" strokeLinejoin="round" />
              <path d="M12 3V21M3 8.5L21 15.5M21 8.5L3 15.5" stroke="#2196F3" strokeOpacity={0.4} />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-hmi-text tracking-wide">{t('title')}</h1>
          <p className="text-xs text-hmi-muted tracking-widest uppercase">{t('subtitle')}</p>
        </div>

        {/* Login card */}
        <div className="w-full bg-hmi-panel border border-hmi-grid rounded-xl p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-hmi-text">{t('cardTitle')}</h2>
            <p className="text-xs text-hmi-muted leading-relaxed">
              {t('cardDescription')}
            </p>
          </div>

          <div className="h-px bg-hmi-grid" />

          <Button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full h-10 flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            {/* Google SVG icon */}
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {loading ? t('googleButtonLoading') : t('googleButtonText')}
          </Button>

          <p className="text-[11px] text-hmi-muted/70 text-center leading-relaxed">
            {t('footerDisclaimer')}
          </p>
        </div>

        {/* Back link */}
        <a
          href="/"
          className="text-xs text-hmi-muted hover:text-hmi-text transition-colors"
        >
          {t('backLink')}
        </a>
      </div>
    </div>
  )
}
