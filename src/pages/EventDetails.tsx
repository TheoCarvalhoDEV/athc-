import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem, AppProfile, Registration } from '../lib/storage';
import { Button } from '../components/ui/Button';
import { Calendar, Clock, MapPin, ArrowLeft, CheckCircle2, Share2, User, Ticket, ChevronLeft, ChevronRight, QrCode, Mail, Phone, CreditCard } from 'lucide-react';

const formatCPF = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const isValidCPF = (cpf: string): boolean => {
  const cleanCpf = cpf.replace(/\D/g, '');
  if (cleanCpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCpf.charAt(i)) * (10 - i);
  }
  let rest = sum % 11;
  let digit1 = rest < 2 ? 0 : 11 - rest;
  if (parseInt(cleanCpf.charAt(9)) !== digit1) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCpf.charAt(i)) * (11 - i);
  }
  rest = sum % 11;
  let digit2 = rest < 2 ? 0 : 11 - rest;
  if (parseInt(cleanCpf.charAt(10)) !== digit2) return false;
  
  return true;
};
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
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
  const [qrCodeData, setQrCodeData] = useState<{ qr_code: string, qr_code_base64: string } | null>(null);
  const [pedidoId, setPedidoId] = useState('');
  const [pixStep, setPixStep] = useState<'select_tickets' | 'buyer_info' | 'qr_code' | 'success'>('buyer_info');
  const [selectedTickets, setSelectedTickets] = useState<{ [key: string]: number }>({});
  
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
          alert("Desculpe, restam apenas " + available + " ingressos disponíveis para " + tkt.name + ".");
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
    const isAlreadyLoaded = !!(window as any).MP_DEVICE_SESSION_ID || 
                            !!document.querySelector('script[src*="mercadopago.com/v2/security.js"]');
    
    if (!isAlreadyLoaded) {
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
        } catch (e) {}
      };

      script.onerror = () => {
        console.error("Erro ao carregar script de segurança dinamicamente no checkout.");
        try {
          delete (document as any).currentScript;
        } catch (e) {}
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
                // Ativar transição de sucesso premium dentro do próprio modal
                setPixStep('success');
                setIsRegistered(true);
                
                // Dispara os confetes virtuais
                setTimeout(() => {
                  createConfettiParticles();
                }, 100);

                // Fecha o modal suavemente e abre o modal principal de sucesso após 4.5 segundos
                setTimeout(() => {
                    setShowPixModal(false);
                    setQrCodeData(null);
                    setShowModal(true);
                }, 4500);
            }
        }
    }, (error) => {
        console.error("Erro ao monitorar o pagamento do pedido:", error);
    });

    return () => unsubscribe();
  }, [qrCodeData, pedidoId]);

  const handlePagarPix = async () => {
    if (!event) return;
    
    if (!buyerName || !buyerEmail || !buyerPhone || !buyerCpf) {
        alert("Por favor, preencha todos os campos do formulário para continuar.");
        return;
    }

    if (!isValidCPF(buyerCpf)) {
        alert("Por favor, informe um CPF válido.");
        return;
    }
    
    setLoadingPix(true);
    const buyerId = currentUser ? currentUser.id : `guest-${Date.now()}`;

    const novoPedidoId = `PIX-${event.id}-${buyerId}-${Date.now()}`;
    setPedidoId(novoPedidoId);
    
    const deviceId = (window as any).MP_DEVICE_SESSION_ID || 
                     (document.getElementById('MP_DEVICE_SESSION_ID') as HTMLInputElement)?.value || 
                     (document.getElementById('deviceId') as HTMLInputElement)?.value || 
                     '';
    
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
        alert("Erro ao processar: " + (error.message || "Verifique o console"));
    } finally {
        setLoadingPix(false);
    }
  };

  useEffect(() => {
    if (pixStep === 'success') {
      gsap.fromTo('.success-circle', 
        { scale: 0.2, rotation: -60, opacity: 0 },
        { scale: 1, rotation: 0, opacity: 1, duration: 0.9, ease: 'back.out(2)' }
      );
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
        { width: '100%', duration: 4, ease: 'linear', delay: 0.2 }
      );
    }
  }, [pixStep]);

  const createConfettiParticles = () => {
    const colors = ['#FFC107', '#E91E63', '#9C27B0', '#00BCD4', '#4CAF50', '#FF5722', '#FFEB3B'];
    const container = document.querySelector('.success-anim');
    if (!container) return;

    for (let i = 0; i < 50; i++) {
      const particle = document.createElement('div');
      particle.className = 'absolute w-2.5 h-2.5 rounded-full pointer-events-none z-50';
      particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.top = `-10px`;
      container.appendChild(particle);

      gsap.to(particle, {
        x: (Math.random() - 0.5) * 200,
        y: Math.random() * 300 + 200,
        rotation: Math.random() * 720,
        opacity: 0,
        scale: Math.random() * 0.5 + 0.5,
        duration: Math.random() * 2.5 + 2,
        ease: 'power2.out',
        onComplete: () => particle.remove()
      });
    }
  };

  const copiarCodigo = () => {
    if (qrCodeData?.qr_code) {
        navigator.clipboard.writeText(qrCodeData.qr_code);
        alert("Código Pix copiado com sucesso!");
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
    if (!buyerName || !buyerPhone) {
      alert("Por favor, preencha nome e telefone para confirmar presença.");
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
      await storage.saveRegistration(registration);
      setShowFreeTicketModal(false);
      setIsRegistered(true);
      setShowModal(true);
    } catch (error) {
      console.error("Erro ao registrar no evento:", error);
      alert("Ocorreu um erro ao confirmar sua vaga.");
    }
  };

  const mediaList = event.mediaUrls && event.mediaUrls.length > 0
    ? event.mediaUrls
    : ['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80&w=1000'];

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
      alert('Link copiado para a área de transferência!');
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-44 md:pb-16 px-4 md:px-8 pt-6">
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
                  className="w-10 h-10 bg-white/75 hover:bg-white text-textLight rounded-2xl flex items-center justify-center shadow-glass-shadow hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-300 neo-click cursor-pointer backdrop-blur-md"
                >
                  <ArrowLeft size={18} />
                </button>

                <button
                  title="Compartilhar"
                  aria-label="Compartilhar"
                  onClick={handleShare}
                  className="w-10 h-10 bg-white/75 hover:bg-white text-textLight rounded-2xl flex items-center justify-center shadow-glass-shadow hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-300 neo-click cursor-pointer backdrop-blur-md"
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
                <div className="w-full h-full relative flex items-center justify-center overflow-hidden bg-black/5">
                  {/* Intelligent Blurred Background */}
                  <img
                    src={mediaList[currentMediaIndex]}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-105 pointer-events-none"
                  />
                  {/* Clean Crisp Image */}
                  <img
                    src={mediaList[currentMediaIndex]}
                    alt={`${event.title} - Foto ${currentMediaIndex + 1}`}
                    className="relative w-full h-full object-contain z-10 select-none transition-all duration-300"
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
              <h1 className="font-serifDisplay text-3xl md:text-4xl lg:text-5xl font-bold text-textLight leading-tight mb-3 anim-up tracking-wide uppercase">
                {event.title}
              </h1>
              <div className="w-16 h-1.5 bg-gradient-to-r from-primary to-primaryHover rounded-full shadow-glow-primary mb-4 anim-up" />
            </div>

            {/* About Section */}
            <div className="text-left space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-gradient-to-b from-primary to-primaryHover rounded-full shadow-glow-primary" />
                <h2 className="font-serifDisplay italic font-semibold text-xl text-textLight">Sobre o Evento</h2>
              </div>
              <div className="relative overflow-hidden glass p-6 rounded-[2rem] shadow-glass-shadow border-none bg-gradient-to-br from-white/60 to-white/30">
                <p className="text-textLight/80 text-sm leading-relaxed whitespace-pre-wrap font-sans relative z-10">
                  {event.description}
                </p>
              </div>
            </div>

            {/* Location Section */}
            <div className="text-left space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-gradient-to-b from-primary to-primaryHover rounded-full shadow-glow-primary" />
                <h2 className="font-serifDisplay italic font-semibold text-xl text-textLight">Localização</h2>
              </div>
              <div className="glass border-none rounded-[2rem] p-6 shadow-glass-shadow">
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <MapPin size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-textLight text-sm truncate">{event.location}</p>
                    <p className="text-xs text-textMuted font-mono mt-1.5 leading-snug">{event.address}</p>
                  </div>
                </div>

                <button
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address || event.location)}`, '_blank')}
                  className="w-full bg-surface/60 hover:bg-surface/85 text-textLight font-display font-black text-xs py-4 rounded-xl flex items-center justify-center gap-2 shadow-glass-shadow hover:shadow-glow-primary active:scale-95 transition-all duration-300 neo-click cursor-pointer"
                >
                  📍 Ver Rota no Google Maps
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Ticket Info/Actions (Sticky on Desktop), Date/Time/Organizer Info */}
          <div className="space-y-6 lg:sticky lg:top-6">
            
            {/* Ticket Actions Card (Floating on Mobile, Static card in Right Column on Desktop) */}
            <div className="fixed bottom-6 left-0 right-0 px-5 z-40 anim-up max-w-2xl mx-auto lg:relative lg:bottom-0 lg:px-0 lg:max-w-none lg:z-10">
              <div className="glass border-none rounded-[2.5rem] p-6 flex flex-col gap-4 shadow-float lg:shadow-glass-shadow backdrop-blur-xl relative overflow-hidden bg-gradient-to-br from-white/90 to-white/50">
                <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
                
                {/* Info do Ingresso */}
                <div className="flex items-center justify-between z-10 text-left">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono font-bold text-accent uppercase tracking-wider mb-1">Ingresso</span>
                    <span className="text-xl font-display font-black text-primary uppercase tracking-wider leading-none truncate max-w-[140px]" title={event.hasTickets && event.ticketPrice ? event.ticketPrice : (event.hasTickets ? 'Consulte' : 'Gratuito')}>
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
                  <span className="bg-accent/15 text-accent font-mono text-[9px] px-3 py-1.5 rounded-full uppercase font-bold backdrop-blur-md shadow-sm">
                    1º Lote Disponível
                  </span>
                </div>

                {/* Ações de Inscrição */}
                <div className="flex flex-col gap-2.5 z-10">
                  {isRegistered ? (
                    <div className="w-full rounded-2xl py-4 bg-accent/10 border border-accent/20 text-accent flex items-center justify-center gap-2 font-display font-black text-sm select-none">
                      <CheckCircle2 size={16} className="text-accent" />
                      <span>Presença Confirmada • Ingresso Garantido</span>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowFreeTicketModal(true)}
                        className="w-full rounded-2xl py-4 shadow-md flex items-center justify-center gap-2 transition-all duration-300 font-display font-black text-sm border-0 cursor-pointer neo-click bg-gradient-to-r from-primary to-primaryHover text-textDark shadow-glow-primary hover:shadow-glow-primary-lg"
                      >
                        Confirmar Presença
                      </button>

                      {event.hasPixTickets && currentUser?.role === 'admin' ? (
                        <button
                          onClick={handleOpenPixModal}
                          className="rounded-2xl px-5 py-4 shadow-md flex items-center justify-center gap-2 transition-all duration-300 font-display font-black text-sm border-0 cursor-pointer neo-click bg-success text-textDark shadow-glow-success hover:shadow-glow-success-lg"
                        >
                          <QrCode size={16} />
                          <span>Comprar Pix</span>
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
                                const cleanPhone = contact.phone.replace(/\D/g, '');
                                const message = `Olá${contact.name ? ` ${contact.name}` : ''}! Tenho interesse no ingresso para o evento *${event.title}*`;
                                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                              }
                            }}
                            className="w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 transition-all duration-300 font-display font-black text-sm border-0 bg-success text-textDark shadow-glow-success hover:shadow-glow-success-lg cursor-pointer neo-click"
                          >
                            <Ticket size={18} />
                            <div className="flex flex-col items-start leading-none text-left">
                              <span className="uppercase tracking-wider">Comprar Ingresso</span>
                              <span className="text-[8px] font-bold opacity-80 mt-1 font-mono">Via WhatsApp</span>
                            </div>
                          </button>
                        );
                      })() : null}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Consolidado de Informações do Evento (Data, Hora, Organizador e GPS Curto) */}
            <div className="glass border-none rounded-[2.5rem] p-6 shadow-glass-shadow bg-gradient-to-br from-white/90 to-white/50 text-left space-y-5">
              <span className="font-mono text-[9px] text-accent uppercase tracking-widest font-bold block mb-1">
                Informações do Evento
              </span>
              
              {/* Grid de Data e Horário */}
              <div className="grid grid-cols-2 gap-4 pb-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-primary">
                    <Calendar size={13} />
                    <span className="font-mono text-[8px] uppercase tracking-wider font-bold">Data</span>
                  </div>
                  <p className="text-xs font-display font-black text-textLight leading-tight">{formatDate(event.date)}</p>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-accent">
                    <Clock size={13} />
                    <span className="font-mono text-[8px] uppercase tracking-wider font-bold">Horário</span>
                  </div>
                  <p className="text-xs font-display font-black text-textLight leading-tight">{event.time}h</p>
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
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-accent text-textDark border border-black flex items-center justify-center text-[7px] font-black shadow-md">
                        ✓
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8px] font-mono font-bold text-accent uppercase tracking-wider">Organizado por</p>
                      <p className="font-display font-bold text-xs text-textLight mt-0.5 truncate max-w-[110px]">{organizer.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/agenda/${organizer.id}`)}
                    className="bg-gradient-to-r from-primary to-primaryHover text-textDark font-display font-black text-[9px] px-3.5 py-2 rounded-xl shadow-glow-primary transition-all duration-300 neo-click hover:shadow-glow-primary-lg cursor-pointer shrink-0 uppercase tracking-wider"
                  >
                    Ver Perfil
                  </button>
                </div>
              )}

              {/* Endereço / GPS Curto */}
              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-accent shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-display font-bold text-xs text-textLight truncate">{event.location}</p>
                    {event.address && <p className="text-[10px] text-textMuted font-mono mt-0.5 leading-snug">{event.address}</p>}
                  </div>
                </div>
                <button
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address || event.location)}`, '_blank')}
                  className="w-full bg-surface/70 hover:bg-surface/90 text-textLight font-display font-black text-[10px] py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all duration-300 neo-click cursor-pointer uppercase tracking-wider"
                >
                  📍 Traçar Rota no GPS
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
            <div className="w-20 h-20 bg-success/15 text-success rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow-success border border-success/20">
              <CheckCircle2 size={38} className="animate-pulse" />
            </div>
            <h3 className="font-display text-2xl font-black text-success uppercase tracking-wider mb-2">Presença Confirmada!</h3>
            <p className="text-sm text-textLight/90 mb-8 leading-relaxed max-w-[260px] mx-auto">
              Sua vaga para <strong className="text-primary">{event.title}</strong> foi garantida com sucesso. Aproveite o evento!
            </p>
            <button 
              onClick={() => setShowModal(false)} 
              className="w-full bg-gradient-to-r from-success to-primaryHover text-textDark border-0 font-display font-black py-4 rounded-2xl transition-all duration-300 shadow-glow-success hover:shadow-glow-success-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-xs uppercase tracking-wider neo-click"
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
            <h3 className="font-display text-xl font-black text-accent uppercase tracking-wider mb-1 mt-2">Comprar Ingresso</h3>
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
                    const cleanPhone = contact.phone.replace(/\D/g, '');
                    const message = `Olá${contact.name ? ` ${contact.name}` : ''}! Tenho interesse no ingresso para o evento *${event?.title}*`;
                    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                  }}
                  className="w-full bg-white/60 border border-glassBorder/40 hover:border-primary/30 rounded-2xl p-4 flex items-center justify-between group hover:bg-white/80 hover:shadow-glow-primary transition-all duration-300 neo-click cursor-pointer"
                >
                  <div className="flex flex-col items-start text-left">
                    <span className="font-bold text-sm md:text-base text-textLight group-hover:text-primary transition-colors">{contact.name || 'Promoter'}</span>
                    <span className="text-xs md:text-sm text-textMuted font-mono mt-0.5">{contact.phone}</span>
                  </div>
                  <Ticket className="text-primary/70 group-hover:text-primary transition-colors" size={18} />
                </button>
              ))}
            </div>
            <button 
              onClick={() => setShowContactsModal(false)} 
              className="w-full bg-white/40 hover:bg-white/60 text-textLight border border-transparent font-display font-bold py-3.5 rounded-2xl transition-all duration-300 active:scale-95 text-xs uppercase tracking-wider mt-4 cursor-pointer"
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
            <h3 className="font-display text-xl font-black text-accent uppercase tracking-wider mb-1 mt-2">Confirmar Presença</h3>
            <p className="text-xs text-textMuted mb-6">Para evitar spam, informe seus dados.</p>
            
            <div className="flex flex-col gap-4 text-left">
              <div className="space-y-4 bg-white/40 p-5 rounded-[1.75rem] shadow-glass-shadow mb-2 border border-glassBorder/30">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono font-bold text-primary uppercase tracking-wider block ml-1">Nome Completo</label>
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
                  <label className="text-[9px] font-mono font-bold text-primary uppercase tracking-wider block ml-1">Telefone / WhatsApp</label>
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
                  className="w-full bg-gradient-to-r from-primary to-primaryHover text-textDark border-0 font-display font-black py-4 rounded-2xl transition-all duration-300 shadow-glow-primary hover:shadow-glow-primary-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider neo-click"
              >
                  Confirmar Presença
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
            <h3 className="font-display text-lg md:text-xl font-black text-accent uppercase tracking-wider mb-0.5 md:mb-1 mt-1 md:mt-2">Pagamento via Pix</h3>
            <p className="text-[11px] md:text-xs text-textMuted mb-4 md:mb-5 font-mono">Total: R$ {getSelectedTicketsTotal().toFixed(2).replace('.', ',')}</p>
            
            {pixStep === 'select_tickets' && (
              <div className="flex flex-col gap-3 md:gap-4 text-left">
                <div className="space-y-2.5 md:space-y-3 bg-white/40 p-3 md:p-4 rounded-[1.75rem] shadow-glass-shadow mb-2 max-h-[35vh] md:max-h-[45vh] overflow-y-auto pr-1 border border-glassBorder/30">
                  <p className="text-[10px] md:text-xs font-mono font-bold text-accent uppercase tracking-wider ml-1 mb-1.5 md:mb-2">Selecione seus Ingressos</p>
                  
                  {(event?.tickets || []).map((t) => {
                    const available = t.capacity - (t.sold || 0);
                    const isSoldOut = t.status === 'sold_out' || available <= 0;
                    const qty = selectedTickets[t.id] || 0;
                    
                    return (
                      <div key={t.id} className="flex justify-between items-center bg-white/80 p-2.5 md:p-3.5 rounded-2xl gap-2.5 md:gap-3 border border-glassBorder/20">
                        <div className="flex-1 min-w-0">
                          <p className="font-sans font-bold text-xs md:text-sm text-textLight truncate">{t.name}</p>
                          <p className="text-[10px] md:text-[11px] text-primary font-bold font-display mt-0.5">R$ {t.price.toFixed(2).replace('.', ',')}</p>
                          <p className="text-[7px] md:text-[8px] text-textMuted font-mono mt-0.5 uppercase tracking-wide">Restam {available} de {t.capacity}</p>
                        </div>
                        
                        {isSoldOut ? (
                          <span className="text-[7px] md:text-[8px] font-mono font-bold text-danger bg-danger/10 px-2 py-1 md:py-1.5 rounded-lg uppercase tracking-wider">Esgotado</span>
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
                  className="w-full bg-success text-textDark border-0 font-display font-black py-3 md:py-4 rounded-2xl transition-all duration-300 shadow-glow-success hover:shadow-glow-success-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-[10px] md:text-xs uppercase tracking-wider"
                >
                  Avançar ({getSelectedTicketsCount()} {getSelectedTicketsCount() === 1 ? 'ingresso' : 'ingressos'})
                </button>
              </div>
            )}

            {pixStep === 'buyer_info' && (
              <div className="flex flex-col gap-3 md:gap-4 text-left">
                <div className="space-y-3.5 md:space-y-4 bg-white/40 p-4 md:p-5 rounded-[1.75rem] shadow-glass-shadow mb-2 max-h-[35vh] md:max-h-[45vh] overflow-y-auto pr-1 border border-glassBorder/30">
                  <p className="text-[10px] md:text-xs font-mono font-bold text-accent uppercase tracking-wider ml-1 mb-1.5 md:mb-2">Seus Dados de Inscrição</p>
                  
                  <div className="space-y-1">
                    <label className="text-[8px] md:text-[9px] font-mono font-bold text-primary uppercase tracking-wider block ml-1">Nome Completo</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 md:left-4 text-textMuted/60 pointer-events-none">
                        <User className="w-3.5 h-3.5 md:w-[15px] md:h-[15px]" />
                      </span>
                      <input 
                        type="text" 
                        placeholder="Nome Completo" 
                        value={buyerName}
                        onChange={e => setBuyerName(e.target.value)}
                        className="w-full text-xs md:text-sm pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3.5 rounded-xl bg-white/90 text-textLight outline-none border border-glassBorder/60 focus:border-success/40 focus:bg-white focus:shadow-glow-success transition-all duration-300 placeholder:text-textMuted/50 font-sans"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] md:text-[9px] font-mono font-bold text-primary uppercase tracking-wider block ml-1">E-mail</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 md:left-4 text-textMuted/60 pointer-events-none">
                        <Mail className="w-3.5 h-3.5 md:w-[15px] md:h-[15px]" />
                      </span>
                      <input 
                        type="email" 
                        placeholder="Seu melhor e-mail" 
                        value={buyerEmail}
                        onChange={e => setBuyerEmail(e.target.value)}
                        className="w-full text-xs md:text-sm pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3.5 rounded-xl bg-white/90 text-textLight outline-none border border-glassBorder/60 focus:border-success/40 focus:bg-white focus:shadow-glow-success transition-all duration-300 placeholder:text-textMuted/50 font-sans"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] md:text-[9px] font-mono font-bold text-primary uppercase tracking-wider block ml-1">Telefone</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 md:left-4 text-textMuted/60 pointer-events-none">
                        <Phone className="w-3.5 h-3.5 md:w-[15px] md:h-[15px]" />
                      </span>
                      <input 
                        type="tel" 
                        placeholder="(00) 00000-0000" 
                        value={buyerPhone}
                        onChange={e => setBuyerPhone(e.target.value)}
                        className="w-full text-xs md:text-sm pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3.5 rounded-xl bg-white/90 text-textLight outline-none border border-glassBorder/60 focus:border-success/40 focus:bg-white focus:shadow-glow-success transition-all duration-300 placeholder:text-textMuted/50 font-sans"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] md:text-[9px] font-mono font-bold text-primary uppercase tracking-wider block ml-1">CPF</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 md:left-4 text-textMuted/60 pointer-events-none">
                        <CreditCard className="w-3.5 h-3.5 md:w-[15px] md:h-[15px]" />
                      </span>
                      <input 
                        type="text" 
                        placeholder="000.000.000-00" 
                        value={buyerCpf}
                        onChange={e => setBuyerCpf(formatCPF(e.target.value))}
                        className="w-full text-xs md:text-sm pl-9 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3.5 rounded-xl bg-white/90 text-textLight outline-none border border-glassBorder/60 focus:border-success/40 focus:bg-white focus:shadow-glow-success transition-all duration-300 placeholder:text-textMuted/50 font-mono"
                      />
                    </div>
                  </div>
                </div>
                
                {event?.tickets && event.tickets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPixStep('select_tickets')}
                    className="w-full bg-white/50 hover:bg-white/70 text-textLight border border-glassBorder/20 font-display font-bold py-2.5 md:py-3 rounded-2xl transition-all duration-300 active:scale-95 text-[9px] md:text-[10px] uppercase tracking-wider mb-1 cursor-pointer"
                  >
                    Voltar para seleção de ingressos
                  </button>
                )}

                <button 
                    onClick={handlePagarPix}
                    disabled={loadingPix || !buyerName || !buyerEmail || !buyerPhone || !buyerCpf}
                    className="w-full bg-success text-textDark border-0 font-display font-black py-3.5 md:py-4 rounded-2xl transition-all duration-300 shadow-glow-success hover:shadow-glow-success-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-xs md:text-sm uppercase tracking-wider"
                >
                    {loadingPix ? <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-textDark border-t-transparent rounded-full animate-spin" /> : <QrCode className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                    {loadingPix ? 'Gerando QR Code...' : 'Gerar QR Code Pix'}
                </button>
              </div>
            )}

            {pixStep === 'qr_code' && qrCodeData && (
              <div className="flex flex-col items-center">
                <div className="p-4 md:p-5 bg-white border border-transparent rounded-[1.75rem] shadow-glass-shadow mb-4 md:mb-6 w-full flex justify-center">
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
                
                <button 
                    onClick={copiarCodigo}
                    className="w-full bg-white/50 hover:bg-white/70 text-textLight border border-glassBorder/20 font-display font-black py-3 md:py-4 px-3 md:px-4 rounded-2xl mb-3 md:mb-4 transition-all shadow-glass-shadow hover:shadow-glow-primary hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 text-[10px] md:text-xs uppercase tracking-wider cursor-pointer"
                >
                    <svg className="w-4 h-4 text-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    Copiar Código Pix
                </button>

                <div className="flex items-center justify-center gap-2 text-[10px] md:text-xs font-mono font-bold text-success bg-success/10 py-3 md:py-3.5 px-3 md:px-4 rounded-2xl w-full border border-success/10 shadow-sm">
                    <span className="relative flex h-2 w-2 md:h-2.5 md:w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-success"></span>
                    </span>
                    AGUARDANDO PAGAMENTO...
                </div>
              </div>
            )}

            {pixStep === 'success' && (
              <div className="flex flex-col items-center justify-center py-4 md:py-6 success-anim relative min-h-[220px] md:min-h-[300px]">
                {/* Círculo animado com o checkmark */}
                <div className="success-circle w-14 h-14 md:w-20 md:h-20 bg-success/15 border border-success/30 rounded-full flex items-center justify-center mb-4 md:mb-6 shadow-glow-success">
                  <CheckCircle2 className="w-7 h-7 md:w-10 md:h-10 text-success" />
                </div>
                
                <h3 className="success-title font-display text-lg md:text-2xl font-black text-success uppercase tracking-wider mb-1 md:mb-2">
                  Pagamento Confirmado!
                </h3>
                
                <p className="success-text text-[11px] md:text-sm text-textLight max-w-[240px] mb-6 md:mb-8 leading-relaxed font-sans">
                  Sua vaga está garantida. Preparando seus ingressos...
                </p>

                {/* Barra de progresso horizontal simulando o encerramento do modal */}
                <div className="w-full h-1.5 bg-surface/50 rounded-full overflow-hidden border border-glassBorder/30">
                  <div className="success-bar h-full bg-gradient-to-r from-success to-primaryHover rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
