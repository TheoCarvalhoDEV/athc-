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
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-6 px-4 relative">
      {/* Ambient glow */}
      <div className="ambient-glow w-48 h-48 bg-primary/15 top-20 right-0" />

      <button 
        onClick={() => navigate(-1)} 
        title="Voltar"
        aria-label="Voltar"
        className="w-10 h-10 mb-6 rounded-2xl bg-surface/50 border border-glassBorder text-textLight flex items-center justify-center shadow-glass-shadow hover:border-primary/40 hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-300 neo-click cursor-pointer relative z-10"
      >
        <ArrowLeft size={18} />
      </button>

      {/* Profile Header */}
      <div className="agenda-header glass rounded-[2.5rem] p-8 text-textLight flex flex-col items-center text-center border border-glassBorder shadow-glass-shadow mb-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 to-primary/5 pointer-events-none" />
        
        {/* Avatar/Logo */}
        <div className="w-24 h-24 rounded-2xl bg-surface/40 border border-glassBorder flex items-center justify-center mb-4 overflow-hidden relative shadow-md shrink-0 z-10">
          {profile.imageUrl ? (
            <img src={profile.imageUrl} className="w-full h-full object-cover" alt={profile.name} />
          ) : profile.type === 'atletica' ? (
             <Users className="text-primary" size={36} />
          ) : (
             <Building2 className="text-primary" size={36} />
          )}
        </div>
        
        <h1 className="font-serifDisplay italic font-bold text-2xl mb-2 text-textLight tracking-wide z-10 leading-tight">{profile.name}</h1>
        <span className="font-mono text-[9px] text-accent bg-accent/10 border border-accent/20 px-3 py-1 font-bold uppercase tracking-widest rounded-full mb-4 inline-block z-10">
          {profile.type === 'atletica' ? 'Atlética' : 'Estabelecimento'}
        </span>
        
        {profile.description && (
          <p className="font-sans text-sm text-textMuted max-w-sm mb-5 leading-relaxed z-10">{profile.description}</p>
        )}

        {/* Redes Sociais */}
        {(profile.instagram || profile.email) && (
          <div className="flex justify-center gap-3.5 z-10">
            {profile.instagram && (
              <a
                href={`https://instagram.com/${profile.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-2xl bg-surface/50 border border-glassBorder hover:border-primary/40 hover:text-primary flex items-center justify-center shadow-glass-shadow hover:-translate-y-0.5 hover:shadow-glow-primary active:scale-95 transition-all duration-300 neo-click cursor-pointer"
                title="Instagram"
              >
                <InstagramIcon size={16} />
              </a>
            )}
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="w-10 h-10 rounded-2xl bg-surface/50 border border-glassBorder hover:border-primary/40 hover:text-primary flex items-center justify-center shadow-glass-shadow hover:-translate-y-0.5 hover:shadow-glow-primary active:scale-95 transition-all duration-300 neo-click cursor-pointer"
                title="E-mail"
              >
                <Mail size={16} />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="agenda-event flex items-center gap-2.5 px-1 mb-6 relative z-10">
        <div className="w-1 h-5 bg-gradient-to-b from-primary to-primaryHover rounded-full shadow-glow-primary" />
        <h2 className="font-serifDisplay italic font-semibold text-xl text-textLight">
          Agenda de Eventos
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
        {events.map((event) => (
          <div key={event.id} className="agenda-event">
            <EventCard event={event} />
          </div>
        ))}
        {events.length === 0 && (
          <div className="agenda-event flex flex-col items-center justify-center py-12 text-center text-textMuted bg-surface/20 border border-glassBorder rounded-3xl p-6">
            <p className="font-sans text-sm">Este perfil ainda não tem eventos agendados.</p>
          </div>
        )}
      </div>
    </div>
  );
};
