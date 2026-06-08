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
