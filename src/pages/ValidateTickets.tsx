import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { storage } from '../lib/storage';
import type { EventItem, Registration } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, ScanLine,
  Keyboard, RefreshCw, User, Ticket, CalendarCheck, CameraOff,
} from 'lucide-react';

type ResultStatus = 'success' | 'already' | 'wrong_event' | 'invalid';

interface ScanResult {
  status: ResultStatus;
  registration?: Registration;
  title: string;
  detail: string;
  when?: string;
}

// Formata data/hora local de validação
const formatWhen = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatCpf = (cpf?: string): string => {
  if (!cpf) return '';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

export const ValidateTickets = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  // Sem sessão → manda para o login (rota é full-screen, fora do PrivateRoute)
  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true });
  }, [authLoading, user, navigate]);

  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const pausedRef = useRef(false); // ignora leituras enquanto um resultado está na tela
  const processingRef = useRef(false);

  // ─── Carrega evento + valida acesso (dono do evento ou admin) ───
  useEffect(() => {
    if (authLoading || !user) return; // espera a sessão resolver antes de checar acesso
    let active = true;
    (async () => {
      if (!eventId) return;
      setLoading(true);
      try {
        const ev = await storage.getEventById(eventId);
        if (!active) return;
        if (!ev) {
          setNotFound(true);
          return;
        }
        const isOwner =
          user?.role === 'admin' || ev.creatorId === (user?.profileId || user?.id);
        if (!isOwner) {
          setDenied(true);
          return;
        }
        setEvent(ev);
        // Estatística inicial de validação
        try {
          const regs = await storage.getRegistrationsForEvent(eventId);
          if (!active) return;
          setTotalCount(regs.length);
          setCheckedInCount(regs.filter((r) => r.checkedIn).length);
        } catch {
          /* contagem é apenas informativa */
        }
      } catch (e) {
        console.error('Erro ao carregar evento para validação:', e);
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [eventId, user?.id, user?.role, user?.profileId, authLoading, user]);

  // ─── Processa um código lido (câmera ou manual) ───
  const handleCode = useCallback(
    async (raw: string) => {
      if (processingRef.current || pausedRef.current) return;
      let code = (raw || '').trim();
      if (!code) return;
      try {
        code = decodeURIComponent(code);
      } catch {
        /* mantém o texto bruto se não for URI */
      }
      // Caso o QR contenha uma URL, usa o último segmento como ID
      if (code.includes('/')) code = code.split('/').filter(Boolean).pop() || code;

      processingRef.current = true;
      pausedRef.current = true;
      setProcessing(true);

      // Vibração curta de feedback (se suportado)
      try { navigator.vibrate?.(40); } catch { /* noop */ }

      try {
        const reg = await storage.getRegistrationById(code);

        if (!reg) {
          setResult({
            status: 'invalid',
            title: 'Ingresso não encontrado',
            detail: 'Este código não corresponde a nenhum ingresso.',
          });
        } else if (reg.eventId !== eventId) {
          setResult({
            status: 'wrong_event',
            registration: reg,
            title: 'Ingresso de outro evento',
            detail: 'Este ingresso não pertence a este evento.',
          });
        } else if (reg.checkedIn) {
          setResult({
            status: 'already',
            registration: reg,
            title: 'Ingresso já validado',
            detail: 'Esta entrada já foi utilizada.',
            when: reg.checkedInAt,
          });
        } else {
          await storage.checkInRegistration(reg.id, user?.name);
          setCheckedInCount((c) => c + 1);
          setResult({
            status: 'success',
            registration: { ...reg, checkedIn: true, checkedInAt: new Date().toISOString() },
            title: 'Entrada liberada',
            detail: 'Ingresso validado com sucesso.',
          });
        }
      } catch (e) {
        console.error('Erro ao validar ingresso:', e);
        setResult({
          status: 'invalid',
          title: 'Erro na validação',
          detail: 'Não foi possível validar agora. Tente novamente.',
        });
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [eventId, user?.name]
  );

  // ─── Inicia a câmera quando o evento está pronto ───
  useEffect(() => {
    if (!event || denied || notFound) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const reader = new BrowserQRCodeReader();

    (async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        // Pega o stream da câmera traseira manualmente — controle total do
        // preview (mais confiável que deixar o zxing anexar; em vários Androids
        // o preview ficava preto). `ideal` permite cair na frontal se não houver
        // traseira, em vez de falhar.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Anexa e dá play explicitamente antes de decodificar — garante que o
        // preview realmente apareça (iOS exige playsinline + muted + gesto/auto).
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        try { await video.play(); } catch { /* autoPlay cobre o resto */ }

        const controls = await reader.decodeFromVideoElement(video, (res) => {
          if (res) handleCode(res.getText());
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (e: any) {
        console.error('Erro ao acessar a câmera:', e);
        if (!cancelled) {
          setCameraError(
            e?.name === 'NotAllowedError'
              ? 'Permissão de câmera negada. Use a digitação manual abaixo.'
              : 'Não foi possível acessar a câmera. Use a digitação manual abaixo.'
          );
          setShowManual(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [event, denied, notFound, handleCode]);

  const resumeScanning = () => {
    setResult(null);
    pausedRef.current = false;
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setManualCode('');
    // Permite revalidar manualmente mesmo com um resultado anterior visível
    pausedRef.current = false;
    handleCode(code);
  };

  // ─── Estados de carregamento / acesso ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || denied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-danger/10 border border-danger/20 text-danger flex items-center justify-center">
          <AlertTriangle size={30} />
        </div>
        <h1 className="font-display font-bold text-xl text-textLight">
          {notFound ? 'Evento não encontrado' : 'Acesso restrito'}
        </h1>
        <p className="text-sm text-textMuted max-w-xs">
          {notFound
            ? 'Não localizamos este evento.'
            : 'Apenas o organizador do evento (ou um admin) pode validar ingressos.'}
        </p>
        <button
          onClick={() => navigate('/profile')}
          className="mt-2 px-6 py-3 rounded-xl bg-primary text-textDark font-sans font-semibold text-sm hover:bg-primaryHover transition-colors cursor-pointer"
        >
          Voltar ao perfil
        </button>
      </div>
    );
  }

  const statusStyles: Record<ResultStatus, { ring: string; chip: string; icon: ReactNode }> = {
    success: { ring: 'border-success/30', chip: 'bg-success text-textDark', icon: <CheckCircle2 size={40} /> },
    already: { ring: 'border-amber-400/40', chip: 'bg-amber-400 text-stone-900', icon: <AlertTriangle size={40} /> },
    wrong_event: { ring: 'border-amber-400/40', chip: 'bg-amber-400 text-stone-900', icon: <AlertTriangle size={40} /> },
    invalid: { ring: 'border-danger/30', chip: 'bg-danger text-white', icon: <XCircle size={40} /> },
  };

  return (
    <div className="min-h-screen bg-stone-950 text-white flex flex-col relative">
      {/* Top bar */}
      <header className="relative z-20 flex items-center gap-3 px-4 pt-5 pb-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-white/50 font-medium">Validar ingressos</p>
          <h1 className="font-display font-bold text-base truncate leading-tight">{event?.title}</h1>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-white/50 font-medium">Validados</p>
          <p className="font-display font-bold text-base tabular-nums leading-tight">
            {checkedInCount}<span className="text-white/40 text-sm">/{totalCount}</span>
          </p>
        </div>
      </header>

      {/* Camera viewport */}
      <div className="relative flex-1 flex items-center justify-center px-4 pb-4">
        <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-black/60 border border-white/10">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            // Força o vídeo para uma camada composta por GPU. Sem isso, em vários
            // Androids o preview fica PRETO (o vídeo vira um hardware overlay que
            // ignora o recorte do container arredondado), mesmo com a leitura do
            // QR funcionando normalmente.
            style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
            autoPlay
            muted
            playsInline
          />

          {/* Overlay de mira */}
          {!cameraError && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3/5 aspect-square">
                <span className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-white/90 rounded-tl-xl" />
                <span className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-white/90 rounded-tr-xl" />
                <span className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-white/90 rounded-bl-xl" />
                <span className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-white/90 rounded-br-xl" />
                {!result && !processing && (
                  <span className="absolute left-2 right-2 h-0.5 bg-success shadow-[0_0_12px_2px_rgba(16,185,129,0.7)] animate-scan-sweep" />
                )}
              </div>
            </div>
          )}

          {/* Erro de câmera */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3 bg-stone-900">
              <CameraOff size={36} className="text-white/50" />
              <p className="text-sm text-white/70 max-w-[240px]">{cameraError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Dica + entrada manual */}
      <div className="relative z-10 px-4 pb-8">
        {!cameraError && (
          <p className="flex items-center justify-center gap-2 text-xs text-white/50 mb-4">
            <ScanLine size={14} /> Aponte a câmera para o QR Code do ingresso
          </p>
        )}

        {!showManual ? (
          <button
            onClick={() => setShowManual(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white/80 font-sans font-medium text-sm transition-colors cursor-pointer"
          >
            <Keyboard size={16} /> Digitar código manualmente
          </button>
        ) : (
          <form onSubmit={submitManual} className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Cole ou digite o código do ingresso"
              className="flex-1 h-12 rounded-xl bg-white/10 border border-white/15 px-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/40 transition-colors"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-5 rounded-xl bg-primary text-textDark font-sans font-semibold text-sm hover:bg-primaryHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Validar
            </button>
          </form>
        )}
      </div>

      {/* Painel de resultado */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={resumeScanning}>
          <div
            className={`w-full max-w-sm bg-surface text-textLight rounded-3xl border ${statusStyles[result.status].ring} shadow-float p-6 text-center animate-in slide-in-from-bottom-4 sm:zoom-in duration-300`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`w-20 h-20 rounded-2xl ${statusStyles[result.status].chip} flex items-center justify-center mx-auto mb-4`}>
              {statusStyles[result.status].icon}
            </div>
            <h2 className="font-display font-bold text-2xl mb-1">{result.title}</h2>
            <p className="text-sm text-textMuted mb-5">{result.detail}</p>

            {result.registration && (
              <div className="surface-cream rounded-2xl p-4 text-left space-y-3 mb-5">
                <div className="flex items-center gap-2.5">
                  <User size={16} className="text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-textMuted">Portador</p>
                    <p className="font-sans font-semibold text-sm truncate">{result.registration.userName || '—'}</p>
                  </div>
                </div>
                {result.registration.userCpf && (
                  <div className="flex items-center gap-2.5">
                    <Ticket size={16} className="text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-textMuted">CPF</p>
                      <p className="font-sans font-medium text-sm tabular-nums">{formatCpf(result.registration.userCpf)}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <CalendarCheck size={16} className="text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-textMuted">Ingresso</p>
                    <p className="font-sans font-medium text-sm truncate">
                      {result.registration.ticketTypeName || 'Ingresso'}
                      {result.registration.paymentStatus ? ` · ${result.registration.paymentStatus}` : ''}
                    </p>
                  </div>
                </div>
                {result.status === 'already' && result.when && (
                  <p className="text-xs text-amber-600 font-medium pt-1 border-t border-glassBorder">
                    Validado em {formatWhen(result.when)}
                    {result.registration.checkedInBy ? ` por ${result.registration.checkedInBy}` : ''}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={resumeScanning}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-textDark font-sans font-semibold text-sm hover:bg-primaryHover active:scale-[0.98] transition-all cursor-pointer"
            >
              <RefreshCw size={16} /> Validar próximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidateTickets;
