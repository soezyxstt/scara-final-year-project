'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { Plus, Trash2, Sliders, ChevronDown, ChevronUp, Check, Info, Download } from 'lucide-react'
import type { Run, Sample, TrajectoryPoint } from '@/lib/db/schema'
import { computeCTEList, computeMCTE, computeATEList } from '@/lib/cte-utils'
import type { TPoint } from '@/lib/hmi-types'
import { cn } from '@/lib/utils'
import JSZip from 'jszip'

// Interfaces
interface Subgroup {
  id: string
  name: string
  runIds: string[]
  color: string
}

interface RunGroup {
  id: string
  name: string
  subgroups: Subgroup[]
}

interface RunData {
  runId: string
  runName: string
  color: string
  run: Run
  samples: Sample[]
  trajectoryPoints: TrajectoryPoint[]
}

interface Props {
  runs: RunData[] // loaded and selected runs in sidebar
  allRuns: Run[] // all runs metadata in DB
  onSelectRuns: (ids: string[]) => void
  selectedIds: string[]
}

interface RunMetrics {
  runId: string
  runName: string
  mcte: number
  mate: number
  j1Rmse: number
  j2Rmse: number
  eefRmse: number
  ssErr: number
  time: number
  mcte_accel: number
  mate_accel: number
  mcte_cruise: number
  mate_cruise: number
  mcte_decel: number
  mate_decel: number
}

interface TelemetryPoint {
  t: number
  th1: number
  th2: number
  th1d: number
  th2d: number
  e1: number
  e2: number
  eefErr: number
  cte: number
  ate: number
}

// Preset Colors for Subgroups
const PRESET_COLORS = [
  { value: '#2196F3', label: 'Blue' },
  { value: '#EF5350', label: 'Red' },
  { value: '#4CAF50', label: 'Green' },
  { value: '#FF9800', label: 'Orange' },
  { value: '#E91E63', label: 'Pink' },
  { value: '#9c27b0', label: 'Purple' },
  { value: '#00BCD4', label: 'Cyan' },
  { value: '#9E9E9E', label: 'Grey' },
]

// Metrics Definitions
const METRICS = [
  { key: 'mcte', label: 'Mean CTE (Global)', unit: 'mm', desc: 'Global Mean Cross-Track Error' },
  { key: 'mcte_accel', label: 'MCTE Accel', unit: 'mm', desc: 'Mean CTE during Acceleration (t < ta)' },
  { key: 'mcte_cruise', label: 'MCTE Cruise', unit: 'mm', desc: 'Mean CTE during Cruise (ta <= t < ta + tc)' },
  { key: 'mcte_decel', label: 'MCTE Decel', unit: 'mm', desc: 'Mean CTE during Deceleration (ta + tc <= t < tf)' },
  { key: 'mate', label: 'Mean |ATE| (Global)', unit: 'mm', desc: 'Global Mean Absolute Along-Track Error' },
  { key: 'mate_accel', label: 'MATE Accel', unit: 'mm', desc: 'Mean |ATE| during Acceleration (t < ta)' },
  { key: 'mate_cruise', label: 'MATE Cruise', unit: 'mm', desc: 'Mean |ATE| during Cruise (ta <= t < ta + tc)' },
  { key: 'mate_decel', label: 'MATE Decel', unit: 'mm', desc: 'Mean |ATE| during Deceleration (ta + tc <= t < tf)' },
  { key: 'eefRmse', label: 'EEF Error RMSE', unit: 'mm', desc: 'End-Effector Cartesian Error RMSE' },
  { key: 'j1Rmse', label: 'J1 RMSE', unit: 'rad', desc: 'Joint 1 position error RMSE' },
  { key: 'j2Rmse', label: 'J2 RMSE', unit: 'rad', desc: 'Joint 2 position error RMSE' },
  { key: 'ssErr', label: 'Steady State Error', unit: 'mm', desc: 'Cartesian error at final trajectory point' },
  { key: 'time', label: 'Time Elapsed', unit: 's', desc: 'Total execution duration' },
] as const

type MetricKey = typeof METRICS[number]['key']

