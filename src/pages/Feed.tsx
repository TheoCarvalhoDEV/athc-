import { useEffect, useRef, useState } from 'react';
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

type FilterType = 'todos' | 'Aberto' | 'VIP' | 'hoje' | 'semana';

export const Feed = () => {
  const containerRef = useRef<HTMLDivElement>(null);
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
      
      if (isLoadMore) {
        setEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id));
          const uniqueNewEvents = newEvents.filter(e => !existingIds.has(e.id));
          return [...prev, ...uniqueNewEvents];
        });
      } else {
        setEvents(newEvents);
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
        
        // Filter pills
        if (containerRef.current?.querySelectorAll('.filter-pill').length) {
          gsap.from('.filter-pill', {
            scale: 0.8,
            opacity: 0,
            duration: 0.4,
            stagger: 0.06,
            delay: 0.3,
            ease: 'back.out(1.7)',
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

  const handleDelete = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const getFilteredAndSortedEvents = () => {
    let filtered = [...events];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filter === 'Aberto' || filter === 'VIP') {
      filtered = filtered.filter(e => e.publicType === filter);
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
    }

    // Sort ascending by date
    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const filteredEvents = getFilteredAndSortedEvents();

  // Top 2 events as highlights
  const highlights = events.slice(0, 3);

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28">
      {/* Premium Header */}
      <div className="feed-header px-5 pt-8 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Atchê" className="w-32 h-32 object-contain mix-blend-multiply mix-blend-multiply mix-blend-multiply" />
              <h1 className="font-brand text-5xl text-primary font-bold tracking-tight mt-1">Atchê</h1>
            </div>
            <p className="font-sans text-sm text-textDark/60 mt-1 flex items-center gap-1.5">
              <Calendar size={13} className="text-primary/50" />
              {formatDate()}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="pulse-dot" />
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-textLight flex items-center justify-center shadow-lg text-sm font-bold overflow-hidden">
              {user?.imageUrl ? (
                <img src={user.imageUrl} className="w-full h-full object-cover" alt={user.name} />
              ) : (
                user?.name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
          </div>
        </div>

        {/* Greeting */}
        <div className="mt-5 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-2xl px-5 py-4">
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

      {/* Highlights Carousel */}
      {highlights.length > 0 && (
        <div className="highlights-section mt-2 mb-6">
          <div className="flex items-center gap-2 px-5 mb-3">
            <Flame size={16} className="text-accent" />
            <h2 className="font-sans font-bold text-base text-textDark">Em Destaque</h2>
          </div>
          
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2">
            {highlights.map(event => (
              <EventCard key={`hl-${event.id}`} event={event} variant="highlight" onDelete={handleDelete} />
            ))}
            {/* Spacer for scroll padding */}
            <div className="min-w-[20px] shrink-0" />
          </div>
        </div>
      )}

      {/* Filter Pills */}
      <div className="flex gap-2 px-5 mb-5 overflow-x-auto scrollbar-hide pb-1">
        {[
          { key: 'todos' as FilterType, label: 'Todos', icon: Sparkles },
          { key: 'hoje' as FilterType, label: 'Hoje', icon: Calendar },
          { key: 'semana' as FilterType, label: 'Esta Semana', icon: null },
          { key: 'Aberto' as FilterType, label: 'Aberto', icon: null },
          { key: 'VIP' as FilterType, label: '✦ VIP', icon: null },
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
                <EventCard event={event} onDelete={handleDelete} />
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
