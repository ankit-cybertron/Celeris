/** Shared motion settings, set once from config at startup. */
let enabled = true;
let duration = 700;

export function setMotion(opts: { enabled: boolean; duration_ms: number }) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  enabled = opts.enabled && !reduce;
  duration = Math.max(0, opts.duration_ms);
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("motion-off", !enabled);
    document.documentElement.style.setProperty("--motion-duration", `${duration}ms`);
  }
}

export const motionEnabled = () => enabled;
export const motionMs = () => (enabled ? duration : 0);

/** Spread onto any Recharts series: <Line {...chartAnim()} /> */
export function chartAnim() {
  return enabled
    ? { isAnimationActive: true, animationDuration: duration, animationEasing: "ease-out" as const }
    : { isAnimationActive: false };
}
