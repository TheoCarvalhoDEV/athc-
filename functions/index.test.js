import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';

// 1. Criar as referências para os mocks (acessíveis nos testes)
const mockDocGet = vi.fn();
const mockDocSet = vi.fn();
const mockDocUpdate = vi.fn();
const mockRunTransaction = vi.fn();

const mockQuery = {
  limit: vi.fn(),
  get: vi.fn(),
};

// Coleções simuladas dinamicamente
const mockCollection = (colName) => ({
  doc: vi.fn((docId) => ({
    _path: `${colName}/${docId}`,
    get: mockDocGet,
    set: mockDocSet,
    update: mockDocUpdate,
  })),
  where: vi.fn(() => mockQuery),
});

mockQuery.limit.mockReturnValue(mockQuery);
mockQuery.get.mockResolvedValue({ empty: true, docs: [] });

const mockFirestore = {
  collection: vi.fn((colName) => mockCollection(colName)),
  runTransaction: mockRunTransaction,
};

const mockAuthUpdateUser = vi.fn();
const mockAuthSetCustomClaims = vi.fn();

const mockMpCreate = vi.fn();
const mockMpGet = vi.fn();

// Mock do firebase-admin
const mockAdmin = {
  initializeApp: vi.fn(),
  firestore: vi.fn(() => mockFirestore),
  auth: vi.fn(() => ({
    updateUser: mockAuthUpdateUser,
    setCustomClaims: mockAuthSetCustomClaims,
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => 'mock-server-timestamp'),
    increment: vi.fn((val) => ({ type: 'increment', value: val })),
  },
};

// Mock do mercadopago
class MercadoPagoConfig {
  constructor() {}
}
class Payment {
  constructor() {}
  create(data) {
    return mockMpCreate(data);
  }
  get(data) {
    return mockMpGet(data);
  }
}
const mockMP = {
  MercadoPagoConfig,
  Payment,
};

// Mock do cors
const mockCors = () => (req, res, callback) => {
  if (typeof callback === 'function') {
    return callback();
  }
};

// 2. Interceptar Module.prototype.require para forçar o carregamento dos mocks no index.js
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'firebase-admin') {
    return mockAdmin;
  }
  if (id === 'mercadopago') {
    return mockMP;
  }
  if (id === 'cors') {
    return mockCors;
  }
  if (id === './rateLimiter') {
    return {
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
      LIMITS: {
        CRIAR_COBRANCA: { max: 5, windowSec: 60 },
        CRIAR_COBRANCA_HORA: { max: 20, windowSec: 3600 },
        ADMIN_RESET: { max: 3, windowSec: 300 },
        WEBHOOK: { max: 60, windowSec: 60 },
      },
    };
  }
  return originalRequire.apply(this, arguments);
};

// 3. Inicializar variáveis de ambiente e importar index.js
process.env.MP_ACCESS_TOKEN = 'mock-access-token';
const requireLocal = createRequire(import.meta.url);
const myFunctions = requireLocal('./index.js');
const fft = requireLocal('firebase-functions-test')();

