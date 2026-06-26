import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { liveTokenFor, liveTokenRemainingMs, LIVE_TOKEN_PERIOD_MS } from '../lib/liveToken';

// Selo de autenticidade "ao vivo" (anti-fraude — item #22).
//
// Exibe um relógio em tempo real + um código de segurança que gira a cada 30s + uma faixa
// holográfica em movimento contínuo. Tudo isso se move sozinho no app: uma captura de tela
// ou foto do ingresso fica CONGELADA, então na portaria basta pedir para o portador mostrar
// esta área em movimento. A validação real continua sendo o QR Code do ingresso.
export const LiveTicketSeal = ({ registrationId }: { registrationId: string }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const token = liveTokenFor(registrationId, now);
  const remainingMs = liveTokenRemainingMs(now);
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const progress = remainingMs / LIVE_TOKEN_PERIOD_MS; // 1 → 0
  const clock = new Date(now).toLocaleTimeString('pt-BR', { hour12: false });

  // Anel de contagem regressiva (SVG).
  const R = 18;
  const CIRC = 2 * Math.PI * R;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-accent/5 p-4 mt-4">
      {/* Faixa holográfica em movimento contínuo — prova visual de "ao vivo". */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent blur-md animate-shimmer-slide" />
      </div>

      <div className="relative flex items-center gap-3.5">
        {/* Anel + segundos restantes */}
        <div className="relative w-12 h-12 shrink-0">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(11,79,72,0.15)" strokeWidth="3" />
            <circle
              cx="22"
              cy="22"
              r={R}
              fill="none"
              stroke="#0B4F48"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-accent tabular-nums">
            {remainingSec}
          </span>
        </div>

        {/* Código de segurança que gira a cada 30s */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-accent">
            <ShieldCheck size={13} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Selo ao vivo</span>
          </div>
          <p className="font-mono font-bold tracking-[0.3em] text-textLight text-lg leading-tight tabular-nums">
            {token}
          </p>
        </div>

        {/* Relógio em tempo real */}
        <div className="text-right shrink-0">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-textMuted">Agora</p>
          <p className="font-mono text-sm font-bold text-textLight tabular-nums">{clock}</p>
        </div>
      </div>

      <p className="relative text-[10px] text-textMuted mt-2.5 leading-snug">
        Na portaria, mostre esta tela <strong className="text-accent">em movimento</strong>. Em um print, o
        código e o relógio aparecem congelados.
      </p>
    </div>
  );
};
