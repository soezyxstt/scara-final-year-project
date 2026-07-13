'use client'

import { useState, useEffect } from 'react'
import { Bot, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Run } from '@/lib/db/schema'
import { useHMISlow } from '@/lib/hmi-context'
import { useTranslations } from 'next-intl'

interface Props {
  runs: Array<{
    runId: string
    runName: string
    color: string
    run: Run
  }>
  onUpdateRunSuggestion?: (runId: string, suggestion: string) => void
}

// Helper to format inline bold text **text** to HTML tags in React
function parseInlineBold(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/)
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-bold text-hmi-text">{part}</strong>
    }
    return part
  })
}

// Sanitize LaTeX math notation to readable plain text characters
function sanitizeMath(text: string) {
  return text
    // Replace $$formula$$ block math wrappers
    .replace(/\$\$(.*?)\$\$/g, '$1')
    // Replace $formula$ inline math wrappers
    .replace(/\$(.*?)\$/g, '$1')
    // Replace common LaTeX characters
    .replace(/\\approx/g, '≈')
    .replace(/\\ge/g, '≥')
    .replace(/\\le/g, '≤')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\degree/g, '°')
    .replace(/\\text\{\s*(.*?)\s*\}/g, '$1')
    .replace(/\\%/g, '%')
}

// Custom Markdown renderer
function MarkdownRenderer({ text }: { text: string }) {
  if (!text) return null

  // Slice JSON recommendations block out of display text
  let cleanText = text
  const jsonIdx = text.indexOf('```json')
  if (jsonIdx !== -1) {
    cleanText = text.substring(0, jsonIdx).trim()
  }

  cleanText = sanitizeMath(cleanText)

  const lines = cleanText.split('\n')
  return (
    <div className="space-y-2 text-xs leading-relaxed font-sans text-hmi-text-secondary">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        
        // Heading 3
        if (line.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-xs font-bold text-hmi-ideal mt-4 mb-2 uppercase tracking-wider border-b border-hmi-grid/45 pb-1">
              {line.substring(4)}
            </h4>
          )
        }
        // Heading 2 / Heading 1
        if (line.startsWith('## ') || line.startsWith('# ')) {
          const content = line.replace(/^[#]+\s+/, '')
          return (
            <h3 key={idx} className="text-sm font-extrabold text-hmi-ideal mt-5 mb-2">
              {content}
            </h3>
          )
        }
        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.substring(2)
          return (
            <div key={idx} className="flex gap-2 ml-3 items-start my-1 text-hmi-text-secondary">
              <span className="text-hmi-ideal select-none shrink-0 mt-1">•</span>
              <span>{parseInlineBold(content)}</span>
            </div>
          )
        }
        // Ordered List
        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+(.*)/)
          const num = match?.[1] || '1'
          const content = match?.[2] || ''
          return (
            <div key={idx} className="flex gap-2 ml-3 items-start my-1 text-hmi-text-secondary">
              <span className="text-hmi-ideal font-bold select-none shrink-0">{num}.</span>
              <span>{parseInlineBold(content)}</span>
            </div>
          )
        }
        // Empty line
        if (!trimmed) return <div key={idx} className="h-1" />

        return (
          <p key={idx} className="my-1">
            {parseInlineBold(line)}
          </p>
        )
      })}
    </div>
  )
}

