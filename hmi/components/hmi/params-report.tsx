'use client'

import { useHMISlow, defaultParams } from '@/lib/hmi-context'

interface ParamsReportChartProps {
  width?: number
  height?: number
}

function SVGCard({ x, y, width, height, title, color = '#3b82f6' }: { x: number; y: number; width: number; height: number; title: string; color?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="8" fill="#131924" fillOpacity="0.7" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <line x1={x + 10} y1={y + 24} x2={x + width - 10} y2={y + 24} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      <circle cx={x + 14} cy={y + 13} r="3" fill={color} />
      <text x={x + 24} y={y + 16} fill="#F1F5F9" fontSize="10" fontWeight="700" letterSpacing="0.05em" fontFamily="system-ui, sans-serif">{title.toUpperCase()}</text>
    </g>
  )
}

function SVGParamRow({ x, y, label, cmd, value, unit = '' }: { x: number; y: number; label: string; cmd?: string; value: string; unit?: string }) {
  return (
    <g>
      <text x={x + 10} y={y + 12} fill="#94A3B8" fontSize="11" fontWeight="500" fontFamily="system-ui, sans-serif">{label}</text>
      {cmd && <text x={x + 10} y={y + 22} fill="#475569" fontSize="8" fontFamily="monospace">{`Cmd: ${cmd}`}</text>}
      <text x={x + 360 - 12} y={y + 15} fill="#06B6D4" fontSize="11" fontWeight="700" fontFamily="monospace" textAnchor="end">
        {value}
        {unit && <tspan fill="#64748B" fontSize="9" fontWeight="500" fontFamily="system-ui"> {unit}</tspan>}
      </text>
    </g>
  )
}

