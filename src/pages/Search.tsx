import { useState, useEffect, useRef } from 'react';
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
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-8 px-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 px-2">
        <div className="flex items-center gap-3">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png?v=3`} 
            alt="Atchê" 
            className="w-12 h-12 object-contain mix-blend-multiply" 
          />
          <h1 className="font-brand text-3xl text-primary font-bold tracking-tight">Atchê</h1>
        </div>
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-textLight flex items-center justify-center shadow-lg text-sm font-bold overflow-hidden">
          {user?.imageUrl ? (
            <img src={user.imageUrl} className="w-full h-full object-cover" alt={user.name} />
          ) : (
            user?.name?.charAt(0).toUpperCase() || 'U'
          )}
        </div>
      </div>

      <div className="relative mb-6">
        <Input 
          placeholder="Pesquisar..." 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12"
        />
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        <button 
          onClick={() => setActiveTab('eventos')}
          className={cn(
            "px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-colors",
            activeTab === 'eventos' ? "bg-primary text-textLight" : "bg-primary/10 text-primary"
          )}
        >
          Eventos
        </button>
        <button 
          onClick={() => setActiveTab('estabelecimentos')}
          className={cn(
            "px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-colors",
            activeTab === 'estabelecimentos' ? "bg-primary text-textLight" : "bg-primary/10 text-primary"
          )}
        >
          Estabelecimentos
        </button>
        <button 
          onClick={() => setActiveTab('atleticas')}
          className={cn(
            "px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-colors",
            activeTab === 'atleticas' ? "bg-primary text-textLight" : "bg-primary/10 text-primary"
          )}
        >
          Atléticas
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {activeTab === 'eventos' ? (
          <>
            {filteredEvents.map(event => (
              <div key={`evt-${event.id}`} className="search-result">
                <EventCard event={event} />
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <p className="text-center font-mono text-textDark/50 mt-10">Nenhum evento encontrado para "{query}"</p>
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
              <p className="text-center font-mono text-textDark/50 mt-10">Nenhum perfil encontrado para "{query}"</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
