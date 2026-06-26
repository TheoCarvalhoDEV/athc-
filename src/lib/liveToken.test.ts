import { describe, it, expect } from 'vitest';
import { liveTokenFor, liveTokenWindow, liveTokenRemainingMs, LIVE_TOKEN_PERIOD_MS } from './liveToken';

const ALPHABET = /^[0-9A-HJKMNP-TV-Z]{6}$/; // base32 Crockford, 6 chars

describe('liveToken', () => {
  it('gera um código de 6 caracteres no alfabeto base32 sem ambíguos', () => {
    expect(liveTokenFor('reg_abc', 0)).toMatch(ALPHABET);
  });

  it('é determinístico dentro da mesma janela de 30s', () => {
    const t = 1_000_000_000_000; // instante arbitrário
    const dentroDaJanela = t + (LIVE_TOKEN_PERIOD_MS - 1) - (t % LIVE_TOKEN_PERIOD_MS);
    expect(liveTokenFor('reg_x', t)).toBe(liveTokenFor('reg_x', dentroDaJanela));
  });

  it('muda quando a janela de 30s vira', () => {
    const t = 1_000_000_000_000;
    const proximaJanela = t + LIVE_TOKEN_PERIOD_MS;
    expect(liveTokenFor('reg_x', t)).not.toBe(liveTokenFor('reg_x', proximaJanela));
  });

  it('difere entre ingressos distintos na mesma janela', () => {
    const t = 1_000_000_000_000;
    expect(liveTokenFor('reg_a', t)).not.toBe(liveTokenFor('reg_b', t));
  });

  it('liveTokenWindow incrementa a cada período', () => {
    const t = 1_000_000_000_000;
    expect(liveTokenWindow(t + LIVE_TOKEN_PERIOD_MS)).toBe(liveTokenWindow(t) + 1);
  });

  it('liveTokenRemainingMs fica dentro de (0, período]', () => {
    const t = 1_000_000_000_123;
    const restante = liveTokenRemainingMs(t);
    expect(restante).toBeGreaterThan(0);
    expect(restante).toBeLessThanOrEqual(LIVE_TOKEN_PERIOD_MS);
  });
});
