import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Ticket, Search, ArrowLeft, Calendar, CheckCircle2, QrCode, IdCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { TicketModal } from '../components/TicketModal';
import { formatCPF, isValidCPF } from '../lib/cpf';
import type { EventItem, Registration } from '../lib/storage';

type RecoveredTicket = { registration: Registration; event: EventItem };

const formatDateBR = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
};

export const RecuperarIngresso = () => {
  const navigate = useNavigate();
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tickets, setTickets] = useState<RecoveredTicket[]>([]);
  const [selected, setSelected] = useState<RecoveredTicket | null>(null);
  const [showTicket, setShowTicket] = useState(false);

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!isValidCPF(cpf)) {
      toast.error('Digite um CPF válido.');
      return;
    }

    setLoading(true);
    setSearched(false);
    try {
      const functions = getFunctions();
      const recuperar = httpsCallable(functions, 'recuperarIngressosPorCpf');
      const result = await recuperar({ cpf: cpf.replace(/\D/g, '') });
      const data = result.data as { ingressos?: RecoveredTicket[] };
      setTickets(data?.ingressos || []);
      setSearched(true);
    } catch (error: any) {
      console.error('Erro ao recuperar ingressos:', error);
      if (error?.code === 'functions/resource-exhausted') {
        toast.error('Muitas buscas seguidas. Aguarde um instante e tente de novo.');
      } else {
        toast.error('Não foi possível buscar agora. Tente novamente em instantes.');
      }
    } finally {
      setLoading(false);
    }
  };

  const abrirIngresso = (t: RecoveredTicket) => {
    setSelected(t);
    setShowTicket(true);
  };

  return (
    <div className="min-h-screen bg-background px-5 py-8 flex flex-col items-center">
      <div className="w-full max-w-md">
        {/* Voltar */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-textMuted hover:text-textLight text-sm font-medium mb-6 transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Voltar
        </button>

        {/* Cabeçalho */}
        <div className="text-center mb-7">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mb-4">
            <Ticket size={28} />
          </div>
          <h1 className="font-display font-semibold text-2xl text-textLight leading-tight">Recuperar ingresso</h1>
          <p className="text-sm text-textMuted mt-1.5 leading-relaxed">
            Comprou sem fazer login? Informe o <strong className="text-textLight">CPF</strong> usado na compra
            para acessar seus ingressos.
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleBuscar} className="surface rounded-2xl p-5 shadow-sm space-y-4">
          <Input
            label="CPF da compra"
            leftIcon={<IdCard size={18} />}
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(formatCPF(e.target.value))}
            maxLength={14}
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            className="rounded-xl py-3.5"
          >
            {!loading && <Search size={18} />}
            {loading ? 'Buscando…' : 'Buscar ingressos'}
          </Button>
        </form>

        {/* Resultados */}
        {searched && (
          <div className="mt-6">
            {tickets.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-textMuted/10 flex items-center justify-center mb-3">
                  <Search size={22} className="text-textMuted/50" />
                </div>
                <p className="text-sm text-textMuted">
                  Nenhum ingresso encontrado para este CPF. Confira se digitou o mesmo CPF usado na compra.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-textMuted px-1">
                  {tickets.length} ingresso{tickets.length !== 1 ? 's' : ''} encontrado{tickets.length !== 1 ? 's' : ''}
                </p>
                {tickets.map((t) => (
                  <button
                    key={t.registration.id}
                    onClick={() => abrirIngresso(t)}
                    className="w-full surface surface-hover rounded-2xl p-4 flex items-center gap-3 text-left cursor-pointer group"
                  >
                    <div className="w-11 h-11 shrink-0 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                      <QrCode size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display font-semibold text-sm text-textLight truncate">{t.event.title}</h3>
                      <div className="flex items-center gap-1.5 text-textMuted mt-0.5">
                        <Calendar size={12} />
                        <span className="text-xs">{formatDateBR(t.event.date)}</span>
                        {t.registration.ticketTypeName && (
                          <span className="text-xs truncate">· {t.registration.ticketTypeName}</span>
                        )}
                      </div>
                    </div>
                    {t.registration.checkedIn ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-textMuted bg-textMuted/10 px-2 py-1 rounded-lg">
                        <CheckCircle2 size={12} /> Usado
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 px-2 py-1 rounded-lg">
                        <CheckCircle2 size={12} /> Válido
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal do ingresso (reaproveita o componente padrão com QR + download) */}
      {selected && (
        <TicketModal
          isOpen={showTicket}
          onClose={() => setShowTicket(false)}
          event={selected.event}
          registration={selected.registration}
        />
      )}
    </div>
  );
};
