import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do firebase-admin e firebase-functions/logger ──
const mockTransaction = {
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
};

const mockRunTransaction = vi.fn(async (fn) => fn(mockTransaction));

const mockDoc = vi.fn(() => ({ id: 'mock-doc' }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('firebase-admin', () => ({
  default: {
    firestore: () => ({
      collection: mockCollection,
      runTransaction: mockRunTransaction,
    }),
  },
  firestore: () => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  }),
}));

vi.mock('firebase-functions/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn() },
  warn: vi.fn(),
  error: vi.fn(),
}));

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Precisamos forçar o admin mock no CommonJS require usado pelo rateLimiter
import Module from 'module';
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === 'firebase-admin') {
    return {
      firestore: () => ({
        collection: mockCollection,
        runTransaction: mockRunTransaction,
      }),
    };
  }
  if (id === 'firebase-functions/logger') {
    return { warn: vi.fn(), error: vi.fn() };
  }
  return originalRequire.apply(this, arguments);
};

const { checkRateLimit, LIMITS } = require('./rateLimiter');

describe('rateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn) => fn(mockTransaction));
  });

  describe('LIMITS', () => {
    it('exporta constantes de limites corretas', () => {
      expect(LIMITS.CRIAR_COBRANCA).toEqual({ max: 5, windowSec: 60 });
      expect(LIMITS.CRIAR_COBRANCA_HORA).toEqual({ max: 20, windowSec: 3600 });
      expect(LIMITS.ADMIN_RESET).toEqual({ max: 3, windowSec: 300 });
      expect(LIMITS.WEBHOOK).toEqual({ max: 60, windowSec: 60 });
    });
  });

  describe('checkRateLimit', () => {
    it('permite requisição quando não existe documento (primeiro request)', async () => {
      mockTransaction.get.mockResolvedValue({ exists: false });

      const result = await checkRateLimit('user123', 'testFunc', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
      expect(mockTransaction.set).toHaveBeenCalledTimes(1);
    });

    it('permite requisição quando está dentro do limite', async () => {
      mockTransaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          count: 2,
          windowStart: Date.now() - 10000,
        }),
      });

      const result = await checkRateLimit('user123', 'testFunc', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
      expect(mockTransaction.update).toHaveBeenCalledTimes(1);
    });

    it('bloqueia requisição quando excede o limite', async () => {
      const windowStart = Date.now() - 30000;
      mockTransaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          count: 5,
          windowStart,
        }),
      });

      const result = await checkRateLimit('user123', 'testFunc', 5, 60);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(30000);
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    it('reseta contador quando janela expira', async () => {
      mockTransaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          count: 99,
          windowStart: Date.now() - 120000,
        }),
      });

      const result = await checkRateLimit('user123', 'testFunc', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ count: 1 })
      );
    });

    it('retorna allowed=true quando identifier está vazio (fail-safe)', async () => {
      const result = await checkRateLimit('', 'testFunc', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });

    it('retorna allowed=true quando functionName está vazio (fail-safe)', async () => {
      const result = await checkRateLimit('user123', '', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });

    it('retorna allowed=true quando a transação falha (fail-open)', async () => {
      mockRunTransaction.mockRejectedValue(new Error('Firestore error'));

      const result = await checkRateLimit('user123', 'testFunc', 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
    });

    it('calcula retryAfterMs corretamente', async () => {
      const elapsed = 45000;
      const windowSec = 60;
      const expectedRetry = (windowSec * 1000) - elapsed;

      mockTransaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          count: 5,
          windowStart: Date.now() - elapsed,
        }),
      });

      const result = await checkRateLimit('user123', 'testFunc', 5, windowSec);

      expect(result.allowed).toBe(false);
      expect(Math.abs(result.retryAfterMs - expectedRetry)).toBeLessThan(100);
    });
  });
});
