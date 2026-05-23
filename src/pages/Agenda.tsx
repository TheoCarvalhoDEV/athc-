import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem, AppProfile } from '../lib/storage';
import { EventCard } from '../components/EventCard';
import gsap from 'gsap';
import { ArrowLeft, Building2, Users, Mail } from 'lucide-react';
import { InstagramIcon } from '../components/InstagramIcon';

export const Agenda = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    const loadData = async () => {
      if (id) {
        try {
          const p = await storage.getProfileById(id);
          if (p) {
            setProfile(p);
            const profileEvents = await storage.getAgendaByProfileId(id);
            setEvents(profileEvents);
          }
        } catch (error) {
          console.error("Erro ao carregar agenda:", error);
        }
      }
    };
    loadData();
  }, [id]);

  useEffect(() => {
    if (profile) {
      const ctx = gsap.context(() => {
        gsap.from('.agenda-header', { y: -20, opacity: 0, duration: 0.5, ease: 'power2.out' });
        gsap.from('.agenda-event', { y: 20, opacity: 0, duration: 0.4, stagger: 0.1, ease: 'power2.out', delay: 0.2 });
      }, containerRef);
      return () => ctx.revert();
    }
  }, [profile, events]);

  if (!profile) {
    return <div className="min-h-screen bg-background flex items-center justify-center p-4 text-center text-primary font-mono">Carregando perfil...</div>;
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-6 px-4">
      
      <button onClick={() => navigate(-1)} className="w-10 h-10 mb-4 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-textLight transition-colors">
        <ArrowLeft size={20} />
      </button>

      {/* Profile Header */}
      <div className="agenda-header bg-gradient-to-br from-primary to-primary/80 rounded-[2rem] p-8 text-textLight flex flex-col items-center text-center shadow-2xl mb-8 relative overflow-hidden inner-glow">
        <div className="absolute inset-0 shimmer pointer-events-none opacity-20" />
        
        {/* Avatar/Logo */}
        <div className="w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center mb-4 overflow-hidden relative shadow-lg shrink-0 z-10">
          {profile.imageUrl ? (
            <img src={profile.imageUrl} className="w-full h-full object-cover" alt={profile.name} />
          ) : profile.type === 'atletica' ? (
             <Users className="text-textLight" size={40} />
          ) : (
             <Building2 className="text-textLight" size={40} />
          )}
        </div>
        
        <h1 className="font-sans text-3xl font-bold mb-1 leading-tight z-10">{profile.name}</h1>
        <p className="font-mono text-xs opacity-75 uppercase tracking-wider mb-3 z-10 px-3 py-1 bg-white/10 rounded-full border border-white/5">
          {profile.type === 'atletica' ? 'Atlética' : 'Estabelecimento'}
        </p>
        
        {profile.description && (
          <p className="font-sans text-sm opacity-90 max-w-sm mb-4 leading-relaxed z-10">{profile.description}</p>
        )}

        {/* Redes Sociais */}
        {(profile.instagram || profile.email) && (
          <div className="flex justify-center gap-3 z-10">
            {profile.instagram && (
              <a
                href={`https://instagram.com/${profile.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 hover:bg-white/25 text-textLight flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-md"
                title="Instagram"
              >
                <InstagramIcon size={18} />
              </a>
            )}
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 hover:bg-white/25 text-textLight flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-md"
                title="E-mail"
              >
                <Mail size={18} />
              </a>
            )}
          </div>
        )}
      </div>

      <h2 className="agenda-event font-sans text-xl font-bold text-textDark mb-4 pl-2 border-l-4 border-primary">
        Agenda de Eventos
      </h2>

      <div className="flex flex-col gap-2">
        {events.map((event) => (
          <div key={event.id} className="agenda-event">
            <EventCard event={event} />
          </div>
        ))}
        {events.length === 0 && (
          <p className="agenda-event text-center font-mono text-textDark/50 mt-10">Este perfil ainda não tem eventos agendados.</p>
        )}
      </div>
    </div>
  );
};