// Helper to compute quantiles
function quantile(arr: number[], q: number): number {
  if (arr.length === 0) return 0
  const pos = (arr.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (arr[base + 1] !== undefined) {
    return arr[base] + rest * (arr[base + 1] - arr[base])
  }
  return arr[base]
}

// Linear interpolation helper
function interpolateSignals(points: TelemetryPoint[], tGrid: number): TelemetryPoint {
  if (points.length === 0) {
    return { t: tGrid, th1: 0, th2: 0, th1d: 0, th2d: 0, e1: 0, e2: 0, eefErr: 0, cte: 0, ate: 0 }
  }
  if (tGrid <= points[0].t) {
    return { ...points[0], t: tGrid }
  }
  if (tGrid >= points[points.length - 1].t) {
    return { ...points[points.length - 1], t: tGrid }
  }
  
  let i = 0
  for (; i < points.length - 1; i++) {
    if (points[i].t <= tGrid && points[i + 1].t >= tGrid) {
      break
    }
  }
  const pA = points[i]
  const pB = points[i + 1]
  const dt = pB.t - pA.t
  const weight = dt > 0 ? (tGrid - pA.t) / dt : 0
  
  return {
    t: tGrid,
    th1: pA.th1 + weight * (pB.th1 - pA.th1),
    th2: pA.th2 + weight * (pB.th2 - pA.th2),
    th1d: pA.th1d + weight * (pB.th1d - pA.th1d),
    th2d: pA.th2d + weight * (pB.th2d - pA.th2d),
    e1: pA.e1 + weight * (pB.e1 - pA.e1),
    e2: pA.e2 + weight * (pB.e2 - pA.e2),
    eefErr: pA.eefErr + weight * (pB.eefErr - pA.eefErr),
    cte: pA.cte + weight * (pB.cte - pA.cte),
    ate: pA.ate + weight * (pB.ate - pA.ate),
  }
}

// Statistical test calculation (Welch's t-test + Cohen's d)
interface StatisticalComparison {
  metricKey: MetricKey
  metricLabel: string
  unit: string
  meanA: number
  sdA: number
  nA: number
  meanB: number
  sdB: number
  nB: number
  diffPct: number
  tStat: number
  df: number
  pValue: number
  significance: 'Highly Significant' | 'Significant' | 'Not Significant'
  cohenD: number
  effectSize: 'Large' | 'Medium' | 'Small' | 'Negligible'
}

function calculateWelchTest(
  key: MetricKey,
  label: string,
  unit: string,
  valsA: number[],
  valsB: number[]
): StatisticalComparison | null {
  const nA = valsA.length
  const nB = valsB.length
  if (nA === 0 || nB === 0) return null
  
  const meanA = valsA.reduce((sum, v) => sum + v, 0) / nA
  const meanB = valsB.reduce((sum, v) => sum + v, 0) / nB
  
  const varA = nA > 1 ? valsA.reduce((sum, v) => sum + (v - meanA) ** 2, 0) / (nA - 1) : 0
  const varB = nB > 1 ? valsB.reduce((sum, v) => sum + (v - meanB) ** 2, 0) / (nB - 1) : 0
  
  const sdA = Math.sqrt(varA)
  const sdB = Math.sqrt(varB)
  
  const diffPct = meanA !== 0 ? ((meanB - meanA) / meanA) * 100 : 0
  
  const denom = Math.sqrt(varA / nA + varB / nB)
  let tStat = 0
  let df = 1
  let pValue = 1.0
  
  if (denom > 1e-15) {
    tStat = (meanA - meanB) / denom
    const termA = varA / nA
    const termB = varB / nB
    const num = (termA + termB) ** 2
    const den = (termA * termA) / Math.max(1, nA - 1) + (termB * termB) / Math.max(1, nB - 1)
    df = den > 0 ? num / den : 1
    
    // Wallace approximation for Student-t to normal distribution mapping
    const absT = Math.abs(tStat)
    let z = 0
    if (df > 0.5) {
      const factor = 1 - 1 / (2 * df)
      const logVal = Math.log(1 + (absT * absT) / df)
      z = Math.sqrt(Math.max(0, df * logVal * factor))
    } else {
      z = absT
    }
    
    // Normal CDF approximation
    const normalCDF = (val: number) => {
      const a1 = 0.0498673470
      const a2 = 0.0211410061
      const a3 = 0.0032776263
      const a4 = 0.0000380036
      const a5 = 0.0000488906
      const a6 = 0.0000053830
      const x = Math.abs(val)
      const poly = 1 + a1*x + a2*x*x + a3*x*x*x + a4*x*x*x*x + a5*x*x*x*x*x + a6*x*x*x*x*x*x
      const phi = 1 - 0.5 * Math.pow(poly, -16)
      return val >= 0 ? phi : 1 - phi
    }
    
    pValue = 2 * (1 - normalCDF(z))
    pValue = Math.max(0, Math.min(1, pValue))
  } else {
    if (Math.abs(meanA - meanB) < 1e-15) {
      tStat = 0
      pValue = 1.0
    } else {
      tStat = meanA > meanB ? Infinity : -Infinity
      pValue = 0.0
    }
    df = nA + nB - 2
  }
  
  let cohenD = 0
  const denomPooled = nA + nB - 2
  if (denomPooled > 0) {
    const sPooled = Math.sqrt(((nA - 1) * varA + (nB - 1) * varB) / denomPooled)
    cohenD = sPooled > 1e-15 ? (meanA - meanB) / sPooled : 0
  } else {
    const sPooled = Math.sqrt((varA + varB) / 2)
    cohenD = sPooled > 1e-15 ? (meanA - meanB) / sPooled : 0
  }
  
  let significance: 'Highly Significant' | 'Significant' | 'Not Significant' = 'Not Significant'
  if (pValue < 0.01) significance = 'Highly Significant'
  else if (pValue < 0.05) significance = 'Significant'
  
  const absD = Math.abs(cohenD)
  let effectSize: 'Large' | 'Medium' | 'Small' | 'Negligible' = 'Negligible'
  if (absD >= 0.8) effectSize = 'Large'
  else if (absD >= 0.5) effectSize = 'Medium'
  else if (absD >= 0.2) effectSize = 'Small'
  
  return {
    metricKey: key,
    metricLabel: label,
    unit,
    meanA,
    sdA,
    nA,
    meanB,
    sdB,
    nB,
    diffPct,
    tStat,
    df,
    pValue,
    significance,
    cohenD,
    effectSize
  }
}

function getTrajectoryPhases(r: Run) {
  const x0 = r.x0 ?? 0
  const y0 = r.y0 ?? 0
  const xf = r.xf ?? 0
  const yf = r.yf ?? 0
  const dx = (xf - x0) / 1000
  const dy = (yf - y0) / 1000
  const D = Math.sqrt(dx * dx + dy * dy)
  
  let vmax = 0.35
  let amax = 0.6
  
  if (r.paramsJson) {
    try {
      const params = JSON.parse(r.paramsJson)
      if (params.vmax && typeof params.vmax === 'number') vmax = params.vmax
      if (params.amax && typeof params.amax === 'number') amax = params.amax
    } catch {}
  }
  
  let ta = 0.583
  let tc = 0
  let tf = 0
  
  if (D >= 0.001) {
    const calculated_ta = vmax / amax
    const da = 0.5 * amax * calculated_ta * calculated_ta
    if (2.0 * da > D) {
      ta = Math.sqrt(D / amax)
      tc = 0
    } else {
      ta = calculated_ta
      tc = (D - 2.0 * da) / vmax
    }
    tf = 2.0 * ta + tc
  }
  
  if (ta <= 1e-3) {
    ta = 0.583
  }
  
  return {
    ta: ta * 1000,
    tc: tc * 1000,
    tf: tf * 1000,
  }
}



export function GroupCompareTab({ runs, allRuns, onSelectRuns, selectedIds }: Props) {
  // State
  const [groups, setGroups] = useState<RunGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string>('')
  const [editorExpanded, setEditorExpanded] = useState<boolean>(false)
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('mcte')
  const [cteCollapsed, setCteCollapsed] = useState<boolean>(false)
  const [ateCollapsed, setAteCollapsed] = useState<boolean>(false)
  
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number
    y: number
    content: React.ReactNode
  } | null>(null)
  
  const [selectedJointSgId, setSelectedJointSgId] = useState<string>('')
  const [subgroupAId, setSubgroupAId] = useState<string>('')
  const [subgroupBId, setSubgroupBId] = useState<string>('')

  // Load Groups from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('scara_run_groups')
    const storedActiveId = localStorage.getItem('scara_active_group_id')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as RunGroup[]
        setGroups(parsed)
        if (parsed.length > 0) {
          if (storedActiveId && parsed.some(g => g.id === storedActiveId)) {
            setActiveGroupId(storedActiveId)
          } else {
            setActiveGroupId(parsed[0].id)
          }
        }
      } catch (e) {
        console.error('Error loading run groups:', e)
      }
    } else {
      // Setup a default initial group
      const defaultGroup: RunGroup = {
        id: 'default-group-1',
        name: 'PID & Velocity Optimization',
        subgroups: [
          { id: 'sub-def-1', name: 'Standard Tuned (Kp=15)', runIds: [], color: '#2196F3' },
          { id: 'sub-def-2', name: 'Aggressive Tuned (Kp=25)', runIds: [], color: '#EF5350' }
        ]
      }
      setGroups([defaultGroup])
      setActiveGroupId(defaultGroup.id)
      localStorage.setItem('scara_run_groups', JSON.stringify([defaultGroup]))
      localStorage.setItem('scara_active_group_id', defaultGroup.id)
    }
  }, [])

  // Save utility
  const saveGroups = (newGroups: RunGroup[]) => {
    setGroups(newGroups)
    localStorage.setItem('scara_run_groups', JSON.stringify(newGroups))
  }

  // Active group selection helper with persistence
  const changeActiveGroupId = (id: string) => {
    setActiveGroupId(id)
    if (id) {
      localStorage.setItem('scara_active_group_id', id)
    } else {
      localStorage.removeItem('scara_active_group_id')
    }
  }

  // Active Group helper
  const activeGroup = useMemo(() => {
    return groups.find(g => g.id === activeGroupId) || null
  }, [groups, activeGroupId])

  // Extract all run IDs in the current active group configuration
  const activeGroupRunIds = useMemo(() => {
    if (!activeGroup) return []
    return activeGroup.subgroups.flatMap(sg => sg.runIds)
  }, [activeGroup])

  // Automatically select the active group's runs in the sidebar if they are not selected.
  // This ensures the data is automatically loaded when switching tabs or closing the editor.
  useEffect(() => {
    if (activeGroup && activeGroupRunIds.length > 0) {
      const selectedSet = new Set(selectedIds)
      const missing = activeGroupRunIds.filter(id => !selectedSet.has(id))
      if (missing.length > 0) {
        const nextIds = Array.from(new Set([...selectedIds, ...activeGroupRunIds]))
        onSelectRuns(nextIds)
      }
    }
  }, [activeGroupId, activeGroupRunIds, onSelectRuns, selectedIds, activeGroup])

  // Unassigned runs that are selected in sidebar but not in current active group
  const unassignedSelectedRuns = useMemo(() => {
    if (!activeGroup) return []
    const assigned = new Set(activeGroupRunIds)
    return runs.filter(r => !assigned.has(r.runId))
  }, [activeGroup, activeGroupRunIds, runs])

  // Grouped runs that are in config but not currently selected/loaded from sidebar
  const unloadedGroupRuns = useMemo(() => {
    if (!activeGroup) return []
    const loadedIds = new Set(runs.map(r => r.runId))
    const missingIds = activeGroupRunIds.filter(id => !loadedIds.has(id))
    return allRuns.filter(r => missingIds.includes(r.id))
  }, [activeGroup, activeGroupRunIds, runs, allRuns])

  // Calculate Metrics for loaded runs
  const computedMetrics = useMemo(() => {
    const map: Record<string, RunMetrics> = {}
    for (const r of runs) {
      const t0 = r.samples[0]?.t ?? 0
      const tPoints = r.trajectoryPoints.map(p => ({
        xi: p.xi ?? 0, yi: p.yi ?? 0, xa: p.xa ?? 0, ya: p.ya ?? 0
      }))
      const ctes = computeCTEList(tPoints)
      const ates = computeATEList(tPoints)
      
      const mcte = computeMCTE(tPoints, ctes)
      const mate = ates.length > 0 ? ates.reduce((sum, v) => sum + Math.abs(v), 0) / ates.length : 0
      
      // Dynamic trajectory phases
      const { ta, tc, tf } = getTrajectoryPhases(r.run)
      
      const accelCtes: number[] = []
      const accelAtes: number[] = []
      const cruiseCtes: number[] = []
      const cruiseAtes: number[] = []
      const decelCtes: number[] = []
      const decelAtes: number[] = []
      
      for (let i = 0; i < tPoints.length; i++) {
        const sample = r.samples[i]
        const tRel = sample ? (sample.t - t0) : i * 10
        const cte = ctes[i] ?? 0
        const ate = Math.abs(ates[i] ?? 0)
        
        if (tRel < ta) {
          accelCtes.push(cte)
          accelAtes.push(ate)
        } else if (tRel < ta + tc) {
          cruiseCtes.push(cte)
          cruiseAtes.push(ate)
        } else if (tRel < tf) {
          decelCtes.push(cte)
          decelAtes.push(ate)
        }
      }
      
      const meanVal = (arr: number[]) => arr.length > 0 ? arr.reduce((sum, v) => sum + v, 0) / arr.length : 0
      
      const mcte_accel = meanVal(accelCtes)
      const mate_accel = meanVal(accelAtes)
      const mcte_cruise = meanVal(cruiseCtes)
      const mate_cruise = meanVal(cruiseAtes)
      const mcte_decel = meanVal(decelCtes)
      const mate_decel = meanVal(decelAtes)
      
      const j1Rmse = r.samples.length > 0
        ? Math.sqrt(r.samples.reduce((sum, s) => sum + (s.e1 ?? 0) ** 2, 0) / r.samples.length)
        : 0
      const j2Rmse = r.samples.length > 0
        ? Math.sqrt(r.samples.reduce((sum, s) => sum + (s.e2 ?? 0) ** 2, 0) / r.samples.length)
        : 0
        
      const eefRmse = r.trajectoryPoints.length > 0
        ? Math.sqrt(r.trajectoryPoints.reduce((sum, pt) => {
            const dx = (pt.xa ?? 0) - (pt.xi ?? 0)
            const dy = (pt.ya ?? 0) - (pt.yi ?? 0)
            return sum + dx*dx + dy*dy
          }, 0) / r.trajectoryPoints.length)
        : 0
        
      const lastPt = r.trajectoryPoints[r.trajectoryPoints.length - 1]
      const ssErr = lastPt
        ? Math.sqrt(((lastPt.xa ?? 0) - (lastPt.xi ?? 0))**2 + ((lastPt.ya ?? 0) - (lastPt.yi ?? 0))**2)
        : 0
        
      const time = r.run.elapsedTime ?? 0
      
      map[r.runId] = {
        runId: r.runId,
        runName: r.runName,
        mcte,
        mate,
        j1Rmse,
        j2Rmse,
        eefRmse,
        ssErr,
        time,
        mcte_accel,
        mate_accel,
        mcte_cruise,
        mate_cruise,
        mcte_decel,
        mate_decel
      }
    }
    return map
  }, [runs])

  // Extract resampled raw telemetry data for relative aligned averages
  const runsTelemetryData = useMemo(() => {
    const data: Record<string, TelemetryPoint[]> = {}
    for (const r of runs) {
      const t0 = r.samples[0]?.t ?? 0
      const tPoints = r.trajectoryPoints.map(p => ({
        xi: p.xi ?? 0, yi: p.yi ?? 0, xa: p.xa ?? 0, ya: p.ya ?? 0
      }))
      const ctes = computeCTEList(tPoints)
      const ates = computeATEList(tPoints)
      
      data[r.runId] = r.samples.map((s, i) => {
        const pt = r.trajectoryPoints[i] || { xi: 0, yi: 0, xa: 0, ya: 0 }
        const dx = (pt.xa ?? 0) - (pt.xi ?? 0)
        const dy = (pt.ya ?? 0) - (pt.yi ?? 0)
        return {
          t: s.t - t0,
          th1: s.th1 ?? 0,
          th2: s.th2 ?? 0,
          th1d: s.th1d ?? 0,
          th2d: s.th2d ?? 0,
          e1: s.e1 ?? 0,
          e2: s.e2 ?? 0,
          eefErr: Math.sqrt(dx * dx + dy * dy),
          cte: ctes[i] ?? 0,
          ate: ates[i] ?? 0,
        }
      })
    }
    return data
  }, [runs])

  // Common Relative Time Grid (100 points, 0 to max duration among loaded runs)
  const maxT = useMemo(() => {
    let highest = 0
    for (const rId in runsTelemetryData) {
      const pts = runsTelemetryData[rId]
      if (pts.length > 0) {
        const last = pts[pts.length - 1]
        if (last.t > highest) highest = last.t
      }
    }
    return highest || 1000
  }, [runsTelemetryData])

  const timeGrid = useMemo(() => {
    return Array.from({ length: 100 }, (_, idx) => (idx / 99) * maxT)
  }, [maxT])

  // Subgroup resampled averages
  const subgroupAverages = useMemo(() => {
    if (!activeGroup) return []
    return activeGroup.subgroups.map(sg => {
      const runsInSg = sg.runIds.map(id => runsTelemetryData[id]).filter(Boolean)
      if (runsInSg.length === 0) {
        return { subgroup: sg, data: [] }
      }
      
      const avgPoints = timeGrid.map(tGrid => {
        const interpolated = runsInSg.map(pts => interpolateSignals(pts, tGrid))
        const n = interpolated.length
        
        const sum = interpolated.reduce(
          (acc, val) => {
            acc.th1 += val.th1
            acc.th2 += val.th2
            acc.th1d += val.th1d
            acc.th2d += val.th2d
            acc.e1 += val.e1
            acc.e2 += val.e2
            acc.eefErr += val.eefErr
            acc.cte += val.cte
            acc.ate += val.ate
            return acc
          },
          { th1: 0, th2: 0, th1d: 0, th2d: 0, e1: 0, e2: 0, eefErr: 0, cte: 0, ate: 0 }
        )
        
        return {
          t: tGrid,
          th1: sum.th1 / n,
          th2: sum.th2 / n,
          th1d: sum.th1d / n,
          th2d: sum.th2d / n,
          e1: sum.e1 / n,
          e2: sum.e2 / n,
          eefErr: sum.eefErr / n,
          cte: sum.cte / n,
          ate: sum.ate / n,
        }
      })
      
      return { subgroup: sg, data: avgPoints }
    })
  }, [activeGroup, runsTelemetryData, timeGrid])

  // Format Averaged Aligned Averages for Recharts (single combined table)
  const averageChartData = useMemo(() => {
    if (subgroupAverages.length === 0) return []
    return timeGrid.map((tVal, idx) => {
      const row: Record<string, number> = { t: tVal }
      for (const sgAvg of subgroupAverages) {
        const pt = sgAvg.data[idx]
        if (pt) {
          row[`${sgAvg.subgroup.id}_eefErr`] = pt.eefErr
          row[`${sgAvg.subgroup.id}_cte`] = pt.cte
          row[`${sgAvg.subgroup.id}_ate`] = pt.ate
          row[`${sgAvg.subgroup.id}_e1`] = pt.e1
          row[`${sgAvg.subgroup.id}_e2`] = pt.e2
        }
      }
      return row
    })
  }, [timeGrid, subgroupAverages])

  // Joint position select default on load
  useEffect(() => {
    if (activeGroup?.subgroups.length && !selectedJointSgId) {
      const firstWithRuns = activeGroup.subgroups.find(s => s.runIds.length > 0)
      if (firstWithRuns) {
        setSelectedJointSgId(firstWithRuns.id)
      } else {
        setSelectedJointSgId(activeGroup.subgroups[0].id)
      }
    }
  }, [activeGroup, selectedJointSgId])

  const jointPositionsChartData = useMemo(() => {
    const sgAvg = subgroupAverages.find(s => s.subgroup.id === selectedJointSgId)
    return sgAvg?.data ?? []
  }, [subgroupAverages, selectedJointSgId])

  // Box Plot Stats for Selected Metric
  const boxPlotData = useMemo(() => {
    if (!activeGroup) return []
    return activeGroup.subgroups.map(sg => {
      const runsInSg = sg.runIds.map(id => computedMetrics[id]).filter(Boolean)
      const vals = runsInSg.map(r => r[selectedMetric])
      if (vals.length === 0) {
        return { subgroup: sg, runs: runsInSg, stats: null }
      }
      const sorted = [...vals].sort((a, b) => a - b)
      const min = sorted[0]
      const max = sorted[sorted.length - 1]
      const q1 = quantile(sorted, 0.25)
      const median = quantile(sorted, 0.50)
      const q3 = quantile(sorted, 0.75)
      const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length
      
      return {
        subgroup: sg,
        runs: runsInSg,
        stats: { min, q1, median, q3, max, mean, n: vals.length, values: vals }
      }
    })
  }, [activeGroup, computedMetrics, selectedMetric])

  // Overall metric range for SVG box plot alignment
  const overallExtent = useMemo(() => {
    const allVals = boxPlotData.flatMap(d => d.stats ? d.stats.values : [])
    if (allVals.length === 0) return { min: 0, max: 10 }
    const min = Math.min(...allVals)
    const max = Math.max(...allVals)
    const range = max - min
    const pad = range === 0 ? 0.5 : range * 0.15
    return {
      min: Math.max(0, min - pad),
      max: max + pad
    }
  }, [boxPlotData])

  // Setup statistical t-test selectors default
  useEffect(() => {
    if (activeGroup && activeGroup.subgroups.length >= 2) {
      const activeIds = activeGroup.subgroups.map(s => s.id)
      if (!activeIds.includes(subgroupAId) || !activeIds.includes(subgroupBId)) {
        setSubgroupAId(activeGroup.subgroups[0].id)
        setSubgroupBId(activeGroup.subgroups[1].id)
      }
    } else {
      setSubgroupAId('')
      setSubgroupBId('')
    }
  }, [activeGroup])

  // Run Welch's t-test on metrics
  const statisticalComparisons = useMemo(() => {
    if (!activeGroup || !subgroupAId || !subgroupBId || subgroupAId === subgroupBId) return []
    const sgA = activeGroup.subgroups.find(s => s.id === subgroupAId)
    const sgB = activeGroup.subgroups.find(s => s.id === subgroupBId)
    if (!sgA || !sgB) return []
    
    const runsA = sgA.runIds.map(id => computedMetrics[id]).filter(Boolean)
    const runsB = sgB.runIds.map(id => computedMetrics[id]).filter(Boolean)
    
    return METRICS.map(m => {
      const valsA = runsA.map(r => r[m.key])
      const valsB = runsB.map(r => r[m.key])
      return calculateWelchTest(m.key, m.label, m.unit, valsA, valsB)
    }).filter(Boolean) as StatisticalComparison[]
  }, [activeGroup, subgroupAId, subgroupBId, computedMetrics])

  // Reference Desired Path points in mm
  const referencePoints = useMemo(() => {
    const firstRun = runs[0]
    if (!firstRun) return []
    return firstRun.trajectoryPoints.map(p => ({
      xi: p.xi ?? 0,
      yi: p.yi ?? 0
    }))
  }, [runs])

  // Normal vectors for reference points
  const normalVectors = useMemo(() => {
    const N = referencePoints.length
    if (N === 0) return []
    const normals: { nx: number; ny: number }[] = []
    
    for (let k = 0; k < N; k++) {
      let tx = 0
      let ty = 0
      if (k < N - 1) {
        tx = referencePoints[k + 1].xi - referencePoints[k].xi
        ty = referencePoints[k + 1].yi - referencePoints[k].yi
      } else if (k > 0) {
        tx = referencePoints[k].xi - referencePoints[k - 1].xi
        ty = referencePoints[k].yi - referencePoints[k - 1].yi
      }
      
      const mag = Math.sqrt(tx * tx + ty * ty)
      if (mag > 1e-6) {
        const utx = tx / mag
        const uty = ty / mag
        normals.push({ nx: -uty, ny: utx })
      } else {
        normals.push({ nx: 0, ny: 0 })
      }
    }
    return normals
  }, [referencePoints])

  // Subgroup averaged Cartesian points and standard deviations
  const subgroupTraces = useMemo(() => {
    if (!activeGroup || referencePoints.length === 0) return []
    
    return activeGroup.subgroups.map(sg => {
      const sgRuns = runs.filter(r => sg.runIds.includes(r.runId))
      if (sgRuns.length === 0) {
        return { subgroup: sg, points: [] }
      }
      
      const N = referencePoints.length
      const tracePoints = Array.from({ length: N }, (_, k) => {
        const ref = referencePoints[k]
        const norm = normalVectors[k] || { nx: 0, ny: 0 }
        
        const deviations: number[] = []
        for (const run of sgRuns) {
          const pt = run.trajectoryPoints[k]
          if (pt) {
            const dx = (pt.xa ?? 0) - ref.xi
            const dy = (pt.ya ?? 0) - ref.yi
            const dev = dx * norm.nx + dy * norm.ny
            deviations.push(dev)
          }
        }
        
        if (deviations.length === 0) {
          return {
            x: ref.xi, y: ref.yi,
            xUpper: ref.xi, yUpper: ref.yi,
            xLower: ref.xi, yLower: ref.yi,
            sd: 0, meanDev: 0
          }
        }
        
        const meanDev = deviations.reduce((a, b) => a + b, 0) / deviations.length
        const variance = deviations.reduce((sum, d) => sum + (d - meanDev) ** 2, 0) / deviations.length
        const sd = Math.sqrt(variance)
        
        const x = ref.xi + meanDev * norm.nx
        const y = ref.yi + meanDev * norm.ny
        
        const xUpper = ref.xi + (meanDev + sd) * norm.nx
        const yUpper = ref.yi + (meanDev + sd) * norm.ny
        
        const xLower = ref.xi + (meanDev - sd) * norm.nx
        const yLower = ref.yi + (meanDev - sd) * norm.ny
        
        return { x, y, xUpper, yUpper, xLower, yLower, sd, meanDev }
      })
      
      return { subgroup: sg, points: tracePoints }
    })
  }, [activeGroup, referencePoints, normalVectors, runs])

  // Bounding box for mapping
  const boundingBox = useMemo(() => {
    if (referencePoints.length === 0) return { xMin: 0, xMax: 100, yMin: 0, yMax: 100 }
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    
    referencePoints.forEach(p => {
      if (p.xi < xMin) xMin = p.xi
      if (p.xi > xMax) xMax = p.xi
      if (p.yi < yMin) yMin = p.yi
      if (p.yi > yMax) yMax = p.yi
    })
    
    subgroupTraces.forEach(t => {
      t.points.forEach(p => {
        if (p.x < xMin) xMin = p.x
        if (p.x > xMax) xMax = p.x
        if (p.y < yMin) yMin = p.y
        if (p.y > yMax) yMax = p.y
        if (p.xUpper < xMin) xMin = p.xUpper
        if (p.xUpper > xMax) xMax = p.xUpper
        if (p.yUpper < yMin) yMin = p.yUpper
        if (p.yUpper > yMax) yMax = p.yUpper
        if (p.xLower < xMin) xMin = p.xLower
        if (p.xLower > xMax) xMax = p.xLower
        if (p.yLower < yMin) yMin = p.yLower
        if (p.yLower > yMax) yMax = p.yLower
      })
    })
    
    return { xMin, xMax, yMin, yMax }
  }, [referencePoints, subgroupTraces])

  // Screen coordinate scaler
  const mapPoints = useMemo(() => {
    const { xMin, xMax, yMin, yMax } = boundingBox
    const xMid = (xMin + xMax) / 2
    const yMid = (yMin + yMax) / 2
    const rx = xMax - xMin
    const ry = yMax - yMin
    const rMax = Math.max(rx, ry, 20)
    
    const width = 500
    const height = 400
    
    const marginLeft = 75
    const marginRight = 30
    const marginTop = 60
    const marginBottom = 50
    
    const chartW = width - marginLeft - marginRight
    const chartH = height - marginTop - marginBottom
    const scale = Math.min(chartW / rMax, chartH / rMax)
    
    const chartXMid = marginLeft + chartW / 2
    const chartYMid = marginTop + chartH / 2
    
    const toScreen = (x: number, y: number) => ({
      x: chartXMid + (x - xMid) * scale,
      y: chartYMid - (y - yMid) * scale
    })
    
    return { toScreen, xMin, xMax, yMin, yMax }
  }, [boundingBox])

  // UI Tick generator for XY Trace
  const uiTicks = useMemo(() => {
    const { xMin, xMax, yMin, yMax } = boundingBox
    const numTicks = 5
    const xTicks = Array.from({ length: numTicks + 1 }).map((_, i) => xMin + i * (xMax - xMin) / numTicks)
    const yTicks = Array.from({ length: numTicks + 1 }).map((_, i) => yMin + i * (yMax - yMin) / numTicks)
    return { xTicks, yTicks }
  }, [boundingBox])

  const handleExportReport = async () => {
    if (!activeGroup) return
    const safeName = activeGroup.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()

    const zip = new JSZip()

    // 1. Generate CSV for metrics
    let csvContent = 'Run Name,Subgroup,MCTE (Global),MCTE Accel,MCTE Cruise,MCTE Decel,MATE (Global),MATE Accel,MATE Cruise,MATE Decel,EEF RMSE,J1 RMSE,J2 RMSE,SS Error,Time\n'
    activeGroup.subgroups.forEach(sg => {
      const runsInSg = sg.runIds.map(id => computedMetrics[id]).filter(Boolean)
      runsInSg.forEach(rMetrics => {
        csvContent += [
          `"${rMetrics.runName}"`,
          `"${sg.name}"`,
          rMetrics.mcte.toFixed(6),
          rMetrics.mcte_accel.toFixed(6),
          rMetrics.mcte_cruise.toFixed(6),
          rMetrics.mcte_decel.toFixed(6),
          rMetrics.mate.toFixed(6),
          rMetrics.mate_accel.toFixed(6),
          rMetrics.mate_cruise.toFixed(6),
          rMetrics.mate_decel.toFixed(6),
          rMetrics.eefRmse.toFixed(6),
          rMetrics.j1Rmse.toFixed(6),
          rMetrics.j2Rmse.toFixed(6),
          rMetrics.ssErr.toFixed(6),
          `${rMetrics.time.toFixed(2)}`
        ].join(',') + '\n'
      })
    })
    zip.file('scara_metrics.csv', csvContent)

    // 2. Generate CSV for Welch t-tests
    let tTestCsv = 'Comparison,Metric,Mean A,SD A,N A,Mean B,SD B,N B,Diff %,t-stat,df,p-value,Significance,Cohen d,Effect Size\n'
    if (activeGroup.subgroups.length >= 2) {
      for (let i = 0; i < activeGroup.subgroups.length; i++) {
        for (let j = i + 1; j < activeGroup.subgroups.length; j++) {
          const sgA = activeGroup.subgroups[i]
          const sgB = activeGroup.subgroups[j]
          const runsA = sgA.runIds.map(id => computedMetrics[id]).filter(Boolean)
          const runsB = sgB.runIds.map(id => computedMetrics[id]).filter(Boolean)
          
          if (runsA.length > 0 && runsB.length > 0) {
            const comparisons = METRICS.map(m => {
              const valsA = runsA.map(r => r[m.key as keyof RunMetrics] as number)
              const valsB = runsB.map(r => r[m.key as keyof RunMetrics] as number)
              return calculateWelchTest(m.key, m.label, m.unit, valsA, valsB)
            }).filter(Boolean) as StatisticalComparison[]
            
            comparisons.forEach(c => {
              tTestCsv += [
                `"${sgA.name} vs ${sgB.name}"`,
                `"${c.metricLabel} (${c.unit})"`,
                c.meanA.toFixed(6),
                c.sdA.toFixed(6),
                c.nA,
                c.meanB.toFixed(6),
                c.sdB.toFixed(6),
                c.nB,
                c.diffPct.toFixed(4),
                c.tStat.toFixed(4),
                c.df.toFixed(4),
                c.pValue.toFixed(6),
                `"${c.significance}"`,
                c.cohenD.toFixed(6),
                `"${c.effectSize}"`
              ].join(',') + '\n'
            })
          }
        }
      }
      zip.file('scara_ttests.csv', tTestCsv)
    }

    // 3. Prepare stats for plots
    const allBoxPlotStats = METRICS.map(m => {
      const stats = activeGroup.subgroups.map(sg => {
        const runsInSg = sg.runIds.map(id => computedMetrics[id]).filter(Boolean)
        const vals = runsInSg.map(r => r[m.key as keyof RunMetrics] as number)
        if (vals.length === 0) {
          return { subgroup: sg, stats: null }
        }
        const sorted = [...vals].sort((a, b) => a - b)
        const min = sorted[0]
        const max = sorted[sorted.length - 1]
        const q1 = quantile(sorted, 0.25)
        const median = quantile(sorted, 0.50)
        const q3 = quantile(sorted, 0.75)
        const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length
        return {
          subgroup: sg,
          stats: { min, q1, median, q3, max, mean, n: vals.length, values: vals }
        }
      })
      return { metric: m, subgroupsStats: stats }
    })

    // Helper to generate SVG Box Plot string styled for academic papers
    const generateBoxPlotSvgStr = (metricKey: string, metricLabel: string, unit: string, subgroupsStats: any[]) => {
      const allVals = subgroupsStats.flatMap(d => d.stats ? d.stats.values : [])
      if (allVals.length === 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 80" width="600" height="80"><text x="300" y="40" fill="#000000" text-anchor="middle" font-size="12" font-family="'Times New Roman', serif">No data available</text></svg>`
      }
      const minVal = Math.min(...allVals)
      const maxVal = Math.max(...allVals)
      const range = maxVal - minVal
      const pad = range === 0 ? 0.5 : range * 0.15
      const extMin = Math.max(0, minVal - pad)
      const extMax = maxVal + pad

      const marginLeft = 130
      const marginRight = 30
      const w = 600
      const chartW = w - marginLeft - marginRight
      const rowH = 60
      const h = subgroupsStats.length * rowH + 85

      const getX = (val: number) => {
        if (extMax === extMin) return marginLeft + chartW / 2
        return marginLeft + ((val - extMin) / (extMax - extMin)) * chartW
      }

      const formatNum = (val: number) => {
        if (val >= 1000) return val.toFixed(1)
        if (val < 0.001) return val.toExponential(3)
        return val.toFixed(4)
      }

      let content = ''
      
      // Title
      content += `<text x="300" y="20" font-weight="bold" text-anchor="middle" font-size="14px" fill="#000000">${metricLabel} (${unit})</text>`

      // Legend
      content += `
        <g transform="translate(85, 36)">
          <polygon points="0,-4 4,0 0,4 -4,0" fill="#FFFFFF" stroke="#000000" stroke-width="1.5" />
          <text x="8" y="3" fill="#000000" font-size="10px" font-family="'Times New Roman', serif">Mean</text>

          <line x1="75" y1="0" x2="90" y2="0" stroke="#000000" stroke-width="3" />
          <text x="96" y="3" fill="#000000" font-size="10px" font-family="'Times New Roman', serif">Median</text>

          <rect x="170" y="-5" width="15" height="10" fill="#000000" fill-opacity="0.15" stroke="#000000" stroke-width="1.5" />
          <text x="190" y="3" fill="#000000" font-size="10px" font-family="'Times New Roman', serif">IQR (Q1-Q3)</text>

          <circle cx="300" cy="0" r="3.5" fill="#FFFFFF" stroke="#000000" stroke-width="1.5" />
          <text x="308" y="3" fill="#000000" font-size="10px" font-family="'Times New Roman', serif">Runs (Jittered)</text>
        </g>
      `

      // Grid lines
      for (let i = 0; i <= 4; i++) {
        const v = extMin + i * (extMax - extMin) / 4
        const x = getX(v)
        content += `
          <line x1="${x}" y1="50" x2="${x}" y2="${h - 35}" stroke="#D0D0D0" stroke-dasharray="2,2" stroke-width="1" />
          <text x="${x}" y="${h - 18}" fill="#000000" font-size="12px" text-anchor="middle" font-family="'Times New Roman', serif">${formatNum(v)}</text>
        `
      }

      // Rows
      subgroupsStats.forEach((sgData, idx) => {
        const { subgroup, stats } = sgData
        const yCenter = 50 + idx * rowH + rowH / 2
        
        // Label
        content += `<text x="15" y="${yCenter + 4}" fill="#000000" font-size="12px" font-weight="bold" font-family="'Times New Roman', serif">${subgroup.name}</text>`
        
        if (!stats) {
          content += `<text x="${marginLeft + 10}" y="${yCenter + 4}" fill="#757575" font-size="12px" font-style="italic" font-family="'Times New Roman', serif">No runs assigned</text>`
          return
        }

        const xMin = getX(stats.min)
        const xMax = getX(stats.max)
        const xQ1 = getX(stats.q1)
        const xMed = getX(stats.median)
        const xQ3 = getX(stats.q3)
        const xMean = getX(stats.mean)

        // Whisker line
        content += `<line x1="${xMin}" y1="${yCenter}" x2="${xMax}" y2="${yCenter}" stroke="${subgroup.color}" stroke-width="2" />`
        // Whisker caps
        content += `<line x1="${xMin}" y1="${yCenter - 6}" x2="${xMin}" y2="${yCenter + 6}" stroke="${subgroup.color}" stroke-width="2" />`
        content += `<line x1="${xMax}" y1="${yCenter - 6}" x2="${xMax}" y2="${yCenter + 6}" stroke="${subgroup.color}" stroke-width="2" />`
        
        // Box
        content += `<rect x="${xQ1}" y="${yCenter - 12}" width="${Math.max(1, xQ3 - xQ1)}" height="24" fill="${subgroup.color}" fill-opacity="0.15" stroke="${subgroup.color}" stroke-width="2" />`
        
        // Median line
        content += `<line x1="${xMed}" y1="${yCenter - 12}" x2="${xMed}" y2="${yCenter + 12}" stroke="${subgroup.color}" stroke-width="4.5" />`
        
        // Mean diamond
        content += `<polygon points="${xMean},${yCenter - 5} ${xMean + 5},${yCenter} ${xMean},${yCenter + 5} ${xMean - 5},${yCenter}" fill="#FFFFFF" stroke="${subgroup.color}" stroke-width="1.5" />`

        // Jittered dots
        stats.values.forEach((v: number, dotIdx: number) => {
          const pseudoNoise = Math.sin(dotIdx * 7.5 + idx * 3) * 6
          const xDot = getX(v)
          const yDot = yCenter + pseudoNoise
          content += `<circle cx="${xDot}" cy="${yDot}" r="4" fill="#FFFFFF" stroke="${subgroup.color}" stroke-width="2" />`
        })
      })

      const svgStyle = `
        <style>
          svg { background-color: #FFFFFF !important; }
          text { font-family: 'Times New Roman', Times, serif !important; font-size: 12pt !important; fill: #000000 !important; }
        </style>
      `
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 ${h}" width="600" height="${h}" style="background:#FFFFFF; border:1px solid #D0D0D0; border-radius:4px; font-family:'Times New Roman', Times, serif;">${svgStyle}${content}</svg>`
    }

    // Helper to generate SVG Line Chart string styled for academic papers
    const generateLineChartSvgStr = (title: string, dataKey: string, unit: string) => {
      let minVal = Infinity
      let maxVal = -Infinity
      subgroupAverages.forEach(sgAvg => {
        sgAvg.data.forEach(pt => {
          const val = pt[dataKey as keyof typeof pt] as number ?? 0
          if (val < minVal) minVal = val
          if (val > maxVal) maxVal = val
        })
      })
      
      if (minVal === Infinity) { minVal = 0; maxVal = 1 }
      if (maxVal === minVal) { minVal -= 0.5; maxVal += 0.5 }
      
      const pad = (maxVal - minVal) * 0.12
      minVal -= pad
      maxVal += pad
      
      const w = 600
      const h = 300
      const padLeft = 75
      const padRight = 30
      const padTop = 50
      const padBottom = 40
      
      const getX = (t: number) => padLeft + (t / 1000) / ((timeGrid[timeGrid.length - 1] || 1000) / 1000) * (w - padLeft - padRight)
      const getY = (val: number) => padTop + (1 - (val - minVal) / (maxVal - minVal)) * (h - padTop - padBottom)
      
      let pathsHtml = ''
      subgroupAverages.forEach(sgAvg => {
        if (sgAvg.data.length === 0) return
        const points = sgAvg.data.map((pt, idx) => {
          const x = getX(pt.t)
          const val = pt[dataKey as keyof typeof pt] as number ?? 0
          const y = getY(val)
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
        }).join(' ')
        pathsHtml += `<path d="${points}" fill="none" stroke="${sgAvg.subgroup.color}" stroke-width="3.5" />`
      })
      
      let gridHtml = ''
      for (let i = 0; i <= 5; i++) {
        const yVal = minVal + i * (maxVal - minVal) / 5
        const yPos = getY(yVal)
        gridHtml += `
          <line x1="${padLeft}" y1="${yPos}" x2="${w - padRight}" y2="${yPos}" stroke="#D0D0D0" stroke-dasharray="2,2" stroke-width="1" />
          <text x="${padLeft - 8}" y="${yPos + 4}" fill="#000000" font-size="12px" text-anchor="end" font-family="'Times New Roman', serif">${yVal.toFixed(3)}</text>
        `
      }
      
      const maxT = timeGrid[timeGrid.length - 1] || 1000
      for (let i = 0; i <= 5; i++) {
        const tVal = i * maxT / 5
        const xPos = getX(tVal)
        gridHtml += `
          <line x1="${xPos}" y1="${h - padBottom}" x2="${xPos}" y2="${padTop}" stroke="#D0D0D0" stroke-dasharray="2,2" stroke-width="1" />
          <text x="${xPos}" y="${h - padBottom + 15}" fill="#000000" font-size="12px" text-anchor="middle" font-family="'Times New Roman', serif">${(tVal / 1000).toFixed(1)}s</text>
        `
      }
      
      let titleAndLabelsHtml = ''
      
      // Centered Title
      titleAndLabelsHtml += `<text x="300" y="20" font-weight="bold" text-anchor="middle" font-size="14px" fill="#000000">${title}</text>`
      
      // Horizontal Legend below Title
      const itemSpacing = 120
      const totalLegendWidth = subgroupAverages.length * itemSpacing
      const startX = w / 2 - totalLegendWidth / 2 + 10
      subgroupAverages.forEach((sgAvg, idx) => {
        const itemX = startX + idx * itemSpacing
        titleAndLabelsHtml += `
          <line x1="${itemX}" y1="36" x2="${itemX + 15}" y2="36" stroke="${sgAvg.subgroup.color}" stroke-width="3.5" />
          <text x="${itemX + 20}" y="40" fill="#000000" font-size="10px" font-weight="bold" font-family="'Times New Roman', serif" text-anchor="start">${sgAvg.subgroup.name}</text>
        `
      })
      
      // Y-axis Label (Rotated on the left)
      titleAndLabelsHtml += `<text transform="translate(18, ${(h - padTop - padBottom)/2 + padTop}) rotate(-90)" font-weight="bold" text-anchor="middle" font-size="12px" fill="#000000">${title} (${unit})</text>`
      
      // X-axis Label (Centered at bottom)
      titleAndLabelsHtml += `<text x="${(w - padLeft - padRight)/2 + padLeft}" y="${h - 6}" font-weight="bold" text-anchor="middle" font-size="12px" fill="#000000">Time (s)</text>`
      
      const svgStyle = `
        <style>
          svg { background-color: #FFFFFF !important; }
          text { font-family: 'Times New Roman', Times, serif !important; font-size: 12pt !important; fill: #000000 !important; }
        </style>
      `
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#FFFFFF; border:1px solid #D0D0D0; border-radius:4px; font-family:'Times New Roman', Times, serif;">${svgStyle}${gridHtml}${pathsHtml}${titleAndLabelsHtml}</svg>`
    }

    // Helper to generate SVG XY Path Comparison string styled for academic papers
    const generateXYTraceSvgStr = () => {
      if (referencePoints.length === 0) return ''
      
      const { xMin, xMax, yMin, yMax } = boundingBox
      const xMid = (xMin + xMax) / 2
      const yMid = (yMin + yMax) / 2
      const rx = xMax - xMin
      const ry = yMax - yMin
      const rMax = Math.max(rx, ry, 20)
      
      const w = 500
      const h = 400
      
      const marginLeft = 75
      const marginRight = 30
      const marginTop = 60
      const marginBottom = 50
      
      const chartW = w - marginLeft - marginRight
      const chartH = h - marginTop - marginBottom
      const scale = Math.min(chartW / rMax, chartH / rMax)
      
      const chartXMid = marginLeft + chartW / 2
      const chartYMid = marginTop + chartH / 2
      
      const toScreen = (x: number, y: number) => ({
        x: chartXMid + (x - xMid) * scale,
        y: chartYMid - (y - yMid) * scale
      })

      let content = ''
      
      // Dynamic Ticks
      const numTicks = 5
      const xTicks = Array.from({ length: numTicks + 1 }).map((_, i) => xMin + i * (xMax - xMin) / numTicks)
      const yTicks = Array.from({ length: numTicks + 1 }).map((_, i) => yMin + i * (yMax - yMin) / numTicks)

      // Draw Grid Lines & Tick Labels
      xTicks.forEach(xPhys => {
        const screenPtBottom = toScreen(xPhys, yMin)
        const screenPtTop = toScreen(xPhys, yMax)
        content += `
          <line x1="${screenPtBottom.x}" y1="${screenPtTop.y}" x2="${screenPtBottom.x}" y2="${screenPtBottom.y}" stroke="#E5E5E5" stroke-dasharray="2,2" stroke-width="1" />
          <text x="${screenPtBottom.x}" y="${screenPtBottom.y + 16}" fill="#000000" font-size="10px" text-anchor="middle" font-family="'Times New Roman', serif">${xPhys.toFixed(1)}</text>
        `
      })

      yTicks.forEach(yPhys => {
        const screenPtLeft = toScreen(xMin, yPhys)
        const screenPtRight = toScreen(xMax, yPhys)
        content += `
          <line x1="${screenPtLeft.x}" y1="${screenPtLeft.y}" x2="${screenPtRight.x}" y2="${screenPtLeft.y}" stroke="#E5E5E5" stroke-dasharray="2,2" stroke-width="1" />
          <text x="${screenPtLeft.x - 8}" y="${screenPtLeft.y + 4}" fill="#000000" font-size="10px" text-anchor="end" font-family="'Times New Roman', serif">${yPhys.toFixed(1)}</text>
        `
      })

      // Reference path (black dashed)
      const dRef = referencePoints.map((p, idx) => {
        const s = toScreen(p.xi, p.yi)
        return `${idx === 0 ? 'M' : 'L'} ${s.x} ${s.y}`
      }).join(' ')
      content += `<path d="${dRef}" fill="none" stroke="#000000" stroke-opacity="0.6" stroke-dasharray="4,4" stroke-width="2" />`

      // Subgroup traces
      subgroupTraces.forEach(trace => {
        if (trace.points.length === 0) return
        
        const upperScreen = trace.points.map(p => toScreen(p.xUpper, p.yUpper))
        const lowerScreen = [...trace.points].reverse().map(p => toScreen(p.xLower, p.yLower))
        const polygonPoints = [...upperScreen, ...lowerScreen].map(p => `${p.x},${p.y}`).join(' ')
        
        const avgPath = trace.points.map((p, idx) => {
          const s = toScreen(p.x, p.y)
          return `${idx === 0 ? 'M' : 'L'} ${s.x} ${s.y}`
        }).join(' ')
        
        content += `
          <polygon points="${polygonPoints}" fill="${trace.subgroup.color}" fill-opacity="0.15" stroke="none" />
          <path d="${avgPath}" fill="none" stroke="${trace.subgroup.color}" stroke-width="3.5" />
        `
      })

      let labelsHtml = ''
      
      // Title
      labelsHtml += `<text x="250" y="20" font-weight="bold" text-anchor="middle" font-size="14px" fill="#000000">XY Cartesian Path Comparison</text>`
      
      // Legend
      const legendItems = [
        { name: 'Desired Reference', color: '#000000', dashed: true },
        ...subgroupTraces.map(t => ({ name: t.subgroup.name, color: t.subgroup.color, dashed: false }))
      ]
      const itemSpacing = 135
      const totalLegendWidth = legendItems.length * itemSpacing
      const startX = w / 2 - totalLegendWidth / 2 + 10
      legendItems.forEach((item, idx) => {
        const itemX = startX + idx * itemSpacing
        if (item.dashed) {
          labelsHtml += `
            <line x1="${itemX}" y1="36" x2="${itemX + 15}" y2="36" stroke="${item.color}" stroke-dasharray="3,3" stroke-width="2" />
            <text x="${itemX + 20}" y="40" fill="#000000" font-size="10px" font-weight="bold" font-family="'Times New Roman', serif" text-anchor="start">${item.name}</text>
          `
        } else {
          labelsHtml += `
            <rect x="${itemX}" y="31" width="15" height="10" fill="${item.color}" fill-opacity="0.15" stroke="none" />
            <line x1="${itemX}" y1="36" x2="${itemX + 15}" y2="36" stroke="${item.color}" stroke-width="3" />
            <text x="${itemX + 20}" y="40" fill="#000000" font-size="10px" font-weight="bold" font-family="'Times New Roman', serif" text-anchor="start">${item.name}</text>
          `
        }
      })

      // Y-axis Title
      labelsHtml += `<text transform="translate(18, ${(h - marginTop - marginBottom)/2 + marginTop}) rotate(-90)" font-weight="bold" text-anchor="middle" font-size="12px" fill="#000000">Y Position (mm)</text>`
      
      // X-axis Title
      labelsHtml += `<text x="${(w - marginLeft - marginRight)/2 + marginLeft}" y="${h - 6}" font-weight="bold" text-anchor="middle" font-size="12px" fill="#000000">X Position (mm)</text>`

      const svgStyle = `
        <style>
          svg { background-color: #FFFFFF !important; }
          text { font-family: 'Times New Roman', Times, serif !important; font-size: 12pt !important; fill: #000000 !important; }
        </style>
      `
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#FFFFFF; border:1px solid #D0D0D0; border-radius:4px; font-family:'Times New Roman', Times, serif;">${svgStyle}${content}${labelsHtml}</svg>`
    }

    // 4. Generate all Box Plot SVGs and add to ZIP
    allBoxPlotStats.forEach(bStat => {
      const svgStr = generateBoxPlotSvgStr(bStat.metric.key, bStat.metric.label, bStat.metric.unit, bStat.subgroupsStats)
      zip.file(`boxplots/scara_boxplot_${bStat.metric.key.toLowerCase()}.svg`, svgStr)
    })

    // 5. Generate relative averages SVGs and add to ZIP
    const alignedCteSvg = generateLineChartSvgStr('Cross-Track Error (CTE)', 'cte', 'mm')
    const alignedAteSvg = generateLineChartSvgStr('Along-Track Error (ATE)', 'ate', 'mm')
    const alignedEefSvg = generateLineChartSvgStr('EEF Cartesian Error', 'eefErr', 'mm')
    const alignedE1Svg = generateLineChartSvgStr('Joint 1 Error (e1)', 'e1', 'rad')
    const alignedE2Svg = generateLineChartSvgStr('Joint 2 Error (e2)', 'e2', 'rad')

    const lineCharts = [
      { name: 'aligned_eef', svg: alignedEefSvg },
      { name: 'aligned_cte', svg: alignedCteSvg },
      { name: 'aligned_ate', svg: alignedAteSvg },
      { name: 'aligned_e1', svg: alignedE1Svg },
      { name: 'aligned_e2', svg: alignedE2Svg }
    ]

    lineCharts.forEach(ch => {
      zip.file(`charts/scara_chart_${ch.name}.svg`, ch.svg)
    })

    // XY path comparison SVG
    const xyPathComparisonSvg = generateXYTraceSvgStr()
    if (xyPathComparisonSvg) {
      zip.file(`charts/scara_chart_xy_path.svg`, xyPathComparisonSvg)
    }

    // 6. Generate zip archive and download it
    zip.generateAsync({ type: 'blob' }).then((zipContent) => {
      const zipLink = document.createElement('a')
      zipLink.href = URL.createObjectURL(zipContent)
      zipLink.download = `scara_report_${safeName}.zip`
      document.body.appendChild(zipLink)
      zipLink.click()
      document.body.removeChild(zipLink)
    })
  }

  // Group actions
  const handleCreateGroup = () => {
    const newGroup: RunGroup = {
      id: `group-${Date.now()}`,
      name: `Custom Group ${groups.length + 1}`,
      subgroups: [
        { id: `sub-${Date.now()}-1`, name: 'Subgroup A', runIds: [], color: '#2196F3' },
        { id: `sub-${Date.now()}-2`, name: 'Subgroup B', runIds: [], color: '#EF5350' }
      ]
    }
    const next = [...groups, newGroup]
    saveGroups(next)
    changeActiveGroupId(newGroup.id)
    setEditorExpanded(true)
  }

  const handleDeleteGroup = (id: string) => {
    const next = groups.filter(g => g.id !== id)
    saveGroups(next)
    if (next.length > 0) {
      changeActiveGroupId(next[0].id)
    } else {
      changeActiveGroupId('')
    }
  }

  const handleUpdateGroupName = (newName: string) => {
    const next = groups.map(g => (g.id === activeGroupId ? { ...g, name: newName } : g))
    saveGroups(next)
  }

  const handleAddSubgroup = () => {
    if (!activeGroupId) return
    const nextColors = PRESET_COLORS.map(c => c.value)
    const activeColors = activeGroup?.subgroups.map(s => s.color) ?? []
    const availableColor = nextColors.find(c => !activeColors.includes(c)) || nextColors[Math.floor(Math.random() * nextColors.length)]
    
    const next = groups.map(g => {
      if (g.id === activeGroupId) {
        return {
          ...g,
          subgroups: [
            ...g.subgroups,
            { id: `sub-${Date.now()}`, name: `Subgroup ${g.subgroups.length + 1}`, runIds: [], color: availableColor }
          ]
        }
      }
      return g
    })
    saveGroups(next)
  }

  const handleDeleteSubgroup = (subgroupId: string) => {
    const next = groups.map(g => {
      if (g.id === activeGroupId) {
        return { ...g, subgroups: g.subgroups.filter(s => s.id !== subgroupId) }
      }
      return g
    })
    saveGroups(next)
  }

  const handleUpdateSubgroup = (subgroupId: string, updates: Partial<Subgroup>) => {
    const next = groups.map(g => {
      if (g.id === activeGroupId) {
        return {
          ...g,
          subgroups: g.subgroups.map(s => (s.id === subgroupId ? { ...s, ...updates } : s))
        }
      }
      return g
    })
    saveGroups(next)
  }

  const handleAssignRunToSubgroup = (runId: string, subgroupId: string) => {
    const next = groups.map(g => {
      if (g.id === activeGroupId) {
        return {
          ...g,
          subgroups: g.subgroups.map(s => {
            let ids = s.runIds.filter(id => id !== runId)
            if (s.id === subgroupId) {
              ids = [...ids, runId]
            }
            return { ...s, runIds: ids }
          })
        }
      }
      return g
    })
    saveGroups(next)
  }

  const handleRemoveRunFromSubgroup = (runId: string, subgroupId: string) => {
    const next = groups.map(g => {
      if (g.id === activeGroupId) {
        return {
          ...g,
          subgroups: g.subgroups.map(s => (s.id === subgroupId ? { ...s, runIds: s.runIds.filter(id => id !== runId) } : s))
        }
      }
      return g
    })
    saveGroups(next)
  }

  const handleSyncSelectedRuns = () => {
    if (!activeGroup || unassignedSelectedRuns.length === 0) return
    let targetSubId = activeGroup.subgroups[0]?.id
    let nextSubgroups = [...activeGroup.subgroups]
    
    if (nextSubgroups.length === 0) {
      const newSubId = `sub-${Date.now()}`
      nextSubgroups = [{ id: newSubId, name: 'Subgroup A', runIds: [], color: '#2196F3' }]
      targetSubId = newSubId
    }

    const next = groups.map(g => {
      if (g.id === activeGroupId) {
        return {
          ...g,
          subgroups: nextSubgroups.map(s => {
            if (s.id === targetSubId) {
              return { ...s, runIds: Array.from(new Set([...s.runIds, ...unassignedSelectedRuns.map(r => r.runId)])) }
            }
            return s
          })
        }
      }
      return g
    })
    saveGroups(next)
  }

  const handleLoadMissingRuns = () => {
    if (unloadedGroupRuns.length === 0) return
    const ids = Array.from(new Set([...runs.map(r => r.runId), ...unloadedGroupRuns.map(r => r.id)]))
    onSelectRuns(ids)
  }

  // Draw Horizontal SVG Box Plot parameters
  const marginLeft = 140
  const marginRight = 30
  const boxWidth = 600
  const chartWidth = boxWidth - marginLeft - marginRight
  const rowHeight = 65
  const paddingTop = 15
  const paddingBottom = 40
  const boxHeight = 26
  
  const scaleX = (val: number) => {
    const { min, max } = overallExtent
    if (max === min) return marginLeft + chartWidth / 2
    return marginLeft + ((val - min) / (max - min)) * chartWidth
  }

  const formatXVal = (val: number) => {
    if (val >= 1000) return val.toFixed(1)
    if (val < 0.001) return val.toExponential(3)
    return val.toFixed(4)
  }

  const isGroupConfigured = activeGroup && activeGroup.subgroups.some(s => s.runIds.length > 0)

  return (
    <div className="flex flex-col gap-5 p-4 bg-hmi-bg text-hmi-text">
      {/* Header Panel */}
      <div className="bg-hmi-panel border border-hmi-grid rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-hmi-text">Statistical Group Comparison</h2>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={activeGroupId}
              onChange={(e) => {
                changeActiveGroupId(e.target.value)
                setSelectedJointSgId('')
              }}
              className="appearance-none bg-hmi-bg border border-hmi-grid rounded px-3 py-1.5 pr-8 text-xs font-semibold text-hmi-text focus:outline-none focus:border-hmi-ideal"
            >
              {groups.length === 0 && <option value="">No Groups Defined</option>}
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-hmi-muted pointer-events-none" />
          </div>
          
          <button
            onClick={handleCreateGroup}
            className="px-3 py-1.5 bg-hmi-ideal hover:bg-hmi-ideal/80 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New Group
          </button>
          
          {activeGroupId && (
            <>
              {isGroupConfigured && (
                <button
                  onClick={handleExportReport}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-transparent rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Report
                </button>
              )}
              <button
                onClick={() => setEditorExpanded(!editorExpanded)}
                className={cn(
                  "px-3 py-1.5 border rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer",
                  editorExpanded ? "border-hmi-ideal text-hmi-ideal bg-hmi-ideal/10" : "border-hmi-grid text-hmi-muted hover:text-hmi-text"
                )}
              >
                <Sliders className="h-3.5 w-3.5" />
                {editorExpanded ? 'Close Editor' : 'Edit Group'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Delete this comparison group?')) handleDeleteGroup(activeGroupId)
                }}
                className="p-1.5 border border-hmi-grid text-hmi-muted hover:text-red-400 hover:border-red-400/50 rounded transition-colors cursor-pointer"
                title="Delete group"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Warnings & Sync section */}
      {activeGroup && (
        <div className="flex flex-col gap-2">
          {unassignedSelectedRuns.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-lg px-3 py-2 text-[10px] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span><strong>{unassignedSelectedRuns.length}</strong> selected runs are not assigned to any subgroup of this group.</span>
              </span>
              <button
                onClick={handleSyncSelectedRuns}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-colors cursor-pointer"
              >
                Sync Into Group
              </button>
            </div>
          )}

          {unloadedGroupRuns.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 text-blue-500 rounded-lg px-3 py-2 text-[10px] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>{unloadedGroupRuns.length}</strong> runs assigned in this group configuration are not currently selected in the sidebar.
                </span>
              </span>
              <button
                onClick={handleLoadMissingRuns}
                className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-500 border border-blue-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-colors cursor-pointer"
              >
                Select & Load Runs
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Group Editor */}
      {activeGroup && editorExpanded && (
        <div className="bg-hmi-panel border border-hmi-grid rounded-lg p-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-3 border-b border-hmi-grid pb-2">
            <span className="text-[10px] font-bold text-hmi-muted uppercase tracking-wider">Group Editor</span>
            <input
              type="text"
              value={activeGroup.name}
              onChange={(e) => handleUpdateGroupName(e.target.value)}
              className="bg-hmi-bg border border-hmi-grid rounded px-2 py-1 text-xs font-semibold text-hmi-text focus:outline-none focus:border-hmi-ideal w-72"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeGroup.subgroups.map((sg) => (
              <div key={sg.id} className="border border-hmi-grid rounded-lg p-3 bg-hmi-bg/40 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={sg.name}
                      onChange={(e) => handleUpdateSubgroup(sg.id, { name: e.target.value })}
                      className="bg-hmi-bg border border-hmi-grid rounded px-2 py-1 text-xs font-medium text-hmi-text focus:outline-none focus:border-hmi-ideal flex-1"
                    />
                    
                    {/* Color selector */}
                    <div className="relative shrink-0">
                      <select
                        value={sg.color}
                        onChange={(e) => handleUpdateSubgroup(sg.id, { color: e.target.value })}
                        className="bg-hmi-bg border border-hmi-grid rounded px-1.5 py-1 text-[10px] text-hmi-text focus:outline-none w-20 pl-6 cursor-pointer"
                        style={{ borderLeft: `4px solid ${sg.color}` }}
                      >
                        {PRESET_COLORS.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <span className="absolute left-2.5 top-2.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sg.color }} />
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDeleteSubgroup(sg.id)}
                    className="p-1 border border-hmi-grid text-hmi-muted hover:text-red-400 hover:border-red-400/30 rounded transition-colors shrink-0 cursor-pointer"
                    title="Delete subgroup"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Subgroup assigned runs list */}
                <div className="flex flex-col gap-1">
                  <div className="text-[9px] font-bold text-hmi-muted uppercase tracking-wider mb-1">Assigned Runs ({sg.runIds.length})</div>
                  <div className="flex flex-wrap gap-1.5 min-h-[30px] p-2 bg-hmi-bg/60 border border-hmi-grid/50 rounded-lg">
                    {sg.runIds.length === 0 ? (
                      <span className="text-[10px] text-hmi-muted italic">No runs assigned</span>
                    ) : (
                      sg.runIds.map(runId => {
                        const runInfo = runs.find(r => r.runId === runId) || allRuns.find(r => r.id === runId)
                        const displayName = runInfo
                          ? ('runName' in runInfo ? runInfo.runName : runInfo.name)
                          : runId.substring(0, 6)
                        return (
                          <span
                            key={runId}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-hmi-panel border border-hmi-grid rounded text-hmi-text"
                          >
                            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: sg.color }} />
                            <span>{displayName}</span>
                            <button
                              onClick={() => handleRemoveRunFromSubgroup(runId, sg.id)}
                              className="text-hmi-muted hover:text-red-400 font-bold ml-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </span>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Add loaded runs dropdown */}
                {runs.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-hmi-muted whitespace-nowrap">Add Run:</span>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAssignRunToSubgroup(e.target.value, sg.id)
                          e.target.value = ''
                        }
                      }}
                      className="bg-hmi-bg border border-hmi-grid rounded px-2 py-0.5 text-[10px] text-hmi-text focus:outline-none flex-1 cursor-pointer"
                    >
                      <option value="">— Select Loaded Run —</option>
                      {runs
                        .filter(r => !sg.runIds.includes(r.runId))
                        .map(r => (
                          <option key={r.runId} value={r.runId}>{r.runName}</option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={handleAddSubgroup}
              className="border-2 border-dashed border-hmi-grid hover:border-hmi-ideal text-hmi-muted hover:text-hmi-ideal rounded-lg p-6 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[140px]"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs font-semibold">Add Subgroup</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!isGroupConfigured ? (
        <div className="bg-hmi-panel border border-hmi-grid rounded-lg p-12 text-center text-xs text-hmi-muted flex flex-col items-center gap-3">
          <Info className="h-6 w-6 text-hmi-muted" />
          <div>
            <p className="font-semibold text-hmi-text">This group has no assigned runs.</p>
            <p className="text-[10px] text-hmi-muted mt-0.5">
              Open the **Group Editor** to add subgroups and assign runs loaded from the sidebar.
            </p>
          </div>
          <button
            onClick={() => setEditorExpanded(true)}
            className="mt-2 px-3 py-1.5 border border-hmi-grid hover:border-hmi-ideal hover:text-hmi-ideal rounded text-xs transition-colors font-medium cursor-pointer"
          >
            Open Group Editor
          </button>
        </div>
      ) : (
        <>
          {/* Distribution Box Plots */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Metric pill list wrapper for dynamic stretch height */}
            <div className="lg:col-span-1 relative min-h-[350px]">
              {/* Inner container that dynamically fits the absolute bounds of the parent cell */}
              <div className="lg:absolute lg:inset-0 bg-hmi-panel border border-hmi-grid rounded-lg p-3 flex flex-col gap-2 overflow-y-auto">
                <span className="text-[9px] font-bold text-hmi-muted uppercase tracking-wider px-2 mb-1">Select Metric</span>
                
                {/* CTE Group */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setCteCollapsed(!cteCollapsed)}
                    className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-hmi-muted uppercase tracking-wider hover:text-hmi-text transition-colors select-none text-left"
                  >
                    <span>Cross-Track Error (CTE)</span>
                    {cteCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                  </button>
                  {!cteCollapsed && (
                    <div className="flex flex-col gap-1 pl-1 border-l border-hmi-grid/40 ml-2 mt-0.5">
                      {METRICS.filter(m => m.key.startsWith('mcte')).map(m => (
                        <button
                          key={m.key}
                          onClick={() => setSelectedMetric(m.key)}
                          className={cn(
                            "w-full text-left px-2 py-1.5 rounded text-xs transition-all flex flex-col gap-0.5 cursor-pointer",
                            selectedMetric === m.key
                              ? "bg-hmi-ideal/10 border border-hmi-ideal text-hmi-text font-semibold"
                              : "border border-transparent hover:bg-hmi-grid/10 text-hmi-muted hover:text-hmi-text"
                          )}
                        >
                          <span>{m.label}</span>
                          <span className="text-[9px] text-hmi-muted font-normal truncate max-w-[150px]">{m.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ATE Group */}
                <div className="flex flex-col gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => setAteCollapsed(!ateCollapsed)}
                    className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-hmi-muted uppercase tracking-wider hover:text-hmi-text transition-colors select-none text-left"
                  >
                    <span>Along-Track Error (ATE)</span>
                    {ateCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                  </button>
                  {!ateCollapsed && (
                    <div className="flex flex-col gap-1 pl-1 border-l border-hmi-grid/40 ml-2 mt-0.5">
                      {METRICS.filter(m => m.key.startsWith('mate')).map(m => (
                        <button
                          key={m.key}
                          onClick={() => setSelectedMetric(m.key)}
                          className={cn(
                            "w-full text-left px-2 py-1.5 rounded text-xs transition-all flex flex-col gap-0.5 cursor-pointer",
                            selectedMetric === m.key
                              ? "bg-hmi-ideal/10 border border-hmi-ideal text-hmi-text font-semibold"
                              : "border border-transparent hover:bg-hmi-grid/10 text-hmi-muted hover:text-hmi-text"
                          )}
                        >
                          <span>{m.label}</span>
                          <span className="text-[9px] text-hmi-muted font-normal truncate max-w-[150px]">{m.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Other Metrics Group */}
                <div className="flex flex-col gap-1 mt-1">
                  <span className="px-2 py-1 text-[10px] font-bold text-hmi-muted uppercase tracking-wider block select-none">
                    Other Metrics
                  </span>
                  <div className="flex flex-col gap-1 pl-1 border-l border-hmi-grid/40 ml-2">
                    {METRICS.filter(m => !m.key.startsWith('mcte') && !m.key.startsWith('mate')).map(m => (
                      <button
                        key={m.key}
                        onClick={() => setSelectedMetric(m.key)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded text-xs transition-all flex flex-col gap-0.5 cursor-pointer",
                          selectedMetric === m.key
                            ? "bg-hmi-ideal/10 border border-hmi-ideal text-hmi-text font-semibold"
                            : "border border-transparent hover:bg-hmi-grid/10 text-hmi-muted hover:text-hmi-text"
                        )}
                      >
                        <span>{m.label}</span>
                        <span className="text-[9px] text-hmi-muted font-normal truncate max-w-[150px]">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom SVG Box Plots */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="bg-hmi-panel border border-hmi-grid rounded-lg p-4 relative min-h-[220px]">
                <div className="flex items-center justify-between border-b border-hmi-grid pb-2 mb-4">
                  <div>
                    <h3 className="text-xs font-bold text-hmi-text">
                      Distribution Box Plot: {METRICS.find(m => m.key === selectedMetric)?.label} ({METRICS.find(m => m.key === selectedMetric)?.unit})
                    </h3>
                    <p className="text-[10px] text-hmi-muted mt-0.5">
                      Hover on circles to view run details or boxes to inspect quantiles (whiskers: min/max, boxes: Q1/Q3).
                    </p>
                  </div>
                </div>

                {/* Floating tooltip */}
                {hoveredPoint && (
                  <div
                    className="absolute z-50 bg-hmi-elevated border border-hmi-grid rounded shadow-xl p-2 pointer-events-none transform -translate-x-1/2 -translate-y-full flex flex-col min-w-[130px] animate-in fade-in-50 duration-75 text-xs text-hmi-text"
                    style={{ left: hoveredPoint.x, top: hoveredPoint.y }}
                  >
                    {hoveredPoint.content}
                  </div>
                )}

                {/* Box plot SVG */}
                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${boxWidth} ${paddingTop + boxPlotData.length * rowHeight + paddingBottom}`}
                    className="w-full h-auto min-w-[500px]"
                  >
                    {boxPlotData.map((d, i) => {
                      const yCenter = paddingTop + i * rowHeight + rowHeight / 2
                      const yTop = yCenter - boxHeight / 2
                      
                      return (
                        <g key={d.subgroup.id}>
                          {/* Label */}
                          <text
                            x="10"
                            y={yCenter + 4}
                            className="fill-hmi-text text-xs font-semibold select-none"
                          >
                            {d.subgroup.name}
                          </text>

                          {/* No data condition */}
                          {!d.stats ? (
                            <g>
                              <line
                                x1={marginLeft}
                                y1={yCenter}
                                x2={marginLeft + chartWidth}
                                y2={yCenter}
                                stroke="var(--color-hmi-grid)"
                                strokeDasharray="3 3"
                                strokeWidth={1}
                              />
                              <text
                                x={marginLeft + 15}
                                y={yCenter + 4}
                                className="fill-hmi-muted text-[10px] italic select-none"
                              >
                                No runs assigned/loaded
                              </text>
                            </g>
                          ) : (
                            <g>
                              {/* Horizontal whisker line */}
                              <line
                                x1={scaleX(d.stats.min)}
                                y1={yCenter}
                                x2={scaleX(d.stats.max)}
                                y2={yCenter}
                                stroke="var(--color-hmi-grid)"
                                strokeWidth={1.5}
                              />
                              
                              {/* Whisker vertical ticks */}
                              <line
                                x1={scaleX(d.stats.min)}
                                y1={yCenter - 5}
                                x2={scaleX(d.stats.min)}
                                y2={yCenter + 5}
                                stroke="var(--color-hmi-grid)"
                                strokeWidth={1.5}
                              />
                              <line
                                x1={scaleX(d.stats.max)}
                                y1={yCenter - 5}
                                x2={scaleX(d.stats.max)}
                                y2={yCenter + 5}
                                stroke="var(--color-hmi-grid)"
                                strokeWidth={1.5}
                              />

                              {/* Box rectangle */}
                              <rect
                                x={scaleX(d.stats.q1)}
                                y={yTop}
                                width={Math.max(2, scaleX(d.stats.q3) - scaleX(d.stats.q1))}
                                height={boxHeight}
                                rx={2}
                                fill={`${d.subgroup.color}18`}
                                stroke={d.subgroup.color}
                                strokeWidth={1.5}
                                className="cursor-help transition-all hover:fill-opacity-25"
                                onMouseEnter={(e) => {
                                  if (!d.stats) return
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  const parentRect = e.currentTarget.parentElement?.parentElement?.parentElement?.getBoundingClientRect()
                                  const x = rect.left - (parentRect?.left ?? 0) + rect.width / 2
                                  const y = rect.top - (parentRect?.top ?? 0) - 8
                                  
                                  setHoveredPoint({
                                    x,
                                    y,
                                    content: (
                                      <div className="text-[10px] leading-relaxed">
                                        <p className="font-bold text-hmi-text mb-0.5">{d.subgroup.name}</p>
                                        <div className="grid grid-cols-2 gap-x-2 font-mono text-hmi-muted">
                                          <span>Min:</span><span className="text-hmi-text text-right">{formatXVal(d.stats.min)}</span>
                                          <span>Q1:</span><span className="text-hmi-text text-right">{formatXVal(d.stats.q1)}</span>
                                          <span>Median:</span><span className="text-hmi-text text-right font-bold text-hmi-ideal">{formatXVal(d.stats.median)}</span>
                                          <span>Q3:</span><span className="text-hmi-text text-right">{formatXVal(d.stats.q3)}</span>
                                          <span>Max:</span><span className="text-hmi-text text-right">{formatXVal(d.stats.max)}</span>
                                          <span className="border-t border-hmi-grid mt-0.5 pt-0.5">Mean:</span>
                                          <span className="text-hmi-text text-right border-t border-hmi-grid mt-0.5 pt-0.5">{formatXVal(d.stats.mean)}</span>
                                          <span>Count:</span><span className="text-hmi-text text-right">{d.stats.n}</span>
                                        </div>
                                      </div>
                                    )
                                  })
                                }}
                                onMouseLeave={() => setHoveredPoint(null)}
                              />

                              {/* Median line */}
                              <line
                                x1={scaleX(d.stats.median)}
                                y1={yTop}
                                x2={scaleX(d.stats.median)}
                                y2={yTop + boxHeight}
                                stroke={d.subgroup.color}
                                strokeWidth={2.5}
                              />

                              {/* Mean Diamond */}
                              <polygon
                                points={`${scaleX(d.stats.mean)},${yCenter - 4.5} ${scaleX(d.stats.mean) + 4.5},${yCenter} ${scaleX(d.stats.mean)},${yCenter + 4.5} ${scaleX(d.stats.mean) - 4.5},${yCenter}`}
                                fill="#ffffff"
                                stroke={d.subgroup.color}
                                strokeWidth={1}
                              />

                              {/* Individual Run points with jitter */}
                              {d.runs.map((r, runIdx) => {
                                const val = r[selectedMetric]
                                const cx = scaleX(val)
                                // Deterministic jitter based on index
                                const jitter = Math.sin(runIdx * 10) * 7
                                const cy = yCenter + jitter
                                const metricUnit = METRICS.find(m => m.key === selectedMetric)?.unit ?? ''
                                
                                return (
                                  <circle
                                    key={r.runId}
                                    cx={cx}
                                    cy={cy}
                                    r={4}
                                    fill={d.subgroup.color}
                                    stroke="#ffffff"
                                    strokeWidth={0.8}
                                    className="cursor-pointer hover:r-[5.5px] transition-all"
                                    onMouseEnter={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      const parentRect = e.currentTarget.parentElement?.parentElement?.parentElement?.getBoundingClientRect()
                                      const x = rect.left - (parentRect?.left ?? 0) + rect.width / 2
                                      const y = rect.top - (parentRect?.top ?? 0) - 8
                                      
                                      setHoveredPoint({
                                        x,
                                        y,
                                        content: (
                                          <div className="text-[10px] leading-normal min-w-[100px]">
                                            <p className="font-semibold text-hmi-text truncate max-w-[140px]">{r.runName}</p>
                                            <p className="text-hmi-muted font-mono mt-0.5">
                                              Val: <span className="text-hmi-text font-bold">{formatXVal(val)} {metricUnit}</span>
                                            </p>
                                          </div>
                                        )
                                      })
                                    }}
                                    onMouseLeave={() => setHoveredPoint(null)}
                                  />
                                )
                              })}
                            </g>
                          )}
                        </g>
                      )
                    })}

                    {/* Bottom Axis */}
                    <g>
                      {(() => {
                        const axisY = paddingTop + boxPlotData.length * rowHeight + 10
                        const { min, max } = overallExtent
                        const ticksCount = 5
                        const tickVals = Array.from({ length: ticksCount }, (_, idx) => min + (idx / (ticksCount - 1)) * (max - min))
                        
                        return (
                          <>
                            {/* Axis line */}
                            <line
                              x1={marginLeft}
                              y1={axisY}
                              x2={marginLeft + chartWidth}
                              y2={axisY}
                              stroke="var(--color-hmi-grid)"
                              strokeWidth={1}
                            />
                            
                            {/* Ticks and text */}
                            {tickVals.map((tv, idx) => {
                              const tx = scaleX(tv)
                              return (
                                <g key={idx}>
                                  <line
                                    x1={tx}
                                    y1={axisY}
                                    x2={tx}
                                    y2={axisY + 4}
                                    stroke="var(--color-hmi-grid)"
                                    strokeWidth={1}
                                  />
                                  <text
                                    x={tx}
                                    y={axisY + 16}
                                    textAnchor="middle"
                                    className="fill-hmi-muted text-[10px] font-mono font-medium select-none"
                                  >
                                    {formatXVal(tv)}
                                  </text>
                                </g>
                              )
                            })}
                          </>
                        )
                      })()}
                    </g>
                  </svg>
                </div>
              </div>

              {/* Box plot Stats Table */}
              <div className="bg-hmi-panel border border-hmi-grid rounded-lg overflow-hidden">
                <table className="w-full text-[11px] border-collapse text-left">
                  <thead>
                    <tr className="bg-hmi-bg/50 border-b border-hmi-grid text-[10px] text-hmi-muted uppercase font-bold tracking-wider">
                      <th className="py-2 px-3">Subgroup</th>
                      <th className="py-2 px-3 text-right">N</th>
                      <th className="py-2 px-3 text-right">Min</th>
                      <th className="py-2 px-3 text-right">Q1</th>
                      <th className="py-2 px-3 text-right">Median</th>
                      <th className="py-2 px-3 text-right">Q3</th>
                      <th className="py-2 px-3 text-right">Max</th>
                      <th className="py-2 px-3 text-right">Mean</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxPlotData.map((d) => (
                      <tr key={d.subgroup.id} className="border-b border-hmi-grid/40 hover:bg-hmi-grid/10 transition-colors">
                        <td className="py-1.5 px-3 font-semibold text-hmi-text flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.subgroup.color }} />
                          <span>{d.subgroup.name}</span>
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono text-hmi-muted">{d.stats?.n ?? 0}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{d.stats ? formatXVal(d.stats.min) : '—'}</td>
                        <td className="py-1.5 px-3 text-right font-mono text-hmi-muted">{d.stats ? formatXVal(d.stats.q1) : '—'}</td>
                        <td className="py-1.5 px-3 text-right font-mono font-medium text-hmi-text">{d.stats ? formatXVal(d.stats.median) : '—'}</td>
                        <td className="py-1.5 px-3 text-right font-mono text-hmi-muted">{d.stats ? formatXVal(d.stats.q3) : '—'}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{d.stats ? formatXVal(d.stats.max) : '—'}</td>
                        <td className="py-1.5 px-3 text-right font-mono font-semibold text-hmi-ideal">{d.stats ? formatXVal(d.stats.mean) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Aligned Resampled Averages */}
          <div className="bg-hmi-panel border border-hmi-grid rounded-lg p-4 mt-2">
            <div>
              <h3 className="text-xs font-bold text-hmi-text">Relative-Time Aligned Averages</h3>
              <p className="text-[10px] text-hmi-muted mt-0.5">
                Resampled telemetry runs aligned relatively to $t_0=0$ and averaged within subgroups. Final values held constant (steady-state clamp).
              </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
              {/* Cartesian Euclidean Error average */}
              <div className="bg-hmi-bg/30 border border-hmi-grid rounded-lg p-3">
                <p className="text-[11px] font-semibold text-hmi-text mb-2 text-center">Average End-Effector Cartesian Error (Euclidean, mm)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={averageChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hmi-grid-subtle)" />
                      <XAxis dataKey="t" tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}s`} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} width={38} label={{ value: 'Error (mm)', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'var(--color-hmi-elevated)', border: '1px solid var(--color-hmi-grid)', fontSize: 10 }}
                        labelFormatter={(v) => `t = ${Number(v).toFixed(0)} ms`}
                      />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      {activeGroup.subgroups.map(sg => (
                        <Line
                          key={sg.id}
                          type="monotone"
                          dataKey={`${sg.id}_eefErr`}
                          stroke={sg.color}
                          name={sg.name}
                          dot={false}
                          strokeWidth={1.8}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tracking Errors CTE & ATE average */}
              <div className="bg-hmi-bg/30 border border-hmi-grid rounded-lg p-3">
                <p className="text-[11px] font-semibold text-hmi-text mb-2 text-center">Average Cross-Track Error (CTE, mm)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={averageChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hmi-grid-subtle)" />
                      <XAxis dataKey="t" tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}s`} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} width={38} label={{ value: 'Error (mm)', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'var(--color-hmi-elevated)', border: '1px solid var(--color-hmi-grid)', fontSize: 10 }}
                        labelFormatter={(v) => `t = ${Number(v).toFixed(0)} ms`}
                      />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      {activeGroup.subgroups.map(sg => (
                        <Line
                          key={sg.id}
                          type="monotone"
                          dataKey={`${sg.id}_cte`}
                          stroke={sg.color}
                          name={sg.name}
                          dot={false}
                          strokeWidth={1.8}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ATE Aligned averages */}
              <div className="bg-hmi-bg/30 border border-hmi-grid rounded-lg p-3">
                <p className="text-[11px] font-semibold text-hmi-text mb-2 text-center">Average Along-Track Error (ATE, mm)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={averageChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hmi-grid-subtle)" />
                      <XAxis dataKey="t" tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}s`} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} width={38} label={{ value: 'Error (mm)', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'var(--color-hmi-elevated)', border: '1px solid var(--color-hmi-grid)', fontSize: 10 }}
                        labelFormatter={(v) => `t = ${Number(v).toFixed(0)} ms`}
                      />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <ReferenceLine y={0} stroke="var(--color-hmi-grid)" strokeDasharray="3 3" />
                      {activeGroup.subgroups.map(sg => (
                        <Line
                          key={sg.id}
                          type="monotone"
                          dataKey={`${sg.id}_ate`}
                          stroke={sg.color}
                          name={sg.name}
                          dot={false}
                          strokeWidth={1.8}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Joint errors average (e1 & e2 side by side) */}
              <div className="bg-hmi-bg/30 border border-hmi-grid rounded-lg p-3">
                <p className="text-[11px] font-semibold text-hmi-text mb-2 text-center">Average Joint 1 Position Error (e₁, rad)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={averageChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hmi-grid-subtle)" />
                      <XAxis dataKey="t" tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}s`} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} width={38} label={{ value: 'Error (rad)', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'var(--color-hmi-elevated)', border: '1px solid var(--color-hmi-grid)', fontSize: 10 }}
                        labelFormatter={(v) => `t = ${Number(v).toFixed(0)} ms`}
                      />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <ReferenceLine y={0} stroke="var(--color-hmi-grid)" strokeDasharray="3 3" />
                      {activeGroup.subgroups.map(sg => (
                        <Line
                          key={sg.id}
                          type="monotone"
                          dataKey={`${sg.id}_e1`}
                          stroke={sg.color}
                          name={sg.name}
                          dot={false}
                          strokeWidth={1.8}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Joint 2 error average */}
              <div className="bg-hmi-bg/30 border border-hmi-grid rounded-lg p-3">
                <p className="text-[11px] font-semibold text-hmi-text mb-2 text-center">Average Joint 2 Position Error (e₂, rad)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={averageChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hmi-grid-subtle)" />
                      <XAxis dataKey="t" tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}s`} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} width={38} label={{ value: 'Error (rad)', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'var(--color-hmi-elevated)', border: '1px solid var(--color-hmi-grid)', fontSize: 10 }}
                        labelFormatter={(v) => `t = ${Number(v).toFixed(0)} ms`}
                      />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <ReferenceLine y={0} stroke="var(--color-hmi-grid)" strokeDasharray="3 3" />
                      {activeGroup.subgroups.map(sg => (
                        <Line
                          key={sg.id}
                          type="monotone"
                          dataKey={`${sg.id}_e2`}
                          stroke={sg.color}
                          name={sg.name}
                          dot={false}
                          strokeWidth={1.8}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Joint Positions (Actual vs Desired) per subgroup */}
            <div className="border border-hmi-grid/80 rounded-lg p-4 mt-4 bg-hmi-bg/25">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hmi-grid/50 pb-3 mb-4">
                <div>
                  <h4 className="text-xs font-bold text-hmi-text">Average Resampled Joint Trajectories</h4>
                  <p className="text-[10px] text-hmi-muted mt-0.5">Select a subgroup below to view actual vs desired tracking trends for Joint 1 and Joint 2.</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-hmi-muted font-medium">Subgroup:</span>
                  <div className="relative">
                    <select
                      value={selectedJointSgId}
                      onChange={(e) => setSelectedJointSgId(e.target.value)}
                      className="appearance-none bg-hmi-bg border border-hmi-grid rounded px-2.5 py-1 pr-7 text-[10px] font-semibold text-hmi-text focus:outline-none focus:border-hmi-ideal cursor-pointer"
                    >
                      {activeGroup.subgroups.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2 h-2.5 w-2.5 text-hmi-muted pointer-events-none" />
                  </div>
                </div>
              </div>

              {jointPositionsChartData.length === 0 ? (
                <div className="py-8 text-center text-[10px] italic text-hmi-muted">No runs assigned or selected for this subgroup.</div>
              ) : (
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Joint 1 Position Chart */}
                  <div className="bg-hmi-panel/50 border border-hmi-grid/60 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-hmi-muted uppercase tracking-wider text-center mb-1.5">Joint 1 Position (rad)</p>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={jointPositionsChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hmi-grid-subtle)" />
                          <XAxis dataKey="t" tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}s`} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                          <YAxis tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} width={38} label={{ value: 'Position (rad)', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: 'var(--color-hmi-elevated)', border: '1px solid var(--color-hmi-grid)', fontSize: 10 }}
                            labelFormatter={(v) => `t = ${Number(v).toFixed(0)} ms`}
                          />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                          <Line type="monotone" dataKey="th1d" stroke="#9E9E9E" strokeDasharray="4 3" name="Desired θ₁d" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                          <Line type="monotone" dataKey="th1" stroke="#2196F3" name="Actual θ₁" dot={false} strokeWidth={2} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Joint 2 Position Chart */}
                  <div className="bg-hmi-panel/50 border border-hmi-grid/60 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-hmi-muted uppercase tracking-wider text-center mb-1.5">Joint 2 Position (rad)</p>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={jointPositionsChartData} margin={{ top: 10, right: 15, left: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hmi-grid-subtle)" />
                          <XAxis dataKey="t" tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}s`} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                          <YAxis tick={{ fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} width={38} label={{ value: 'Position (rad)', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--color-hmi-text-secondary)', fontSize: 9 }} />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: 'var(--color-hmi-elevated)', border: '1px solid var(--color-hmi-grid)', fontSize: 10 }}
                            labelFormatter={(v) => `t = ${Number(v).toFixed(0)} ms`}
                          />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                          <Line type="monotone" dataKey="th2d" stroke="#9E9E9E" strokeDasharray="4 3" name="Desired θ₂d" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                          <Line type="monotone" dataKey="th2" stroke="#FF9800" name="Actual θ₂" dot={false} strokeWidth={2} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Statistical Testing Section (Welch's t-test / Cohen's d) */}
          <div className="bg-hmi-panel border border-hmi-grid rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hmi-grid pb-3 mb-4">
              <div>
                <h3 className="text-xs font-bold text-hmi-text">Welch's t-Test & Effect Size Comparison</h3>
                <p className="text-[10px] text-hmi-muted mt-0.5">
                  Check if differences between two subgroups are statistically significant (Welch's t-test handles unequal sample sizes and variances).
                </p>
              </div>

              {activeGroup.subgroups.length >= 2 && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={subgroupAId}
                      onChange={(e) => setSubgroupAId(e.target.value)}
                      className="appearance-none bg-hmi-bg border border-hmi-grid rounded px-2.5 py-1 pr-7 text-[10px] font-semibold text-hmi-text focus:outline-none focus:border-hmi-ideal cursor-pointer"
                    >
                      {activeGroup.subgroups.map(s => (
                        <option key={s.id} value={s.id} disabled={s.id === subgroupBId}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2 h-2.5 w-2.5 text-hmi-muted pointer-events-none" />
                  </div>
                  <span className="text-[10px] text-hmi-muted font-bold">vs</span>
                  <div className="relative">
                    <select
                      value={subgroupBId}
                      onChange={(e) => setSubgroupBId(e.target.value)}
                      className="appearance-none bg-hmi-bg border border-hmi-grid rounded px-2.5 py-1 pr-7 text-[10px] font-semibold text-hmi-text focus:outline-none focus:border-hmi-ideal cursor-pointer"
                    >
                      {activeGroup.subgroups.map(s => (
                        <option key={s.id} value={s.id} disabled={s.id === subgroupAId}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2 h-2.5 w-2.5 text-hmi-muted pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            {subgroupAId === subgroupBId || !subgroupAId || !subgroupBId ? (
              <div className="py-8 text-center text-xs text-hmi-muted italic">Select two different subgroups to run t-tests.</div>
            ) : statisticalComparisons.length === 0 ? (
              <div className="py-8 text-center text-xs text-hmi-muted italic">Both subgroups must have at least one loaded run to perform analysis.</div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-hmi-bg/50 border-b border-hmi-grid text-[10px] text-hmi-muted uppercase font-bold tracking-wider">
                        <th className="py-2.5 px-3">Metric</th>
                        <th className="py-2.5 px-3 text-right">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeGroup.subgroups.find(s => s.id === subgroupAId)?.color }} />
                            <span>Mean (A)</span>
                          </span>
                        </th>
                        <th className="py-2.5 px-3 text-right">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeGroup.subgroups.find(s => s.id === subgroupBId)?.color }} />
                            <span>Mean (B)</span>
                          </span>
                        </th>
                        <th className="py-2.5 px-3 text-right">% Diff</th>
                        <th className="py-2.5 px-3 text-right">t-stat (df)</th>
                        <th className="py-2.5 px-3 text-right">p-value</th>
                        <th className="py-2.5 px-3 text-center">Significance Badge</th>
                        <th className="py-2.5 px-3 text-center">Cohen's d (Effect Size)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statisticalComparisons.map((c) => (
                        <tr key={c.metricKey} className="border-b border-hmi-grid/40 hover:bg-hmi-grid/10 transition-colors">
                          <td className="py-2 px-3 font-medium text-hmi-text">{c.metricLabel} ({c.unit})</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {c.meanA.toFixed(4)} <span className="text-[10px] text-hmi-muted">±{c.sdA.toFixed(3)}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {c.meanB.toFixed(4)} <span className="text-[10px] text-hmi-muted">±{c.sdB.toFixed(3)}</span>
                          </td>
                          <td className={cn(
                            "py-2 px-3 text-right font-mono font-semibold",
                            c.diffPct < 0 ? "text-green-400" : c.diffPct > 0 ? "text-red-400" : "text-hmi-text"
                          )}>
                            {c.diffPct > 0 ? '+' : ''}{c.diffPct.toFixed(2)}%
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-hmi-muted">
                            {c.tStat.toFixed(2)} <span className="text-[10px]">({c.df.toFixed(1)})</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-hmi-text">
                            {c.pValue < 0.001 ? '<0.001' : c.pValue.toFixed(4)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={cn(
                              "inline-block text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider",
                              c.significance === 'Highly Significant' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" :
                              c.significance === 'Significant' ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                              "bg-hmi-grid/55 text-hmi-muted border border-hmi-grid/80"
                            )}>
                              {c.significance}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono">
                            <span className="font-semibold text-hmi-text">{c.cohenD.toFixed(3)}</span>{' '}
                            <span className={cn(
                              "text-[10px] uppercase font-bold",
                              c.effectSize === 'Large' ? "text-red-400" :
                              c.effectSize === 'Medium' ? "text-amber-400" :
                              c.effectSize === 'Small' ? "text-blue-400" : "text-hmi-muted"
                            )}>
                              ({c.effectSize})
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-hmi-bg/40 border border-hmi-grid rounded-lg p-3 text-[10px] text-hmi-muted flex items-start gap-2 leading-relaxed">
                  <Info className="h-4 w-4 text-hmi-ideal mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-hmi-text">Statistical Reference Guide:</span>
                    <ul className="list-disc pl-4 mt-1 flex flex-col gap-0.5">
                      <li>
                        <strong>Welch's t-test</strong> computes the probability (p-value) that the difference between means is due to random chance. 
                        A <code className="bg-hmi-bg px-1 py-0.5 rounded text-hmi-text font-mono text-[9px]">p &lt; 0.05</code> (Significant) indicates less than 5% probability, validating a true performance difference.
                      </li>
                      <li>
                        <strong>Cohen's d</strong> measures the effect size (standardized difference). 
                        A value <code className="bg-hmi-bg px-1 py-0.5 rounded text-hmi-text font-mono text-[9px]">d &ge; 0.8</code> indicates a **Large** effect, showing a highly practical difference in control regimes.
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Geometrical XY Trace Comparison with Confidence Corridor */}
                {referencePoints.length > 0 && (
                  <div className="bg-hmi-bg/25 border border-hmi-grid/80 rounded-lg p-4 mt-2">
                    <div className="border-b border-hmi-grid pb-2 mb-4">
                      <h4 className="text-xs font-bold text-hmi-text">Geometrical XY Path Comparison</h4>
                      <p className="text-[10px] text-hmi-muted mt-0.5">
                        Average trajectory coordinate traces (solid lines) plotted on the Cartesian XY plane, surrounded by a 1-standard-deviation confidence corridor (shaded bands) representing geometric spread.
                      </p>
                    </div>
                    
                    <div className="flex flex-col lg:flex-row gap-4 items-center justify-center">
                      {/* SVG Canvas */}
                      <div className="bg-hmi-bg/50 border border-hmi-grid rounded-lg p-4 w-full max-w-[500px] flex items-center justify-center relative select-none">
                        {/* Bounding box legend */}
                        <div className="absolute top-2 left-2 bg-hmi-panel/85 border border-hmi-grid/55 rounded p-1.5 text-[9px] flex flex-col gap-1 z-10">
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-0.5 border-t border-dashed border-hmi-text/60" />
                            <span className="text-hmi-muted">Desired path</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-1 inline-block" style={{ backgroundColor: activeGroup.subgroups.find(s => s.id === subgroupAId)?.color }} />
                            <span className="text-hmi-text font-medium">{activeGroup.subgroups.find(s => s.id === subgroupAId)?.name} (A)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-1 inline-block" style={{ backgroundColor: activeGroup.subgroups.find(s => s.id === subgroupBId)?.color }} />
                            <span className="text-hmi-text font-medium">{activeGroup.subgroups.find(s => s.id === subgroupBId)?.name} (B)</span>
                          </div>
                        </div>
                        
                        <svg viewBox="0 0 500 400" className="w-full h-auto">
                          {/* Draw grid lines & ticks */}
                          {uiTicks.xTicks.map((xPhys, idx) => {
                            const screenPtBottom = mapPoints.toScreen(xPhys, mapPoints.yMin)
                            const screenPtTop = mapPoints.toScreen(xPhys, mapPoints.yMax)
                            return (
                              <g key={`x-${idx}`}>
                                <line 
                                  x1={screenPtBottom.x} 
                                  y1={screenPtTop.y} 
                                  x2={screenPtBottom.x} 
                                  y2={screenPtBottom.y} 
                                  className="stroke-hmi-grid/25" 
                                  strokeDasharray="2 2" 
                                  strokeWidth={0.8} 
                                />
                                <text 
                                  x={screenPtBottom.x} 
                                  y={screenPtBottom.y + 14} 
                                  fill="currentColor" 
                                  className="text-hmi-text-secondary fill-current font-mono text-[9px]"
                                  textAnchor="middle"
                                >
                                  {xPhys.toFixed(1)}
                                </text>
                              </g>
                            )
                          })}
                          
                          {uiTicks.yTicks.map((yPhys, idx) => {
                            const screenPtLeft = mapPoints.toScreen(mapPoints.xMin, yPhys)
                            const screenPtRight = mapPoints.toScreen(mapPoints.xMax, yPhys)
                            return (
                              <g key={`y-${idx}`}>
                                <line 
                                  x1={screenPtLeft.x} 
                                  y1={screenPtLeft.y} 
                                  x2={screenPtRight.x} 
                                  y2={screenPtLeft.y} 
                                  className="stroke-hmi-grid/25" 
                                  strokeDasharray="2 2" 
                                  strokeWidth={0.8} 
                                />
                                <text 
                                  x={screenPtLeft.x - 8} 
                                  y={screenPtLeft.y + 3} 
                                  fill="currentColor" 
                                  className="text-hmi-text-secondary fill-current font-mono text-[9px]"
                                  textAnchor="end"
                                >
                                  {yPhys.toFixed(1)}
                                </text>
                              </g>
                            )
                          })}
                          
                          {/* Rotated Y-axis title */}
                          <text 
                            transform={`translate(18, ${(400 - 60 - 50)/2 + 60}) rotate(-90)`} 
                            fontWeight="bold" 
                            textAnchor="middle" 
                            fontSize={10} 
                            fill="currentColor"
                            className="text-hmi-text-secondary fill-current"
                          >
                            Y Position (mm)
                          </text>

                          {/* X-axis title */}
                          <text 
                            x={(500 - 75 - 30)/2 + 75} 
                            y={400 - 6} 
                            fontWeight="bold" 
                            textAnchor="middle" 
                            fontSize={10} 
                            fill="currentColor"
                            className="text-hmi-text-secondary fill-current"
                          >
                            X Position (mm)
                          </text>
                          
                          {/* 1. Reference Path */}
                          {(() => {
                            const dPath = referencePoints.map((p, idx) => {
                              const s = mapPoints.toScreen(p.xi, p.yi)
                              return `${idx === 0 ? 'M' : 'L'} ${s.x} ${s.y}`
                            }).join(' ')
                            return <path d={dPath} fill="none" stroke="var(--color-hmi-text)" strokeOpacity={0.25} strokeDasharray="4 4" strokeWidth={1} />
                          })()}
                          
                          {/* 2. Subgroup A Corridor & Trace */}
                          {(() => {
                            const trace = subgroupTraces.find(t => t.subgroup.id === subgroupAId)
                            if (!trace || trace.points.length === 0) return null
                            
                            const upperScreen = trace.points.map(p => mapPoints.toScreen(p.xUpper, p.yUpper))
                            const lowerScreen = [...trace.points].reverse().map(p => mapPoints.toScreen(p.xLower, p.yLower))
                            const polygonPoints = [...upperScreen, ...lowerScreen].map(p => `${p.x},${p.y}`).join(' ')
                            
                            const avgPath = trace.points.map((p, idx) => {
                              const s = mapPoints.toScreen(p.x, p.y)
                              return `${idx === 0 ? 'M' : 'L'} ${s.x} ${s.y}`
                            }).join(' ')
                            
                            return (
                              <g>
                                <polygon points={polygonPoints} fill={trace.subgroup.color} fillOpacity={0.12} stroke="none" />
                                <path d={avgPath} fill="none" stroke={trace.subgroup.color} strokeWidth={2.2} />
                              </g>
                            )
                          })()}

                          {/* 3. Subgroup B Corridor & Trace */}
                          {(() => {
                            const trace = subgroupTraces.find(t => t.subgroup.id === subgroupBId)
                            if (!trace || trace.points.length === 0) return null
                            
                            const upperScreen = trace.points.map(p => mapPoints.toScreen(p.xUpper, p.yUpper))
                            const lowerScreen = [...trace.points].reverse().map(p => mapPoints.toScreen(p.xLower, p.yLower))
                            const polygonPoints = [...upperScreen, ...lowerScreen].map(p => `${p.x},${p.y}`).join(' ')
                            
                            const avgPath = trace.points.map((p, idx) => {
                              const s = mapPoints.toScreen(p.x, p.y)
                              return `${idx === 0 ? 'M' : 'L'} ${s.x} ${s.y}`
                            }).join(' ')
                            
                            return (
                              <g>
                                <polygon points={polygonPoints} fill={trace.subgroup.color} fillOpacity={0.12} stroke="none" />
                                <path d={avgPath} fill="none" stroke={trace.subgroup.color} strokeWidth={2.2} />
                              </g>
                            )
                          })()}
                        </svg>
                      </div>
                      
                      {/* Description */}
                      <div className="flex-1 text-[10px] leading-relaxed text-hmi-muted flex flex-col gap-2 max-w-[400px]">
                        <p className="font-bold text-[11px] text-hmi-text">Understanding the Geometrical Spread</p>
                        <p>
                          The dashed line represents the <strong>desired trajectory</strong>. The solid colored lines represent the <strong>average Cartesian path</strong> followed by each subgroup.
                        </p>
                        <p>
                          The shaded area surrounding each line is the <strong>confidence corridor</strong>:
                          <span className="block my-1 font-mono text-[9px] bg-hmi-bg/40 p-1.5 rounded text-hmi-text border border-hmi-grid/40 select-text">
                            corridor(s) = [p̄(s) - σ(s)n̂, p̄(s) + σ(s)n̂]
                          </span>
                          where <code className="text-hmi-ideal">σ(s)</code> is the standard deviation of lateral (cross-track) error at position <code className="text-hmi-ideal">s</code>, and <code className="text-hmi-ideal">n̂</code> is the normal vector perpendicular to the desired path.
                        </p>
                        <p>
                          This visualizes <strong>geometric reproducibility</strong>. A larger offset of the average line from the desired path indicates persistent tracking errors (e.g. friction or dynamics lag), while a wider shaded band indicates higher run-to-run variation.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
