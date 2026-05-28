import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventCard } from '../components/EventCard';
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

  // Pull to Refresh States & Refs
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isPulling = useRef(false);

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
      
      await loadEvents(false);
      
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 300);
    } else {
      setPullDistance(0);
    }
  };

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

      const now = new Date();
      const upcomingEvents = visibleEvents.filter(e => {
        const eventDateTime = new Date(`${e.date}T${e.time || '00:00'}`);
        return eventDateTime >= now;
      });

      if (isLoadMore) {
        setEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id));
          const uniqueNewEvents = upcomingEvents.filter(e => !existingIds.has(e.id));
          return [...prev, ...uniqueNewEvents];
        });
      } else {
        setEvents(upcomingEvents);
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
    <div 
      ref={containerRef} 
      className="min-h-screen bg-background pb-28 select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
      <div 
        className="flex items-center justify-center overflow-hidden transition-all duration-200 pointer-events-none sticky top-0 z-50 w-full"
        style={{ 
          height: `${pullDistance}px`,
          opacity: pullDistance > 0 ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FCFAF7]/90 backdrop-blur-md border border-primary/10 shadow-lg mt-2">
          {isRefreshing ? (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <div 
              className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full transition-transform duration-75"
              style={{ transform: `rotate(${pullDistance * 6}deg)` }}
            />
          )}
          <span className="text-[10px] font-bold text-primary uppercase tracking-widest font-mono">
            {isRefreshing ? 'Atualizando...' : (pullDistance >= 60 ? 'Solte para atualizar' : 'Puxe para atualizar')}
          </span>
        </div>
      </div>

      {/* Premium Header */}
      <div className="feed-header px-5 pt-8 pb-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <img 
              src={`${import.meta.env.BASE_URL}logo.png?v=3`} 
              alt="Atchêi" 
              className="w-auto h-14 object-contain mix-blend-multiply drop-shadow-sm" 
            />
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/profile')}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-textLight flex items-center justify-center shadow-lg text-lg font-bold overflow-hidden transition-transform hover:scale-105 active:scale-95 cursor-pointer"
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
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-2xl px-5 py-4 relative overflow-hidden">
          <div className="relative z-10">
            <p className="font-sans text-sm text-textDark/60 mb-2 flex items-center gap-1.5 font-medium">
              <Calendar size={14} className="text-primary/60" />
              {formatDate()}
            </p>
            <p className="font-sans text-textDark">
              <span className="font-bold text-lg">{getGreeting()}</span>
              {user?.name && <span className="text-primary font-bold">, {user.name}</span>}
              <span className="text-textDark/60"> 👋</span>
            </p>
            <p className="font-sans text-xs text-textDark/50 mt-1">
              Confira os melhores eventos perto de você
            </p>
          </div>
        </div>
      </div>

      {/* Highlights Carousel */}
      <div className="highlights-section mt-2 mb-6">
        <div className="flex items-center gap-2 px-5 mb-3">
          <Flame size={16} className="text-accent" />
          <h2 className="font-sans font-bold text-base text-textDark">Em Destaque</h2>
        </div>
        
        <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2">
          {isLoading ? (
            [1, 2, 3].map(i => (
              <div key={`hl-skel-${i}`} className="min-w-[280px] h-[160px] rounded-3xl bg-primary/10 animate-pulse shrink-0 border border-primary/5" />
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
            <div className="min-w-[280px] h-[160px] rounded-3xl bg-primary/5 border border-primary/10 flex flex-col items-center justify-center shrink-0 w-full">
              <Flame size={24} className="text-primary/30 mb-2" />
              <p className="font-sans text-sm text-textDark/50 font-bold">Nenhum evento em destaque</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 px-5 mb-5 overflow-x-auto scrollbar-hide pb-1">
        {[
          { key: 'todos' as FilterType, label: 'Todos', icon: Sparkles },
          { key: 'emAlta' as FilterType, label: 'Em Alta', icon: Flame },
          { key: 'hoje' as FilterType, label: 'Hoje', icon: Calendar },
          { key: 'semana' as FilterType, label: 'Esta Semana', icon: null },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`filter-pill flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-all duration-200 ${
              filter === f.key
                ? 'bg-primary text-textLight shadow-md scale-105'
                : 'bg-primary/8 text-primary/70 hover:bg-primary/15'
            }`}
          >
            {f.icon && <f.icon size={14} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Section Title */}
      <div className="flex items-center gap-2 px-5 mb-4">
        <div className="w-1 h-5 bg-primary rounded-full" />
        <h2 className="font-sans font-bold text-base text-textDark">
          Próximos Eventos
        </h2>
        <span className="font-mono text-xs text-textDark/40 ml-auto">
          {filteredEvents.length} evento{filteredEvents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Events List */}
      <div className="flex flex-col gap-4 px-5">
        {isLoading ? (
          // Simple loading skeletons
          [1, 2, 3].map(i => (
            <div key={i} className="w-full h-40 bg-primary/5 animate-pulse rounded-2xl" />
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
                  className="px-6 py-3 rounded-full bg-primary/10 text-primary font-bold text-sm hover:bg-primary hover:text-textLight transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? 'Carregando...' : 'Carregar mais eventos'}
                </button>
              </div>
            )}

            {filteredEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-primary/40" />
                </div>
                <p className="font-sans text-textDark/50 text-sm text-center">
                  Nenhum evento encontrado
                </p>
                <p className="font-mono text-xs text-textDark/30 mt-1">
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
