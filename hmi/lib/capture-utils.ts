import JSZip from 'jszip'
import { drawTrace } from '@/components/hmi/xy-trace'
import type { DSample, TPoint, HMIState } from '@/lib/hmi-types'

/**
 * Converts a Recharts SVG element to a PNG/JPEG Blob.
 * Supports configurable resolution scales and formats.
 */
export async function svgToBlob(
  svgElement: SVGElement,
  width: number,
  height: number,
  bgCol: string = '#121212',
  scale: number = 2,
  format: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<Blob> {
  // 1. Clone the SVG element so we do not modify the DOM
  const clonedSvg = svgElement.cloneNode(true) as SVGElement
  clonedSvg.setAttribute('width', width.toString())
  clonedSvg.setAttribute('height', height.toString())

  // Ensure fonts look premium
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = `
    text {
      font-family: Geist, "Geist Sans", ui-sans-serif, system-ui, sans-serif !important;
      font-weight: 500;
    }
  `
  clonedSvg.insertBefore(styleEl, clonedSvg.firstChild)

  // 2. Convert SVG element to serialized XML string
  const svgString = new XMLSerializer().serializeToString(clonedSvg)

  // 3. Create blob URL
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // 4. Create a canvas with high-DPI scaling (configurable) for sharp charts
      const canvas = document.createElement('canvas')
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas context not available'))
        return
      }

      // Draw background
      ctx.fillStyle = bgCol
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Scale coordinates
      ctx.scale(scale, scale)

      // Draw SVG onto canvas
      ctx.drawImage(img, 0, 0, width, height)

      // Clean up URL
      URL.revokeObjectURL(url)

      // 5. Convert to Blob
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Canvas blob generation failed'))
        }
      }, format)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

/**
 * Renders the XY Workspace Trace onto an off-screen canvas at custom scale
 * and returns it as a PNG/JPEG Blob.
 */
export function renderXYTraceToBlob(
  state: HMIState,
  showArm: boolean,
  scale: number = 2,
  format: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const size = 600
    canvas.width = size * scale
    canvas.height = size * scale
    
    // Temporarily mock window.devicePixelRatio during drawTrace to match requested scale
    const originalDPR = typeof window !== 'undefined' ? window.devicePixelRatio : 1
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: scale,
        writable: true,
        configurable: true
      })
    }

    try {
      drawTrace(canvas, state, showArm)

      // Restore window.devicePixelRatio
      if (typeof window !== 'undefined') {
        Object.defineProperty(window, 'devicePixelRatio', {
          value: originalDPR,
          writable: true,
          configurable: true
        })
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Canvas toBlob failed'))
        }
      }, format)
    } catch (err) {
      // Ensure restore is called even if drawing fails
      if (typeof window !== 'undefined') {
        Object.defineProperty(window, 'devicePixelRatio', {
          value: originalDPR,
          writable: true,
          configurable: true
        })
      }
      reject(err)
    }
  })
}

/**
 * Generates the CSV telemetry data matching the ComparisonTable output format.
 */
export function generateCSVString(d: DSample[], t: TPoint[]): string {
  const r2d = 180 / Math.PI
  const rows = d.map((s, i) => {
    const tp = t[i]
    const eef = tp ? Math.sqrt((tp.xi - tp.xa) ** 2 + (tp.yi - tp.ya) ** 2) : 0
    return {
      idx: s.idx,
      t: (s.t / 1000).toFixed(3),
      th1d: (s.th1d * r2d).toFixed(3),
      th1: (s.th1 * r2d).toFixed(3),
      e1: (s.e1 * r2d).toFixed(3),
      th2d: (s.th2d * r2d).toFixed(3),
      th2: (s.th2 * r2d).toFixed(3),
      e2: (s.e2 * r2d).toFixed(3),
      v1: (s.dth1 * r2d).toFixed(3),
      v2: (s.dth2 * r2d).toFixed(3),
      v1d: (s.dth1d * r2d).toFixed(3),
      v2d: (s.dth2d * r2d).toFixed(3),
      pwm1: s.pwm1,
      th1_raw: (s.th1raw * r2d).toFixed(3),
      th2_raw: (s.th2raw * r2d).toFixed(3),
      eef: eef.toFixed(3),
    }
  })

  const header = 'Sample,t(s),θ1_d(°),θ1(°),e1(°),θ2_d(°),θ2(°),e2(°),v1(°/s),v2(°/s),v1d(°/s),v2d(°/s),pwm1,θ1_raw(°),θ2_raw(°),EEF_err(mm)\n'
  const body = rows
    .map(
      (r) =>
        `${r.idx},${r.t},${r.th1d},${r.th1},${r.e1},${r.th2d},${r.th2},${r.e2},${r.v1},${r.v2},${r.v1d},${r.v2d},${r.pwm1},${r.th1_raw},${r.th2_raw},${r.eef}`
    )
    .join('\n')

  return header + body
}

/**
 * Utility to download a Blob to the browser.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Retrieves the user's export preferences from localStorage.
 */
