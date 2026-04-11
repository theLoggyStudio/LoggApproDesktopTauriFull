import { useEffect, useState } from 'react';

/**
 * Animation douce des chiffres (KPI) — complète les keyframes CSS pour les valeurs numériques.
 */
export function useAnimatedNumber(
  target: number,
  durationMs: number,
  decimals = 0,
  enabled = true,
): string {
  const [v, setV] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setV(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    let raf: number;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setV(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, enabled]);

  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
}
