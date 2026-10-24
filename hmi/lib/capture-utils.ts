import JSZip from 'jszip'
import { toCanvas, getFontEmbedCSS } from 'html-to-image'
import { drawTrace } from '@/components/hmi/xy-trace'
import type { DSample, TPoint, HMIState } from '@/lib/hmi-types'
import { withCaptureSession, getSavedRunCaptureSource, ALL_CAPTURE_CHART_KEYS } from '@/lib/capture-session'

function flushPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}
function backgroundFor(element: Element = document.documentElement): string {
  let current: Element | null = element
  while (current) {
    const color = getComputedStyle(current).backgroundColor
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color
    current = current.parentElement
  }
  return getComputedStyle(document.documentElement).getPropertyValue('--hmi-bg').trim() || '#ffffff'
}
function isVisible(element: HTMLElement) {
  if (element.closest('#hmi-capture-root')) return false
  const rect = element.getBoundingClientRect()
  if (rect.width < 10 || rect.height < 10) return false
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  }
  return true
}
export function getVisibleCaptureSurfaces(): HTMLElement[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-capture-chart], [data-export-surface]')).filter(isVisible)
  return nodes.filter(node => !nodes.some(parent => parent !== node && parent.contains(node)))
}
export function getVisibleCaptureOptions() {
  return getVisibleCaptureSurfaces().map((node, index) => ({
    id: node.dataset.captureChart || `surface-${index}`,
    name: node.querySelector('h2, h3, [data-chart-title]')?.textContent?.trim() || node.getAttribute('aria-label') || `Chart ${index + 1}`,
  }))
}
function visibleSurface(type: string): HTMLElement | undefined {
  const surfaces = getVisibleCaptureSurfaces()
  return surfaces.find((node, index) => (node.dataset.captureChart || `surface-${index}`) === type)
    || (type === 'xy' ? Array.from(document.querySelectorAll<HTMLElement>('#hmi-xy-trace, [data-replay-run]')).find(isVisible) : undefined)
}
function canvasBlob(canvas: HTMLCanvasElement, format: 'image/png' | 'image/jpeg'): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image generation failed.')), format, 0.95))
}
async function surfaceToBlob(node: HTMLElement, scale: number, format: 'image/png' | 'image/jpeg') {
  await document.fonts.ready
  await flushPaint()
  const rect = node.getBoundingClientRect()
  const canvas = await toCanvas(node, {
    width: Math.ceil(rect.width), height: Math.ceil(rect.height), pixelRatio: scale,
    backgroundColor: backgroundFor(node),
    filter: child => !(child instanceof Element && child.matches('[data-export-ignore], [role="tooltip"]')),
  })
  return canvasBlob(canvas, format)
}

