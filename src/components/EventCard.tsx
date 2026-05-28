import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EventItem } from '../lib/storage';
import { Navigation, Clock, MapPin, ExternalLink, Ticket, ArrowRight } from 'lucide-react';

interface EventCardProps {
  event: EventItem;
  variant?: 'default' | 'highlight';
}

export const EventCard = ({ event, variant = 'default' }: EventCardProps) => {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);


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
      <div className="relative min-w-[260px] max-w-[260px] h-[180px] rounded-[1.5rem] overflow-hidden shadow-lg press-effect cursor-pointer shrink-0 group"
        onClick={() => navigate(`/event/${event.id}`)}>
        {/* Background */}
        {event.mediaUrls && event.mediaUrls.length > 0 && !imageError ? (
          <img 
            src={event.mediaUrls[0]} 
            alt={event.title} 
            className="absolute inset-0 w-full h-full object-cover" 
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-primary/60" />
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />



        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-sans font-bold text-base text-white leading-tight truncate drop-shadow-lg">
            {event.title}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <Clock size={12} className="text-accent" />
            <span className="font-mono text-[10px] text-white/90 font-bold">{event.date} {event.time}</span>
            <span className="text-white/40">·</span>
            <MapPin size={12} className="text-accent" />
            <span className="font-mono text-[10px] text-white/80 truncate">{event.location}</span>
          </div>
        </div>

        {/* Shimmer effect */}
        <div className="absolute inset-0 shimmer pointer-events-none" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-background border border-primary/15 rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col press-effect">
        {/* Image Section */}
        <div className="h-44 relative overflow-hidden cursor-pointer" onClick={() => navigate(`/event/${event.id}`)}>
          {event.mediaUrls && event.mediaUrls.length > 0 && !imageError ? (
            <img 
              src={event.mediaUrls[0]} 
              alt={event.title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#E6DCCF] via-[#DDD0BF] to-[#D4C4AD] flex items-center justify-center">
              <img 
                src={`${import.meta.env.BASE_URL}placeholder-logo.png`} 
                alt="Atchêi" 
                className="w-20 h-20 object-contain opacity-35" 
              />
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />



          {/* Time badge top right */}
          <div className="absolute top-3 right-3">
            <div className="bg-background/80 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5 border border-primary/10">
              <Clock size={12} className="text-primary" />
              <span className="font-mono text-[10px] font-bold text-primary">{event.date} {event.time}</span>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="p-4 -mt-3 bg-background rounded-t-[1.2rem] relative z-10 border-t border-primary/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-sans font-bold text-lg text-textDark leading-tight truncate">
                {event.title}
              </h3>

              {/* Location - clickable for maps */}
              <button
                onClick={(e) => { e.stopPropagation(); openMaps(); }}
                className="mt-2 flex items-center gap-1.5 text-primary/80 hover:text-primary transition-colors group/loc cursor-pointer"
              >
                <MapPin size={14} className="shrink-0" />
                <span className="font-mono text-xs truncate group-hover/loc:underline">{event.location}</span>
                <ExternalLink size={10} className="shrink-0 opacity-0 group-hover/loc:opacity-100 transition-opacity" />
              </button>

              {event.address && (
                <button
                  onClick={(e) => { e.stopPropagation(); openMaps(); }}
                  className="mt-1 flex items-center gap-1.5 text-textDark/50 hover:text-primary/70 transition-colors group/addr cursor-pointer"
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
                className="w-9 h-9 rounded-full bg-green-500/15 text-green-600 flex items-center justify-center hover:bg-green-500 hover:text-white transition-all beat-hover"
                title="Comprar Ingresso"
              >
                <Ticket size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openMaps(); }}
                className="w-9 h-9 rounded-full bg-accent/15 text-accent flex items-center justify-center hover:bg-accent hover:text-white transition-all beat-hover"
                title="Como chegar"
              >
                <Navigation size={16} />
              </button>
              <button
                onClick={() => navigate(`/event/${event.id}`)}
                className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-textLight transition-all"
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
