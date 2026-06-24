import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { storage } from '../lib/storage';
import type { EventItem, Registration } from '../lib/storage';
import { matchesTicketCode } from '../lib/ticketCode';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, ScanLine,
  Keyboard, RefreshCw, User, Ticket, CalendarCheck, CameraOff, SwitchCamera,
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
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined); // undefined = facingMode environment

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // stream ativo (parado sempre no cleanup)
  const pausedRef = useRef(false); // ignora leituras enquanto um resultado está na tela
  const processingRef = useRef(false);
  const regsRef = useRef<Registration[]>([]); // inscrições do evento (resolve código curto + id)

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
        // Carrega as inscrições do evento: alimenta a contagem E a resolução de
        // códigos curtos / ids na validação.
        try {
          const regs = await storage.getRegistrationsForEvent(eventId);
          if (!active) return;
          regsRef.current = regs;
          setTotalCount(regs.length);
          setCheckedInCount(regs.filter((r) => r.checkedIn).length);
        } catch {
          /* contagem/resolução tentam novamente sob demanda na leitura */
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
    // Usa apenas campos escalares estáveis do usuário, NÃO o objeto `user`. O
    // AuthContext recria `user` em segundo plano (sync do perfil); incluir o
    // objeto fazia este effect re-rodar e chamar setEvent(novoObjeto), o que
    // reiniciava a câmera em loop.
  }, [eventId, user?.id, user?.role, user?.profileId, authLoading]);

  // ─── Resolve um texto lido para uma inscrição ───
  // Aceita o id completo do documento (lido do QR, exato) OU o código curto
  // ATX-XXXX-XXXX (digitação manual), casando contra as inscrições do evento.
  const resolveRegistration = useCallback(
    async (text: string): Promise<Registration | 'ambiguous' | null> => {
      const matchIn = (list: Registration[]): Registration | 'ambiguous' | null => {
        // 1) id completo do documento (QR padrão) — exato, imune a colisão.
        const exact = list.find((r) => r.id === text);
        if (exact) return exact;
        // 2) código curto derivado do id (digitação manual). O código é um hash
        //    de 40 bits: a colisão dentro de um evento é raríssima, mas se houver
        //    mais de um casamento NÃO validamos (evita liberar a pessoa errada).
        const shortMatches = list.filter((r) => matchesTicketCode(text, r.id));
        if (shortMatches.length === 1) return shortMatches[0];
        if (shortMatches.length > 1) return 'ambiguous';
        return null;
      };

      let reg = matchIn(regsRef.current);
      if (reg === null) {
        // Pode ser um ingresso comprado depois que a tela abriu — recarrega uma vez.
        try {
          const fresh = await storage.getRegistrationsForEvent(eventId!);
          regsRef.current = fresh;
          setTotalCount(fresh.length);
          setCheckedInCount(fresh.filter((r) => r.checkedIn).length);
          reg = matchIn(fresh);
        } catch {
          /* segue para o fallback */
        }
      }
      if (reg === null) {
        // Último recurso: id de documento que não está na lista (ex.: outro
        // evento) — permite detectar "ingresso de outro evento".
        reg = await storage.getRegistrationById(text);
      }
      return reg;
    },
    [eventId]
  );

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
        const reg = await resolveRegistration(code);

        if (reg === 'ambiguous') {
          setResult({
            status: 'invalid',
            title: 'Código ambíguo',
            detail: 'Mais de um ingresso corresponde a este código. Use a leitura do QR Code para validar com precisão.',
          });
        } else if (!reg) {
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
          const when = new Date().toISOString();
          await storage.checkInRegistration(reg.id, user?.name);
          // Atualiza o cache local para que uma segunda leitura do mesmo
          // ingresso já apareça como "validado".
          regsRef.current = regsRef.current.map((r) =>
            r.id === reg.id
              ? { ...r, checkedIn: true, checkedInAt: when, checkedInBy: user?.name || '' }
              : r
          );
          setCheckedInCount((c) => c + 1);
          setResult({
            status: 'success',
            registration: { ...reg, checkedIn: true, checkedInAt: when },
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
    [eventId, user?.name, resolveRegistration]
  );

  // Mantém a última versão de handleCode acessível sem recriar o effect da
  // câmera. Se handleCode entrasse nas deps do effect, ele re-rodaria quando o
  // AuthContext atualizasse o usuário em segundo plano (user.name muda) —
  // disparando um SEGUNDO getUserMedia concorrente na mesma câmera, causa
  // conhecida de PREVIEW PRETO no Android (a leitura segue funcionando).
  const handleCodeRef = useRef(handleCode);
  useEffect(() => {
    handleCodeRef.current = handleCode;
  }, [handleCode]);

  // ─── Inicia a câmera quando o evento está pronto (e ao trocar de lente) ───
  useEffect(() => {
    // `loading` precisa ser false: só então o <video> está renderizado (o render
    // mostra o spinner enquanto loading=true). Sem essa guarda, o effect rodava
    // no render intermediário em que `event` já está setado mas `loading` ainda
    // é true (setEvent e setLoading(false) são updates separados, com um await
    // no meio) — o getUserMedia não achava o <video> e desistia → preview preto.
    if (!event || denied || notFound || loading) return;
    let cancelled = false;
    const reader = new BrowserQRCodeReader();

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    // Início ADIADO: o StrictMode (dev) monta → desmonta → monta. Agendando o
    // getUserMedia num timer, o mount descartável é cancelado (clearTimeout no
    // cleanup) ANTES de abrir a câmera — evitando dois getUserMedia concorrentes
    // na mesma câmera, que intermitentemente devolvia um preview preto no F5.
    const startTimer = setTimeout(() => {
      void (async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        // Câmera específica (após troca de lente) ou a traseira padrão.
        const constraints: MediaStreamConstraints = deviceId
          ? { video: { deviceId: { exact: deviceId } }, audio: false }
          : { video: { facingMode: { ideal: 'environment' } }, audio: false };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Encerra qualquer stream anterior antes de anexar o novo (sem overlap).
        stopStream();
        streamRef.current = stream;

        // Anexa e dá play explicitamente antes de decodificar — garante que o
        // preview realmente apareça (iOS exige playsinline + muted + gesto/auto).
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        try { await video.play(); } catch { /* autoPlay cobre o resto */ }
        if (cancelled) {
          stopStream();
          return;
        }

        const controls = await reader.decodeFromVideoElement(video, (res) => {
          if (res) handleCodeRef.current(res.getText());
        });
        if (cancelled) {
          controls.stop();
          stopStream();
          return;
        }
        controlsRef.current = controls;
        setCameraError(null);

        // Lista as câmeras (rótulos só vêm após a permissão) para habilitar o
        // botão "Trocar câmera" quando houver mais de uma.
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setVideoDevices(all.filter((d) => d.kind === 'videoinput'));
        } catch { /* lista é só conveniência */ }
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
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      stopStream();
    };
    // Depende do ID do evento (string estável), não do objeto `event`. O
    // AuthContext recria o objeto `event` em segundo plano (refresh do usuário);
    // usar a identidade do objeto reiniciava a câmera em loop e cancelava o
    // getUserMedia antes de anexar o stream (preview preto / temStream:false).
    // `loading` é dependência: quando vira false o <video> é (re)montado, e o
    // effect precisa re-rodar para anexar o stream ao nó atual. Isso também
    // cobre o caso de o perfil sincronizar tarde (re-carga → flicker → remount).
  }, [event?.id, denied, notFound, deviceId, loading]);

  // Alterna entre as câmeras disponíveis (útil quando a traseira "ideal" abre
  // uma lente que não renderiza o preview corretamente).
  const switchCamera = () => {
    if (videoDevices.length < 2) return;
    const idx = deviceId ? videoDevices.findIndex((d) => d.deviceId === deviceId) : 0;
    const next = videoDevices[(idx + 1) % videoDevices.length];
    if (!next) return;
    setResult(null);
    pausedRef.current = false;
    setCameraError(null);
    setDeviceId(next.deviceId); // dispara o re-start do effect da câmera
  };

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
        {/* IMPORTANTE: o container NÃO usa `overflow-hidden`. Em muitos Androids,
            clipar o <video> num container arredondado faz o overlay de hardware
            renderizar PRETO (a leitura do QR funciona, mas o preview some). Por
            isso o arredondamento vai no próprio vídeo + camada de GPU. */}
        <div
          className="relative w-full max-w-sm aspect-square rounded-3xl bg-black/60 border border-white/10"
          style={{ isolation: 'isolate', transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-cover rounded-3xl"
            // Camada composta por GPU: respeita o arredondamento e renderiza os
            // frames em vez de um retângulo preto.
            style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)', willChange: 'transform', backfaceVisibility: 'hidden' }}
            autoPlay
            muted
            playsInline
          />

          {/* Trocar câmera (quando há mais de uma lente disponível) */}
          {!cameraError && videoDevices.length > 1 && (
            <button
              onClick={switchCamera}
              aria-label="Trocar câmera"
              title="Trocar câmera"
              className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 border border-white/20 text-white flex items-center justify-center backdrop-blur-sm transition-colors cursor-pointer"
            >
              <SwitchCamera size={18} />
            </button>
          )}

          {/* Overlay de mira */}
          {!cameraError && (
            <div className="absolute inset-0 pointer-events-none rounded-3xl">
              <div className="absolute inset-0 bg-black/20 rounded-3xl" />
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
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3 bg-stone-900 rounded-3xl">
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
