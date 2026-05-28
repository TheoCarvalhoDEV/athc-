import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventCard } from '../components/EventCard';
import { cn } from '../lib/utils';
import { storage } from '../lib/storage';
import type { EventItem } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import gsap from 'gsap';
import { Sparkles, Flame, Calendar } from 'lucide-react';

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

type FilterType = 'todos' | 'Aberto' | 'hoje' | 'semana' | 'emAlta';

export const Feed = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('todos');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useAuth();

  const loadEvents = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    else setIsLoading(true);
    
    try {
      const pageSize = 10;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentLastDoc = isLoadMore ? lastDoc : null;
      
      const { events: newEvents, lastDoc: newLastDoc } = await storage.getPaginatedEvents(currentLastDoc, pageSize);

      const isUserAdmin = user?.role === 'admin';
      const visibleEvents = isUserAdmin ? newEvents : newEvents.filter(e => !e.isTestEvent);

      if (isLoadMore) {
        setEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id));
          const uniqueNewEvents = visibleEvents.filter(e => !existingIds.has(e.id));
          return [...prev, ...uniqueNewEvents];
        });
      } else {
        setEvents(visibleEvents);
      }
      
      setLastDoc(newLastDoc);
      setHasMore(newEvents.length === pageSize);
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
    } finally {
      setIsLoading(false);
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filter === 'Aberto') {
      filtered = filtered.filter(e => e.publicType === 'Aberto');
    } else if (filter === 'hoje') {
      filtered = filtered.filter(e => {
        const eventDate = new Date(e.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.getTime() === today.getTime();
      });
    } else if (filter === 'semana') {
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      filtered = filtered.filter(e => {
        const eventDate = new Date(e.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= today && eventDate <= nextWeek;
      });
    } else if (filter === 'emAlta') {
      // Sort by registration count (most popular first)
      return filtered.sort((a, b) => (b.registrationCount || 0) - (a.registrationCount || 0));
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
    <div ref={containerRef} className="min-h-screen bg-background pb-28 relative">
      {/* Ambient glow decorative */}
      <div className="ambient-glow w-64 h-64 bg-primary/10 -top-32 -right-32" />
      <div className="ambient-glow w-48 h-48 bg-accent/8 top-96 -left-24" />

      {/* Premium Header */}
      <div className="feed-header px-5 pt-8 pb-4 relative z-10">
        <div className="flex justify-between items-center mb-6 md:hidden">
          <div className="flex items-center gap-2">
            <img 
              src={`${import.meta.env.BASE_URL}logo.png?v=3`} 
              alt="Atchêi" 
              className="w-auto h-14 object-contain drop-shadow-sm brightness-110" 
            />
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/profile')}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primaryHover text-textDark border border-primary/20 flex items-center justify-center shadow-glow-primary text-lg font-display font-extrabold overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
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

        {/* Greeting */}
        <div className="glass rounded-[2.5rem] p-7 relative overflow-hidden shadow-glass-shadow border-glassBorder/60 bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-xl">
          {/* Luzes decorativas internas (auroras em miniatura) */}
          <div className="absolute -right-6 -top-6 w-36 h-36 rounded-full bg-primary/8 blur-2xl pointer-events-none" />
          <div className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full bg-accent/4 blur-xl pointer-events-none" />
          
          <div className="flex justify-between items-center gap-6 relative z-10">
            <div className="flex-1 min-w-0 text-left">
              <p className="font-mono text-[9px] text-accent/80 mb-3 flex items-center gap-2 font-bold uppercase tracking-[0.15em]">
                <Calendar size={12} className="text-accent" />
                {formatDate()}
              </p>
              <div className="text-textLight">
                <span className="font-serifDisplay italic font-light text-2xl tracking-wide block text-accent leading-none">
                  {getGreeting()},
                </span>
                {user?.name && (
                  <span className="text-primary font-serifDisplay italic font-bold text-4xl block tracking-wide leading-tight mt-1 truncate">
                    {user.name}
                  </span>
                )}
              </div>
              <p className="font-sans text-xs text-textMuted mt-4 font-medium leading-relaxed max-w-[240px]">
                Descubra os melhores encontros e eventos selecionados para hoje.
              </p>
            </div>

            {/* Métrica de eventos ativos na cena */}
            <div className="shrink-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary to-primaryHover text-textDark border border-primary/20 rounded-[2rem] w-24 h-24 shadow-glow-primary relative overflow-hidden group hover:scale-[1.03] active:scale-[0.98] transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-tr from-primaryHover/60 via-transparent to-transparent opacity-80 pointer-events-none" />
              <div className="relative z-10 flex flex-col items-center justify-center">
                <span className="text-[8px] font-mono font-bold text-textDark/70 uppercase tracking-widest leading-none">Na Cena</span>
                <span className="text-3xl font-serifDisplay font-bold text-textDark mt-1.5 leading-none">{events.length}</span>
                <span className="text-[7px] font-mono font-bold text-textDark/85 uppercase mt-1.5 tracking-wider">rolês</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights Carousel */}
      <div className="highlights-section mt-4 mb-6 relative z-10">
        <div className="flex items-center justify-between px-5 mb-3.5">
          <div className="flex flex-col">
            <h2 className="font-serifDisplay italic font-semibold text-2xl text-textLight leading-none">
              Em Destaque
            </h2>
            <span className="text-[9px] font-mono text-textMuted uppercase tracking-widest mt-1.5 flex items-center gap-1 opacity-80">
              <Flame size={10} className="text-primary animate-pulse" /> Rolês mais quentes da semana
            </span>
          </div>
        </div>
        
        <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2">
          {isLoading ? (
            [1, 2, 3].map(i => (
              <div key={`hl-skel-${i}`} className="min-w-[280px] h-[160px] rounded-3xl skeleton-dark shrink-0" />
            ))
          ) : highlights.length > 0 ? (
            <>
              {highlights.map(event => (
                 <EventCard key={`hl-${event.id}`} event={event} variant="highlight" />
              ))}
              {/* Spacer for scroll padding */}
              <div className="min-w-[20px] shrink-0" />
            </>
          ) : (
            <div className="min-w-[280px] h-[160px] rounded-3xl glass flex flex-col items-center justify-center shrink-0 w-full">
              <Flame size={24} className="text-primary/30 mb-2" />
              <p className="font-sans text-sm text-textMuted font-bold">Nenhum evento em destaque</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-3 px-5 mb-6 overflow-x-auto scrollbar-hide pb-1.5 relative z-10">
        {[
          { key: 'todos' as FilterType, label: 'Todos', icon: Sparkles },
          { key: 'emAlta' as FilterType, label: 'Em Alta', icon: Flame },
          { key: 'hoje' as FilterType, label: 'Hoje', icon: Calendar },
          { key: 'semana' as FilterType, label: 'Esta Semana', icon: null },
          { key: 'Aberto' as FilterType, label: 'Aberto', icon: null },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "filter-pill flex items-center gap-1.5 px-5 py-3 rounded-2xl font-display font-black text-xs uppercase tracking-wider whitespace-nowrap transition-all duration-300 border neo-click",
              filter === f.key
                ? 'bg-gradient-to-r from-primary to-primaryHover text-textDark border-primary/20 shadow-glow-primary scale-105'
                : 'bg-white/80 border-glassBorder text-textMuted hover:text-textLight hover:bg-surfaceHover hover:-translate-y-0.5'
            )}
          >
            {f.icon && <f.icon size={13} className={filter === f.key ? "text-textDark" : "text-primary/70"} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Section Title */}
      <div className="flex items-center justify-between px-5 mb-5 relative z-10">
        <div className="flex flex-col text-left">
          <h2 className="font-serifDisplay italic font-semibold text-2xl text-textLight leading-none">
            Próximos Eventos<span className="text-primary font-serifDisplay font-normal">.</span>
          </h2>
          <span className="text-[9px] font-mono text-textMuted uppercase tracking-widest mt-1.5 opacity-80">
            Selecionados para você
          </span>
        </div>
        <span className="font-mono text-[9px] text-primary bg-primary/10 px-3 py-1 border border-primary/20 rounded-full font-bold uppercase">
          {filteredEvents.length} {filteredEvents.length !== 1 ? 'eventos' : 'evento'}
        </span>
      </div>

      {/* Events List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-5 relative z-10">
        {isLoading ? (
          // Simple loading skeletons
          [1, 2, 3].map(i => (
            <div key={i} className="w-full h-40 skeleton-dark rounded-3xl" />
          ))
        ) : (
          <>
            {filteredEvents.map((event) => (
              <div key={event.id} className="event-card-anim">
                 <EventCard event={event} />
              </div>
            ))}
            
            {hasMore && filteredEvents.length > 0 && (
              <div className="flex justify-center mt-4 mb-8">
                <button
                  onClick={() => loadEvents(true)}
                  disabled={isLoadingMore}
                  className="px-6 py-3.5 rounded-2xl bg-surface/50 border border-glassBorder hover:border-primary/30 text-textLight font-display font-black hover:shadow-glow-primary active:scale-95 transition-all duration-300 neo-click disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? 'Carregando...' : 'Ver Mais Eventos'}
                </button>
              </div>
            )}

            {filteredEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-primary/40" />
                </div>
                <p className="font-sans text-textMuted text-sm text-center">
                  Nenhum evento encontrado
                </p>
                <p className="font-mono text-xs text-textMuted/60 mt-1">
                  {filter !== 'todos' ? 'Tente outro filtro' : 'Crie seu primeiro evento!'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
