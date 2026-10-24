import type { SavedRunDataset } from '@/components/dashboard/dashboard-xy-trace'

export type CaptureScope = 'all' | string[]

export const ALL_CAPTURE_CHART_KEYS = [
  'cte',
  'ate',
  'eef',
  'eef-vel',
  'pwm',
  'pos',
  'vel',
  'phase',
  'fft-eef',
  'fft-th1',
  'fft-th2',
  'effort',
  'ctc',
  'internal',
  'stepper',
  'pid-breakdown',
  'loop',
  'params',
  'metrics',
] as const

type CaptureListener = (scope: CaptureScope | null) => void

let listener: CaptureListener | null = null
let activeScope: CaptureScope | null = null

function flushPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export function registerCaptureSessionListener(fn: CaptureListener) {
  listener = fn
  fn(activeScope)
  return () => {
    if (listener === fn) listener = null
  }
}

export function getActiveCaptureScope(): CaptureScope | null {
  return activeScope
}

/** Mount hidden capture charts, run export work, then unmount. */
export async function withCaptureSession<T>(
  scope: CaptureScope,
  fn: () => Promise<T>
): Promise<T> {
  if (activeScope) {
    throw new Error('A capture session is already in progress.')
  }

  activeScope = scope
  listener?.(scope)

  try {
    // Let React commit the newly mounted chart tree and paint once.
    await flushPaint()
    await new Promise((resolve) => setTimeout(resolve, 80))
    await flushPaint()
    return await fn()
  } finally {
    activeScope = null
    listener?.(null)
  }
}

// A mounted Saved runs page owns its fetched data independently of the live HMI.
let savedRunSource: readonly SavedRunDataset[] | null = null
const savedRunListeners = new Set<() => void>()
export function getSavedRunCaptureSource() { return savedRunSource }
export function subscribeSavedRunCaptureSource(fn: () => void) {
  savedRunListeners.add(fn)
  return () => { savedRunListeners.delete(fn) }
}
export function registerSavedRunCaptureSource(runs: readonly SavedRunDataset[]) {
  savedRunSource = runs
  savedRunListeners.forEach(fn => fn())
  return () => {
    if (savedRunSource === runs) {
      savedRunSource = null
      savedRunListeners.forEach(fn => fn())
    }
  }
}
