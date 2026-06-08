import JSZip from 'jszip'
import { drawTrace } from '@/components/hmi/xy-trace'
import type { DSample, TPoint, HMIState } from '@/lib/hmi-types'
import { withCaptureSession } from '@/lib/capture-session'

function flushPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/** Clone SVG and uniquify internal ids so gradient/mask refs survive standalone export. */
function prepareSvgForExport(svgElement: SVGElement, width: number, height: number): SVGElement {
  const clone = svgElement.cloneNode(true) as SVGElement

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const viewBox = svgElement.getAttribute('viewBox')
  if (viewBox) {
    clone.setAttribute('viewBox', viewBox)
  } else {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }

  const prefix = `exp_${Math.random().toString(36).slice(2, 9)}_`
  const idMap = new Map<string, string>()

  clone.querySelectorAll('[id]').forEach((node) => {
    const oldId = node.id
    if (!oldId) return
    const newId = `${prefix}${oldId}`
    idMap.set(oldId, newId)
    node.id = newId
  })

  const rewriteRefs = (value: string) => {
    let out = value
    idMap.forEach((newId, oldId) => {
      out = out.replaceAll(`url(#${oldId})`, `url(#${newId})`)
      out = out.replaceAll(`href="#${oldId}"`, `href="#${newId}"`)
      out = out.replaceAll(`xlink:href="#${oldId}"`, `xlink:href="#${newId}"`)
    })
    return out
  }

  clone.querySelectorAll('*').forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      if (attr.value.includes('#')) {
        node.setAttribute(attr.name, rewriteRefs(attr.value))
      }
    }
  })

  clone.querySelectorAll('[style]').forEach((node) => {
    const style = node.getAttribute('style')
    if (style?.includes('var(')) {
      node.setAttribute(
        'style',
        style.replace(/var\([^)]+\)/g, 'ui-sans-serif, system-ui, sans-serif')
      )
    }
  })

  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = `
    text, tspan {
      font-family: ui-sans-serif, system-ui, sans-serif !important;
      font-weight: 500;
    }
  `
  clone.insertBefore(styleEl, clone.firstChild)

  return clone
}

function findReadyChartSvg(type: string): SVGElement | null {
  const container = document.querySelector(`#capture-chart-${type}`)
  if (!container) return null

  const svgs = Array.from(container.querySelectorAll('svg'))
  if (svgs.length === 0) return null

  const svg = svgs.reduce((best, current) => {
    const bestRect = best.getBoundingClientRect()
    const currentRect = current.getBoundingClientRect()
    return currentRect.width * currentRect.height > bestRect.width * bestRect.height
      ? current
      : best
  })

  const rect = svg.getBoundingClientRect()
  if (rect.width < 10 || rect.height < 10) return null

  const hasChartGeometry = svg.querySelector(
    '.recharts-curve, .recharts-area-area, .recharts-line-curve, .recharts-bar-rectangle, path[d]'
  )
  const hasStaticContent = svg.querySelector('rect, line, circle, text')
  if (!hasChartGeometry && !hasStaticContent) return null

  return svg
}

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
  const clonedSvg = prepareSvgForExport(svgElement, width, height)

  // Convert SVG element to serialized XML string
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
 * Polls for a painted SVG inside a capture container, waiting up to `timeoutMs`
 * for the chart to finish rendering (React + useHMISlow can be async).
 */
async function waitForChartSvg(type: string, timeoutMs = 5000): Promise<SVGElement> {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const svg = findReadyChartSvg(type)
    if (svg) {
      await flushPaint()
      return svg
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Chart "${type}" did not render within ${timeoutMs}ms. Make sure telemetry data is loaded.`)
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
    blob = await withCaptureSession([type], async () => {
      const svgEl = await waitForChartSvg(type)
      const chartH = type === 'params' ? 600 : type === 'metrics' ? 500 : 400
      return svgToBlob(svgEl, 800, chartH, '#121212', resolutionScale, exportFormat)
    })
  }

  downloadBlob(blob, filename)
}

/**
 * Packages and downloads all graphs inside a ZIP archive.
 */
export async function downloadAllGraphs(
  state: HMIState,
  includeCSV = false,
  onProgress?: (msg: string) => void,
  customZipName?: string
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
    { key: 'cte', label: 'cte_cross_track_error' },
    { key: 'ate', label: 'ate_along_track_error' },
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
    { key: 'metrics', label: 'run_metrics_report' },
  ] as const

  await withCaptureSession('all', async () => {
    for (let i = 0; i < charts.length; i++) {
      const chart = charts[i]
      if (onProgress) onProgress(`Rendering ${chart.label}...`)
      const svgEl = await waitForChartSvg(chart.key)
      const chartH = chart.key === 'params' ? 600 : chart.key === 'metrics' ? 500 : 400
      const chartBlob = await svgToBlob(svgEl, 800, chartH, '#121212', resolutionScale, exportFormat)
      const fileNum = String(i + 2).padStart(2, '0')
      zip.file(`${fileNum}_${chart.label}.${ext}`, chartBlob)
    }
  })

  if (includeCSV) {
    if (onProgress) onProgress('Generating telemetry CSV...')
    const csvString = generateCSVString(dBuf, tBuf)
    zip.file(`${prefix}_telemetry_data.csv`, csvString)
  }

  if (onProgress) onProgress('Packaging ZIP archive...')
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  const safeName = customZipName ? customZipName.replace(/[^a-zA-Z0-9_-]/g, '_') : null
  const zipFilename = safeName
    ? `${safeName}.zip`
    : includeCSV
      ? `${prefix}_diagnostics_package_${timestamp}.zip`
      : `${prefix}_graphs_${timestamp}.zip`

  downloadBlob(zipBlob, zipFilename)
}
