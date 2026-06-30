import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventCard } from '../components/EventCard';
import { cn } from '../lib/utils';
import { storage } from '../lib/storage';
import type { EventItem } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import gsap from 'gsap';
import { Sparkles, Flame, Calendar, Ticket } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { EventCardSkeleton } from '../components/ui/Skeleton';

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 6) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const formatDate = (): string => {
  const now = new Date();
  return now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

type FilterType = 'todos' | 'hoje' | 'semana' | 'emAlta';

export const Feed = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('todos');
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  
  // Estados para Paginação de Eventos
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Pull to Refresh States & Refs
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const pullIndicatorRef = useRef<HTMLDivElement>(null);
  const pullSpinnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pullIndicatorRef.current) {
      pullIndicatorRef.current.style.height = `${pullDistance}px`;
      pullIndicatorRef.current.style.opacity = pullDistance > 0 ? '1' : '0';
    }
    if (pullSpinnerRef.current) {
      pullSpinnerRef.current.style.transform = `rotate(${pullDistance * 6}deg)`;
    }
  }, [pullDistance]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && !isRefreshing) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0) {
      const distance = Math.min(diff * 0.45, 80);
      setPullDistance(distance);
      
      if (diff > 5 && e.cancelable) {
        e.preventDefault();
      }
    } else {
      isPulling.current = false;
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= 60) {
      setIsRefreshing(true);
      setPullDistance(60);
      
      await loadEvents();
      
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 300);
    } else {
      setPullDistance(0);
    }
  };

  const loadEvents = async () => {
    setIsLoading(true);
    setLastDoc(null);
    setHasMore(true);
    
    try {
      // Busca a primeira página de 10 eventos
      const { events: newEvents, lastDoc: nextLastDoc } = await storage.getPaginatedEvents(null, 10);

      const isUserAdmin = user?.role === 'admin';
      const visibleEvents = isUserAdmin ? newEvents : newEvents.filter(e => !e.isTestEvent);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const upcomingEvents = visibleEvents.filter(e => {
        // Evento expira só no fim do seu dia: visível durante todo o dia da data marcada.
        const eventDay = new Date(`${e.date}T00:00`);
        return eventDay >= startOfToday;
      });

      setEvents(upcomingEvents);
      setLastDoc(nextLastDoc);
      if (newEvents.length < 10) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMoreEvents = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    
    try {
      // Busca a próxima página de 10 eventos a partir do lastDoc
      const { events: newEvents, lastDoc: nextLastDoc } = await storage.getPaginatedEvents(lastDoc, 10);

      const isUserAdmin = user?.role === 'admin';
      const visibleEvents = isUserAdmin ? newEvents : newEvents.filter(e => !e.isTestEvent);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const upcomingEvents = visibleEvents.filter(e => {
        // Evento expira só no fim do seu dia: visível durante todo o dia da data marcada.
        const eventDay = new Date(`${e.date}T00:00`);
        return eventDay >= startOfToday;
      });

      setEvents(prev => [...prev, ...upcomingEvents]);
      setLastDoc(nextLastDoc);
      if (newEvents.length < 10) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Erro ao carregar mais eventos:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      const ctx = gsap.context(() => {
        // Header entrance
        if (containerRef.current?.querySelector('.feed-header')) {
          gsap.from('.feed-header', {
            y: -20,
            opacity: 0,
            duration: 0.6,
            ease: 'power3.out',
          });
        }
        
        // Highlights section
        if (containerRef.current?.querySelector('.highlights-section')) {
          gsap.from('.highlights-section', {
            x: -30,
            opacity: 0,
            duration: 0.7,
            delay: 0.2,
            ease: 'expo.out',
          });
        }
        
        // Event cards
        if (containerRef.current?.querySelectorAll('.event-card-anim').length) {
          gsap.from('.event-card-anim', {
            y: 40,
            opacity: 0,
            duration: 0.6,
            stagger: 0.1,
            delay: 0.4,
            ease: 'expo.out',
          });
        }
      }, containerRef);
      return () => ctx.revert();
    }
  }, []); // Run only once on mount

  const getFilteredAndSortedEvents = () => {
    let filtered = [...events];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const parseLocalDate = (dateStr: string): Date => {
      const parts = dateStr.split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
    };

    if (filter === 'hoje') {
      filtered = filtered.filter(e => {
        const eventDate = parseLocalDate(e.date);
        return eventDate.getTime() === today.getTime();
      });
    } else if (filter === 'semana') {
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      filtered = filtered.filter(e => {
        const eventDate = parseLocalDate(e.date);
        return eventDate >= today && eventDate <= nextWeek;
      });
    } else if (filter === 'emAlta') {
      // Sort by registration count (most popular first) and limit to 10
      return filtered
        .sort((a, b) => (b.registrationCount || 0) - (a.registrationCount || 0))
        .slice(0, 10);
    }

    // Sort ascending by date
    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const filteredEvents = getFilteredAndSortedEvents();

  // Top 3 events sorted by popularity (most confirmed first)
  const highlights = [...events]
    .sort((a, b) => (b.registrationCount || 0) - (a.registrationCount || 0))
    .slice(0, 3);

  return (
    <div 
      ref={containerRef} 
      className="min-h-screen bg-background pb-28 relative select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
      <div 
        ref={pullIndicatorRef}
        className="flex items-center justify-center overflow-hidden transition-all duration-200 pointer-events-none sticky top-0 z-50 w-full"
      >
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/90 backdrop-blur-md border border-primary/10 shadow-float mt-2">
          {isRefreshing ? (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <div 
              ref={pullSpinnerRef}
              className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full transition-transform duration-75"
            />
          )}
          <span className="text-xs font-medium text-primary">
            {isRefreshing ? 'Atualizando...' : (pullDistance >= 60 ? 'Solte para atualizar' : 'Puxe para atualizar')}
          </span>
        </div>
      </div>

      {/* Cabeçalho */}
      <div className="feed-header px-5 pt-8 pb-4 relative z-10">
        <div className="flex justify-between items-center mb-6 md:hidden">
          <div className="flex items-center gap-2">
            <img 
              src={`${import.meta.env.BASE_URL}logo.png?v=5`} 
              alt="Atchêi" 
              className="w-auto h-14 object-contain drop-shadow-sm brightness-110" 
            />
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/profile')}
              className="w-14 h-14 rounded-2xl bg-primary text-textDark flex items-center justify-center text-lg font-sans font-bold overflow-hidden transition-all duration-200 hover:brightness-110 active:scale-95 cursor-pointer"
              title="Ir para o perfil"
            >
              {user?.imageUrl ? (
                <img src={user.imageUrl} className="w-full h-full object-cover" alt={user.name} />
              ) : (
                user?.name?.charAt(0).toUpperCase() || 'U'
              )}
            </button>
          </div>
        </div>

        {/* Saudação */}
        <div className="surface rounded-2xl p-7 relative overflow-hidden">
          <div className="flex justify-between items-center gap-6 relative z-10">
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs text-textMuted mb-3 flex items-center gap-2 font-medium first-letter:uppercase">
                <Calendar size={13} className="text-accent" />
                {formatDate()}
              </p>
              <div className="text-textLight">
                <span className="font-display italic text-2xl block text-accent leading-tight">
                  {getGreeting()},
                </span>
                {user?.name && (
                  <span className="text-primary font-display font-semibold text-4xl block leading-tight mt-1 truncate">
                    {user.name}
                  </span>
                )}
              </div>
              <p className="font-sans text-sm text-textMuted mt-4 leading-relaxed max-w-[240px]">
                Descubra os melhores encontros e eventos selecionados para hoje.
              </p>
              <button
                onClick={() => navigate('/ingresso')}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accentHover transition-colors cursor-pointer"
              >
                <Ticket size={13} />
                Já comprou? Recuperar ingresso
              </button>
            </div>

            {/* Métrica de eventos ativos na cena */}
            <div className="shrink-0 flex flex-col items-center justify-center bg-primary text-textDark rounded-2xl w-24 h-24">
              <span className="text-[10px] font-medium text-textDark/80 leading-none">Acontecendo</span>
              <span className="text-4xl font-display font-semibold text-textDark mt-1.5 leading-none">{events.length}</span>
              <span className="text-[10px] font-medium text-textDark/85 mt-1.5">eventos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights Carousel */}
      <div className="highlights-section mt-4 mb-6 relative z-10">
        <div className="flex items-center justify-between px-5 mb-3.5">
          <div className="flex flex-col text-left">
            <h2 className="font-display font-semibold text-2xl text-textLight leading-tight">
              Em destaque
            </h2>
            <span className="text-xs text-textMuted mt-1.5 flex items-center gap-1.5">
              <Flame size={12} className="text-primary" /> Eventos mais quentes da semana
            </span>
          </div>
        </div>
        
        <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2">
          {isLoading ? (
            [1, 2, 3].map(i => (
              <div key={`hl-skel-${i}`} className="min-w-[260px] h-[180px] rounded-2xl skeleton-dark shrink-0" />
            ))
          ) : highlights.length > 0 ? (
            <>
              {highlights.map(event => (
                 <EventCard key={`hl-${event.id}`} event={event} variant="highlight" />
              ))}
              <div className="min-w-[20px] shrink-0" />
            </>
          ) : (
            <div className="min-w-[260px] h-[180px] rounded-2xl surface-cream flex flex-col items-center justify-center shrink-0 w-full">
              <Flame size={24} className="text-primary/30 mb-2" />
              <p className="font-sans text-sm text-textMuted">Nenhum evento em destaque</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-3 px-5 mb-6 overflow-x-auto scrollbar-hide pb-1.5 relative z-10">
        {[
          { key: 'todos' as FilterType, label: 'Todos', icon: Sparkles },
          { key: 'emAlta' as FilterType, label: 'Em alta', icon: Flame },
          { key: 'hoje' as FilterType, label: 'Hoje', icon: Calendar },
          { key: 'semana' as FilterType, label: 'Esta semana', icon: null },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "filter-pill flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-sans font-medium text-sm whitespace-nowrap transition-all duration-200 border neo-click cursor-pointer",
              filter === f.key
                ? 'bg-primary text-textDark border-primary'
                : 'bg-surface border-glassBorder text-textMuted hover:text-textLight hover:bg-surfaceHover'
            )}
          >
            {f.icon && <f.icon size={15} className={filter === f.key ? "text-textDark" : "text-primary/70"} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Section Title */}
      <div className="flex items-center justify-between px-5 mb-5 relative z-10">
        <div className="flex flex-col text-left">
          <h2 className="font-display font-semibold text-2xl text-textLight leading-tight">
            Próximos eventos<span className="text-primary">.</span>
          </h2>
          <span className="text-xs text-textMuted mt-1.5">
            Selecionados para você
          </span>
        </div>
        <span className="text-xs text-primary bg-primary/10 px-3 py-1 border border-primary/20 rounded-full font-medium">
          {filteredEvents.length} {filteredEvents.length !== 1 ? 'eventos' : 'evento'}
        </span>
      </div>

      {/* Events List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-5 relative z-10">
        {isLoading ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <EventCardSkeleton key={i} />
          ))
        ) : (
          <>
            {filteredEvents.map((event) => (
              <div key={event.id} className="event-card-anim">
                 <EventCard event={event} />
              </div>
            ))}


            {/* Botão Carregar Mais para Paginação de Eventos */}
            {hasMore && filteredEvents.length > 0 && (
              <div className="flex justify-center w-full col-span-full mt-6 mb-4">
                <Button
                  variant="secondary"
                  onClick={handleLoadMoreEvents}
                  loading={isLoadingMore}
                >
                  Carregar mais eventos
                </Button>
              </div>
            )}

            {filteredEvents.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  icon={<Sparkles size={28} />}
                  title="Nenhum evento encontrado"
                  description={filter !== 'todos' ? 'Tente outro filtro para ver mais eventos.' : 'Ainda não há eventos por aqui. Que tal criar o primeiro?'}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
