import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook de rate limiting no frontend.
 * Aplica cooldown visual após cada chamada de `trigger()`.
 *
 * @param cooldownMs - Tempo de cooldown em milissegundos.
 * @returns { isLimited, remainingMs, trigger }
 */
export function useRateLimit(cooldownMs: number) {
  const [endTime, setEndTime] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const trigger = useCallback(() => {
    const newEnd = Date.now() + cooldownMs;
    setEndTime(newEnd);
    setRemainingMs(cooldownMs);
  }, [cooldownMs]);

  useEffect(() => {
    if (endTime === null) return;

    // Atualizar remainingMs a cada 100ms
    intervalRef.current = setInterval(() => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setRemainingMs(0);
        setEndTime(null);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        setRemainingMs(remaining);
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [endTime]);

  const isLimited = remainingMs > 0;

  return { isLimited, remainingMs, trigger };
}
