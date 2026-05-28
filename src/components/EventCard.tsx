import { useNavigate } from 'react-router-dom';
import type { EventItem } from '../lib/storage';
import { Navigation, Clock, MapPin, ExternalLink, Ticket, ArrowRight } from 'lucide-react';
import { isVideoUrl } from '../lib/imageUtils';

const formatCardDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

interface EventCardProps {
  event: EventItem;
  variant?: 'default' | 'highlight';
}

export const EventCard = ({ event, variant = 'default' }: EventCardProps) => {
  const navigate = useNavigate();


  const openMaps = () => {
    const query = event.address || event.location;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
  };

  const openWhatsApp = () => {
    const contacts = event.whatsappContacts && event.whatsappContacts.length > 0
      ? event.whatsappContacts
      : (event.whatsappNumber ? [{ name: event.whatsappName || '', phone: event.whatsappNumber }] : []);
    const contact = contacts[0];
    if (!contact) return;
    const cleanPhone = contact.phone.replace(/\D/g, '');
    const message = `Olá${contact.name ? ` ${contact.name}` : ''}! Gostaria de comprar ingresso para o evento *${event.title}* (${event.time} - ${event.location}).`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };



  if (variant === 'highlight') {
    return (
      <div className="relative min-w-[260px] max-w-[260px] h-[180px] rounded-3xl overflow-hidden border border-glassBorder shadow-glass-shadow hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow-primary transition-all duration-300 cursor-pointer shrink-0 group text-left"
        onClick={() => navigate(`/event/${event.id}`)}>
        {/* Background */}
        {event.mediaUrls && event.mediaUrls.length > 0 ? (
          isVideoUrl(event.mediaUrls[0]) ? (
            <video
              src={event.mediaUrls[0]}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              muted
              loop
              playsInline
              autoPlay
            />
          ) : (
            <img src={event.mediaUrls[0]} alt={event.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          )
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-surface" />
        )}

        {/* Gradient Overlay - Dark Shadow (no white fade) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent z-10" />

        {/* Badge de quantidade de mídias removido */}

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
          <h3 className="font-serifDisplay font-extrabold text-base text-white leading-tight truncate uppercase tracking-wider">
            {event.title}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <Clock size={12} className="text-white/70" />
            <span className="font-mono text-[10px] text-white/95 font-bold">{formatCardDate(event.date)} {event.time}</span>
            <span className="text-white/30">·</span>
            <MapPin size={12} className="text-white/70" />
            <span className="font-mono text-[10px] text-white/90 truncate">{event.location}</span>
          </div>
        </div>

        {/* Shimmer effect */}
        <div className="absolute inset-0 shimmer pointer-events-none z-20" />
      </div>
    );
  }

  return (
    <>
      <div className="glass border border-glassBorder rounded-3xl overflow-hidden shadow-glass-shadow hover:border-primary/30 hover:shadow-glow-primary hover:-translate-y-1 transition-all duration-300 flex flex-col group text-left">
        {/* Image Section */}
        <div className="h-44 relative overflow-hidden cursor-pointer" onClick={() => navigate(`/event/${event.id}`)}>
          {event.mediaUrls && event.mediaUrls.length > 0 ? (
            isVideoUrl(event.mediaUrls[0]) ? (
              <video
                src={event.mediaUrls[0]}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                muted
                loop
                playsInline
                autoPlay
              />
            ) : (
              <img src={event.mediaUrls[0]} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            )
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-surface via-surfaceHover to-surface flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <div className="w-8 h-8 border-b-2 border-primary rounded-b-full opacity-40"></div>
              </div>
            </div>
          )}

          {/* Badge de quantidade de mídias removido */}

          {/* Time badge top right */}
          <div className="absolute top-3 right-3">
            <div className="glass border border-glassBorder rounded-lg px-3 py-1 flex items-center gap-1.5 backdrop-blur-md">
              <Clock size={12} className="text-primary" />
              <span className="font-mono text-[10px] font-bold text-textLight">{formatCardDate(event.date)} {event.time}</span>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="p-4 relative z-10 border-t border-glassBorder bg-surface/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-serifDisplay font-extrabold text-lg text-textLight leading-tight truncate uppercase tracking-wider">
                {event.title}
              </h3>

              {/* Location - clickable for maps */}
              <button
                onClick={(e) => { e.stopPropagation(); openMaps(); }}
                className="mt-2 flex items-center gap-1.5 text-accent hover:text-accentHover transition-colors group/loc cursor-pointer"
              >
                <MapPin size={14} className="shrink-0" />
                <span className="font-mono text-xs truncate group-hover/loc:underline">{event.location}</span>
                <ExternalLink size={10} className="shrink-0 opacity-0 group-hover/loc:opacity-100 transition-opacity" />
              </button>

              {event.address && (
                <button
                  onClick={(e) => { e.stopPropagation(); openMaps(); }}
                  className="mt-1 flex items-center gap-1.5 text-textMuted hover:text-textLight transition-colors group/addr cursor-pointer"
                >
                  <span className="font-mono text-[11px] truncate max-w-[200px] group-hover/addr:underline">
                    📍 {event.address}
                  </span>
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); openWhatsApp(); }}
                className="w-9 h-9 rounded-xl bg-success/10 text-success border border-success/20 flex items-center justify-center hover:bg-success hover:text-textDark hover:shadow-glow-success transition-all duration-300 neo-click cursor-pointer"
                title="Comprar Ingresso"
              >
                <Ticket size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openMaps(); }}
                className="w-9 h-9 rounded-xl bg-accent/10 text-accent border border-accent/20 flex items-center justify-center hover:bg-accent hover:text-textDark hover:shadow-glow-accent transition-all duration-300 neo-click cursor-pointer"
                title="Como chegar"
              >
                <Navigation size={16} />
              </button>
              <button
                onClick={() => navigate(`/event/${event.id}`)}
                className="w-9 h-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center hover:bg-primary hover:text-textDark hover:shadow-glow-primary transition-all duration-300 neo-click cursor-pointer"
                title="Ver Detalhes"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
