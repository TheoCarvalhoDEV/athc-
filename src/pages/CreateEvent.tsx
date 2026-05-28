import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem } from '../lib/storage';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  ArrowLeft, Image as ImageIcon, Clock, MapPin, FileText, X,
  CalendarPlus, Users2, CheckCircle, Upload, Plus, Trash2, AlertTriangle
} from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../contexts/AuthContext';
import { compressImage, dataURLtoBlob, isVideoUrl } from '../lib/imageUtils';
import { cn } from '../lib/utils';

interface WhatsAppContact {
  name: string;
  phone: string;
}

export const CreateEvent = () => {
  const { id: editId } = useParams();
  const isEdit = !!editId;
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [publicType, setPublicType] = useState<'Aberto' | 'Geral' | 'Universitário'>('Aberto');
  const [hasTickets, setHasTickets] = useState(false);
  const [ticketPrice, setTicketPrice] = useState('');
  const [whatsappContacts, setWhatsappContacts] = useState<WhatsAppContact[]>([{ name: '', phone: '' }]);
  const [hasPixTickets, setHasPixTickets] = useState(false);
  const [pixTicketPrice, setPixTicketPrice] = useState('');
  const [isTestEvent, setIsTestEvent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Media / Upload state
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        try {
          if (file.type.startsWith('video/')) {
            // Upload direto para o Storage sem compressão para arquivos de vídeo
            return await storage.uploadFile(file, 'events');
          } else {
            // Comprime e faz upload se for imagem
            const compressed = await compressImage(file, 1200, 1200, 0.8);
            if (compressed) {
              const blob = dataURLtoBlob(compressed);
              const compressedFile = new File([blob], `event_${Date.now()}_${file.name}`, { type: 'image/jpeg' });
              return await storage.uploadFile(compressedFile, 'events');
            }
          }
          return '';
        } catch (uploadError) {
          console.error("Erro ao fazer upload da mídia:", uploadError);
          return '';
        }
      });
      
      const urls = await Promise.all(uploadPromises);
      const validUrls = urls.filter(url => url !== '');
      setMediaUrls(prev => [...prev, ...validUrls]);
    } catch (error) {
      console.error("Erro no upload de mídia:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const addContact = () => {
    setWhatsappContacts(prev => [...prev, { name: '', phone: '' }]);
  };

  const removeContact = (index: number) => {
    if (whatsappContacts.length <= 1) return;
    setWhatsappContacts(prev => prev.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: 'name' | 'phone', value: string) => {
    setWhatsappContacts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const loadEventForEdit = useCallback(async () => {
    if (editId) {
      const events = await storage.getEvents();
      const event = events.find(e => e.id === editId);
      if (event) {
        setTitle(event.title);
        setDescription(event.description || '');
        setDate(event.date);
        setTime(event.time);
        setLocation(event.location);
        setAddress(event.address || '');
        setPublicType(event.publicType as 'Aberto' | 'Geral' | 'Universitário');
        setHasTickets(event.hasTickets || false);
        setTicketPrice(event.ticketPrice || '');
        setHasPixTickets(event.hasPixTickets || false);
        setPixTicketPrice(event.pixTicketPrice || '');
        setIsTestEvent(event.isTestEvent || false);
        setMediaUrls(event.mediaUrls || []);
        if (event.whatsappContacts && event.whatsappContacts.length > 0) {
          setWhatsappContacts(event.whatsappContacts);
        } else if (event.whatsappNumber) {
          setWhatsappContacts([{ name: (event as any).whatsappName || '', phone: event.whatsappNumber }]);
        }
      }
    }
  }, [editId]);

  useEffect(() => {
    loadEventForEdit();
  }, [loadEventForEdit]);

  useEffect(() => {
    if (containerRef.current) {
      const ctx = gsap.context(() => {
        gsap.from('.create-anim', {
          y: 25,
          opacity: 0,
          duration: 0.6,
          stagger: 0.08,
          ease: 'expo.out',
        });
      }, containerRef);
      return () => ctx.revert();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const creatorId = user?.profileId || user?.id || 'admin';

    const eventData: EventItem = {
      id: editId || Date.now().toString(),
      title,
      description,
      date,
      time,
      location,
      address,
      publicType,
      hasTickets,
      ticketPrice,
      whatsappNumber: whatsappContacts[0]?.phone || '',
      whatsappContacts: whatsappContacts.filter(c => c.phone !== ''),
      hasPixTickets: user?.role === 'admin' ? hasPixTickets : false,
      pixTicketPrice: user?.role === 'admin' ? pixTicketPrice : '',
      creatorId,
      isTestEvent: user?.role === 'admin' ? isTestEvent : false,
      mediaUrls,
      registrationCount: 0,
    };

    try {
      await storage.saveEvent(eventData);
      navigate('/profile');
    } catch (error) {
      console.error("Erro ao salvar evento:", error);
      alert("Erro ao salvar evento. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-6 px-4 relative">
      {/* Ambient glow */}
      <div className="ambient-glow w-48 h-48 bg-primary/10 top-0 right-0" />

      <button onClick={() => navigate(-1)} className="w-10 h-10 mb-6 rounded-2xl bg-surface/50 border border-glassBorder text-textLight flex items-center justify-center shadow-glass-shadow hover:border-primary/40 hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-300 neo-click cursor-pointer relative z-10">
        <ArrowLeft size={18} />
      </button>

      <div className="max-w-2xl mx-auto">
        <div className="create-anim flex items-center gap-3.5 mb-6 relative z-10 text-left">
        <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center border border-accent/20 shadow-glow-accent">
          <CalendarPlus size={22} />
        </div>
        <div>
          <h1 className="font-serifDisplay italic font-bold text-2xl text-textLight tracking-wide leading-tight">
            {isEdit ? 'Editar Evento' : 'Criar Evento'}
          </h1>
          <p className="text-xs text-textMuted font-mono uppercase mt-0.5 font-bold">Configure os detalhes do seu rolê</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
        {/* Media Upload */}
        <div className="create-anim space-y-2 text-left">
          <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
            <ImageIcon size={12} />
            Fotos do Evento
          </label>
          <div className="grid grid-cols-3 gap-3">
            {mediaUrls.map((url, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-surface/50 border border-glassBorder shadow-glass-shadow relative overflow-hidden group">
                {isVideoUrl(url) ? (
                  <video src={url} className="w-full h-full object-cover" muted playsInline />
                ) : (
                  <img src={url} alt={`Mídia ${i + 1}`} className="w-full h-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  className="absolute top-2 right-2 w-6 h-6 bg-danger text-textLight border border-danger/20 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer duration-300"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <label className="aspect-square rounded-2xl bg-surfaceHover/50 border border-dashed border-primary/45 flex flex-col items-center justify-center text-textMuted cursor-pointer hover:border-accent/60 hover:text-accent transition-all duration-300 hover:bg-surfaceHover">
              {isUploading ? (
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Upload size={20} className="text-primary" />
                  <span className="text-[10px] font-mono font-bold mt-1 uppercase">Upload</span>
                </>
              )}
              <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleMediaUpload} disabled={isUploading} />
            </label>
          </div>
        </div>

        {/* Title */}
        <div className="create-anim space-y-1 text-left">
          <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
            <FileText size={12} />
            Nome do Evento
          </label>
          <Input required placeholder="Ex: Sunset Party" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        {/* Description */}
        <div className="create-anim space-y-1 text-left">
          <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 tracking-wider">Descrição</label>
          <textarea
            placeholder="Descreva o evento..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full min-h-[120px] bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 py-3 text-sm font-sans text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all duration-300 resize-none placeholder:text-textMuted/50"
          />
        </div>

        {/* Date & Time */}
        <div className="create-anim grid grid-cols-2 gap-3 text-left">
          <div className="space-y-1">
            <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
              <CalendarPlus size={12} />
              Data
            </label>
            <Input type="date" required value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
              <Clock size={12} />
              Horário
            </label>
            <Input type="time" required value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        {/* Location */}
        <div className="create-anim space-y-1 text-left">
          <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
            <MapPin size={12} />
            Local
          </label>
          <Input required placeholder="Ex: Pub Aurora" value={location} onChange={e => setLocation(e.target.value)} />
        </div>

        <div className="create-anim space-y-1 text-left">
          <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 tracking-wider">Endereço Completo</label>
          <Input placeholder="Ex: Rua X, 123 - Bairro - Cidade/UF" value={address} onChange={e => setAddress(e.target.value)} />
        </div>

        {/* Public Type */}
        <div className="create-anim space-y-1.5 text-left">
          <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
            <Users2 size={12} />
            Tipo de Acesso
          </label>
          <div className="flex gap-3.5">
            {(['Aberto', 'Geral', 'Universitário'] as const).map(t => (
              <button key={t} type="button" onClick={() => setPublicType(t)}
                className={cn(
                  "flex-1 py-3.5 rounded-xl font-display uppercase tracking-wider text-xs border transition-all duration-300 neo-click cursor-pointer",
                  publicType === t 
                    ? 'bg-accent/10 text-accent border-accent/30 shadow-glow-accent font-black' 
                    : 'bg-surface/50 border-glassBorder text-textMuted font-bold hover:text-textLight'
                )}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Tickets Toggle */}
        <div className="create-anim space-y-3.5 glass rounded-[1.8rem] p-5 border border-glassBorder shadow-glass-shadow text-left">
          <div className="flex items-center justify-between">
            <label className="text-sm font-display uppercase tracking-wider font-black text-textLight">Possui Ingressos?</label>
            <button type="button" onClick={() => setHasTickets(!hasTickets)}
              className={cn(
                "w-12 h-7 rounded-full transition-all relative border border-glassBorder cursor-pointer",
                hasTickets ? 'bg-primary/20 border-primary/45' : 'bg-surfaceHover/50'
              )}>
              <div className={cn(
                "w-5 h-5 rounded-full absolute top-[3px] transition-all",
                hasTickets ? 'right-[3px] bg-primary shadow-glow-primary' : 'left-[3px] bg-textMuted'
              )} />
            </button>
          </div>

          {hasTickets && (
            <div className="space-y-4 pt-4 border-t border-glassBorder">
              <div className="space-y-1.5">
                <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 tracking-wider block">Preço do Ingresso</label>
                <Input placeholder="Ex: R$ 30,00 ou Lote 1 R$20 / Lote 2 R$30" value={ticketPrice} onChange={e => setTicketPrice(e.target.value)} />
              </div>

              <div className="space-y-3">
                <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 tracking-wider block">Promoters de Venda (WhatsApp)</label>
                {whatsappContacts.map((contact, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder="Nome" value={contact.name} onChange={e => updateContact(i, 'name', e.target.value)} className="flex-1 text-sm font-sans" />
                    <Input placeholder="(00) 00000-0000" value={contact.phone} onChange={e => updateContact(i, 'phone', e.target.value)} className="flex-1 text-sm font-mono" />
                    {whatsappContacts.length > 1 && (
                      <button type="button" onClick={() => removeContact(i)} className="text-danger hover:text-red-400 p-2.5 border border-glassBorder bg-surface/50 hover:bg-surfaceHover rounded-xl neo-click transition-all duration-300">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addContact} className="w-full py-3 rounded-xl border border-dashed border-primary/45 text-primary font-display uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 hover:bg-primary/10 transition-colors cursor-pointer duration-300 shadow-sm">
                  <Plus size={14} />
                  Adicionar Promoter
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PIX Section — Admin Only */}
        {user?.role === 'admin' && (
          <div className="create-anim space-y-3.5 glass rounded-[1.8rem] p-5 border border-glassBorder shadow-glass-shadow text-left">
            <div className="flex items-center justify-between">
              <label className="text-sm font-display uppercase tracking-wider font-black text-textLight flex items-center gap-2">
                <CheckCircle size={16} className="text-success" />
                Venda via PIX
              </label>
              <button type="button" onClick={() => setHasPixTickets(!hasPixTickets)}
                className={cn(
                  "w-12 h-7 rounded-full transition-all relative border border-glassBorder cursor-pointer",
                  hasPixTickets ? 'bg-success/20 border-success/40' : 'bg-surfaceHover/50'
                )}>
                <div className={cn(
                  "w-5 h-5 rounded-full absolute top-[3px] transition-all",
                  hasPixTickets ? 'right-[3px] bg-success shadow-glow-success' : 'left-[3px] bg-textMuted'
                )} />
              </button>
            </div>

            {hasPixTickets && (
              <div className="space-y-1.5 pt-4 border-t border-glassBorder">
                <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 block">Valor PIX (R$)</label>
                <Input type="number" placeholder="30.00" value={pixTicketPrice} onChange={e => setPixTicketPrice(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {/* Test Event — Admin Only */}
        {user?.role === 'admin' && (
          <div className="create-anim flex items-center gap-3.5 glass rounded-[1.5rem] p-5 border border-glassBorder shadow-glass-shadow text-left">
            <input type="checkbox" id="testEvent" checked={isTestEvent} onChange={e => setIsTestEvent(e.target.checked)} className="accent-primary w-5 h-5 cursor-pointer border border-glassBorder rounded-md" />
            <label htmlFor="testEvent" className="text-sm font-mono text-textMuted uppercase tracking-wider flex items-center gap-2 cursor-pointer select-none font-bold">
              <AlertTriangle size={14} className="text-accent" />
              Rolê de teste (só admin vê)
            </label>
          </div>
        )}

        <div className="create-anim pt-4">
          <Button type="submit" disabled={isLoading} className="w-full rounded-xl py-4 font-display uppercase tracking-wider text-base">
            {isLoading ? (isEdit ? 'Salvando...' : 'Criando...') : (isEdit ? 'Salvar Alterações' : 'Criar Evento')}
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
};
