/**
 * What-if rule: a change of `delta` in an indicator, applied at the forecast origin, scales the
 * P50 by (1 + beta × delta) from horizon `bestLag` onward (h is 1-based months ahead; lag 0 → from h1).
 */
export function whatIfFactor(h: number, bestLag: number, beta: number, delta: number): number {
  return h >= Math.max(1, bestLag) ? Math.max(0, 1 + beta * delta) : 1;
}
