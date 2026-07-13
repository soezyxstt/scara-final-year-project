'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function getDefaultName() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = now.getFullYear()
  const mm = pad(now.getMonth() + 1)
  const dd = pad(now.getDate())
  const hh = pad(now.getHours())
  const min = pad(now.getMinutes())
  const ss = pad(now.getSeconds())
  return `${yyyy}-${mm}-${dd}_${hh}:${min}:${ss}`
}

interface Props {
  open: boolean
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function SaveRunDialog({ open, onConfirm, onCancel }: Props) {
  const t = useTranslations('SaveRunDialog')
  const [name, setName] = useState(getDefaultName())

  // Refresh default name each time dialog opens
  useEffect(() => {
    if (open) setName(getDefaultName())
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v: boolean) => { if (!v) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-[sheet-overlay-in_150ms_ease]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'bg-hmi-panel border border-hmi-grid rounded-lg shadow-2xl p-5 w-[360px]',
            'focus:outline-none'
          )}
        >
          <Dialog.Title className="text-sm font-bold text-hmi-text mb-1">
            {t('title')}
          </Dialog.Title>
          <Dialog.Description className="text-xs text-hmi-muted mb-4">
            {t('desc')}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-hmi-muted">{t('label')}</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-8 text-xs bg-hmi-bg border-hmi-grid"
                placeholder="YYYY-MM-DD_HH:MM:SS"
                autoFocus
              />
              {!name.trim() && (
                <p className="text-[11px] text-red-400">{t('errorEmpty')}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="text-xs h-7"
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim()}
                className="text-xs h-7 bg-hmi-ideal hover:bg-hmi-ideal-dark text-white border-0"
              >
                {t('start')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
