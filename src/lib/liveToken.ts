// Token visual "ao vivo" do ingresso (anti-fraude — item #22).
//
// Deriva um código curto DETERMINÍSTICO a partir do id da inscrição + a janela de 30s
// atual. Como o código depende do tempo, ele GIRA a cada 30 segundos no app. Um print
// ou foto do ingresso congela o código (e o relógio); o app mostra o código mudando em
// tempo real — é esse movimento que o porteiro confere para saber que o ingresso está
// "vivo" e não é uma captura de tela. A validação de fato continua sendo o QR Code.

// Base32 estilo Crockford, sem caracteres ambíguos (I, L, O, U), igual ao ticketCode.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Hash FNV-1a de 32 bits com semente — boa distribuição para ids arbitrários.
const fnv1a = (str: string, seed: number): number => {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

// Período de rotação do token (30 segundos).
export const LIVE_TOKEN_PERIOD_MS = 30_000;

// Índice da janela de tempo atual (incrementa a cada 30s).
export const liveTokenWindow = (now: number = Date.now()): number =>
  Math.floor(now / LIVE_TOKEN_PERIOD_MS);

// Código curto (6 caracteres base32) derivado do id da inscrição + janela de 30s.
export const liveTokenFor = (id: string, now: number = Date.now()): string => {
  const win = liveTokenWindow(now);
  const a = fnv1a(`${id}:${win}`, 0x811c9dc5);
  const b = fnv1a(`${win}:${id}`, 0x9e3779b9);
  // 30 bits → 6 caracteres base32.
  let v = (BigInt(b & 0x7fff) << 15n) | BigInt(a & 0x7fff);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code = ALPHABET[Number(v & 31n)] + code;
    v >>= 5n;
  }
  return code;
};

// Milissegundos restantes até o token girar para o próximo valor.
export const liveTokenRemainingMs = (now: number = Date.now()): number =>
  LIVE_TOKEN_PERIOD_MS - (now % LIVE_TOKEN_PERIOD_MS);