export function getExportPreferences() {
  if (typeof window === 'undefined') {
    return {
      exportFormat: 'image/png' as 'image/png' | 'image/jpeg',
      resolutionScale: 2,
      filenamePrefix: 'scara_hmi',
    }
  }
  const exportFormat = (localStorage.getItem('hmi_export_format') as 'image/png' | 'image/jpeg') || 'image/png'
  const resolutionScale = parseInt(localStorage.getItem('hmi_export_scale') || '2', 10)
  const filenamePrefix = localStorage.getItem('hmi_filename_prefix') || 'scara_hmi'
  return { exportFormat, resolutionScale, filenamePrefix }
}

/**
 * Captures and downloads a single chart.
 */
export async function downloadSingleGraph(
  type: string,
  name: string,
  state: HMIState
) {
  const isLive = state.recordingState === 'REC'
  const dBuf = isLive ? state.dBuffer : state.frozenD
  const hasData = dBuf.length > 0

  if (!hasData) {
    throw new Error('No telemetry data available. Please run a trajectory move first.')
  }

  const { exportFormat, resolutionScale, filenamePrefix } = getExportPreferences()
  let blob: Blob
  const ext = exportFormat === 'image/png' ? 'png' : 'jpg'
  const timestamp = Date.now()
  const filename = `${filenamePrefix || 'scara'}_${type}_${timestamp}.${ext}`

  if (type === 'xy') {
    blob = await renderXYTraceToBlob(state, true, resolutionScale, exportFormat)
  } else {
    const svgEl = document.querySelector(`#capture-chart-${type} svg`) as SVGElement
    if (!svgEl) {
      throw new Error(`Chart element for ${type} was not found in DOM.`)
    }
    const chartH = type === 'params' ? 600 : 400
    blob = await svgToBlob(svgEl, 800, chartH, '#121212', resolutionScale, exportFormat)
  }

  downloadBlob(blob, filename)
}

/**
 * Packages and downloads all graphs inside a ZIP archive.
 */
export async function downloadAllGraphs(
  state: HMIState,
  includeCSV = false,
  onProgress?: (msg: string) => void
) {
  const isLive = state.recordingState === 'REC'
  const dBuf = isLive ? state.dBuffer : state.frozenD
  const tBuf = isLive ? state.tBuffer : state.frozenT
  const hasData = dBuf.length > 0

  if (!hasData) {
    throw new Error('No telemetry data available. Please run a trajectory move first.')
  }

  const { exportFormat, resolutionScale, filenamePrefix } = getExportPreferences()
  const JSZipLib = (await import('jszip')).default
  const zip = new JSZipLib()
  const ext = exportFormat === 'image/png' ? 'png' : 'jpg'
  const prefix = filenamePrefix || 'scara'
  const timestamp = Date.now()

  if (onProgress) onProgress('Rendering XY workspace...')
  const xyBlob = await renderXYTraceToBlob(state, true, resolutionScale, exportFormat)
  zip.file(`01_xy_workspace_trace.${ext}`, xyBlob)

  const charts = [
    { key: 'eef', label: 'eef_error_chart' },
    { key: 'eef-vel', label: 'eef_velocity_chart' },
    { key: 'pwm', label: 'pwm_command_chart' },
    { key: 'pos', label: 'joint_position_chart' },
    { key: 'vel', label: 'joint_velocity_chart' },
    { key: 'phase', label: 'phase_portrait' },
    { key: 'fft-eef', label: 'fft_eef_error' },
    { key: 'fft-th1', label: 'fft_joint1' },
    { key: 'fft-th2', label: 'fft_joint2' },
    { key: 'effort', label: 'control_effort_proxy' },
    { key: 'ctc', label: 'ctc_feedforward_torques' },
    { key: 'internal', label: 'j1_internal_control_signals' },
    { key: 'stepper', label: 'j2_stepper_velocity_commands' },
    { key: 'pid-breakdown', label: 'j1_pid_control_effort_breakdown' },
    { key: 'loop', label: 'microcontroller_loop_execution_time' },
    { key: 'params', label: 'system_parameters_report' },
  ]

  for (let i = 0; i < charts.length; i++) {
    const chart = charts[i]
    if (onProgress) onProgress(`Rendering ${chart.label}...`)
    const svgEl = document.querySelector(`#capture-chart-${chart.key} svg`) as SVGElement
    if (!svgEl) {
      throw new Error(`Chart element for ${chart.key} was not found in DOM.`)
    }
    const chartH = chart.key === 'params' ? 600 : 400
    const chartBlob = await svgToBlob(svgEl, 800, chartH, '#121212', resolutionScale, exportFormat)
    const fileNum = String(i + 2).padStart(2, '0')
    zip.file(`${fileNum}_${chart.label}.${ext}`, chartBlob)
  }

  if (includeCSV) {
    if (onProgress) onProgress('Generating telemetry CSV...')
    const csvString = generateCSVString(dBuf, tBuf)
    zip.file(`${prefix}_telemetry_data.csv`, csvString)
  }

  if (onProgress) onProgress('Packaging ZIP archive...')
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  const zipFilename = includeCSV
    ? `${prefix}_diagnostics_package_${timestamp}.zip`
    : `${prefix}_graphs_${timestamp}.zip`

  downloadBlob(zipBlob, zipFilename)
}
