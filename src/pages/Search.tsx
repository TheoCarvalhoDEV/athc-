import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { storage } from '../lib/storage';
import type { EventItem, AppProfile } from '../lib/storage';
import { EventCard } from '../components/EventCard';
import { ProfileCard } from '../components/ProfileCard';
import gsap from 'gsap';
import { Search as SearchIcon } from 'lucide-react';
import { cn } from '../lib/utils';

import { useAuth } from '../contexts/AuthContext';

type TabType = 'eventos' | 'estabelecimentos' | 'atleticas';

export const Search = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('eventos');
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const [profiles, setProfiles] = useState<AppProfile[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [allEvents, allProfiles] = await Promise.all([
          storage.getEvents(),
          storage.getProfiles()
        ]);
        const currentUser = storage.getCurrentUser();
        const visibleEvents = currentUser?.role === 'admin' ? allEvents : allEvents.filter(e => !e.isTestEvent);
        setEvents(visibleEvents);
        setProfiles(allProfiles);
      } catch (error) {
        console.error("Erro ao carregar dados na busca:", error);
      }
    };
    loadData();
  }, []);

  const filteredEvents = events.filter(e => e.title.toLowerCase().includes(query.toLowerCase()));
  
  const filteredProfiles = profiles.filter(p => {
    const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase());
    if (activeTab === 'estabelecimentos') return matchesQuery && p.type === 'estabelecimento';
    if (activeTab === 'atleticas') return matchesQuery && p.type === 'atletica';
    return false;
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (containerRef.current?.querySelectorAll('.search-result').length) {
        gsap.fromTo('.search-result', 
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: 'power2.out' }
        );
      }
    }, containerRef);
    return () => ctx.revert();
  }, []); // Run only once on mount

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-8 px-4 relative">
      {/* Ambient glow */}
      <div className="ambient-glow w-48 h-48 bg-primary/10 top-0 right-0" />

      {/* Header */}
      <div className="flex justify-between items-center mb-6 px-2 relative z-10 md:hidden">
        <div className="flex items-center gap-2">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png?v=3`} 
            alt="Atchêi" 
            className="w-auto h-14 object-contain brightness-110 drop-shadow-sm" 
          />
        </div>
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

      <div className="relative mb-6 z-10">
        <Input 
          placeholder="Pesquisar..." 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 md:pl-12"
        />
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" size={18} />
      </div>

      <div className="flex gap-3 mb-6 overflow-x-auto pt-1 pb-2.5 px-4 -mx-4 scrollbar-hide relative z-10">
        <button 
          onClick={() => setActiveTab('eventos')}
          className={cn(
            "px-5 py-3 rounded-2xl font-display font-black text-xs uppercase tracking-wider whitespace-nowrap transition-all duration-300 border neo-click",
            activeTab === 'eventos' 
              ? "bg-gradient-to-r from-accent to-accentHover text-textDark border-accent/20 shadow-glow-accent scale-105" 
              : "bg-white/80 border-glassBorder text-textMuted hover:text-textLight hover:bg-surfaceHover hover:-translate-y-0.5"
          )}
        >
          Eventos
        </button>
        <button 
          onClick={() => setActiveTab('estabelecimentos')}
          className={cn(
            "px-5 py-3 rounded-2xl font-display font-black text-xs uppercase tracking-wider whitespace-nowrap transition-all duration-300 border neo-click",
            activeTab === 'estabelecimentos' 
              ? "bg-gradient-to-r from-accent to-accentHover text-textDark border-accent/20 shadow-glow-accent scale-105" 
              : "bg-white/80 border-glassBorder text-textMuted hover:text-textLight hover:bg-surfaceHover hover:-translate-y-0.5"
          )}
        >
          Estabelecimentos
        </button>
        <button 
          onClick={() => setActiveTab('atleticas')}
          className={cn(
            "px-5 py-3 rounded-2xl font-display font-black text-xs uppercase tracking-wider whitespace-nowrap transition-all duration-300 border neo-click",
            activeTab === 'atleticas' 
              ? "bg-gradient-to-r from-accent to-accentHover text-textDark border-accent/20 shadow-glow-accent scale-105" 
              : "bg-white/80 border-glassBorder text-textMuted hover:text-textLight hover:bg-surfaceHover hover:-translate-y-0.5"
          )}
        >
          Atléticas
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
        {activeTab === 'eventos' ? (
          <>
            {filteredEvents.map(event => (
              <div key={`evt-${event.id}`} className="search-result">
                <EventCard event={event} />
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <p className="text-center font-mono text-textMuted mt-10">Nenhum evento encontrado para "{query}"</p>
            )}
          </>
        ) : (
          <>
            {filteredProfiles.map(profile => (
              <div key={`prof-${profile.id}`} className="search-result">
                <ProfileCard profile={profile} />
              </div>
            ))}
            {filteredProfiles.length === 0 && (
              <p className="text-center font-mono text-textMuted mt-10">Nenhum perfil encontrado para "{query}"</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
