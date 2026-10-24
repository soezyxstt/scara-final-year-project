'use client'

import type { Run } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import { useTranslations, useLocale } from 'next-intl'
import { MathLabel } from '@/components/ui/math'

interface RunData {
  run: Run
  color: string
}

interface Props { runs: RunData[] }

function MetricRow({ label, runs, field, unit = '', decimals = 3 }: {
  label: string
  runs: RunData[]
  field: keyof Run
  unit?: string
  decimals?: number
}) {
  const t = useTranslations('DashboardMetricsTab')
  const locale = useLocale()
  return (
    <tr className="border-b border-hmi-grid/50 hover:bg-hmi-grid/20 transition-colors">
      <td className="px-2 py-1.5 text-[11px] font-medium text-hmi-muted sm:px-3"><MathLabel>{label}</MathLabel></td>
      {runs.map(({ run, color }) => {
        const val = run[field]
        const display = typeof val === 'number'
          ? `${val.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals
            })}${unit}`
          : typeof val === 'boolean'
            ? (val ? t('yes') : t('no'))
            : val ?? '—'
        return (
          <td key={run.id} className="px-2 py-1.5 text-right font-mono text-[11px] text-hmi-text sm:px-3">
            <span style={{ borderBottom: `2px solid ${color}`, paddingBottom: 1 }}>{display}</span>
          </td>
        )
      })}
    </tr>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td
          colSpan={100}
          className="px-2 pt-3 pb-1 text-[11px] font-semibold text-hmi-muted sm:px-3 sm:pt-4"
        >
          {title}
        </td>
      </tr>
      {children}
    </>
  )
}

export function MetricsTab({ runs }: Props) {
  const t = useTranslations('DashboardMetricsTab')

  if (runs.length === 0) {
    return <div className="p-8 text-center text-xs text-hmi-muted">{t('selectRunsMessage')}</div>
  }

  return (
    <div className="min-w-0 p-3 sm:p-4">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-hmi-grid">
            <th className="w-40 px-2 py-2 text-left text-[11px] font-semibold text-hmi-muted sm:px-3">
              {t('metric')}
            </th>
            {runs.map(({ run, color }) => (
              <th key={run.id} className="min-w-[100px] px-2 py-2 text-right text-[11px] font-semibold sm:px-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-hmi-text truncate max-w-[120px]" title={run.name}>{run.name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Section title={t('sections.runInfo')}>
            <MetricRow label={t('labels.elapsedTime')} runs={runs} field="elapsedTime" unit=" s" decimals={3} />
            <MetricRow label={t('labels.sampleCount')} runs={runs} field="sampleCount" decimals={0} />
            <MetricRow label={t('labels.startX')} runs={runs} field="x0" unit=" mm" decimals={1} />
            <MetricRow label={t('labels.startY')} runs={runs} field="y0" unit=" mm" decimals={1} />
            <MetricRow label={t('labels.targetX')} runs={runs} field="xf" unit=" mm" decimals={1} />
            <MetricRow label={t('labels.targetY')} runs={runs} field="yf" unit=" mm" decimals={1} />
          </Section>

          <Section title={t('sections.trackingAccuracy')}>
            <MetricRow label={t('labels.accuracyIdx')} runs={runs} field="accuracyIdx" decimals={4} />
            <MetricRow label={t('labels.maxErr')} runs={runs} field="maxErr" unit=" mm" decimals={3} />
            <MetricRow label={t('labels.mcte')} runs={runs} field="mcte" unit=" mm" decimals={3} />
            <MetricRow label={t('labels.mate')} runs={runs} field="mate" unit=" mm" decimals={3} />
            <MetricRow label={t('labels.rmsAte')} runs={runs} field="rmsAte" unit=" mm" decimals={3} />
            <MetricRow label={t('labels.finalErr')} runs={runs} field="finalErr" unit=" mm" decimals={3} />
            <MetricRow label={t('labels.errorRatio')} runs={runs} field="errorRatio" decimals={4} />
          </Section>

          <Section title={t('sections.controlPerformance')}>
            <MetricRow label={t('labels.pwmMax')} runs={runs} field="pwmMax" decimals={1} />
            <MetricRow label={t('labels.ctrlVariance')} runs={runs} field="ctrlVariance" decimals={4} />
            <MetricRow label={t('labels.jitter')} runs={runs} field="jitter" decimals={4} />
          </Section>
        </tbody>
        </table>
      </div>

      {/* Gains & Params per run */}
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
        {runs.map(({ run, color }) => {
          const gains = run.gainsJson ? (() => { try { return JSON.parse(run.gainsJson) } catch { return null } })() : null
          const params = run.paramsJson ? (() => { try { return JSON.parse(run.paramsJson) } catch { return null } })() : null
          return (
            <section key={run.id} className="min-w-0 border-t border-hmi-grid py-3">
              <div className="flex items-center gap-2 pb-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[11px] font-semibold text-hmi-text truncate">{run.name}</span>
              </div>

              {gains && (
                <div className="border-t border-hmi-grid/50 py-2">
                  <p className="mb-1.5 text-[11px] font-medium text-hmi-muted">{t('pidGains')}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono sm:grid-cols-3">
                    {Object.entries(gains).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-1">
                        <span className="text-hmi-muted">{k}</span>
                        <span className="text-hmi-text">{typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {params && (
                <div className="border-t border-hmi-grid/50 py-2">
                  <p className="mb-1.5 text-[11px] font-medium text-hmi-muted">{t('keyParameters')}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
                    {(['vmax', 'amax', 'cfreq', 'u1max', 'fzt', 'pwmDb', 'td1r', 'td2r', 'dben', 'dbrel'] as string[]).map(k => (
                      params[k] !== undefined && (
                        <div key={k} className="flex items-center justify-between gap-1">
                          <span className="text-hmi-muted">{k}</span>
                          <span className="text-hmi-text">
                            {typeof params[k] === 'boolean' ? (params[k] ? t('on') : t('off')) : typeof params[k] === 'number' ? params[k].toFixed(3) : String(params[k])}
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