/** Freeze computed SVG presentation before removing it from the page's CSS context. */
function prepareSvgForExport(svg: SVGElement, width: number, height: number): SVGElement {
  const clone = svg.cloneNode(true) as SVGElement
  const originals = [svg, ...Array.from(svg.querySelectorAll('*'))]
  const copies = [clone, ...Array.from(clone.querySelectorAll('*'))]
  const properties = ['fill', 'stroke', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity', 'opacity', 'stop-color', 'stop-opacity', 'background-color']
  const ids = new Map<string, string>()
  const prefix = `exp_${Math.random().toString(36).slice(2)}_`
  originals.forEach((original, index) => {
    const copy = copies[index] as SVGElement
    const style = getComputedStyle(original)
    properties.forEach(property => copy.style.setProperty(property, style.getPropertyValue(property)))
    if (copy.id) { const old = copy.id; copy.id = prefix + old; ids.set(old, copy.id) }
  })
  copies.forEach(node => {
    Array.from(node.attributes).forEach(attr => {
      let value = attr.value
      if ((attr.localName === 'href') && value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`
      value = value.replace(/url\(["']?([^)'"\s]+)["']?\)/g, (match, url: string) => {
        const id = url.slice(url.lastIndexOf('#') + 1)
        return ids.has(id) ? `url(#${ids.get(id)})` : match
      })
      node.setAttribute(attr.name, value)
    })
  })
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height))
  if (!clone.hasAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  return clone
}
export async function svgToBlob(svg: SVGElement, width: number, height: number, bgCol = backgroundFor(svg), scale = 2, format: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
  await document.fonts.ready
  const clone = prepareSvgForExport(svg, width, height)
  const fontCSS = await getFontEmbedCSS(svg as unknown as HTMLElement)
  if (fontCSS) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = fontCSS; clone.prepend(style)
  }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('SVG image could not be rendered.')); img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context not available.')
    ctx.fillStyle = bgCol; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, width, height)
    return await canvasBlob(canvas, format)
  } finally { URL.revokeObjectURL(url) }
}
export async function renderXYTraceToBlob(state: HMIState, showArm: boolean, scale = 2, format: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
  const source = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  source.width = Math.round(600 * dpr); source.height = Math.round(600 * dpr)
  drawTrace(source, state, showArm)
  const canvas = document.createElement('canvas')
  canvas.width = 600 * scale; canvas.height = 600 * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context not available.')
  ctx.fillStyle = backgroundFor(); ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvasBlob(canvas, format)
}
export function generateCSVString(d: DSample[], t: TPoint[]): string {
  const r2d = 180 / Math.PI
  const pointsByTime = new Map(t.map(point => [point.t, point]))
  const rows = d.map((s, i) => {
    const tp = pointsByTime.get(s.t) ?? (d.length === t.length ? t[i] : undefined)
    const eef = tp ? Math.hypot(tp.xi - tp.xa, tp.yi - tp.ya) : undefined
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
      eef: eef?.toFixed(3) ?? '',
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


export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function getExportPreferences() {
  const storedFormat = typeof window === 'undefined' ? null : localStorage.getItem('hmi_export_format')
  const exportFormat: 'image/png' | 'image/jpeg' = storedFormat === 'image/jpeg' ? storedFormat : 'image/png'
  const requestedScale = typeof window === 'undefined' ? 2 : Number(localStorage.getItem('hmi_export_scale') || 2)
  const resolutionScale = Number.isFinite(requestedScale) ? Math.min(4, Math.max(1, requestedScale)) : 2
  const filenamePrefix = typeof window === 'undefined' ? 'scara_hmi' : localStorage.getItem('hmi_filename_prefix') || 'scara_hmi'
  return { exportFormat, resolutionScale, filenamePrefix }
}
async function hiddenChartBlob(type: string, scale: number, format: 'image/png' | 'image/jpeg') {
  return withCaptureSession([type], async () => {
    const started = Date.now()
    while (Date.now() - started < 5000) {
      const container = document.getElementById(`capture-chart-${type}`)
      const svgs = Array.from(container?.querySelectorAll('svg') || [])
      const svg = svgs.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0]
      if (svg && svg.getBoundingClientRect().width >= 10 && svg.querySelector('path, rect, text')) {
        await flushPaint()
        const rect = svg.getBoundingClientRect()
        return svgToBlob(svg, rect.width, rect.height, backgroundFor(svg), scale, format)
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`Chart "${type}" did not render.`)
  })
}
export async function downloadSingleGraph(type: string, _name: string, state: HMIState) {
  const { exportFormat, resolutionScale, filenamePrefix } = getExportPreferences()
  const visible = visibleSurface(type)
  let blob: Blob
  if (visible) blob = await surfaceToBlob(visible, resolutionScale, exportFormat)
  else {
    if (getSavedRunCaptureSource() !== null) throw new Error('Open the chart you want to download first.')
    const data = state.recordingState === 'REC' ? state.dBuffer : state.frozenD
    if (!data.length) throw new Error('No telemetry data available.')
    blob = type === 'xy' ? await renderXYTraceToBlob(state, true, resolutionScale, exportFormat) : await hiddenChartBlob(type, resolutionScale, exportFormat)
  }
  downloadBlob(blob, `${filenamePrefix}_${type}_${Date.now()}.${exportFormat === 'image/png' ? 'png' : 'jpg'}`)
}
function recordsCSV(rows: readonly object[]) {
  if (!rows.length) return ''
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const field = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [keys.map(field).join(','), ...rows.map(row => keys.map(key => field((row as Record<string, unknown>)[key])).join(','))].join('\n')
}
export async function downloadAllGraphs(state: HMIState, includeCSV = false, onProgress?: (msg: string) => void, customZipName?: string) {
  const { exportFormat, resolutionScale, filenamePrefix } = getExportPreferences()
  const savedRuns = getSavedRunCaptureSource()
  const dBuf = state.recordingState === 'REC' ? state.dBuffer : state.frozenD
  const tBuf = state.recordingState === 'REC' ? state.tBuffer : state.frozenT
  const surfaces = getVisibleCaptureSurfaces()
  if (!surfaces.length && (savedRuns !== null || !dBuf.length)) throw new Error('Open a chart with data to download.')
  const zip = new JSZip()
  const ext = exportFormat === 'image/png' ? 'png' : 'jpg'
  const captured = new Set<string>()
  let index = 0
  const add = (key: string, blob: Blob) => { zip.file(`${String(++index).padStart(2, '0')}_${key}.${ext}`, blob); captured.add(key) }
  for (const [i, node] of surfaces.entries()) {
    const key = node.dataset.captureChart || `chart_${i + 1}`
    onProgress?.(`Rendering ${key}…`)
    add(key, await surfaceToBlob(node, resolutionScale, exportFormat))
  }
  // Saved runs must never fall back to unrelated live-controller buffers.
  if (savedRuns === null && dBuf.length) {
    if (!captured.has('xy')) add('xy', await renderXYTraceToBlob(state, true, resolutionScale, exportFormat))
    for (const key of ALL_CAPTURE_CHART_KEYS) {
      if (captured.has(key)) continue
      onProgress?.(`Rendering ${key}…`)
      add(key, await hiddenChartBlob(key, resolutionScale, exportFormat))
    }
  }
  if (includeCSV) {
    if (savedRuns !== null) {
      savedRuns.forEach((dataset, i) => {
        zip.file(`run_${i + 1}_samples.csv`, recordsCSV(dataset.samples))
        zip.file(`run_${i + 1}_trajectory.csv`, recordsCSV(dataset.trajectoryPoints))
        zip.file(`run_${i + 1}_metadata.json`, JSON.stringify(dataset.run, null, 2))
      })
    } else zip.file(`${filenamePrefix}_telemetry_data.csv`, generateCSVString(dBuf, tBuf))
  }
  onProgress?.('Packaging ZIP…')
  const blob = await zip.generateAsync({ type: 'blob' })
  const safeName = customZipName?.replace(/[^a-zA-Z0-9_-]/g, '_')
  downloadBlob(blob, `${safeName || `${filenamePrefix}_${includeCSV ? 'diagnostics' : 'graphs'}_${Date.now()}`}.zip`)
}
