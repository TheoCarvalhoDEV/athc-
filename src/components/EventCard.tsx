import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EventItem } from '../lib/storage';
import { storage } from '../lib/storage';
import { Navigation, Trash2, Clock, MapPin, ExternalLink, Ticket, ArrowRight } from 'lucide-react';

interface EventCardProps {
  event: EventItem;
  onDelete?: (id: string) => void;
  variant?: 'default' | 'highlight';
}

export const EventCard = ({ event, onDelete, variant = 'default' }: EventCardProps) => {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const openMaps = () => {
    const query = event.address || event.location;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
  };

  const openWhatsApp = () => {
    const message = `Olá! Gostaria de comprar ingresso para o evento *${event.title}* (${event.time} - ${event.location}).`;
    const url = `https://wa.me/5565996097252?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleDelete = () => {
    storage.deleteEvent(event.id);
    onDelete?.(event.id);
    setShowDeleteConfirm(false);
  };



  if (variant === 'highlight') {
    return (
      <div className="relative min-w-[260px] max-w-[260px] h-[180px] rounded-[1.5rem] overflow-hidden shadow-lg press-effect cursor-pointer shrink-0 group"
        onClick={() => navigate(`/event/${event.id}`)}>
        {/* Background */}
        {event.mediaUrls && event.mediaUrls.length > 0 ? (
          <img src={event.mediaUrls[0]} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-primary/60" />
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Badge */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="badge-open">
            Aberto
          </span>
          {event.mediaUrls && event.mediaUrls.length > 1 && (
            <span className="bg-black/40 backdrop-blur-sm rounded-full px-2 py-0.5 text-[9px] font-bold text-white flex items-center gap-1 border border-white/10 shadow-md">
              📸 {event.mediaUrls.length}
            </span>
          )}
        </div>

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
          {event.mediaUrls && event.mediaUrls.length > 0 ? (
            <img src={event.mediaUrls[0]} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#E6DCCF] via-[#DDD0BF] to-[#D4C4AD] flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <div className="w-8 h-8 border-b-4 border-primary rounded-b-full opacity-40"></div>
              </div>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

          {/* Badge */}
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="badge-open">
              Aberto
            </span>
            {event.mediaUrls && event.mediaUrls.length > 1 && (
              <span className="bg-background/80 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-bold text-primary border border-primary/10 flex items-center gap-1 shadow-sm">
                📸 {event.mediaUrls.length}
              </span>
            )}
          </div>

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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] modal-backdrop flex items-center justify-center p-6" onClick={() => setShowDeleteConfirm(false)}>
          <div
            className="bg-background rounded-[1.5rem] p-6 max-w-sm w-full shadow-2xl border border-primary/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h3 className="font-sans font-bold text-lg text-textDark mb-2">Excluir evento?</h3>
              <p className="font-sans text-sm text-textDark/60 mb-6">
                Tem certeza que deseja excluir <span className="font-bold text-textDark">"{event.title}"</span>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-full border-2 border-primary/20 text-textDark font-bold text-sm hover:bg-primary/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-3 rounded-full bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors beat-hover"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
