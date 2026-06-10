/**
 * LOESS-like local mean / local regression smoothing utility.
 * - `y`: array of signal values
 * - `x`: optional array of independent values (defaults to indices)
 * - `span`: fraction of points to use for local neighborhood (0..1)
 * - `degree`: 0 = local constant (weighted mean), 1 = local linear
 *
 * Returns an array of smoothed values (same length as `y`).
 */
export function localLoess(
  y: number[],
  x?: number[],
  span = 0.3,
  degree = 1
): number[] {
  const n = y.length;
  if (!x) x = Array.from({ length: n }, (_, i) => i);
  if (x.length !== n) throw new Error('x and y must have same length');
  span = Math.max(0.01, Math.min(1, span));
  const m = Math.max(2, Math.floor(span * n));
  const out = new Array<number>(n);

  function tricube(u: number) {
    const t = 1 - Math.abs(u) ** 3;
    return t > 0 ? t ** 3 : 0;
  }

  for (let i = 0; i < n; i++) {
    const x0 = x[i];
    // compute distances and find bandwidth h
    const dists: number[] = new Array(n);
    for (let j = 0; j < n; j++) dists[j] = Math.abs(x[j] - x0);
    const sorted = dists.slice().sort((a, b) => a - b);
    let h = sorted[Math.min(m - 1, sorted.length - 1)];
    if (h === 0) {
      // if multiple points coincide, use tiny h to avoid division by zero
      h = 1e-12;
    }

    // compute weights
    const w: number[] = new Array(n);
    let sumw = 0;
    for (let j = 0; j < n; j++) {
      const u = dists[j] / h;
      const ww = tricube(u);
      w[j] = ww;
      sumw += ww;
    }

    if (sumw === 0) {
      out[i] = y[i];
      continue;
    }

    if (degree <= 0) {
      // weighted mean
      let s = 0;
      for (let j = 0; j < n; j++) s += w[j] * y[j];
      out[i] = s / sumw;
      continue;
    }

    // local linear fit: solve 2x2 normal equations
    let S0 = 0;
    let Sx = 0;
    let Sy = 0;
    let Sxx = 0;
    let Sxy = 0;
    for (let j = 0; j < n; j++) {
      const ww = w[j];
      const xv = x[j];
      const yv = y[j];
      S0 += ww;
      Sx += ww * xv;
      Sy += ww * yv;
      Sxx += ww * xv * xv;
      Sxy += ww * xv * yv;
    }

    const denom = S0 * Sxx - Sx * Sx;
    if (Math.abs(denom) < 1e-12) {
      // fallback to weighted mean
      let s = 0;
      for (let j = 0; j < n; j++) s += w[j] * y[j];
      out[i] = s / sumw;
      continue;
    }

    const beta1 = (S0 * Sxy - Sx * Sy) / denom;
    const beta0 = (Sy - beta1 * Sx) / S0;
    out[i] = beta0 + beta1 * x0;
  }

  return out;
}

export default localLoess;
