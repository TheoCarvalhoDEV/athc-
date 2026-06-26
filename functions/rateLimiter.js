const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

/**
 * Limites de rate limiting para cada função.
 * Sem setAdminClaim — baixo risco, poucos admins.
 */
const LIMITS = {
  CRIAR_COBRANCA: { max: 5, windowSec: 60 },        // 5 por minuto
  CRIAR_COBRANCA_HORA: { max: 20, windowSec: 3600 }, // 20 por hora
  ADMIN_RESET: { max: 3, windowSec: 300 },           // 3 por 5 minutos
  WEBHOOK: { max: 60, windowSec: 60 },               // 60 por minuto por IP
  RECUPERAR_INGRESSO: { max: 10, windowSec: 60 },    // 10 buscas por minuto por IP
};

/**
 * Verifica e incrementa o contador de rate limit usando transação Firestore.
 *
 * @param {string} identifier - ID do usuário, IP, etc.
 * @param {string} functionName - Nome da função (chave para distinguir limites).
 * @param {number} maxRequests - Máximo de requisições permitidas na janela.
 * @param {number} windowSeconds - Tamanho da janela em segundos.
 * @returns {Promise<{allowed: boolean, retryAfterMs: number}>}
 */
async function checkRateLimit(identifier, functionName, maxRequests, windowSeconds) {
  if (!identifier || !functionName) {
    logger.warn("checkRateLimit chamado sem identifier ou functionName. Permitindo por segurança.");
    return { allowed: true, retryAfterMs: 0 };
  }

  const db = admin.firestore();
  const docId = `${functionName}_${identifier}`;
  const docRef = db.collection("_rateLimits").doc(docId);
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        // Primeiro request — criar documento
        transaction.set(docRef, {
          count: 1,
          windowStart: now,
          expiresAt: new Date(now + windowMs),
          functionName,
          identifier,
        });
        return { allowed: true, retryAfterMs: 0 };
      }

      const data = doc.data();
      const windowStart = data.windowStart || 0;
      const elapsed = now - windowStart;

      if (elapsed >= windowMs) {
        // Janela expirou — resetar contador
        transaction.update(docRef, {
          count: 1,
          windowStart: now,
          expiresAt: new Date(now + windowMs),
        });
        return { allowed: true, retryAfterMs: 0 };
      }

      const currentCount = data.count || 0;

      if (currentCount >= maxRequests) {
        // Limite atingido
        const retryAfterMs = windowMs - elapsed;
        logger.warn(
          `Rate limit atingido: ${functionName} por ${identifier}. ` +
          `${currentCount}/${maxRequests} em ${Math.round(elapsed / 1000)}s. ` +
          `Tente novamente em ${Math.round(retryAfterMs / 1000)}s.`
        );
        return { allowed: false, retryAfterMs };
      }

      // Incrementar contador
      transaction.update(docRef, {
        count: currentCount + 1,
      });
      return { allowed: true, retryAfterMs: 0 };
    });

    return result;
  } catch (error) {
    // Em caso de erro na verificação, permitir a requisição (fail-open)
    // para não bloquear operações legítimas por falha infra
    logger.error("Erro no checkRateLimit, permitindo requisição (fail-open):", error);
    return { allowed: true, retryAfterMs: 0 };
  }
}

module.exports = { checkRateLimit, LIMITS };
