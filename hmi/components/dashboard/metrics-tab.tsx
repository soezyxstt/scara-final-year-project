'use client'

import type { Run } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

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
  return (
    <tr className="border-b border-hmi-grid/50 hover:bg-hmi-grid/20 transition-colors">
      <td className="py-1.5 px-3 text-[11px] text-hmi-muted font-medium">{label}</td>
      {runs.map(({ run, color }) => {
        const val = run[field]
        const display = typeof val === 'number'
          ? `${val.toFixed(decimals)}${unit}`
          : typeof val === 'boolean'
            ? (val ? 'yes' : 'no')
            : val ?? '—'
        return (
          <td key={run.id} className="py-1.5 px-3 text-[11px] text-hmi-text font-mono text-right">
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
          className="pt-4 pb-1 px-3 text-[10px] font-bold text-hmi-muted/70 uppercase tracking-widest"
        >
          {title}
        </td>
      </tr>
      {children}
    </>
  )
}

export function MetricsTab({ runs }: Props) {
  if (runs.length === 0) {
    return <div className="p-8 text-center text-xs text-hmi-muted">Select one or more runs from the sidebar.</div>
  }

  return (
    <div className="p-4 overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-hmi-grid">
            <th className="py-2 px-3 text-left text-[10px] font-bold text-hmi-muted uppercase tracking-wider w-40">
              Metric
            </th>
            {runs.map(({ run, color }) => (
              <th key={run.id} className="py-2 px-3 text-right text-[11px] font-semibold min-w-[140px]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-hmi-text truncate max-w-[120px]" title={run.name}>{run.name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Section title="Run Info">
            <MetricRow label="Elapsed time" runs={runs} field="elapsedTime" unit=" s" decimals={3} />
            <MetricRow label="Sample count" runs={runs} field="sampleCount" decimals={0} />
            <MetricRow label="Start X" runs={runs} field="x0" unit=" mm" decimals={1} />
            <MetricRow label="Start Y" runs={runs} field="y0" unit=" mm" decimals={1} />
            <MetricRow label="Target X" runs={runs} field="xf" unit=" mm" decimals={1} />
            <MetricRow label="Target Y" runs={runs} field="yf" unit=" mm" decimals={1} />
          </Section>

          <Section title="Tracking Accuracy">
            <MetricRow label="Accuracy Index (AI)" runs={runs} field="accuracyIdx" decimals={4} />
            <MetricRow label="Max CTE (ε_max)" runs={runs} field="maxErr" unit=" mm" decimals={3} />
            <MetricRow label="Mean CTE (MCTE)" runs={runs} field="mcte" unit=" mm" decimals={3} />
            <MetricRow label="Mean ATE (MATE)" runs={runs} field="mate" unit=" mm" decimals={3} />
            <MetricRow label="RMS ATE" runs={runs} field="rmsAte" unit=" mm" decimals={3} />
            <MetricRow label="Final error (ε_f)" runs={runs} field="finalErr" unit=" mm" decimals={3} />
            <MetricRow label="Error ratio (R_ε)" runs={runs} field="errorRatio" decimals={4} />
          </Section>

          <Section title="Control Performance">
            <MetricRow label="Peak PWM" runs={runs} field="pwmMax" decimals={1} />
            <MetricRow label="Ctrl variance (σ²)" runs={runs} field="ctrlVariance" decimals={4} />
            <MetricRow label="Jitter (|ΔPWM|)" runs={runs} field="jitter" decimals={4} />
          </Section>
        </tbody>
      </table>

      {/* Gains & Params per run */}
      <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: `repeat(${runs.length}, minmax(0, 1fr))` }}>
        {runs.map(({ run, color }) => {
          const gains = run.gainsJson ? (() => { try { return JSON.parse(run.gainsJson) } catch { return null } })() : null
          const params = run.paramsJson ? (() => { try { return JSON.parse(run.paramsJson) } catch { return null } })() : null
          return (
            <div key={run.id} className="bg-hmi-panel border border-hmi-grid rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-hmi-grid flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[11px] font-semibold text-hmi-text truncate">{run.name}</span>
              </div>

              {gains && (
                <div className="px-3 py-2 border-b border-hmi-grid/50">
                  <p className="text-[10px] font-bold text-hmi-muted uppercase tracking-wider mb-1.5">PID Gains</p>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px] font-mono">
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
                <div className="px-3 py-2">
                  <p className="text-[10px] font-bold text-hmi-muted uppercase tracking-wider mb-1.5">Key Parameters</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
                    {(['vmax', 'amax', 'cfreq', 'u1max', 'fzt', 'pwmDb', 'td1r', 'td2r', 'dben', 'dbrel'] as string[]).map(k => (
                      params[k] !== undefined && (
                        <div key={k} className="flex items-center justify-between gap-1">
                          <span className="text-hmi-muted">{k}</span>
                          <span className="text-hmi-text">
                            {typeof params[k] === 'boolean' ? (params[k] ? 'on' : 'off') : typeof params[k] === 'number' ? params[k].toFixed(3) : String(params[k])}
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
