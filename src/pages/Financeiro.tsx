import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem, Pedido } from '../lib/storage';
import { DollarSign, TrendingUp, Ticket, RotateCcw, Wallet, ChevronRight } from 'lucide-react';
import gsap from 'gsap';

const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDateBR = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

// Soma a quantidade de ingressos de um pedido (lotes) ou 1 quando é lote único.
const countIngressos = (p: Pedido): number => {
  if (p.itensComprados && p.itensComprados.length > 0) {
    return p.itensComprados.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  }
  return 1;
};

type EventFinance = {
  event: EventItem;
  faturado: number;
  ingressos: number;
  pagos: number;
  estornado: number;
  pendentes: number;
};

const REFUND_STATUSES = ['estornado', 'chargeback', 'cancelado'];

export const Financeiro = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EventFinance[]>([]);

  const currentUser = storage.getCurrentUser();
  const userId = currentUser?.id;
  const role = currentUser?.role;

  const loadData = useCallback(async () => {
    if (!userId || (role !== 'partner' && role !== 'admin')) {
      navigate('/feed');
      return;
    }
    setLoading(true);
    try {
      const allEvents = await storage.getEvents();
      const targetId = currentUser?.profileId || userId;
      const myEvents = role === 'admin'
        ? allEvents
        : allEvents.filter(e => e.creatorId === targetId);

      const finances = await Promise.all(
        myEvents.map(async (event): Promise<EventFinance> => {
          // Ignora pedidos de teste (gerados por admin) para não poluir o faturamento real.
          const pedidos = (await storage.getPedidosForEvent(event.id)).filter(p => !p.isTeste);
          const pagos = pedidos.filter(p => p.status === 'pago');
          const estornos = pedidos.filter(p => REFUND_STATUSES.includes(p.status));
          return {
            event,
            faturado: pagos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0),
            ingressos: pagos.reduce((acc, p) => acc + countIngressos(p), 0),
            pagos: pagos.length,
            estornado: estornos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0),
            pendentes: pedidos.filter(p => p.status === 'pendente').length,
          };
        })
      );

      // Eventos com mais faturamento primeiro
      finances.sort((a, b) => b.faturado - a.faturado);
      setRows(finances);
    } catch (error) {
      console.error('Erro ao carregar dados financeiros:', error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!loading && containerRef.current) {
      const ctx = gsap.context(() => {
        if (containerRef.current?.querySelectorAll('.fin-anim').length) {
          gsap.from('.fin-anim', { y: 20, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power2.out' });
        }
      }, containerRef);
      return () => ctx.revert();
    }
  }, [loading]);

  const totalFaturado = rows.reduce((acc, r) => acc + r.faturado, 0);
  const totalIngressos = rows.reduce((acc, r) => acc + r.ingressos, 0);
  const totalEstornado = rows.reduce((acc, r) => acc + r.estornado, 0);
  const ticketMedio = totalIngressos > 0 ? totalFaturado / totalIngressos : 0;

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-8 px-4 relative">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-6 fin-anim relative z-10 text-left">
        <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center border border-primary/20">
          <Wallet size={22} />
        </div>
        <div>
          <h1 className="font-display font-semibold text-2xl text-textLight leading-tight">Painel financeiro</h1>
          <p className="text-xs font-medium text-textMuted mt-0.5">Vendas e faturamento dos seus eventos</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-primary gap-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="font-sans text-xs text-textMuted">Calculando faturamento…</span>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3.5 mb-6 relative z-10 text-left">
            <div className="surface p-4 rounded-2xl shadow-sm fin-anim">
              <div className="flex items-center gap-2 text-success mb-2">
                <DollarSign size={15} />
                <span className="text-xs font-medium text-textMuted">Total faturado</span>
              </div>
              <span className="font-display text-2xl font-semibold text-textLight leading-none">{formatBRL(totalFaturado)}</span>
            </div>
            <div className="surface p-4 rounded-2xl shadow-sm fin-anim">
              <div className="flex items-center gap-2 text-accent mb-2">
                <Ticket size={15} />
                <span className="text-xs font-medium text-textMuted">Ingressos vendidos</span>
              </div>
              <span className="font-display text-2xl font-semibold text-textLight leading-none">{totalIngressos}</span>
            </div>
            <div className="surface p-4 rounded-2xl shadow-sm fin-anim">
              <div className="flex items-center gap-2 text-primary mb-2">
                <TrendingUp size={15} />
                <span className="text-xs font-medium text-textMuted">Ticket médio</span>
              </div>
              <span className="font-display text-2xl font-semibold text-textLight leading-none">{formatBRL(ticketMedio)}</span>
            </div>
            <div className="surface p-4 rounded-2xl shadow-sm fin-anim">
              <div className="flex items-center gap-2 text-danger mb-2">
                <RotateCcw size={15} />
                <span className="text-xs font-medium text-textMuted">Estornado</span>
              </div>
              <span className="font-display text-2xl font-semibold text-textLight leading-none">{formatBRL(totalEstornado)}</span>
            </div>
          </div>

          {/* Breakdown por evento */}
          <div className="flex items-center gap-2.5 mb-4 fin-anim relative z-10">
            <div className="w-1 h-5 bg-primary/40 rounded-full" />
            <h2 className="font-display text-lg font-semibold text-textLight">Faturamento por evento</h2>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4 fin-anim">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Wallet size={24} className="text-primary/40" />
              </div>
              <p className="font-sans text-textMuted text-sm">Você ainda não possui eventos com vendas.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
              {rows.map(({ event, faturado, ingressos, pagos, estornado, pendentes }) => (
                <button
                  key={event.id}
                  onClick={() => navigate(`/event/${event.id}`)}
                  className="surface surface-hover p-5 rounded-2xl flex flex-col gap-3.5 fin-anim shadow-sm text-left cursor-pointer group"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-base text-textLight truncate">{event.title}</h3>
                      <p className="text-xs text-textMuted mt-1.5">{formatDateBR(event.date)}</p>
                    </div>
                    <ChevronRight size={16} className="text-textMuted group-hover:text-primary transition-colors shrink-0 mt-1" />
                  </div>

                  <div className="flex items-end justify-between pt-3 border-t border-glassBorder">
                    <div>
                      <p className="text-[11px] text-textMuted font-medium">Faturado</p>
                      <p className="font-display text-xl font-semibold text-success leading-tight">{formatBRL(faturado)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-textMuted font-medium">Ingressos</p>
                      <p className="font-mono text-sm font-bold text-accent">{ingressos}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-success/10 text-success border border-success/20">
                      {pagos} pago{pagos !== 1 ? 's' : ''}
                    </span>
                    {pendentes > 0 && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                        {pendentes} pendente{pendentes !== 1 ? 's' : ''}
                      </span>
                    )}
                    {estornado > 0 && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-danger/10 text-danger border border-danger/20">
                        {formatBRL(estornado)} estornado
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-[11px] text-textMuted/70 mt-6 text-center fin-anim leading-relaxed max-w-md mx-auto">
            Os valores consideram apenas pagamentos via Pix processados pelo sistema. Cortesias e vendas manuais
            (dinheiro/Pix manual) não entram no faturamento.
          </p>
        </>
      )}
    </div>
  );
};
