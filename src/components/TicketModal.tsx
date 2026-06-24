import { X, Calendar, Clock, MapPin, Download, CheckCircle2 } from 'lucide-react';
import type { EventItem, Registration } from '../lib/storage';
import { makeTicketCode } from '../lib/ticketCode';

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventItem;
  registration: Registration;
}

export const TicketModal = ({ isOpen, onClose, event, registration }: TicketModalProps) => {
  if (!isOpen) return null;

  const formatDateBR = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch {
      return dateStr;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(registration.id)}&color=1c1917&bgcolor=ffffff`;
  const shortCode = makeTicketCode(registration.id);

  return (
    <div className="fixed inset-0 z-[100] modal-backdrop flex items-center justify-center p-4">
      <div className="glass rounded-[2.5rem] p-6 md:p-8 max-w-2xl w-full relative flex flex-col max-h-[90vh] overflow-y-auto border border-glassBorder/80 backdrop-blur-3xl shadow-float bg-surface/98 text-left animate-in zoom-in duration-300">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 bg-surface/50 border border-glassBorder rounded-xl text-textLight hover:bg-surfaceHover hover:border-primary/40 active:scale-95 transition-all duration-300 cursor-pointer neo-click z-10"
          title="Fechar"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        <div className="text-center mb-6">
          <span className="text-xs text-stone-400 font-medium block mb-1">
            Seu ingresso oficial
          </span>
          <h2 className="font-display italic font-semibold text-2xl text-textLight">Presença confirmada</h2>
        </div>

        {/* Real Ticket Card (with cutouts) — `printable-ticket` isola este card na impressão */}
        <div className="printable-ticket relative bg-[#FCFAF7] border border-stone-200/80 rounded-[2rem] overflow-hidden flex flex-col md:flex-row shadow-glass-shadow text-stone-900 mb-6 print:border-none print:shadow-none">
          {/* Half circles cutouts on the sides for ticket styling */}
          <div className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 rounded-full bg-[#FCFAF7] border border-stone-200/80 hidden md:block z-20 shadow-inner" style={{ clipPath: 'polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%)' }} />
          <div className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 rounded-full bg-[#FCFAF7] border border-stone-200/80 hidden md:block z-20 shadow-inner" style={{ clipPath: 'polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%)' }} />

          {/* Left part: Info */}
          <div className="flex-1 p-6 md:p-8 space-y-5 flex flex-col justify-between">
            <div>
              <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-medium px-3 py-1 rounded-full inline-block mb-3">
                {registration.ticketTypeName || 'Ingresso comum'}
              </span>
              <h3 className="font-display font-semibold text-xl md:text-2xl text-stone-900 leading-tight mb-2">
                {event.title}
              </h3>
              <p className="text-xs text-stone-500">
                Código: <span className="font-semibold tracking-wider text-stone-700">{shortCode}</span>
              </p>
            </div>

            <div className="space-y-3 pt-3 border-t border-stone-200">
              <div className="flex items-center gap-2 text-stone-700">
                <Calendar size={15} className="text-primary shrink-0" />
                <span className="text-xs font-sans font-medium">{formatDateBR(event.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-stone-700">
                <Clock size={15} className="text-primary shrink-0" />
                <span className="text-xs font-sans font-medium">{event.time}h</span>
              </div>
              <div className="flex items-center gap-2 text-stone-700">
                <MapPin size={15} className="text-accent shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-sans font-medium truncate">{event.location}</p>
                  {event.address && <p className="text-[10px] text-stone-500 truncate">{event.address}</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-stone-200 text-left">
              <div>
                <span className="text-[10px] font-medium text-stone-400 block">Portador</span>
                <span className="text-xs font-sans font-semibold text-stone-850 truncate block">{registration.userName}</span>
              </div>
              <div>
                <span className="text-[10px] font-medium text-stone-400 block">CPF</span>
                <span className="text-xs font-mono font-semibold text-stone-850 truncate block">
                  {registration.userCpf ? registration.userCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Dotted separator line */}
          <div className="w-full h-[1px] md:w-[1px] md:h-auto border-t-2 md:border-t-0 md:border-l-2 border-dashed border-stone-300 relative flex items-center justify-center">
            {/* Notch circles for mobile stack separator */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-6 h-6 rounded-full bg-background border border-stone-200/80 md:hidden" />
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 w-6 h-6 rounded-full bg-background border border-stone-200/80 md:hidden" />
          </div>

          {/* Right part: QR Code / Stub */}
          <div className="w-full md:w-56 p-6 md:p-8 bg-stone-50/50 flex flex-col items-center justify-center text-center">
            <div className="bg-white p-3 rounded-2xl border border-stone-200 shadow-sm mb-3">
              <img
                src={qrCodeUrl}
                alt="QR Code de validação do ingresso"
                className="w-32 h-32 md:w-36 md:h-36 object-contain"
              />
            </div>
            <span className="text-[10px] font-medium text-stone-400 block">
              Status do ingresso
            </span>
            <span className="text-xs font-semibold text-success mt-1 inline-flex items-center gap-1">
              <CheckCircle2 size={14} />
              {registration.paymentStatus || 'Pago'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handlePrint}
            className="flex-1 py-3.5 rounded-xl border border-glassBorder bg-surface/50 text-textLight font-sans font-semibold text-sm hover:bg-surfaceHover active:scale-95 transition-all duration-300 neo-click cursor-pointer flex items-center justify-center gap-2"
          >
            <Download size={14} />
            Imprimir / Salvar PDF
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl bg-primary text-textDark border border-primary/20 font-sans font-semibold text-sm hover:bg-primaryHover active:scale-95 transition-all duration-300 neo-click cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