// Regex parser to extract structured JSON recommendations
function extractTuningJSON(text: string) {
  try {
    const match = text.match(/```json\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/)
    if (match) {
      const parsed = JSON.parse(match[1])
      if (parsed && typeof parsed === 'object' && parsed.tuning) {
        return parsed.tuning as Record<string, number>
      }
    }
  } catch (err) {
    // Incomplete stream or invalid syntax
  }
  return null
}

export function CopilotTab({ runs, onUpdateRunSuggestion }: Props) {
  const t = useTranslations('DashboardCopilotTab')
  const { state, serial } = useHMISlow()
  const [mode, setMode] = useState<'explain' | 'diagnose' | 'recommend'>('diagnose')
  const [output, setOutput] = useState('')
  const [modelUsed, setModelUsed] = useState('')
  const [loading, setLoading] = useState(false)

  const primary = runs[0]

  useEffect(() => {
    if (primary?.run) {
      setOutput(primary.run.aiSuggestion || '')
      setModelUsed('')
    } else {
      setOutput('')
      setModelUsed('')
    }
  }, [primary])

  if (runs.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center text-hmi-muted italic text-xs">
        {t('noRunsSelected')}
      </div>
    )
  }

  const handleConsult = async () => {
    const runId = primary.runId
    setLoading(true)
    setOutput('')
    setModelUsed('')

    try {
      const response = await fetch(`/api/runs/${runId}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      if (!response.body) {
        throw new Error(t('consultationFailed'))
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      let isFirstChunk = true
      let fullText = ''

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          const chunk = decoder.decode(value)
          
          if (isFirstChunk) {
            isFirstChunk = false
            const match = chunk.match(/^\[MODEL_USED:(.*?)\]\n/)
            if (match) {
              setModelUsed(match[1])
              const sliced = chunk.slice(match[0].length)
              fullText += sliced
              setOutput(prev => prev + sliced)
              continue
            }
          }

          fullText += chunk
          setOutput(prev => prev + chunk)
        }
      }

      if (onUpdateRunSuggestion) {
        onUpdateRunSuggestion(runId, fullText)
      }

    } catch (err: any) {
      toast.error(t('aiCopilotError'), { description: err.message || t('consultationFailed') })
    } finally {
      setLoading(false)
    }
  }

  const tuningParams = extractTuningJSON(output)
  const isSerialConnected = state.serialStatus === 'connected'

  const handleApplyTuning = async (tuning: Record<string, number>) => {
    const toastId = toast.loading(t('applyingRecommendations'))
    try {
      for (const [cmd, val] of Object.entries(tuning)) {
        await serial.sendCommand(`${cmd},${val}`)
      }
      await serial.sendCommand('getparams')
      await serial.sendCommand('getgains')
      toast.success(t('appliedSuccessfully'), { id: toastId })
    } catch (err: any) {
      toast.error(t('failedToApplyGains'), { description: err.message || err, id: toastId })
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header toolbar - Sticky */}
      <div className="sticky top-0 z-30 bg-hmi-bg/95 backdrop-blur-sm border border-hmi-grid p-4 rounded-lg flex flex-row items-center justify-between flex-wrap gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-hmi-ideal/15 rounded-lg text-hmi-ideal border border-hmi-ideal/30">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-hmi-text flex items-center gap-1.5">
              {t('aiCopilotFor', { runName: primary.runName })}
              {modelUsed && (
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-hmi-grid/70 text-hmi-muted border border-hmi-grid">
                  {t('via', { model: modelUsed })}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-hmi-muted">{t('persona')}</p>
          </div>
        </div>

        {/* Right side controls: Mode Selector + Action Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-hmi-bg/85 border border-hmi-grid p-1 rounded-lg">
            {(['explain', 'diagnose', 'recommend'] as const).map(m => (
              <button
                key={m}
                disabled={loading}
                onClick={() => setMode(m)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all cursor-pointer",
                  mode === m
                    ? "bg-hmi-ideal text-white shadow-sm"
                    : "text-hmi-muted hover:text-hmi-text"
                )}
              >
                {t(`modes.${m}`)}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            disabled={loading}
            onClick={handleConsult}
            className="bg-hmi-ideal hover:bg-hmi-ideal/80 text-white font-bold text-[10px] uppercase tracking-wider gap-1.5 py-1 px-3.5 h-8 shadow cursor-pointer transition-all shrink-0"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? t('consulting') : output ? t('reGenerate') : t('generate')}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      {output ? (
        <div className="flex flex-col gap-4">
          <div className="bg-hmi-panel border border-hmi-grid p-6 rounded-lg font-sans leading-relaxed">
            <MarkdownRenderer text={output} />
          </div>

          {/* One-Click Apply Action Box */}
          {tuningParams && Object.keys(tuningParams).length > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in shadow-sm">
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping shrink-0" />
                  {t('recommendationsDetected')}
                </span>
                <span className="text-[10px] text-hmi-muted font-mono leading-tight truncate">
                  {Object.entries(tuningParams).map(([cmd, val]) => `${cmd}: ${val}`).join(', ')}
                </span>
              </div>
              <Button
                size="sm"
                disabled={!isSerialConnected || loading}
                onClick={() => handleApplyTuning(tuningParams)}
                className="bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold text-[10px] uppercase tracking-wider py-1.5 px-3 h-8 shadow shrink-0 cursor-pointer transition-transform hover:scale-[1.02]"
              >
                {isSerialConnected ? t('applyToHardware') : t('connectSerialToApply')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-hmi-panel border border-dashed border-hmi-grid/50 p-12 rounded-lg flex flex-col items-center justify-center text-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-hmi-ideal animate-spin" />
              <p className="text-xs text-hmi-text-secondary font-medium animate-pulse">{t('consultingCopilot')}</p>
              <p className="text-[10px] text-hmi-muted italic">{t('consultingSub')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 max-w-sm">
              <Sparkles className="h-8 w-8 text-hmi-ideal/65 animate-pulse" />
              <p className="text-xs font-semibold text-hmi-text">{t('noCachedAnalysis')}</p>
              <p className="text-[10px] text-hmi-muted">{t('noCachedAnalysisSub')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
