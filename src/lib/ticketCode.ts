// Geração e normalização do código curto e legível do ingresso.
//
// O código é DERIVADO de forma determinística do id do documento da inscrição
// (registration.id). Isso significa que funciona para QUALQUER ingresso já
// emitido — sem precisar de campo novo no Firestore nem alteração no backend.
//
// A validação (ValidateTickets) resolve os dois formatos:
//   • id completo  → lido do QR Code do ingresso (exato, sem colisão);
//   • código curto → digitado manualmente na portaria,
// comparando contra as inscrições do evento.

// Base32 estilo Crockford, sem os caracteres ambíguos I, L, O e U.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Hash FNV-1a de 32 bits com semente — boa distribuição para ids arbitrários.
const fnv1a = (str: string, seed: number): number => {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0; // primo FNV de 32 bits
  }
  return h >>> 0;
};

// Núcleo de 8 caracteres base32 (40 bits → espaço ~1 trilhão). A probabilidade
// de colisão na escala de um evento (milhares de ingressos) é desprezível.
export const ticketCodeCore = (id: string): string => {
  const clean = (id || '').trim();
  const a = fnv1a(clean, 0x811c9dc5);
  const b = fnv1a(clean, 0x9e3779b9);
  // 40 bits: 32 de `a` + 8 de `b`.
  let v = (BigInt(b & 0xff) << 32n) | BigInt(a);
  let core = '';
  for (let i = 0; i < 8; i++) {
    core = ALPHABET[Number(v & 31n)] + core;
    v >>= 5n;
  }
  return core;
};

// Código formatado para exibição no ingresso: ATX-XXXX-XXXX
export const makeTicketCode = (id: string): string => {
  const core = ticketCodeCore(id);
  return `ATX-${core.slice(0, 4)}-${core.slice(4)}`;
};

// Normaliza um texto lido/digitado para comparação: maiúsculas, mapeia os
// caracteres comumente confundidos (O→0, I/L→1) e remove tudo que não for
// alfanumérico (espaços, hifens, o prefixo "ATX-", etc.).
export const normalizeLoose = (raw: string): string => {
  const upper = (raw || '').toUpperCase();
  const mapped = upper.replace(/O/g, '0').replace(/[IL]/g, '1');
  return mapped.replace(/[^0-9A-Z]/g, '');
};

// Verifica se um texto livre corresponde ao código curto de um id.
// Aceita o núcleo puro ("12AB34CD") ou com prefixo ("ATX12AB34CD").
export const matchesTicketCode = (raw: string, id: string): boolean => {
  const norm = normalizeLoose(raw);
  if (norm.length < 6) return false;
  const core = ticketCodeCore(id);
  return norm === core || norm === 'ATX' + core;
};