describe('Cloud Functions Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.get.mockResolvedValue({ empty: true, docs: [] });
  });

  describe('criarCobrancaPix', () => {
    it('deve falhar se dados incompletos forem fornecidos', async () => {
      const wrapped = fft.wrap(myFunctions.criarCobrancaPix);
      
      await expect(wrapped({
        data: { valor: null }
      })).rejects.toThrow('Dados incompletos para gerar o Pix.');
    });

    it('deve criar cobranca pix com sucesso se houver estoque', async () => {
      const wrapped = fft.wrap(myFunctions.criarCobrancaPix);
      
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          tickets: [{ id: 'lote-1', name: 'Lote VIP', capacity: 10, sold: 2, price: 50 }]
        })
      });

      mockMpCreate.mockResolvedValueOnce({
        id: 'mp-pay-123',
        point_of_interaction: {
          transaction_data: {
            qr_code: 'mock-qr-code',
            qr_code_base64: 'mock-qr-base64'
          }
        }
      });

      const result = await wrapped({
        data: {
          valor: 50,
          email: 'comprador@teste.com',
          pedidoId: 'ped-123',
          eventId: 'evt-123',
          itensSelecionados: [{ id: 'lote-1', quantity: 1, price: 50, name: 'Lote VIP' }]
        }
      });

      expect(mockMpCreate).toHaveBeenCalled();
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ped-123',
          valor: 50,
          status: 'pendente',
          mercadoPagoPaymentId: 'mp-pay-123'
        }),
        expect.anything()
      );
      expect(result).toEqual({
        id: 'mp-pay-123',
        qr_code: 'mock-qr-code',
        qr_code_base64: 'mock-qr-base64'
      });
    });

    it('deve falhar se a quantidade solicitada exceder o estoque', async () => {
      const wrapped = fft.wrap(myFunctions.criarCobrancaPix);

      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          tickets: [{ id: 'lote-1', name: 'Lote VIP', capacity: 10, sold: 10, price: 50 }]
        })
      });

      await expect(wrapped({
        data: {
          valor: 50,
          email: 'comprador@teste.com',
          pedidoId: 'ped-123',
          eventId: 'evt-123',
          itensSelecionados: [{ id: 'lote-1', quantity: 1, price: 50, name: 'Lote VIP' }]
        }
      })).rejects.toThrow('Desculpe, o ingresso "Lote VIP" esgotou ou não possui a quantidade solicitada disponível.');
    });
  });

  describe('setAdminClaim', () => {
    it('deve falhar se solicitante nao estiver autenticado', async () => {
      const wrapped = fft.wrap(myFunctions.setAdminClaim);
      
      await expect(wrapped({
        data: { uid: 'user-xyz', admin: true },
        auth: null
      })).rejects.toThrow('Apenas usuários autenticados podem definir permissões.');
    });

    it('deve falhar se solicitante nao for admin', async () => {
      const wrapped = fft.wrap(myFunctions.setAdminClaim);
      
      await expect(wrapped({
        data: { uid: 'user-xyz', admin: true },
        auth: {
          token: {
            email: 'not-admin@example.com',
            admin: false
          }
        }
      })).rejects.toThrow('Apenas administradores podem definir novos administradores.');
    });

    it('deve definir claim de admin com sucesso', async () => {
      const wrapped = fft.wrap(myFunctions.setAdminClaim);
      
      mockAuthSetCustomClaims.mockResolvedValueOnce({ success: true });

      const result = await wrapped({
        data: { uid: 'user-xyz', admin: true },
        auth: {
          token: {
            email: 'admin@atche.com.br',
            admin: true
          }
        }
      });

      expect(mockAuthSetCustomClaims).toHaveBeenCalledWith('user-xyz', { admin: true });
      expect(result).toEqual({ success: true, uid: 'user-xyz', admin: true });
    });
  });

  describe('webhookMercadoPago', () => {
    it('deve retornar 400 se ID de pagamento nao for fornecido', async () => {
      const req = {
        query: {},
        body: {},
        headers: {},
      };
      
      let resolveSend;
      const sendPromise = new Promise((resolve) => { resolveSend = resolve; });
      const res = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockImplementation((msg) => { resolveSend(msg); }),
      };

      const wrapped = myFunctions.webhookMercadoPago;
      wrapped(req, res);
      await sendPromise;

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('ID do pagamento não fornecido.');
    });

    it('deve processar webhook com sucesso se pagamento for aprovado', async () => {
      const req = {
        query: { id: 'mp-pay-789' },
        body: {},
        headers: {},
      };
      
      let resolveSend;
      const sendPromise = new Promise((resolve) => { resolveSend = resolve; });
      const res = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockImplementation((msg) => { resolveSend(msg); }),
      };

      mockMpGet.mockResolvedValueOnce({
        status: 'approved',
        external_reference: 'ped-789',
      });

      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          status: 'pendente',
          eventId: 'evt-123',
          userId: 'usr-123',
          clienteNome: 'João',
          clienteEmail: 'joao@example.com',
          itensComprados: [{ id: 'lote-1', quantity: 2, price: 50, name: 'Lote VIP' }]
        }),
        id: 'ped-789'
      });

      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref && ref._path && ref._path.startsWith('pedidos/')) {
            return Promise.resolve({
              exists: true,
              data: () => ({
                status: 'pendente',
                eventId: 'evt-123',
                userId: 'usr-123',
                clienteNome: 'João',
                clienteEmail: 'joao@example.com',
                itensComprados: [{ id: 'lote-1', quantity: 2, price: 50, name: 'Lote VIP' }]
              }),
              id: 'ped-789'
            });
          }
          if (ref && ref._path && ref._path.startsWith('events/')) {
            return Promise.resolve({
              exists: true,
              data: () => ({
                tickets: [{ id: 'lote-1', name: 'Lote VIP', capacity: 10, sold: 2, status: 'active' }]
              })
            });
          }
          return Promise.resolve({ exists: false });
        }),
        update: vi.fn(),
        set: vi.fn(),
      };
      
      mockRunTransaction.mockImplementationOnce(async (callback) => {
        await callback(mockTx);
      });

      const wrapped = myFunctions.webhookMercadoPago;
      wrapped(req, res);
      await sendPromise;

      expect(mockMpGet).toHaveBeenCalledWith({ id: 'mp-pay-789' });
      expect(mockRunTransaction).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'pago' })
      );
      expect(mockTx.set).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('Webhook processado.');
    });

    it('deve retornar 400 se MP_WEBHOOK_SECRET estiver configurado mas headers de assinatura estiverem ausentes', async () => {
      const originalSecret = process.env.MP_WEBHOOK_SECRET;
      process.env.MP_WEBHOOK_SECRET = 'segredo-teste';

      const req = {
        query: { id: 'mp-pay-789' },
        body: {},
        headers: {},
      };
      
      let resolveSend;
      const sendPromise = new Promise((resolve) => { resolveSend = resolve; });
      const res = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockImplementation((msg) => { resolveSend(msg); }),
      };

      const wrapped = myFunctions.webhookMercadoPago;
      wrapped(req, res);
      await sendPromise;

      if (originalSecret) {
        process.env.MP_WEBHOOK_SECRET = originalSecret;
      } else {
        delete process.env.MP_WEBHOOK_SECRET;
      }

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Assinatura ausente ou inválida.');
    });

    it('deve retornar 401 se MP_WEBHOOK_SECRET estiver configurado mas assinatura calculada nao bater', async () => {
      const originalSecret = process.env.MP_WEBHOOK_SECRET;
      process.env.MP_WEBHOOK_SECRET = 'segredo-teste';

      const req = {
        query: { id: 'mp-pay-789' },
        body: {},
        headers: {
          'x-signature': 'ts=12345678,v1=hash-invalida',
          'x-request-id': 'req-123'
        },
      };
      
      let resolveSend;
      const sendPromise = new Promise((resolve) => { resolveSend = resolve; });
      const res = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockImplementation((msg) => { resolveSend(msg); }),
      };

      const wrapped = myFunctions.webhookMercadoPago;
      wrapped(req, res);
      await sendPromise;

      if (originalSecret) {
        process.env.MP_WEBHOOK_SECRET = originalSecret;
      } else {
        delete process.env.MP_WEBHOOK_SECRET;
      }

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith('Assinatura não autorizada.');
    });
  });
});
