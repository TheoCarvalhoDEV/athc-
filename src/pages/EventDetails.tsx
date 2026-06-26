import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem, AppProfile, Registration } from '../lib/storage';
import { Button } from '../components/ui/Button';
import { useRateLimit } from '../hooks/useRateLimit';
import { TicketModal } from '../components/TicketModal';
import { Calendar, Clock, MapPin, ArrowLeft, CheckCircle2, Share2, User, Ticket, ChevronLeft, ChevronRight, QrCode, Mail, Phone, CreditCard, Copy, Check, Timer, RefreshCw, FlaskConical, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { formatCPF, isValidCPF } from '../lib/cpf';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirestore, doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import gsap from 'gsap';
import { loadMercadoPago } from '@mercadopago/sdk-js';
import { isVideoUrl } from '../lib/imageUtils';

export const EventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user: currentUser } = useAuth();
  const userId = currentUser?.id;
  const [showContactsModal, setShowContactsModal] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [organizer, setOrganizer] = useState<AppProfile | null>(null);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // PIX STATES
  const [showPixModal, setShowPixModal] = useState(false);
  const [showFreeTicketModal, setShowFreeTicketModal] = useState(false);
  const [loadingPix, setLoadingPix] = useState(false);
  const { isLimited: isPixLimited, remainingMs: pixRemainingMs, trigger: triggerPixCooldown } = useRateLimit(10000);
  const [qrCodeData, setQrCodeData] = useState<{ qr_code: string, qr_code_base64: string } | null>(null);
  const [pedidoId, setPedidoId] = useState('');
  const [pixStep, setPixStep] = useState<'select_tickets' | 'buyer_info' | 'qr_code' | 'success'>('buyer_info');
  const [selectedTickets, setSelectedTickets] = useState<{ [key: string]: number }>({});
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [registrationForTicket, setRegistrationForTicket] = useState<Registration | null>(null);
  // Geração de ingresso de teste (somente admin)
  const [loadingTestTicket, setLoadingTestTicket] = useState(false);
  // Mantém a referência da inscrição para o fechamento agendado do modal de sucesso
  const registrationForTicketRef = useRef<Registration | null>(null);

  // Validação inline do formulário do comprador (substitui os alert())
  const [pixErrors, setPixErrors] = useState<{ [k: string]: string }>({});
  // Feedback do botão "Copiar código Pix"
  const [pixCopied, setPixCopied] = useState(false);
  // Expiração do QR Code Pix (10 min) + recuperação
  const PIX_TTL_SECONDS = 600;
  const [pixSecondsLeft, setPixSecondsLeft] = useState(PIX_TTL_SECONDS);
  const [pixExpired, setPixExpired] = useState(false);
  // Contagem regressiva visível na tela de sucesso antes de abrir o ingresso
  const [successCountdown, setSuccessCountdown] = useState(5);

  const formatSecondsLeft = (total: number) => {
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const validateBuyer = () => {
    const e: { [k: string]: string } = {};
    if (!buyerName.trim()) e.name = 'Informe seu nome completo.';
    if (!buyerEmail.trim()) e.email = 'Informe seu e-mail.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.trim())) e.email = 'E-mail inválido.';
    if (!buyerPhone.trim()) e.phone = 'Informe seu telefone.';
    else if (buyerPhone.replace(/\D/g, '').length < 10) e.phone = 'Telefone incompleto.';
    if (!buyerCpf.trim()) e.cpf = 'Informe seu CPF.';
    else if (!isValidCPF(buyerCpf)) e.cpf = 'CPF inválido.';
    setPixErrors(e);
    return Object.keys(e).length === 0;
  };

  const clearPixError = (field: string) => {
    setPixErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleOpenPixModal = () => {
    if (event?.tickets && event.tickets.length > 0) {
      setPixStep('select_tickets');
      const initial: { [key: string]: number } = {};
      event.tickets.forEach(t => {
        initial[t.id] = 0;
      });
      setSelectedTickets(initial);
    } else {
      setPixStep('buyer_info');
    }
    setQrCodeData(null);
    setPixErrors({});
    setPixCopied(false);
    setPixExpired(false);
    registrationForTicketRef.current = null;
    setShowPixModal(true);
  };

  const getSelectedTicketsTotal = () => {
    if (!event?.tickets || event.tickets.length === 0) {
      return Number(event?.pixTicketPrice || 0);
    }
    return event.tickets.reduce((sum, t) => sum + (t.price * (selectedTickets[t.id] || 0)), 0);
  };

  const getSelectedTicketsCount = () => {
    if (!event?.tickets || event.tickets.length === 0) return 0;
    return Object.values(selectedTickets).reduce((sum, qty) => sum + qty, 0);
  };

  const handleUpdateTicketQty = (ticketId: string, delta: number) => {
    setSelectedTickets(prev => {
      const current = prev[ticketId] || 0;
      const next = Math.max(0, current + delta);

      const tkt = event?.tickets?.find(t => t.id === ticketId);
      if (tkt && tkt.capacity !== undefined) {
        const available = tkt.capacity - (tkt.sold || 0);
        if (next > available) {
          toast.error(`Restam apenas ${available} ingresso(s) de "${tkt.name}".`);
          return prev;
        }
      }

      return { ...prev, [ticketId]: next };
    });
  };

  // BUYER STATES
  const [buyerName, setBuyerName] = useState(currentUser?.name || '');
  const [buyerEmail, setBuyerEmail] = useState(currentUser?.username || '');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCpf, setBuyerCpf] = useState('');

  useEffect(() => {
    if (currentUser) {
      setBuyerName(currentUser.name || '');
      setBuyerEmail(currentUser.username || '');
    }
  }, [currentUser?.id]);

  // Inicialização do SDK V2 do Mercado Pago no Frontend
  // Inicializa o SDK V2 do Mercado Pago + Carrega o script de segurança como fallback
  useEffect(() => {
    const initMP = async () => {
      const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY;
      if (publicKey && publicKey !== 'APP_USR-COLOQUE_SUA_PUBLIC_KEY_AQUI') {
        try {
          await loadMercadoPago();
          new (window as any).MercadoPago(publicKey, { locale: 'pt-BR' });
          console.log("Mercado Pago SDK inicializado com sucesso no frontend.");
        } catch (err) {
          console.error("Erro ao inicializar o Mercado Pago SDK:", err);
        }
      }
    };
    initMP();

    // Injeta o script de segurança do Mercado Pago dinamicamente como fallback se não estiver carregado
    const hasDeviceSessionId = !!(window as any).MP_DEVICE_SESSION_ID;
    const hasScriptTag = !!document.querySelector('script[src*="mercadopago.com/v2/security.js"]');

    if (hasDeviceSessionId) {
      // Se a variável global já existe, garante que o input oculto seja preenchido
      const input = document.getElementById('MP_DEVICE_SESSION_ID') as HTMLInputElement;
      if (input) {
        input.value = (window as any).MP_DEVICE_SESSION_ID;
      }
    }

    if (!hasScriptTag) {
      const scriptId = 'mp-security-script';
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://www.mercadopago.com/v2/security.js';
      script.setAttribute('view', 'checkout');
      script.setAttribute('output', 'MP_DEVICE_SESSION_ID');
      script.async = true;

      try {
        Object.defineProperty(document, 'currentScript', {
          get: () => document.getElementById(scriptId) || script,
          configurable: true
        });
      } catch (e) {
        console.warn("Não foi possível interceptar document.currentScript", e);
      }

      script.onload = () => {
        console.log("Script de segurança do Mercado Pago (security.js) injetado dinamicamente no checkout.");
        try {
          delete (document as any).currentScript;
        } catch (e) { }
      };

      script.onerror = () => {
        console.error("Erro ao carregar script de segurança dinamicamente no checkout.");
        try {
          delete (document as any).currentScript;
        } catch (e) { }
      };

      document.body.appendChild(script);
    }
  }, []);



  // Firebase Instances
  const functions = getFunctions();
  if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && import.meta.env.VITE_USE_EMULATORS === 'true') {
    try {
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    } catch (e) {
      // Ignore
    }
  }
  const db = getFirestore();

  useEffect(() => {
    if (!qrCodeData || !pedidoId) return;

    const docRef = doc(db, 'pedidos', pedidoId);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const dados = docSnap.data();
        if (dados.status === 'pago') {
          // Ativar transição de sucesso dentro do próprio modal
          setPixStep('success');
          setIsRegistered(true);

          try {
            const regsRef = collection(db, 'registrations');
            const q = query(regsRef, where('pedidoId', '==', pedidoId));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              const regs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration));
              registrationForTicketRef.current = regs[0];
              setRegistrationForTicket(regs[0]);
            }
          } catch (err) {
            console.error("Erro ao buscar inscrições do pedido:", err);
          }
          // O fechamento do modal e a abertura do ingresso são controlados pela
          // contagem regressiva visível (useEffect de pixStep === 'success').
        }
      }
    }, (error) => {
      console.error("Erro ao monitorar o pagamento do pedido:", error);
    });

    return () => unsubscribe();
  }, [qrCodeData, pedidoId]);

  const handlePagarPix = async () => {
    if (!event) return;
    if (isPixLimited) return;

    if (!validateBuyer()) {
      toast.error('Revise os campos destacados para continuar.');
      return;
    }

    triggerPixCooldown();
    setPixExpired(false);
    setLoadingPix(true);
    const buyerId = currentUser ? currentUser.id : `guest-${Date.now()}`;

    const novoPedidoId = `PIX-${event.id}-${buyerId}-${Date.now()}`;
    setPedidoId(novoPedidoId);

    const deviceId = (window as any).MP_DEVICE_SESSION_ID ||
      (document.getElementById('MP_DEVICE_SESSION_ID') as HTMLInputElement)?.value ||
      (document.getElementById('deviceId') as HTMLInputElement)?.value ||
      '';

    console.log("Device ID capturado para o pagamento:", deviceId);

    // Mapear os ingressos selecionados
    const itensSelecionados = (event.tickets || [])
      .filter(t => (selectedTickets[t.id] || 0) > 0)
      .map(t => ({
        id: t.id,
        name: t.name,
        price: t.price,
        quantity: selectedTickets[t.id]
      }));

    const valorTotal = getSelectedTicketsTotal();

    const pedido = {
      pedidoId: novoPedidoId,
      valor: valorTotal,
      cpf: buyerCpf.replace(/\D/g, ''),
      email: buyerEmail,
      clienteNome: buyerName,
      clienteTelefone: buyerPhone,
      eventId: event.id,
      eventTitle: event.title,
      eventDescription: event.description || '',
      userId: buyerId,
      deviceId: deviceId,
      itensSelecionados: itensSelecionados
    };

    try {
      const criarCobrancaPix = httpsCallable(functions, 'criarCobrancaPix');
      const result = await criarCobrancaPix(pedido);
      const data = result.data as any;

      setQrCodeData({
        qr_code: data.qr_code,
        qr_code_base64: data.qr_code_base64
      });
      setPixStep('qr_code');
    } catch (error: any) {
      console.error("Erro ao gerar Pix:", error);
      if (error?.code === 'functions/resource-exhausted') {
        toast.error("Limite de cobranças atingido. Tente novamente mais tarde.");
      } else {
        toast.error('Não foi possível gerar o Pix. Tente novamente em instantes.');
      }
    } finally {
      setLoadingPix(false);
    }
  };

  // Gera um "pagamento Pix confirmado" de teste (admin) e abre o ingresso resultante.
  // Não cobra nada, não altera estoque nem faturamento real (backend marca isTeste).
  const handleGerarIngressoTeste = async () => {
    if (!event || loadingTestTicket) return;
    setLoadingTestTicket(true);
    try {
      // Usa o primeiro lote disponível (qty 1) quando o evento tem lotes; senão ingresso simples.
      const primeiroLote = (event.tickets || []).find(t => (t.capacity - (t.sold || 0)) > 0) || event.tickets?.[0];
      const itensSelecionados = primeiroLote
        ? [{ id: primeiroLote.id, name: primeiroLote.name, quantity: 1 }]
        : [];

      const criarIngressoTeste = httpsCallable(functions, 'criarIngressoTeste');
      const result = await criarIngressoTeste({ eventId: event.id, itensSelecionados });
      const data = result.data as { registrations?: Registration[] };
      const reg = data?.registrations?.[0];

      if (reg) {
        registrationForTicketRef.current = reg;
        setRegistrationForTicket(reg);
        setShowTicketModal(true);
        toast.success('Ingresso de teste gerado! Pagamento Pix simulado como confirmado.');
      } else {
        toast.error('Não foi possível gerar o ingresso de teste.');
      }
    } catch (error: any) {
      console.error('Erro ao gerar ingresso de teste:', error);
      toast.error(error?.message || 'Erro ao gerar o ingresso de teste.');
    } finally {
      setLoadingTestTicket(false);
    }
  };

  useEffect(() => {
    if (pixStep !== 'success') return;

    gsap.fromTo('.success-title',
      { y: 25, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, delay: 0.3, ease: 'power3.out' }
    );
    gsap.fromTo('.success-text',
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, delay: 0.5, ease: 'power3.out' }
    );
    gsap.fromTo('.success-bar',
      { width: '0%' },
      { width: '100%', duration: 5, ease: 'linear', delay: 0.2 }
    );

    // Contagem regressiva visível: informa ao usuário o que vai acontecer
    setSuccessCountdown(5);
    const interval = setInterval(() => {
      setSuccessCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);

    // Fecha o modal e abre o ingresso (ou o modal de sucesso) ao final
    const closeTimer = setTimeout(() => {
      setShowPixModal(false);
      setQrCodeData(null);
      if (registrationForTicketRef.current) {
        setShowTicketModal(true);
      } else {
        setShowModal(true);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(closeTimer);
    };
  }, [pixStep]);

  // Timer de expiração do QR Code Pix (reinicia a cada novo código gerado)
  useEffect(() => {
    if (!qrCodeData || pixStep !== 'qr_code') return;

    setPixSecondsLeft(PIX_TTL_SECONDS);
    setPixExpired(false);

    const interval = setInterval(() => {
      setPixSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setPixExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [qrCodeData, pixStep]);

  const copiarCodigo = async () => {
    if (!qrCodeData?.qr_code) return;
    try {
      await navigator.clipboard.writeText(qrCodeData.qr_code);
      setPixCopied(true);
      toast.success('Código Pix copiado!');
      setTimeout(() => setPixCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente o código.');
    }
  };

  const loadEvent = useCallback(async () => {
    if (id) {
      setIsLoading(true);
      try {
        const allEvents = await storage.getEvents();
        const found = allEvents.find((e: EventItem) => e.id === id);
        const currentUser = storage.getCurrentUser();
        if (found && found.isTestEvent && currentUser?.role !== 'admin') {
          setEvent(null);
        } else {
          setEvent(found || null);
        }

        if (found) {
          const orgProfile = await storage.getProfileById(found.creatorId);
          setOrganizer(orgProfile || null);
        }

        if (userId) {
          const registered = await storage.hasUserRegistered(id, userId);
          setIsRegistered(registered);
        }
      } catch (error) {
        console.error("Erro ao carregar detalhes do evento:", error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [id, userId]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    if (event && containerRef.current) {
      const ctx = gsap.context(() => {
        if (containerRef.current?.querySelectorAll('.anim-up').length) {
          gsap.from('.anim-up', {
            y: 30,
            opacity: 0,
            duration: 0.6,
            stagger: 0.1,
            ease: 'power3.out',
          });
        }
      }, containerRef);
      return () => ctx.revert();
    }
  }, [event]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background flex-col gap-4">
        <p className="text-primary font-mono">Evento não encontrado.</p>
        <Button onClick={() => navigate('/')}>Voltar ao Início</Button>
      </div>
    );
  }

  const handleRegister = async () => {
    if (!buyerName.trim() || !buyerPhone.trim()) {
      toast.error('Preencha nome e telefone para confirmar presença.');
      return;
    }

    if (!event) return;

    const buyerId = currentUser ? currentUser.id : `guest-${Date.now()}`;

    const registration: Registration = {
      id: Date.now().toString(),
      eventId: event.id,
      userId: buyerId,
      userName: buyerName,
      userEmail: buyerEmail,
      userPhone: buyerPhone,
      userCpf: buyerCpf,
      paymentStatus: 'Gratuito',
      timestamp: new Date().toISOString()
    };

    try {
      const docId = await storage.saveRegistration(registration);
      const regWithRealId = { ...registration, id: docId };
      setRegistrationForTicket(regWithRealId);
      setShowFreeTicketModal(false);
      setIsRegistered(true);
      setShowTicketModal(true);
    } catch (error) {
      console.error("Erro ao registrar no evento:", error);
      toast.error('Ocorreu um erro ao confirmar sua vaga. Tente novamente.');
    }
  };

  const mediaList = event.mediaUrls && event.mediaUrls.length > 0
    ? event.mediaUrls
    : [`${import.meta.env.BASE_URL}placeholder-logo.png`];

  const isPlaceholder = mediaList[currentMediaIndex]?.includes('placeholder-logo.png');

  const handleNextMedia = () => {
    setCurrentMediaIndex((prev) => (prev + 1) % mediaList.length);
  };

  const handlePrevMedia = () => {
    setCurrentMediaIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current - touchEndX.current > 50) {
      handleNextMedia();
    } else if (touchStartX.current - touchEndX.current < -50) {
      handlePrevMedia();
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: event.title,
        text: event.description,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link do evento copiado!');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-[calc(15rem+env(safe-area-inset-bottom))] md:pb-16 px-4 md:px-8 pt-6">
      <input type="hidden" id="MP_DEVICE_SESSION_ID" name="MP_DEVICE_SESSION_ID" />
      <input type="hidden" id="deviceId" />

      {/* Main Responsive Grid Container */}
      <div className="w-full max-w-7xl mx-auto relative flex flex-col">

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* LEFT COLUMN: Media Carousel, Title, About, Location */}
          <div className="lg:col-span-2 space-y-6">

            {/* Image Section */}
            <div
              className="relative h-80 md:h-[420px] w-full overflow-hidden rounded-[2.5rem] shadow-glass-shadow group"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Floating Action Buttons over Image */}
              <div className="absolute top-5 left-5 right-5 flex justify-between items-center z-20">
                <button
                  title="Voltar"
                  aria-label="Voltar"
                  onClick={() => navigate(-1)}
                  className="w-10 h-10 bg-white/85 hover:bg-white text-textLight rounded-xl flex items-center justify-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 neo-click cursor-pointer backdrop-blur-sm"
                >
                  <ArrowLeft size={18} />
                </button>

                <button
                  title="Compartilhar"
                  aria-label="Compartilhar"
                  onClick={handleShare}
                  className="w-10 h-10 bg-white/85 hover:bg-white text-textLight rounded-xl flex items-center justify-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 neo-click cursor-pointer backdrop-blur-sm"
                >
                  <Share2 size={18} />
                </button>
              </div>

              {isVideoUrl(mediaList[currentMediaIndex]) ? (
                <div className="w-full h-full relative flex items-center justify-center bg-black/10">
                  <video
                    src={mediaList[currentMediaIndex]}
                    className="relative w-full h-full object-contain z-10"
                    controls
                    playsInline
                  />
                </div>
              ) : (
                <div className={`w-full h-full relative flex items-center justify-center overflow-hidden ${isPlaceholder ? 'bg-gradient-to-br from-surface via-surfaceHover to-surface p-12' : 'bg-black/5'}`}>
                  {/* Intelligent Blurred Background */}
                  {!isPlaceholder && (
                    <img
                      src={mediaList[currentMediaIndex]}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-105 pointer-events-none"
                    />
                  )}
                  {/* Clean Crisp Image */}
                  <img
                    src={mediaList[currentMediaIndex]}
                    alt={isPlaceholder ? event.title : `${event.title} - Foto ${currentMediaIndex + 1}`}
                    className={`relative z-10 select-none transition-all duration-300 ${
                      isPlaceholder 
                        ? 'w-auto h-24 md:h-32 object-contain opacity-50' 
                        : 'w-full h-full object-contain'
                    }`}
                    draggable="false"
                  />
                </div>
              )}

              {/* Carousel Navigation Controls */}
              {mediaList.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevMedia}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-surface/60 rounded-xl flex items-center justify-center text-textLight shadow-sm hover:scale-105 active:scale-95 transition-all z-20 cursor-pointer hidden md:flex"
                    aria-label="Mídia anterior"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMedia}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-surface/60 rounded-xl flex items-center justify-center text-textLight shadow-sm hover:scale-105 active:scale-95 transition-all z-20 cursor-pointer hidden md:flex"
                    aria-label="Próxima mídia"
                  >
                    <ChevronRight size={14} />
                  </button>

                  {/* Dots indicators */}
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-auto">
                    {mediaList.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCurrentMediaIndex(idx)}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === currentMediaIndex ? 'bg-primary w-4' : 'bg-textMuted/40'}`}
                        aria-label={`Ir para foto ${idx + 1}`}
                      />
                    ))}
                  </div>

                  {/* Counter Badge */}
                  <div className="absolute bottom-6 right-6 bg-surface/60 rounded-xl px-2.5 py-1 text-[10px] font-mono font-bold text-textLight z-20 pointer-events-none backdrop-blur-md">
                    {currentMediaIndex + 1} / {mediaList.length}
                  </div>
                </>
              )}
            </div>



            {/* Event Title */}
            <div className="text-left">
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold text-textLight leading-tight mb-4 anim-up">
                {event.title}
              </h1>
            </div>

            {/* About Section */}
            <div className="text-left space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-primary/40 rounded-full" />
                <h2 className="font-display font-semibold text-xl text-textLight">Sobre o evento</h2>
              </div>
              <div className="relative overflow-hidden surface p-6 rounded-2xl">
                <p className="text-textLight text-sm leading-relaxed whitespace-pre-wrap font-sans relative z-10">
                  {event.description}
                </p>
              </div>
            </div>

            {/* Location Section */}
            <div className="text-left space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-primary/40 rounded-full" />
                <h2 className="font-display font-semibold text-xl text-textLight">Localização</h2>
              </div>
              <div className="surface rounded-2xl p-6 space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <MapPin size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-textLight text-sm truncate">{event.location}</p>
                    <p className="text-xs text-textLight/75 font-medium font-sans mt-1.5 leading-snug">{event.address}</p>
                  </div>
                </div>

                {/* Google Map Embed */}
                <div className="w-full h-64 md:h-80 rounded-[1.5rem] overflow-hidden border border-glassBorder/30 shadow-inner relative z-10">
                  <iframe
                    title="Mapa de localização do evento"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(event.address || event.location)}`}
                  ></iframe>
                </div>

                <button
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address || event.location)}`, '_blank')}
                  className="w-full bg-surface border border-glassBorder hover:bg-surfaceHover hover:border-primary/30 text-textLight font-sans font-semibold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all duration-200 neo-click cursor-pointer"
                >
                  <MapPin size={15} /> Ver rota no Google Maps
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Ticket Info/Actions (Sticky on Desktop), Date/Time/Organizer Info */}
          <div className="space-y-6 lg:sticky lg:top-6">

            {/* Ticket Actions Card (Floating on Mobile, Static card in Right Column on Desktop) */}
            <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-0 right-0 px-5 z-40 anim-up max-w-2xl mx-auto lg:relative lg:bottom-0 lg:px-0 lg:max-w-none lg:z-10">
              <div className="surface rounded-2xl p-6 flex flex-col gap-4 shadow-md lg:shadow-sm relative overflow-hidden">

                {/* Info do Ingresso */}
                <div className="flex items-center justify-between z-10 text-left">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-accent mb-1">Ingresso</span>
                    <span className="text-2xl font-display font-semibold text-primary leading-none truncate max-w-[140px]" title={event.hasTickets && event.ticketPrice ? event.ticketPrice : (event.hasTickets ? 'Consulte' : 'Gratuito')}>
                      {(() => {
                        if (!event.hasTickets) return 'Gratuito';
                        if (!event.ticketPrice) return 'Consulte';
                        const price = event.ticketPrice.trim();
                        if (price.toUpperCase().includes('R$') || price.includes('$')) return price;
                        if (/^[\d.,]+$/.test(price)) {
                          if (!price.includes(',') && !price.includes('.')) return `R$ ${price},00`;
                          return `R$ ${price}`;
                        }
                        return price;
                      })()}
                    </span>
                  </div>
                  <span className="bg-accent/10 text-accent text-[11px] px-3 py-1.5 rounded-full font-medium border border-accent/20">
                    1º lote disponível
                  </span>
                </div>

                {/* Ações de Inscrição */}
                <div className="flex flex-col gap-2.5 z-10">
                  {isRegistered ? (
                    <div className="w-full rounded-xl py-4 bg-accent/10 border border-accent/20 text-accent flex items-center justify-center gap-2 font-sans font-semibold text-sm select-none">
                      <CheckCircle2 size={16} className="text-accent" />
                      <span>Presença confirmada · ingresso garantido</span>
                    </div>
                  ) : (
                    <>
                      {event.hasPresence !== false && (
                        <button
                          onClick={() => setShowFreeTicketModal(true)}
                          className="w-full rounded-xl py-4 shadow-sm flex items-center justify-center gap-2 transition-all duration-200 font-sans font-semibold text-sm border-0 cursor-pointer neo-click bg-primary text-textDark hover:bg-primaryHover"
                        >
                          Confirmar presença
                        </button>
                      )}

                      {event.hasPixTickets ? (
                        <button
                          onClick={handleOpenPixModal}
                          className="rounded-xl px-5 py-4 shadow-sm flex items-center justify-center gap-2 transition-all duration-200 font-sans font-semibold text-sm border-0 cursor-pointer neo-click bg-success text-textDark hover:brightness-95"
                        >
                          <QrCode size={16} />
                          <span>Comprar via Pix</span>
                        </button>
                      ) : event.hasTickets ? (() => {
                        const contacts = event.whatsappContacts && event.whatsappContacts.length > 0
                          ? event.whatsappContacts
                          : (event.whatsappNumber ? [{ name: event.whatsappName || '', phone: event.whatsappNumber }] : []);

                        return (
                          <button
                            onClick={() => {
                              if (contacts.length > 1) {
                                setShowContactsModal(true);
                              } else if (contacts.length === 1) {
                                const contact = contacts[0];
                                let cleanPhone = contact.phone.replace(/\D/g, '');
                                if (cleanPhone.length === 10 || cleanPhone.length === 11) {
                                  cleanPhone = `55${cleanPhone}`;
                                }
                                const message = `Olá${contact.name ? ` ${contact.name}` : ''}! Tenho interesse no ingresso para o evento *${event.title}*`;
                                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                              }
                            }}
                            className="w-full rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all duration-200 font-sans font-semibold text-sm border-0 bg-success text-textDark hover:brightness-95 cursor-pointer neo-click"
                          >
                            <Ticket size={18} />
                            <div className="flex flex-col items-start leading-none text-left">
                              <span>Comprar ingresso</span>
                              <span className="text-[10px] opacity-80 mt-1">via WhatsApp</span>
                            </div>
                          </button>
                        );
                      })() : null}
                    </>
                  )}
                </div>

                {/* Atalho de teste (somente admin): simula um Pix confirmado e abre o ingresso. */}
                {currentUser?.role === 'admin' && (
                  <button
                    onClick={handleGerarIngressoTeste}
                    disabled={loadingTestTicket}
                    className="w-full rounded-xl py-3 border border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 font-sans font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 z-10"
                  >
                    {loadingTestTicket
                      ? <Loader2 size={15} className="animate-spin" />
                      : <FlaskConical size={15} />}
                    <span>{loadingTestTicket ? 'Gerando ingresso de teste…' : 'Gerar ingresso de teste (admin)'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Consolidado de Informações do Evento (Data, Hora, Organizador e GPS Curto) */}
            <div className="surface rounded-2xl p-6 text-left space-y-5">
              <span className="text-xs font-medium text-accent block mb-1">
                Informações do evento
              </span>

              {/* Grid de Data e Horário */}
              <div className="grid grid-cols-2 gap-4 pb-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-primary">
                    <Calendar size={13} />
                    <span className="text-[11px] font-medium">Data</span>
                  </div>
                  <p className="text-sm font-sans font-semibold text-textLight leading-tight">{formatDate(event.date)}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-accent">
                    <Clock size={13} />
                    <span className="text-[11px] font-medium">Horário</span>
                  </div>
                  <p className="text-sm font-sans font-semibold text-textLight leading-tight">{event.time}h</p>
                </div>
              </div>

              {/* Bloco do Organizador */}
              {organizer && (
                <div className="flex items-center justify-between gap-3 pb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-surface/85 overflow-hidden flex items-center justify-center text-primary">
                        {organizer.imageUrl ? (
                          <img src={organizer.imageUrl} className="w-full h-full object-cover" alt={organizer.name} />
                        ) : (
                          <User size={16} />
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-accent text-textDark border-2 border-surface flex items-center justify-center shadow-sm">
                        <Check size={9} strokeWidth={3} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-accent">Organizado por</p>
                      <p className="font-sans font-semibold text-sm text-textLight mt-0.5 leading-tight">{organizer.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/agenda/${organizer.id}`)}
                    className="bg-primary text-textDark font-sans font-semibold text-xs px-3.5 py-2 rounded-xl transition-all duration-200 neo-click hover:bg-primaryHover cursor-pointer shrink-0"
                  >
                    Ver perfil
                  </button>
                </div>
              )}

              {/* Endereço / GPS Curto */}
              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-accent shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-sans font-semibold text-sm text-textLight truncate">{event.location}</p>
                    {event.address && <p className="text-xs text-textMuted font-sans mt-0.5 leading-snug">{event.address}</p>}
                  </div>
                </div>
                <button
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address || event.location)}`, '_blank')}
                  className="w-full bg-surface border border-glassBorder hover:bg-surfaceHover hover:border-primary/30 text-textLight font-sans font-semibold text-sm py-3 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all duration-200 neo-click cursor-pointer"
                >
                  <MapPin size={14} /> Traçar rota no GPS
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Success Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-backdrop">
          <div className="glass border-none rounded-[2.5rem] p-8 max-w-sm md:max-w-lg w-full text-center relative overflow-hidden backdrop-blur-3xl shadow-float bg-surface/98">
            {/* Animação premium do Checkmark */}
            <div className="payment-success-icon-wrapper mx-auto mb-6">
              <div className="payment-success-pulse-ring"></div>
              <svg className="payment-success-checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle className="payment-success-checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                <path className="payment-success-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
            <h3 className="font-display text-2xl font-semibold text-success mb-2">Presença confirmada!</h3>
            <p className="text-sm text-textLight/90 mb-8 leading-relaxed max-w-[260px] mx-auto">
              Sua vaga para <strong className="text-primary">{event.title}</strong> foi garantida com sucesso. Aproveite o evento!
            </p>
            <button
              onClick={() => setShowModal(false)}
              className="w-full bg-success text-textDark border-0 font-sans font-semibold py-4 rounded-xl transition-all duration-200 hover:brightness-95 active:scale-[0.98] cursor-pointer text-sm neo-click"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Contacts Modal */}
      {showContactsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-backdrop">
          <div className="glass border-none rounded-[2.5rem] p-8 max-w-sm md:max-w-lg w-full text-center max-h-[80vh] flex flex-col relative overflow-hidden backdrop-blur-3xl shadow-float bg-surface/98">
            <button onClick={() => setShowContactsModal(false)} className="absolute top-5 right-5 bg-white/10 hover:bg-white/20 p-2 rounded-2xl text-textLight transition-all duration-300 cursor-pointer neo-click">
              <span className="sr-only">Fechar</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="font-display text-xl font-semibold text-accent mb-1 mt-2">Comprar ingresso</h3>
            <p className="text-xs text-textMuted mb-6 leading-relaxed max-w-[240px] mx-auto">
              Escolha com qual promoter você deseja falar para garantir sua vaga:
            </p>
            <div className="space-y-3 overflow-y-auto pr-2 pb-4 flex-1">
              {(event?.whatsappContacts && event.whatsappContacts.length > 0
                ? event.whatsappContacts
                : (event?.whatsappNumber ? [{ name: event.whatsappName || '', phone: event.whatsappNumber }] : [])).map((contact, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      let cleanPhone = contact.phone.replace(/\D/g, '');
                      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
                        cleanPhone = `55${cleanPhone}`;
                      }
                      const message = `Olá${contact.name ? ` ${contact.name}` : ''}! Tenho interesse no ingresso para o evento *${event?.title}*`;
                      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                    }}
                    className="w-full surface hover:border-primary/30 rounded-xl p-4 flex items-center justify-between group hover:bg-surfaceHover transition-all duration-200 neo-click cursor-pointer"
                  >
                    <div className="flex flex-col items-start text-left">
                      <span className="font-sans font-semibold text-sm md:text-base text-textLight group-hover:text-primary transition-colors">{contact.name || 'Promoter'}</span>
                      <span className="text-xs md:text-sm text-textMuted font-mono mt-0.5">{contact.phone}</span>
                    </div>
                    <Ticket className="text-primary/70 group-hover:text-primary transition-colors" size={18} />
                  </button>
                ))}
            </div>
            <button
              onClick={() => setShowContactsModal(false)}
              className="w-full bg-surface hover:bg-surfaceHover text-textLight border border-glassBorder font-sans font-medium py-3.5 rounded-xl transition-all duration-200 active:scale-95 text-sm mt-4 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Free Ticket Modal */}
      {showFreeTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-backdrop">
          <div className="glass border-none rounded-[2.5rem] p-8 max-w-sm md:max-w-lg w-full text-center relative overflow-hidden backdrop-blur-3xl shadow-float bg-surface/98">
            <button onClick={() => setShowFreeTicketModal(false)} className="absolute top-5 right-5 bg-white/10 hover:bg-white/20 p-2 rounded-2xl text-textLight transition-all duration-300 cursor-pointer neo-click">
              <span className="sr-only">Fechar</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="font-display text-xl font-semibold text-accent mb-1 mt-2">Confirmar presença</h3>
            <p className="text-sm text-textMuted mb-6">Para evitar spam, informe seus dados.</p>

            <div className="flex flex-col gap-4 text-left">
              <div className="space-y-4 bg-white/40 p-5 rounded-[1.75rem] shadow-glass-shadow mb-2 border border-glassBorder/30">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-textMuted block ml-1">Nome Completo</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-4 text-textMuted/60 pointer-events-none">
                      <User size={15} />
                    </span>
                    <input
                      type="text"
                      placeholder="Seu nome"
                      value={buyerName}
                      onChange={e => setBuyerName(e.target.value)}
                      className="w-full text-sm pl-11 pr-4 py-3.5 rounded-xl bg-white/90 text-textLight outline-none border border-glassBorder/60 focus:border-primary/40 focus:bg-white focus:shadow-glow-primary transition-all duration-300 placeholder:text-textMuted/50 font-sans"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-textMuted block ml-1">Telefone / WhatsApp</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-4 text-textMuted/60 pointer-events-none">
                      <Phone size={15} />
                    </span>
                    <input
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={buyerPhone}
                      onChange={e => setBuyerPhone(e.target.value)}
                      className="w-full text-sm pl-11 pr-4 py-3.5 rounded-xl bg-white/90 text-textLight outline-none border border-glassBorder/60 focus:border-primary/40 focus:bg-white focus:shadow-glow-primary transition-all duration-300 placeholder:text-textMuted/50 font-sans"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleRegister}
                disabled={!buyerName || !buyerPhone}
                className="w-full bg-primary text-textDark border-0 font-sans font-semibold py-4 rounded-xl transition-all duration-200 hover:bg-primaryHover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-sm neo-click"
              >
                Confirmar presença
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pix Modal */}
      {showPixModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-backdrop">
          <div className="glass border-none rounded-[2.5rem] p-5 md:p-8 max-w-sm md:max-w-lg w-full text-center relative overflow-hidden backdrop-blur-3xl shadow-float bg-surface/98">
            <button onClick={() => setShowPixModal(false)} className="absolute top-4 right-4 md:top-5 md:right-5 bg-white/10 hover:bg-white/20 p-2 rounded-2xl text-textLight transition-all duration-300 cursor-pointer neo-click">
              <span className="sr-only">Fechar</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="font-display text-xl md:text-2xl font-bold text-accent mb-0.5 md:mb-1 mt-1 md:mt-2">Pagamento via Pix</h3>
            <p className="text-xs md:text-sm text-textMuted mb-4 md:mb-5">Total: <span className="font-semibold text-textLight tabular-nums">R$ {getSelectedTicketsTotal().toFixed(2).replace('.', ',')}</span></p>

            {pixStep === 'select_tickets' && (
              <div className="flex flex-col gap-3 md:gap-4 text-left">
                <div className="space-y-2.5 md:space-y-3 bg-white/40 p-3 md:p-4 rounded-[1.75rem] shadow-glass-shadow mb-2 max-h-[35vh] md:max-h-[45vh] overflow-y-auto pr-1 border border-glassBorder/30">
                  <p className="text-xs font-medium text-accent ml-1 mb-1.5 md:mb-2">Selecione seus Ingressos</p>

                  {(event?.tickets || []).map((t) => {
                    const available = t.capacity - (t.sold || 0);
                    const isSoldOut = t.status === 'sold_out' || available <= 0;
                    const qty = selectedTickets[t.id] || 0;

                    return (
                      <div key={t.id} className="flex justify-between items-center bg-white/80 p-2.5 md:p-3.5 rounded-2xl gap-2.5 md:gap-3 border border-glassBorder/20">
                        <div className="flex-1 min-w-0">
                          <p className="font-sans font-semibold text-xs md:text-sm text-textLight truncate">{t.name}</p>
                          <p className="text-xs md:text-sm text-primary font-semibold font-sans mt-0.5">R$ {t.price.toFixed(2).replace('.', ',')}</p>
                          <p className="text-[11px] text-textMuted mt-0.5">Restam {available} de {t.capacity}</p>
                        </div>

                        {isSoldOut ? (
                          <span className="text-[10px] font-semibold text-danger bg-danger/10 px-2 py-1 md:py-1.5 rounded-lg">Esgotado</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateTicketQty(t.id, -1)}
                              className="w-6 h-6 md:w-7 md:h-7 rounded-xl bg-surface/85 hover:bg-surface border border-glassBorder/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center text-textLight font-bold text-xs md:text-sm"
                            >
                              -
                            </button>
                            <span className="font-mono text-xs md:text-sm font-bold w-4 text-center text-textLight">{qty}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateTicketQty(t.id, 1)}
                              className="w-6 h-6 md:w-7 md:h-7 rounded-xl bg-surface/85 hover:bg-surface border border-glassBorder/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center text-textLight font-bold text-xs md:text-sm"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setPixStep('buyer_info')}
                  disabled={getSelectedTicketsCount() === 0}
                  className="w-full bg-success text-textDark border-0 font-sans font-semibold py-3 md:py-4 rounded-xl transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  Avançar ({getSelectedTicketsCount()} {getSelectedTicketsCount() === 1 ? 'ingresso' : 'ingressos'})
                </button>
              </div>
            )}

            {pixStep === 'buyer_info' && (
              <div className="flex flex-col gap-3 md:gap-4 text-left">
                <div className="space-y-3.5 md:space-y-4 bg-white/40 p-4 md:p-5 rounded-[1.75rem] shadow-glass-shadow mb-2 max-h-[35vh] md:max-h-[45vh] overflow-y-auto pr-1 border border-glassBorder/30">
                  <p className="text-xs font-medium text-accent ml-1 mb-1.5 md:mb-2">Seus Dados de Inscrição</p>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-textMuted block ml-1">Nome Completo</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 md:left-4 text-textMuted/60 pointer-events-none">
                        <User className="w-3.5 h-3.5 md:w-[15px] md:h-[15px]" />
                      </span>
                      <input
                        type="text"
                        placeholder="Nome Completo"
                        value={buyerName}
                        disabled={loadingPix}
                        aria-invalid={!!pixErrors.name || undefined}
                        onChange={e => { setBuyerName(e.target.value); clearPixError('name'); }}
                        className={`w-full text-xs md:text-sm pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3.5 rounded-xl bg-white/90 text-textLight outline-none border focus:bg-white transition-all duration-300 placeholder:text-textMuted/50 font-sans disabled:opacity-60 disabled:cursor-not-allowed ${pixErrors.name ? 'border-danger/60 focus:border-danger focus:shadow-[0_4px_20px_rgba(239,68,68,0.12)]' : 'border-glassBorder/60 focus:border-success/40 focus:shadow-glow-success'}`}
                      />
                    </div>
                    {pixErrors.name && <p className="text-[10px] md:text-xs text-danger font-semibold ml-1 mt-1">{pixErrors.name}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-textMuted block ml-1">E-mail</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 md:left-4 text-textMuted/60 pointer-events-none">
                        <Mail className="w-3.5 h-3.5 md:w-[15px] md:h-[15px]" />
                      </span>
                      <input
                        type="email"
                        placeholder="Seu melhor e-mail"
                        value={buyerEmail}
                        disabled={loadingPix}
                        aria-invalid={!!pixErrors.email || undefined}
                        onChange={e => { setBuyerEmail(e.target.value); clearPixError('email'); }}
                        className={`w-full text-xs md:text-sm pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3.5 rounded-xl bg-white/90 text-textLight outline-none border focus:bg-white transition-all duration-300 placeholder:text-textMuted/50 font-sans disabled:opacity-60 disabled:cursor-not-allowed ${pixErrors.email ? 'border-danger/60 focus:border-danger focus:shadow-[0_4px_20px_rgba(239,68,68,0.12)]' : 'border-glassBorder/60 focus:border-success/40 focus:shadow-glow-success'}`}
                      />
                    </div>
                    {pixErrors.email && <p className="text-[10px] md:text-xs text-danger font-semibold ml-1 mt-1">{pixErrors.email}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-textMuted block ml-1">Telefone</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 md:left-4 text-textMuted/60 pointer-events-none">
                        <Phone className="w-3.5 h-3.5 md:w-[15px] md:h-[15px]" />
                      </span>
                      <input
                        type="tel"
                        placeholder="(00) 00000-0000"
                        value={buyerPhone}
                        disabled={loadingPix}
                        aria-invalid={!!pixErrors.phone || undefined}
                        onChange={e => { setBuyerPhone(e.target.value); clearPixError('phone'); }}
                        className={`w-full text-xs md:text-sm pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3.5 rounded-xl bg-white/90 text-textLight outline-none border focus:bg-white transition-all duration-300 placeholder:text-textMuted/50 font-sans disabled:opacity-60 disabled:cursor-not-allowed ${pixErrors.phone ? 'border-danger/60 focus:border-danger focus:shadow-[0_4px_20px_rgba(239,68,68,0.12)]' : 'border-glassBorder/60 focus:border-success/40 focus:shadow-glow-success'}`}
                      />
                    </div>
                    {pixErrors.phone && <p className="text-[10px] md:text-xs text-danger font-semibold ml-1 mt-1">{pixErrors.phone}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-textMuted block ml-1">CPF</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 md:left-4 text-textMuted/60 pointer-events-none">
                        <CreditCard className="w-3.5 h-3.5 md:w-[15px] md:h-[15px]" />
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        value={buyerCpf}
                        disabled={loadingPix}
                        aria-invalid={!!pixErrors.cpf || undefined}
                        onChange={e => { setBuyerCpf(formatCPF(e.target.value)); clearPixError('cpf'); }}
                        className={`w-full text-xs md:text-sm pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3.5 rounded-xl bg-white/90 text-textLight outline-none border focus:bg-white transition-all duration-300 placeholder:text-textMuted/50 font-mono disabled:opacity-60 disabled:cursor-not-allowed ${pixErrors.cpf ? 'border-danger/60 focus:border-danger focus:shadow-[0_4px_20px_rgba(239,68,68,0.12)]' : 'border-glassBorder/60 focus:border-success/40 focus:shadow-glow-success'}`}
                      />
                    </div>
                    {pixErrors.cpf && <p className="text-[10px] md:text-xs text-danger font-semibold ml-1 mt-1">{pixErrors.cpf}</p>}
                  </div>
                </div>

                {event?.tickets && event.tickets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPixStep('select_tickets')}
                    disabled={loadingPix}
                    className="w-full bg-surface hover:bg-surfaceHover text-textLight border border-glassBorder font-sans font-medium py-2.5 md:py-3 rounded-xl transition-all duration-200 active:scale-95 text-xs mb-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Voltar para seleção de ingressos
                  </button>
                )}

                <button
                  onClick={handlePagarPix}
                  disabled={loadingPix || isPixLimited || !buyerName || !buyerEmail || !buyerPhone || !buyerCpf}
                  className="w-full bg-success text-textDark border-0 font-display font-black py-3.5 md:py-4 rounded-2xl transition-all duration-300 shadow-glow-success hover:shadow-glow-success-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-xs md:text-sm uppercase tracking-wider focus-visible:ring-2 focus-visible:ring-success/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
                >
                  {loadingPix ? <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-textDark border-t-transparent rounded-full animate-spin" /> : <QrCode className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                  {loadingPix ? 'Gerando QR Code...' : isPixLimited ? `Aguarde ${Math.ceil(pixRemainingMs / 1000)}s...` : 'Gerar QR Code Pix'}
                </button>
              </div>
            )}

            {pixStep === 'qr_code' && (
              pixExpired ? (
                <div className="flex flex-col items-center text-center py-2">
                  <div className="w-16 h-16 rounded-2xl bg-danger/10 border border-danger/20 text-danger flex items-center justify-center mb-4">
                    <Timer className="w-8 h-8" />
                  </div>
                  <h4 className="font-display font-semibold text-lg text-textLight mb-1.5">QR Code expirado</h4>
                  <p className="text-xs md:text-sm text-textMuted max-w-[250px] mb-5 leading-relaxed font-sans">
                    O tempo para pagamento deste código acabou. Gere um novo para continuar — seus dados foram mantidos.
                  </p>
                  <button
                    onClick={handlePagarPix}
                    disabled={loadingPix}
                    className="w-full bg-primary text-textDark border-0 font-sans font-semibold py-3.5 md:py-4 rounded-xl transition-all duration-200 hover:bg-primaryHover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {loadingPix ? <div className="w-4 h-4 border-2 border-textDark border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {loadingPix ? 'Gerando...' : 'Gerar novo QR Code'}
                  </button>
                </div>
              ) : qrCodeData ? (
                <div className="flex flex-col items-center">
                  <div className="p-4 md:p-5 bg-white border border-transparent rounded-[1.75rem] shadow-glass-shadow mb-3 w-full flex justify-center">
                    {qrCodeData.qr_code_base64 ? (
                      <img
                        src={`data:image/jpeg;base64,${qrCodeData.qr_code_base64}`}
                        alt="QR Code Pix"
                        className="w-40 h-40 md:w-48 md:h-48 rounded-lg object-contain"
                      />
                    ) : (
                      <div className="w-40 h-40 md:w-48 md:h-48 flex items-center justify-center text-textMuted bg-surface rounded-lg text-sm">Indisponível</div>
                    )}
                  </div>

                  {/* Contagem regressiva de expiração do código */}
                  <div className={`flex items-center justify-center gap-1.5 mb-4 text-xs font-semibold transition-colors ${pixSecondsLeft <= 60 ? 'text-danger' : 'text-textMuted'}`}>
                    <Timer className="w-3.5 h-3.5" />
                    <span className="tabular-nums">Código expira em {formatSecondsLeft(pixSecondsLeft)}</span>
                  </div>

                  <button
                    onClick={copiarCodigo}
                    className={`w-full font-sans font-semibold py-3 md:py-4 px-3 md:px-4 rounded-xl mb-3 md:mb-4 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm cursor-pointer border outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${pixCopied ? 'bg-success/10 text-success border-success/30 focus-visible:ring-success/40' : 'bg-surface hover:bg-surfaceHover text-textLight border-glassBorder focus-visible:ring-primary/40'}`}
                  >
                    {pixCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 text-textMuted" />}
                    {pixCopied ? 'Código copiado!' : 'Copiar Código Pix'}
                  </button>

                  <div className="flex items-center justify-center gap-2 text-xs md:text-sm font-sans font-semibold text-success bg-success/10 py-3 md:py-3.5 px-3 md:px-4 rounded-xl w-full border border-success/15">
                    <span className="relative flex h-2 w-2 md:h-2.5 md:w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-success"></span>
                    </span>
                    Aguardando pagamento…
                  </div>

                  {/* Recuperação por CPF: tranquiliza quem pode fechar a aba antes de confirmar */}
                  <p className="text-[11px] text-textMuted text-center mt-3 leading-snug max-w-[280px]">
                    Pode fechar esta tela após pagar. Você acessa o ingresso quando quiser em{' '}
                    <strong className="text-textLight">/ingresso</strong>, informando o seu CPF.
                  </p>
                </div>
              ) : null
            )}

            {pixStep === 'success' && (
              <div className="flex flex-col items-center justify-center py-4 md:py-6 relative min-h-[220px] md:min-h-[300px]">
                {/* Animação premium do Checkmark */}
                <div className="payment-success-icon-wrapper">
                  <div className="payment-success-pulse-ring"></div>
                  <svg className="payment-success-checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                    <circle className="payment-success-checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                    <path className="payment-success-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                  </svg>
                </div>

                <h3 className="success-title font-display text-2xl md:text-3xl font-bold text-success mb-1 md:mb-2">
                  Pagamento confirmado!
                </h3>

                <p className="success-text text-sm text-textLight max-w-[250px] mb-2 leading-relaxed font-sans">
                  Sua vaga está garantida. Abrindo seu ingresso em <strong className="text-success tabular-nums">{successCountdown}s</strong>…
                </p>
                <p className="success-text text-xs text-textMuted max-w-[250px] mb-6 md:mb-8 font-sans">
                  Para reabrir depois, acesse <strong className="text-textLight">/ingresso</strong> e informe o seu CPF.
                </p>

                {/* Barra de progresso indicando o encerramento automático do modal */}
                <div className="w-full h-1.5 bg-success/10 rounded-full overflow-hidden">
                  <div className="success-bar h-full bg-success rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {registrationForTicket && (
        <TicketModal
          isOpen={showTicketModal}
          onClose={() => setShowTicketModal(false)}
          event={event}
          registration={registrationForTicket}
        />
      )}
    </div>
  );
};
