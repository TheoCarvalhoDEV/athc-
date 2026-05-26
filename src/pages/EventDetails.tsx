import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem, Registration, AppProfile } from '../lib/storage';
import { Button } from '../components/ui/Button';
import { Calendar, Clock, MapPin, ArrowLeft, CheckCircle2, Share2, User, Ticket, ChevronLeft, ChevronRight, QrCode } from 'lucide-react';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import gsap from 'gsap';

export const EventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentUser = storage.getCurrentUser();
  const userId = currentUser?.id;
  const [showContactsModal, setShowContactsModal] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [organizer, setOrganizer] = useState<AppProfile | null>(null);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // PIX STATES
  const [showPixModal, setShowPixModal] = useState(false);
  const [loadingPix, setLoadingPix] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ qr_code: string, qr_code_base64: string } | null>(null);
  const [pedidoId, setPedidoId] = useState('');
  
  // GUEST STATES
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // Firebase Instances
  const functions = getFunctions();
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
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
                // Fechar modal Pix e garantir vaga
                setShowPixModal(false);
                await handleRegister();
                // O handleRegister já abre o showModal (Success Modal)
            }
        }
    });

    return () => unsubscribe();
  }, [qrCodeData, pedidoId]);

  const handlePagarPix = async () => {
    if (!event) return;
    
    if (!currentUser && (!guestName || !guestEmail)) {
        alert("Por favor, preencha nome e email para continuar.");
        return;
    }
    
    setLoadingPix(true);
    const buyerId = currentUser ? currentUser.id : `guest-${Date.now()}`;
    const buyerEmail = currentUser ? (currentUser.username || 'comprador@atche.com') : guestEmail;

    const novoPedidoId = `PIX-${event.id}-${buyerId}-${Date.now()}`;
    setPedidoId(novoPedidoId);
    
    const pedido = {
        pedidoId: novoPedidoId,
        valor: Number(event.pixTicketPrice || 0),
        cpf: '12345678909', // Placeholder temporário
        email: buyerEmail
    };

    try {
        const criarCobrancaPix = httpsCallable(functions, 'criarCobrancaPix');
        const result = await criarCobrancaPix(pedido);
        const data = result.data as any;
        
        setQrCodeData({
            qr_code: data.qr_code,
            qr_code_base64: data.qr_code_base64
        });
    } catch (error: any) {
        console.error("Erro ao gerar Pix:", error);
        alert("Erro ao processar: " + (error.message || "Verifique o console"));
    } finally {
        setLoadingPix(false);
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
        const found = allEvents.find(e => e.id === id);
        setEvent(found || null);

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
    // Se não tiver logado e não for visitante com dados preenchidos, não pode registrar ingresso grátis (Garantir Vaga)
    if (!currentUser && (!guestName || !guestEmail)) {
      navigate('/login');
      return;
    }

    if (!event) return;

    const buyerId = currentUser ? currentUser.id : `guest-${Date.now()}`;
    const buyerName = currentUser ? currentUser.name : guestName;

    const registration: Registration = {
      id: Date.now().toString(),
      eventId: event.id,
      userId: buyerId,
      userName: buyerName,
      timestamp: new Date().toISOString()
    };

    try {
      await storage.saveRegistration(registration);
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
    <div ref={containerRef} className="min-h-screen bg-background pb-44">
      {/* Centered Container for Desktop */}
      <div className="max-w-2xl mx-auto bg-background min-h-screen shadow-2xl relative flex flex-col">
        <div className="absolute top-8 left-0 right-0 px-4 flex justify-between items-center z-20">
          <button
            title="Voltar"
            aria-label="Voltar"
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-background/60 backdrop-blur-xl rounded-2xl flex items-center justify-center text-textDark shadow-lg border border-white/20"
          >
            <ArrowLeft size={20} />
          </button>

          <button
            title="Compartilhar"
            aria-label="Compartilhar"
            onClick={handleShare}
            className="w-10 h-10 bg-background/60 backdrop-blur-xl rounded-2xl flex items-center justify-center text-textDark shadow-lg border border-white/20"
          >
            <Share2 size={20} />
          </button>
        </div>

        <div
          className="relative h-80 w-full overflow-hidden rounded-b-[3rem] group"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <img
            src={mediaList[currentMediaIndex]}
            alt={`${event.title} - Foto ${currentMediaIndex + 1}`}
            className="w-full h-full object-cover transition-all duration-300 select-none"
            draggable="false"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent pointer-events-none" />

          {/* Carousel Navigation Controls */}
          {mediaList.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrevMedia}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-background/60 backdrop-blur-md rounded-xl flex items-center justify-center text-textDark shadow-md border border-white/20 hover:scale-105 active:scale-95 transition-all z-20 cursor-pointer hidden md:flex"
                aria-label="Mídia anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={handleNextMedia}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-background/60 backdrop-blur-md rounded-xl flex items-center justify-center text-textDark shadow-md border border-white/20 hover:scale-105 active:scale-95 transition-all z-20 cursor-pointer hidden md:flex"
                aria-label="Próxima mídia"
              >
                <ChevronRight size={16} />
              </button>

              {/* Dots indicators */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-auto">
                {mediaList.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentMediaIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === currentMediaIndex ? 'bg-primary w-4' : 'bg-primary/30'}`}
                    aria-label={`Ir para foto ${idx + 1}`}
                  />
                ))}
              </div>

              {/* Counter Badge bottom-right */}
              <div className="absolute bottom-6 right-6 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 text-[10px] font-mono font-bold text-white border border-white/10 shadow-md z-20 pointer-events-none">
                {currentMediaIndex + 1} / {mediaList.length}
              </div>
            </>
          )}
        </div>

        <div className="absolute top-24 right-4 px-3 py-1 bg-primary text-textLight text-[10px] font-bold rounded-full shadow-lg z-20 uppercase tracking-widest">
          {event.publicType}
        </div>

        <div className="relative z-10 px-5 pt-7 pb-40">
          {/* Título com estilo premium e gradiente refinado */}
          <h1 className="font-sans text-4xl font-extrabold text-textDark leading-tight mb-3 anim-up tracking-tight bg-gradient-to-r from-textDark via-primary to-accent bg-clip-text text-transparent">
            {event.title}
          </h1>
          <div className="w-16 h-1.5 bg-gradient-to-r from-primary to-accent rounded-full mb-8 anim-up" />

          {/* Cards de Data e Horário com estilo Glassmorphism */}
          <div className="grid grid-cols-2 gap-4 mb-8 anim-up">
            <div className="bg-gradient-to-b from-[#FCFAF7] to-[#F5EFE6] p-4 rounded-[2rem] border border-primary/10 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.03)] flex flex-col gap-2 hover:scale-[1.02] transition-transform duration-300">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Calendar size={15} />
                </div>
                <span className="font-sans font-bold text-[10px] text-primary/60 uppercase tracking-widest">Data</span>
              </div>
              <p className="text-sm font-bold text-textDark leading-snug pl-1">{formatDate(event.date)}</p>
            </div>

            <div className="bg-gradient-to-b from-[#FCFAF7] to-[#F5EFE6] p-4 rounded-[2rem] border border-primary/10 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.03)] flex flex-col gap-2 hover:scale-[1.02] transition-transform duration-300">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Clock size={15} />
                </div>
                <span className="font-sans font-bold text-[10px] text-primary/60 uppercase tracking-widest">Horário</span>
              </div>
              <p className="text-sm font-bold text-textDark leading-snug pl-1">{event.time}h</p>
            </div>
          </div>

          {/* Seção do Organizador VIP */}
          {organizer && (
            <div className="bg-gradient-to-r from-primary/5 via-primary/2 to-transparent border border-primary/10 p-5 rounded-[2.2rem] mb-8 flex items-center justify-between gap-3 anim-up shadow-sm hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary overflow-hidden border-2 border-white shadow-md">
                    {organizer.imageUrl ? (
                      <img src={organizer.imageUrl} className="w-full h-full object-cover" alt={organizer.name} />
                    ) : (
                      <User size={24} />
                    )}
                  </div>
                  {/* Badge de Verificado */}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-textLight border-2 border-white flex items-center justify-center text-[10px] font-bold shadow-md">
                    ✓
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold text-primary/50 uppercase tracking-widest truncate">Organizado por</p>
                  <p className="font-sans font-bold text-base text-textDark mt-0.5 truncate">{organizer.name}</p>
                  <p className="text-[10px] text-textDark/40 font-mono truncate">Parceiro Oficial Atchê</p>
                </div>
              </div>

              <button
                onClick={() => navigate(`/agenda/${organizer.id}`)}
                className="bg-primary text-textLight font-sans font-bold text-xs px-4 py-2.5 rounded-full shadow-md hover:bg-primary/95 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                Ver Perfil
              </button>
            </div>
          )}

          {/* Seção Sobre o Evento Premium */}
          <div className="mb-8 anim-up">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-4 bg-primary rounded-full" />
              <h2 className="font-sans font-bold text-base text-textDark tracking-tight">Sobre o Evento</h2>
            </div>
            <div className="relative overflow-hidden bg-gradient-to-b from-[#FCFAF7] to-[#F8F3EA] p-6 rounded-[2.5rem] border border-primary/8 shadow-sm">
              {/* Aspa de fundo decorativa */}
              <div className="absolute -top-6 -right-6 text-9xl font-sans text-primary/5 pointer-events-none select-none">
                ”
              </div>
              <p className="text-textDark/80 text-sm leading-relaxed whitespace-pre-wrap font-sans relative z-10">
                {event.description}
              </p>
            </div>
          </div>


          {/* Localização e Card de GPS de Luxo */}
          <div className="mb-8 anim-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-primary rounded-full" />
                <h2 className="font-sans font-bold text-base text-textDark tracking-tight">Localização</h2>
              </div>
            </div>

            <div className="bg-gradient-to-b from-[#FCFAF7] to-[#F5EFE6] border border-primary/10 rounded-[2.5rem] p-5 shadow-sm hover:border-primary/20 transition-all duration-300">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/5 shadow-inner">
                  <MapPin size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-bold text-textDark text-sm truncate">{event.location}</p>
                  <p className="text-xs text-textDark/60 font-mono mt-0.5 leading-snug">{event.address}</p>
                </div>
              </div>

              <button
                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address || event.location)}`, '_blank')}
                className="w-full bg-[#EAE3D5] text-primary hover:bg-primary hover:text-textLight font-sans font-bold text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all duration-300 cursor-pointer"
              >
                📍 Ver Rota no Google Maps
              </button>
            </div>
          </div>

        </div>

        {/* Floating Action Button for Registration - Pílula Ultra Premium */}
        <div className="fixed bottom-6 left-0 right-0 px-5 z-40 anim-up max-w-2xl mx-auto">
          <div className="bg-gradient-to-b from-[#FCFAF7]/95 to-[#FAF5EC]/95 backdrop-blur-3xl p-5 rounded-[2rem] shadow-[0_20px_40px_rgba(43,24,16,0.12)] border border-primary/20 flex flex-col gap-4">
            
            {/* Info do Ingresso */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest mb-0.5">Ingresso</span>
                <span className="text-xl font-sans font-bold text-primary tracking-tight leading-none truncate max-w-[140px]" title={event.hasTickets && event.ticketPrice ? event.ticketPrice : (event.hasTickets ? 'Consulte' : 'Gratuito')}>
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
              <span className="bg-primary/5 text-primary text-[10px] font-mono px-3 py-1.5 rounded-full border border-primary/10">
                1º Lote Disponível
              </span>
            </div>

            {/* Ações (Grid dinâmico dependendo de quantos botões temos) */}
            <div className="flex flex-col gap-2">
              {/* Botão Temporariamente Oculto a pedido
              <button
                onClick={handleRegister}
                disabled={isRegistered}
                className={`w-full rounded-xl py-3.5 shadow-md flex items-center justify-center gap-2 transition-all duration-300 font-sans font-bold text-sm cursor-pointer ${isRegistered
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-none scale-100'
                    : 'bg-primary text-textLight hover:bg-primary/95 shadow-primary/20 hover:scale-[1.01] active:scale-95'
                  }`}
              >
                {isRegistered ? (
                  <>
                    <CheckCircle2 size={18} />
                    <span>Presença Confirmada</span>
                  </>
                ) : (
                  <span>Garantir Vaga</span>
                )}
              </button>
              */}

              {event.hasPixTickets ? (
                <button
                  onClick={() => {
                      if (!isRegistered) setShowPixModal(true);
                  }}
                  disabled={isRegistered}
                  className={`rounded-2xl px-5 py-3.5 shadow-md flex items-center gap-2 transition-all duration-300 font-sans font-extrabold text-xs h-auto cursor-pointer ${isRegistered
                      ? 'bg-green-600 text-white shadow-green-600/10 scale-100'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 hover:scale-105 active:scale-95'
                    }`}
                >
                  {isRegistered ? (
                    <>
                      <CheckCircle2 size={15} />
                      <span>Pago & Confirmado</span>
                    </>
                  ) : (
                    <>
                      <QrCode size={18} />
                      <span>Comprar Pix</span>
                    </>
                  )}
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
                    className="w-full rounded-xl py-3.5 shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 transition-all duration-300 font-sans font-bold text-sm bg-gradient-to-r from-green-600 to-green-500 text-white cursor-pointer hover:scale-[1.02] active:scale-95"
                  >
                    <Ticket size={18} />
                    <div className="flex flex-col items-start leading-none text-left">
                      <span>Comprar Ingresso</span>
                      <span className="text-[10px] font-medium opacity-90 mt-1 font-mono">
                        {contacts.length === 1 && contacts[0].name ? `Tratar com: ${contacts[0].name}` : contacts.length > 1 ? `${contacts.length} Promoters Disponíveis` : 'Via WhatsApp'}
                      </span>
                    </div>
                  </button>
                );
              })() : null}
            </div>
          </div>
        </div>

      </div>

      {/* Success Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-background p-6 rounded-[2rem] border border-primary/20 shadow-2xl max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="font-sans text-2xl font-bold text-textDark mb-2">Presença Confirmada!</h3>
            <p className="text-sm text-textDark/70 mb-6">
              Sua vaga para {event.title} foi garantida. Aproveite o evento!
            </p>
            <Button onClick={() => setShowModal(false)} className="w-full rounded-full">
              Entendido
            </Button>
          </div>
        </div>
      )}

      {/* Contacts Modal */}
      {showContactsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-background p-6 rounded-[2rem] border border-primary/20 shadow-2xl max-w-sm w-full text-center max-h-[80vh] flex flex-col">
            <h3 className="font-sans text-2xl font-bold text-textDark mb-2">Comprar Ingresso</h3>
            <p className="text-xs text-textDark/70 mb-6">
              Escolha com qual promoter você deseja falar para garantir sua vaga:
            </p>
            <div className="space-y-3 overflow-y-auto pr-2 pb-4">
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
                  className="w-full bg-primary/5 hover:bg-primary/10 border border-primary/10 rounded-2xl p-4 flex items-center justify-between transition-colors group"
                >
                  <div className="flex flex-col items-start">
                    <span className="font-bold text-sm text-textDark group-hover:text-primary transition-colors">{contact.name || 'Promoter'}</span>
                    <span className="text-[10px] text-textDark/50 font-mono mt-0.5">{contact.phone}</span>
                  </div>
                  <Ticket className="text-primary/40 group-hover:text-primary transition-colors" size={18} />
                </button>
              ))}
            </div>
            <Button onClick={() => setShowContactsModal(false)} variant="outline" className="w-full rounded-full mt-2">
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {/* Pix Modal */}
      {showPixModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={() => setShowPixModal(false)} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors">
              <span className="sr-only">Fechar</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="font-sans text-xl font-bold text-gray-800 mb-1">Pagamento via Pix</h3>
            <p className="text-xs text-gray-500 mb-4">Total: R$ {Number(event?.pixTicketPrice || 0).toFixed(2).replace('.', ',')}</p>
            
            {!qrCodeData ? (
              <div className="flex flex-col gap-4">
                {!currentUser && (
                  <div className="text-left space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100 mb-2">
                    <p className="text-xs font-bold text-gray-700">Seus Dados (Visitante)</p>
                    <input 
                      type="text" 
                      placeholder="Nome Completo" 
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      className="w-full text-sm p-2.5 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 transition-colors"
                    />
                    <input 
                      type="email" 
                      placeholder="Seu melhor email" 
                      value={guestEmail}
                      onChange={e => setGuestEmail(e.target.value)}
                      className="w-full text-sm p-2.5 rounded-lg border border-gray-200 outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                )}
                
                <button 
                    onClick={handlePagarPix}
                    disabled={loadingPix || (!currentUser && (!guestName || !guestEmail))}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {loadingPix ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <QrCode size={18} />}
                    {loadingPix ? 'Gerando QR Code...' : 'Gerar QR Code Pix'}
                </button>
              </div>
            ) : (
                <div className="flex flex-col items-center">
                    <div className="p-3 bg-white border-2 border-emerald-50 rounded-2xl shadow-sm mb-4 w-full flex justify-center">
                        {qrCodeData.qr_code_base64 ? (
                            <img 
                                src={`data:image/jpeg;base64,${qrCodeData.qr_code_base64}`} 
                                alt="QR Code Pix" 
                                className="w-48 h-48 rounded-lg object-contain"
                            />
                        ) : (
                            <div className="w-48 h-48 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg text-sm">Indisponível</div>
                        )}
                    </div>
                    
                    <button 
                        onClick={copiarCodigo}
                        className="w-full bg-gray-50 hover:bg-gray-100 text-gray-800 font-semibold py-3 px-4 rounded-xl mb-4 transition-colors border border-gray-200 flex items-center justify-center gap-2 text-sm"
                    >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        Copiar Pix Copia e Cola
                    </button>

                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 py-2 px-4 rounded-full w-full">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Aguardando pagamento...
                    </div>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