export function ParamsReportChart({
  width = 800,
  height = 600,
}: ParamsReportChartProps) {
  const { state } = useHMISlow()
  const currentParams = state.params || defaultParams
  const gains = state.gains
  const hasSynced = state.hasSyncedParams
  const serialStatus = state.serialStatus
  const currentMove = state.currentMove

  const fmt = (v: number | undefined, precision = 4) => {
    if (v === undefined) return '--'
    return v.toFixed(precision).replace(/\.?0+$/, '')
  }

  const timestamp = new Date().toLocaleString()

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 800 600`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        backgroundColor: '#0c101b',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <defs>
        <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e293b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Background fill */}
      <rect width="800" height="600" fill="#0c101b" rx="12" />

      {/* Header Panel */}
      <rect x="0" y="0" width="800" height="70" fill="url(#headerGrad)" />
      
      {/* Title */}
      <text x="25" y="32" fill="#F8FAFC" fontSize="15" fontWeight="800" fontFamily="system-ui, sans-serif" letterSpacing="-0.02em">
        SCARA CONTROLLER PARAMETERS REPORT
      </text>
      <text x="25" y="50" fill="#64748B" fontSize="9" fontWeight="600" fontFamily="system-ui, sans-serif" letterSpacing="0.02em">
        SYSTEM CONFIGURATION • GAINS • KINEMATIC LIMITS
      </text>

      {/* Status Badges */}
      <g transform="translate(560, 20)">
        {/* Connection status */}
        <rect x="0" y="0" width="105" height="18" rx="4" fill={serialStatus === 'connected' ? '#064e3b' : '#7f1d1d'} fillOpacity="0.6" stroke={serialStatus === 'connected' ? '#059669' : '#dc2626'} strokeWidth="1" />
        <circle cx="10" cy="9" r="3.5" fill={serialStatus === 'connected' ? '#10b981' : '#ef4444'} />
        <text x="22" y="12" fill={serialStatus === 'connected' ? '#34d399' : '#f87171'} fontSize="8" fontWeight="800" fontFamily="monospace">
          {serialStatus === 'connected' ? 'CONNECTED' : 'DISCONNECTED'}
        </text>

        {/* Sync status */}
        <rect x="112" y="0" width="105" height="18" rx="4" fill={hasSynced ? '#022c22' : '#78350f'} fillOpacity="0.6" stroke={hasSynced ? '#0f766e' : '#d97706'} strokeWidth="1" />
        <text x="164" y="12" fill={hasSynced ? '#2dd4bf' : '#fbbf24'} fontSize="8" fontWeight="800" fontFamily="monospace" textAnchor="middle">
          {hasSynced ? 'HARDWARE SYNCED' : 'OFFLINE DEFAULTS'}
        </text>
      </g>

      <line x1="0" y1="70" x2="800" y2="70" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

      {/* ================= LEFT COLUMN ================= */}
      {/* 1. Joint Gains PID & FF */}
      <g transform="translate(20, 85)">
        <SVGCard x={0} y={0} width={365} height={175} title="Joint Gains (PID & FF)" color="#10B981" />
        <g transform="translate(0, 30)">
          <SVGParamRow x={0} y={0} label="Proportional Gain (Kp1 / Kp2)" cmd="kp1 / kp2" value={`${fmt(gains?.kp1, 2)} / ${fmt(gains?.kp2, 2)}`} />
          <SVGParamRow x={0} y={32} label="Integral Gain (Ki1 / Ki2)" cmd="ki1 / ki2" value={`${fmt(gains?.ki1, 2)} / ${fmt(gains?.ki2, 2)}`} />
          <SVGParamRow x={0} y={64} label="Derivative Gain (Kd1 / Kd2)" cmd="kd1 / kd2" value={`${fmt(gains?.kd1, 2)} / ${fmt(gains?.kd2, 2)}`} />
          <SVGParamRow x={0} y={96} label="CTC FF Gain (Inertia/Coriolis/Gravity)" cmd="ffi/ffc/ffg" value={`${fmt(gains?.ffInertia, 2)} / ${fmt(gains?.ffCoriolis, 2)} / ${fmt(gains?.ffGravity, 2)}`} />
          <SVGParamRow x={0} y={128} label="Motor Microstepping Configuration" cmd="mstep" value={gains?.mstep ? `1:${gains.mstep}` : '--'} />
        </g>
      </g>

      {/* 2. Hold Mode Constants */}
      <g transform="translate(20, 275)">
        <SVGCard x={0} y={0} width={365} height={175} title="Joint Hold Mode Settings" color="#F59E0B" />
        <g transform="translate(0, 24)">
          <SVGParamRow x={0} y={0} label="J1 Hold Entry Limit (dben)" cmd="dben" value={fmt(currentParams.dben, 4)} unit="rad" />
          <SVGParamRow x={0} y={22} label="J1 Hold Exit Limit (dbrel)" cmd="dbrel" value={fmt(currentParams.dbrel, 4)} unit="rad" />
          <SVGParamRow x={0} y={44} label="J1 Hold Velocity Limit (dbvel)" cmd="dbvel" value={fmt(currentParams.dbvel, 4)} unit="rad/s" />
          <SVGParamRow x={0} y={66} label="J1 Hold Kp / Kd Scale" cmd="hskp/hskd" value={`${fmt(currentParams.hskp, 2)} / ${fmt(currentParams.hskd, 2)}`} />
          <SVGParamRow x={0} y={88} label="J2 Hold Entry Limit (db2en)" cmd="db2en" value={fmt(currentParams.db2en, 4)} unit="rad" />
          <SVGParamRow x={0} y={110} label="J2 Hold Exit Limit (db2rel)" cmd="db2rel" value={fmt(currentParams.db2rel, 4)} unit="rad" />
        </g>
      </g>

      {/* 3. Control Loop Settings */}
      <g transform="translate(20, 465)">
        <SVGCard x={0} y={0} width={365} height={110} title="Control Loop Configuration" color="#8B5CF6" />
        <g transform="translate(0, 30)">
          <SVGParamRow x={0} y={0} label="ESP32 Control Loop Frequency" cmd="cfreq" value={fmt(currentParams.cfreq, 0)} unit="Hz" />
          <SVGParamRow x={0} y={30} label="J1 Integrator Decay Coefficient" cmd="idecay" value={fmt(currentParams.idecay, 2)} />
          <SVGParamRow x={0} y={60} label="J1 Controller Saturation Limit" cmd="u1max" value={fmt(currentParams.u1max, 1)} unit="PWM" />
        </g>
      </g>

      {/* ================= RIGHT COLUMN ================= */}
      {/* 4. Motion Limits */}
      <g transform="translate(415, 85)">
        <SVGCard x={0} y={0} width={365} height={110} title="Kinematics & Motion Limits" color="#3B82F6" />
        <g transform="translate(0, 30)">
          <SVGParamRow x={0} y={0} label="Max Cartesian Path Velocity" cmd="vmax" value={fmt(currentParams.vmax, 2)} unit="m/s" />
          <SVGParamRow x={0} y={30} label="Max Cartesian Acceleration" cmd="amax" value={fmt(currentParams.amax, 2)} unit="m/s²" />
          <SVGParamRow x={0} y={60} label="Safety Joint Acceleration Limit" cmd="ddth" value={fmt(currentParams.ddth, 1)} unit="rad/s²" />
        </g>
      </g>

      {/* 5. Friction & Deadband */}
      <g transform="translate(415, 210)">
        <SVGCard x={0} y={0} width={175} height={140} title="PWM Deadband" color="#E11D48" />
        <g transform="translate(0, 30)">
          <text x="12" y="14" fill="#94A3B8" fontSize="10" fontWeight="500" fontFamily="system-ui, sans-serif">Offset (db)</text>
          <text x="12" y="38" fill="#EC4899" fontSize="15" fontWeight="700" fontFamily="monospace">{fmt(currentParams.pwmDb, 0)} <tspan fontSize="9" fill="#64748B" fontFamily="system-ui">PWM</tspan></text>

          <text x="12" y="65" fill="#94A3B8" fontSize="10" fontWeight="500" fontFamily="system-ui, sans-serif">Blending (fzt)</text>
          <text x="12" y="89" fill="#EC4899" fontSize="15" fontWeight="700" fontFamily="monospace">{fmt(currentParams.fzt, 2)} <tspan fontSize="9" fill="#64748B" fontFamily="system-ui">rad/s</tspan></text>
        </g>
      </g>
      <g transform="translate(605, 210)">
        <SVGCard x={0} y={0} width={175} height={140} title="CTC Parameters" color="#D946EF" />
        <g transform="translate(0, 30)">
          <text x="12" y="14" fill="#94A3B8" fontSize="10" fontWeight="500" fontFamily="system-ui, sans-serif">Nom Torque (taunom)</text>
          <text x="12" y="38" fill="#F472B6" fontSize="13" fontWeight="700" fontFamily="monospace">{fmt(currentParams.taunom, 3)} <tspan fontSize="9" fill="#64748B" fontFamily="system-ui">N·m</tspan></text>

          <text x="12" y="65" fill="#94A3B8" fontSize="10" fontWeight="500" fontFamily="system-ui, sans-serif">Nom Inertia (m22ref)</text>
          <text x="12" y="89" fill="#F472B6" fontSize="13" fontWeight="700" fontFamily="monospace">{fmt(currentParams.m22ref, 4)} <tspan fontSize="8" fill="#64748B" fontFamily="system-ui">kg·m²</tspan></text>
        </g>
      </g>

      {/* 6. Tracking Differentiator */}
      <g transform="translate(415, 365)">
        <SVGCard x={0} y={0} width={365} height={110} title="Tracking Differentiator (TD)" color="#06B6D4" />
        <g transform="translate(0, 30)">
          <SVGParamRow x={0} y={0} label="TD Bandwidth Joint 1 (r)" cmd="td1r" value={fmt(currentParams.td1r, 1)} unit="rad/s" />
          <SVGParamRow x={0} y={30} label="TD Bandwidth Joint 2 (r)" cmd="td2r" value={fmt(currentParams.td2r, 1)} unit="rad/s" />
          <SVGParamRow x={0} y={60} label="TD Step Size (h = 3×DT)" value={fmt(currentParams.tdH, 4)} unit="s" />
        </g>
      </g>


      {/* 7. Last Move Info */}
      <g transform="translate(415, 490)">
        <SVGCard x={0} y={0} width={365} height={85} title="Last Trajectory Move Details" color="#64748B" />
        <g transform="translate(0, 30)">
          <SVGParamRow x={0} y={0} label="Trajectory Start Coordinate (x0, y0)" value={currentMove ? `(${currentMove.x0.toFixed(1)}, ${currentMove.y0.toFixed(1)})` : '--'} unit="mm" />
          <SVGParamRow x={0} y={26} label="Trajectory Target Coordinate (xf, yf)" value={currentMove ? `(${currentMove.xf.toFixed(1)}, ${currentMove.yf.toFixed(1)})` : '--'} unit="mm" />
        </g>
      </g>

      {/* Report Footer */}
      <line x1="20" y1="585" x2="780" y2="585" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      <text x="25" y="594" fill="#334155" fontSize="7.5" fontFamily="monospace">
        SCARA DIAGNOSTICS REPORT GENERATOR V1.0.0
      </text>
      <text x="775" y="594" fill="#475569" fontSize="7.5" fontFamily="monospace" textAnchor="end">
        {timestamp}
      </text>
    </svg>
  )
}

