import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRateLimit } from './useRateLimit';

describe('useRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('estado inicial: não limitado', () => {
    const { result } = renderHook(() => useRateLimit(3000));

    expect(result.current.isLimited).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    expect(typeof result.current.trigger).toBe('function');
  });

  it('fica limitado após trigger()', () => {
    const { result } = renderHook(() => useRateLimit(3000));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isLimited).toBe(true);
    expect(result.current.remainingMs).toBe(3000);
  });

  it('remainingMs decrementa com o tempo', () => {
    const { result } = renderHook(() => useRateLimit(3000));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isLimited).toBe(true);

    // Avança 1.5s
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Deve ter decrementado (com tolerância do intervalo de 100ms)
    expect(result.current.remainingMs).toBeLessThanOrEqual(1600);
    expect(result.current.remainingMs).toBeGreaterThan(0);
    expect(result.current.isLimited).toBe(true);
  });

  it('liberado após cooldown completo', () => {
    const { result } = renderHook(() => useRateLimit(3000));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isLimited).toBe(true);

    // Avança 3.2s (> cooldown de 3s)
    act(() => {
      vi.advanceTimersByTime(3200);
    });

    expect(result.current.isLimited).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it('cooldown pode ser re-triggered', () => {
    const { result } = renderHook(() => useRateLimit(2000));

    act(() => {
      result.current.trigger();
    });

    // Avança 1s
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isLimited).toBe(true);

    // Re-trigger reseta o cooldown
    act(() => {
      result.current.trigger();
    });

    expect(result.current.isLimited).toBe(true);
    expect(result.current.remainingMs).toBe(2000);
  });

  it('funciona com diferentes valores de cooldown', () => {
    const { result } = renderHook(() => useRateLimit(500));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isLimited).toBe(true);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.isLimited).toBe(false);
  });
});
