import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { storage } from '../lib/storage';
import type { AppProfile } from '../lib/storage';
import { cn } from '../lib/utils';
import { compressImage } from '../lib/imageUtils';
import gsap from 'gsap';
import {
  ArrowLeft, Image as ImageIcon, MapPin, X, Plus, Clock, Loader2,
  Search as SearchIcon, CalendarPlus, Users2, CheckCircle, Upload,
  Trash2, AlertTriangle, FileText
} from 'lucide-react';
import { useMap, useMapsLibrary, APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Cropper from 'react-easy-crop';

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  fileName: string
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas is empty'));
        return;
      }
      resolve(new File([blob], fileName, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  });
}

const eventSchema = z.object({
  title: z.string().min(3, "Mínimo 3 caracteres"),
  date: z.string().min(1, "Data obrigatória"),
  time: z.string().min(1, "Horário obrigatório"),
  location: z.string().min(1, "Local obrigatório"),
  address: z.string().min(1, "Endereço obrigatório"),
  publicType: z.string(),
  description: z.string().min(10, "A descrição deve ter no mínimo 10 caracteres"),
  hasTickets: z.boolean(),
  hasPixTickets: z.boolean().optional(),
  ticketPrice: z.string().optional(),
  pixTicketPrice: z.string().optional(),
  isTestEvent: z.boolean().optional(),
  whatsappContacts: z.array(z.object({ name: z.string(), phone: z.string() })).optional(),
  whatsappNumber: z.string().optional(),
  mediaUrls: z.array(z.string())
}).refine(data => {
  if (!data.hasTickets) return true;
  if (data.whatsappContacts && data.whatsappContacts.length > 0) {
    const firstPhone = data.whatsappContacts[0].phone.replace(/\D/g, '');
    return firstPhone.length >= 10;
  }
  if (data.whatsappNumber) {
    return data.whatsappNumber.replace(/\D/g, '').length >= 10;
  }
  return false;
}, {
  message: "WhatsApp obrigatório para vendas (mín. 10 digitos)",
  path: ["whatsappContacts"]
});

type EventFormValues = z.infer<typeof eventSchema>;

const GOOGLE_MAP_ID = 'bf51a910020fa25a';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export const CreateEvent = () => {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places']}>
      <CreateEventContent />
    </APIProvider>
  );
};

const CreateEventContent = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { register, handleSubmit: formSubmit, watch, setValue, formState: { isSubmitting }, reset } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      date: '',
      time: '',
      publicType: 'Aberto',
      description: '',
      location: 'Centro',
      address: '',
      mediaUrls: [],
      hasTickets: false,
      hasPixTickets: false,
      ticketPrice: '',
      pixTicketPrice: '',
      isTestEvent: false,
      whatsappContacts: [{ name: '', phone: '' }],
      whatsappNumber: ''
    }
  });

  const mediaUrls = watch('mediaUrls');
  const hasTickets = watch('hasTickets');
  const hasPixTickets = watch('hasPixTickets');
  const isTestEvent = watch('isTestEvent');
  const location = watch('location');
  const address = watch('address');
  const publicType = watch('publicType');

  const [showMapModal, setShowMapModal] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-16.0669, -57.6868]); // Cuiabá center
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Crop States
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const { user } = useAuth();
  const userId = user?.id;
  const userRole = user?.role;
  const [originalCreatorId, setOriginalCreatorId] = useState<string | null>(null);

  // States for Admin selecting partner
  const [profiles, setProfiles] = useState<AppProfile[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>('');

  useEffect(() => {
    const loadEventData = async () => {
      if (userRole === 'admin') {
        try {
          const allProfiles = await storage.getProfiles();
          setProfiles(allProfiles.filter(p => p.type === 'estabelecimento' || p.type === 'atletica'));
        } catch (error) {
          console.error("Erro ao carregar perfis:", error);
        }
      }

      if (id) {
        try {
          const events = await storage.getEvents();
          const ev = events.find(e => e.id === id);
          if (ev) {
            reset({
              title: ev.title,
              date: ev.date,
              time: ev.time,
              publicType: ev.publicType,
              description: ev.description,
              location: ev.location,
              address: ev.address || '',
              mediaUrls: ev.mediaUrls || [],
              hasTickets: ev.hasTickets || false,
              ticketPrice: ev.ticketPrice || '',
              hasPixTickets: ev.hasPixTickets || false,
              pixTicketPrice: ev.pixTicketPrice || '',
              isTestEvent: ev.isTestEvent || false,
              whatsappContacts: ev.whatsappContacts || (ev.whatsappNumber ? [{ name: ev.whatsappName || '', phone: ev.whatsappNumber }] : [{ name: '', phone: '' }]),
              whatsappNumber: ev.whatsappNumber || ''
            });
            setOriginalCreatorId(ev.creatorId);
            setSelectedCreatorId(ev.creatorId);
          }
        } catch (error) {
          console.error("Erro ao carregar dados do evento para edição:", error);
        }
      }
    };
    loadEventData();
  }, [id, userRole, reset]);

  useEffect(() => {
    if (!userId || (userRole !== 'partner' && userRole !== 'admin')) {
      navigate('/feed');
      return;
    }
  }, [userId, userRole, navigate]);

  useEffect(() => {
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
  }, []);

  const onSubmit = async (data: EventFormValues) => {
    const targetCreatorId = selectedCreatorId || user?.profileId || userId!;
    const eventData = {
      id: id || Date.now().toString(),
      ...data,
      whatsappContacts: data.whatsappContacts?.filter(c => c.phone.trim() !== '') || [],
      publicType: data.publicType as any,
      creatorId: id ? (selectedCreatorId || originalCreatorId || targetCreatorId) : targetCreatorId,
    };
    try {
      await storage.saveEvent(eventData as any);
      toast.success('Evento salvo com sucesso!');
      navigate('/profile');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar o evento.');
    }
  };

  const onError = (errors: any) => {
    Object.values(errors).forEach((err: any) => {
      toast.error(err.message);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        toast.error("Apenas imagens são suportadas.");
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error(`A imagem é muito grande (máx 15MB).`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setCurrentFile(file);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCropModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCropConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels || !currentFile) return;
    setCropModalOpen(false);
    setIsUploading(true);
    const toastId = toast.loading('Processando imagem e fazendo upload...');

    try {
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, currentFile.name);
      const compressedBase64 = await compressImage(croppedFile, 1080, 1080, 0.7);

      const res = await fetch(compressedBase64);
      const blob = await res.blob();
      const finalFile = new File([blob], currentFile.name, { type: 'image/jpeg' });

      const url = await storage.uploadFile(finalFile, 'events');
      setValue('mediaUrls', [...mediaUrls, url], { shouldValidate: true });
      toast.success('Upload concluído!');
    } catch (error) {
      console.error("Erro no recorte/upload:", error);
      toast.error('Falha ao processar imagem.');
    } finally {
      setIsUploading(false);
      setImageSrc('');
      setCurrentFile(null);
      toast.dismiss(toastId);
    }
  };

  const removeMedia = (index: number) => {
    setValue('mediaUrls', mediaUrls.filter((_: string, i: number) => i !== index), { shouldValidate: true });
  };

  const getAddressFromCoords = async (lat: number, lng: number) => {
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data = await response.json();
      const addr = data.display_name;
      const name = data.address.road || data.address.suburb || "Local Selecionado";
      setValue('location', name);
      setValue('address', addr, { shouldValidate: true });
    } catch (error) {
      console.error("Error fetching address:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const GoogleMapEvents = () => {
    const map = useMap();

    useEffect(() => {
      if (map && mapCenter) {
        map.panTo({ lat: mapCenter[0], lng: mapCenter[1] });
      }
    }, [map, mapCenter]);

    useEffect(() => {
      if (!map) return;

      const listener = map.addListener('click', async (e: any) => {
        const latlng = e.latLng.toJSON();
        setSelectedPos([latlng.lat, latlng.lng]);
        getAddressFromCoords(latlng.lat, latlng.lng);
      });

      return () => {
        if (typeof google !== 'undefined') {
          google.maps.event.removeListener(listener);
        }
      };
    }, [map]);

    if (!map) return null;
    return selectedPos ? <AdvancedMarker position={{ lat: selectedPos[0], lng: selectedPos[1] }} /> : null;
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-6 px-4 relative">
      {/* Ambient glow */}
      <div className="ambient-glow w-48 h-48 bg-primary/10 top-0 right-0 pointer-events-none" />

      <button
        type="button"
        onClick={() => navigate(-1)}
        title="Voltar"
        aria-label="Voltar"
        className="w-10 h-10 mb-6 rounded-2xl bg-surface/50 border border-glassBorder text-textLight flex items-center justify-center shadow-glass-shadow hover:border-primary/40 hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-300 neo-click cursor-pointer relative z-10"
      >
        <ArrowLeft size={18} />
      </button>

      <div className="max-w-2xl mx-auto">
        <div className="create-anim flex items-center gap-3.5 mb-6 relative z-10 text-left">
          <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center border border-accent/20 shadow-glow-accent">
            <CalendarPlus size={22} />
          </div>
          <div>
            <h1 className="font-serifDisplay italic font-bold text-2xl text-textLight tracking-wide leading-tight animate-fade-in">
              {isEdit ? 'Editar Evento' : 'Criar Evento'}
            </h1>
            <p className="text-xs text-textMuted font-mono uppercase mt-0.5 font-bold">Configure os detalhes do seu rolê</p>
          </div>
        </div>

        {user ? (
          <form onSubmit={formSubmit(onSubmit, onError)} className="space-y-5 relative z-10">
            {/* Admin Select Partner */}
            {userRole === 'admin' && (
              <div className="create-anim space-y-1 text-left">
                <label htmlFor="creator-select" className="text-[9px] font-mono font-bold text-primary uppercase ml-1 block tracking-wider">
                  Criar evento pelo estabelecimento:
                </label>
                <select
                  id="creator-select"
                  title="Selecione o estabelecimento criador"
                  className="w-full h-12 bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 text-sm font-sans focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all text-textLight"
                  value={selectedCreatorId}
                  onChange={e => setSelectedCreatorId(e.target.value)}
                >
                  <option value="">(Nenhum - Criar como Admin)</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id} className="text-stone-900 bg-white">
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Media Upload */}
            <div className="create-anim space-y-2 text-left">
              <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
                <ImageIcon size={12} />
                Fotos do Evento
              </label>
              <div className="grid grid-cols-3 gap-3">
                {mediaUrls.map((url: string, i: number) => (
                  <div key={i} className="aspect-square rounded-2xl bg-surface/50 border border-glassBorder shadow-glass-shadow relative overflow-hidden group">
                    <img src={url} alt={`Mídia ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      title="Remover mídia"
                      aria-label="Remover mídia"
                      className="absolute top-2 right-2 w-6 h-6 bg-danger text-textLight border border-danger/20 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer duration-300"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {mediaUrls.length < 6 && (
                  <label className="aspect-square rounded-2xl bg-surfaceHover/50 border border-dashed border-primary/45 flex flex-col items-center justify-center text-textMuted cursor-pointer hover:border-accent/60 hover:text-accent transition-all duration-300 hover:bg-surfaceHover">
                    {isUploading ? (
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Upload size={20} className="text-primary" />
                        <span className="text-[10px] font-mono font-bold mt-1 uppercase">Upload</span>
                      </>
                    )}
                    <input type="file" className="hidden" accept="image/*" disabled={isUploading} onChange={handleFileChange} />
                  </label>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="create-anim space-y-1 text-left">
              <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
                <FileText size={12} />
                Nome do Evento
              </label>
              <Input
                placeholder="Ex: Sunset Party"
                className="bg-surface/50 border-glassBorder text-textLight"
                {...register('title')}
              />
            </div>

            {/* Description */}
            <div className="create-anim space-y-1 text-left">
              <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 tracking-wider">Descrição</label>
              <textarea
                placeholder="Descreva o evento..."
                className="w-full min-h-[120px] bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 py-3 text-sm font-sans text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all duration-300 resize-none placeholder:text-textMuted/50"
                {...register('description')}
              />
            </div>

            {/* Date & Time */}
            <div className="create-anim grid grid-cols-2 gap-3 text-left">
              <div className="space-y-1">
                <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
                  <CalendarPlus size={12} />
                  Data
                </label>
                <Input
                  type="date"
                  className="bg-surface/50 border-glassBorder text-textLight"
                  {...register('date')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
                  <Clock size={12} />
                  Horário
                </label>
                <Input
                  type="time"
                  className="bg-surface/50 border-glassBorder text-textLight"
                  {...register('time')}
                />
              </div>
            </div>

            {/* Location */}
            <div className="create-anim grid grid-cols-[1fr_auto] gap-2 items-end text-left">
              <div className="space-y-1">
                <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
                  <MapPin size={12} />
                  Local
                </label>
                <Input
                  placeholder="Ex: Pub Aurora"
                  className="bg-surface/50 border-glassBorder text-textLight"
                  {...register('location')}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all border border-primary/20 shadow-sm cursor-pointer"
                title="Escolher no Mapa"
              >
                <MapPin size={18} />
              </button>
            </div>

            {/* Address */}
            <div className="create-anim space-y-1 text-left">
              <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 tracking-wider">Endereço Completo</label>
              <Input
                placeholder="Ex: Rua X, 123 - Bairro - Cidade/UF"
                className="bg-surface/50 border-glassBorder text-textLight"
                {...register('address')}
              />
            </div>

            {/* Public Type */}
            <div className="create-anim space-y-1.5 text-left">
              <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 flex items-center gap-1.5 tracking-wider">
                <Users2 size={12} />
                Tipo de Acesso
              </label>
              <div className="flex gap-3.5">
                {(['Aberto', 'Geral', 'Universitário'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValue('publicType', t, { shouldValidate: true })}
                    className={cn(
                      "flex-1 py-3.5 rounded-xl font-display uppercase tracking-wider text-xs border transition-all duration-300 neo-click cursor-pointer",
                      publicType === t
                        ? 'bg-accent/10 text-accent border-accent/30 shadow-glow-accent font-black'
                        : 'bg-surface/50 border-glassBorder text-textMuted font-bold hover:text-textLight'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Tickets Toggle */}
            <div className="create-anim space-y-3.5 glass rounded-[1.8rem] p-5 border border-glassBorder shadow-glass-shadow text-left">
              <div className="flex items-center justify-between">
                <label className="text-sm font-display uppercase tracking-wider font-black text-textLight">Possui Ingressos?</label>
                <button
                  type="button"
                  onClick={() => setValue('hasTickets', !hasTickets, { shouldValidate: true })}
                  title="Possui ingressos"
                  aria-label="Possui ingressos"
                  className={cn(
                    "w-12 h-7 rounded-full transition-all relative border border-glassBorder cursor-pointer",
                    hasTickets ? 'bg-primary/20 border-primary/45' : 'bg-surfaceHover/50'
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full absolute top-[3px] transition-all",
                      hasTickets ? 'right-[3px] bg-primary shadow-glow-primary' : 'left-[3px] bg-textMuted'
                    )}
                  />
                </button>
              </div>

              {hasTickets && (
                <div className="space-y-4 pt-4 border-t border-glassBorder">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 tracking-wider block">Preço do Ingresso</label>
                    <Input
                      placeholder="Ex: R$ 30,00 ou Lote 1 R$20 / Lote 2 R$30"
                      className="bg-surface/50 border-glassBorder text-textLight"
                      {...register('ticketPrice')}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 tracking-wider block">Promoters de Venda (WhatsApp)</label>
                    {(watch('whatsappContacts') || []).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          placeholder="Nome"
                          className="flex-1 text-sm font-sans bg-surface/50 border-glassBorder text-textLight"
                          {...register(`whatsappContacts.${i}.name` as const)}
                        />
                        <Input
                          placeholder="(00) 00000-0000"
                          className="flex-1 text-sm font-mono bg-surface/50 border-glassBorder text-textLight"
                          {...register(`whatsappContacts.${i}.phone` as const)}
                        />
                        {(watch('whatsappContacts') || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const current = watch('whatsappContacts') || [];
                              setValue('whatsappContacts', current.filter((_, idx) => idx !== i));
                            }}
                            title="Remover promoter"
                            aria-label="Remover promoter"
                            className="text-danger hover:text-red-400 p-2.5 border border-glassBorder bg-surface/50 hover:bg-surfaceHover rounded-xl neo-click transition-all duration-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {(watch('whatsappContacts') || []).length < 5 && (
                      <button
                        type="button"
                        onClick={() => {
                          const current = watch('whatsappContacts') || [];
                          setValue('whatsappContacts', [...current, { name: '', phone: '' }]);
                        }}
                        className="w-full py-3 rounded-xl border border-dashed border-primary/45 text-primary font-display uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 hover:bg-primary/10 transition-colors cursor-pointer duration-300 shadow-sm"
                      >
                        <Plus size={14} />
                        Adicionar Promoter
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* PIX Section — Admin Only */}
            {userRole === 'admin' && (
              <div className="create-anim space-y-3.5 glass rounded-[1.8rem] p-5 border border-glassBorder shadow-glass-shadow text-left">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-display uppercase tracking-wider font-black text-textLight flex items-center gap-2">
                    <CheckCircle size={16} className="text-success" />
                    Venda via PIX
                  </label>
                  <button
                    type="button"
                    onClick={() => setValue('hasPixTickets', !hasPixTickets, { shouldValidate: true })}
                    title="Venda via PIX"
                    aria-label="Venda via PIX"
                    className={cn(
                      "w-12 h-7 rounded-full transition-all relative border border-glassBorder cursor-pointer",
                      hasPixTickets ? 'bg-success/20 border-success/40' : 'bg-surfaceHover/50'
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full absolute top-[3px] transition-all",
                        hasPixTickets ? 'right-[3px] bg-success shadow-glow-success' : 'left-[3px] bg-textMuted'
                      )}
                    />
                  </button>
                </div>

                {hasPixTickets && (
                  <div className="space-y-1.5 pt-4 border-t border-glassBorder">
                    <label className="text-[9px] font-mono font-bold text-primary uppercase ml-1 block">Valor PIX (R$)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="30.00"
                      className="bg-surface/50 border-glassBorder text-textLight"
                      {...register('pixTicketPrice')}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Test Event — Admin Only */}
            {userRole === 'admin' && (
              <div className="create-anim flex items-center gap-3.5 glass rounded-[1.5rem] p-5 border border-glassBorder shadow-glass-shadow text-left">
                <input
                  type="checkbox"
                  id="testEvent"
                  className="accent-primary w-5 h-5 cursor-pointer border border-glassBorder rounded-md"
                  checked={!!isTestEvent}
                  onChange={e => setValue('isTestEvent', e.target.checked, { shouldValidate: true })}
                />
                <label htmlFor="testEvent" className="text-sm font-mono text-textMuted uppercase tracking-wider flex items-center gap-2 cursor-pointer select-none font-bold">
                  <AlertTriangle size={14} className="text-accent" />
                  Rolê de teste (só admin vê)
                </label>
              </div>
            )}

            <div className="create-anim pt-4">
              <Button type="submit" disabled={isSubmitting} className="w-full rounded-xl py-4 font-display uppercase tracking-wider text-base">
                {isSubmitting ? (isEdit ? 'Salvando...' : 'Criando...') : (isEdit ? 'Salvar Alterações' : 'Criar Evento')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        )}
      </div>

      {/* Modal do Mapa */}
      {showMapModal && (
        <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background w-full max-w-lg h-[80vh] rounded-[2.5rem] border border-glassBorder shadow-2xl flex flex-col p-6 relative overflow-hidden animate-in zoom-in duration-300">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div className="text-left">
                <h3 className="font-serifDisplay italic font-bold text-xl text-textLight">Escolher Localização</h3>
                <p className="text-[10px] font-mono text-textMuted uppercase tracking-wider">Busque ou clique no mapa para marcar</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                className="bg-primary/10 p-2.5 rounded-full text-primary hover:bg-primary/20 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Fechar Mapa"
                aria-label="Fechar Mapa"
              >
                <X size={18} />
              </button>
            </div>

            {/* Map Container */}
            <div className="relative flex-1 rounded-[2rem] overflow-hidden border border-glassBorder bg-primary/5 shadow-inner flex flex-col">
              <div className="absolute top-4 left-4 right-4 z-20">
                <PlaceAutocomplete
                  onPlaceSelect={(place) => {
                    if (place && (place as any).geometry?.location) {
                      const lat = (place as any).geometry.location.lat();
                      const lng = (place as any).geometry.location.lng();
                      setMapCenter([lat, lng]);
                      setSelectedPos([lat, lng]);
                      setValue('address', (place as any).formatted_address || (place as any).name || '', { shouldValidate: true });
                      setValue('location', (place as any).name || location);
                    }
                  }}
                />
              </div>

              <Map
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
                mapId={GOOGLE_MAP_ID}
                defaultCenter={{ lat: mapCenter[0], lng: mapCenter[1] }}
                defaultZoom={15}
                gestureHandling={'greedy'}
                disableDefaultUI={true}
              >
                <GoogleMapEvents />
                {selectedPos && (
                  <AdvancedMarker position={{ lat: selectedPos[0], lng: selectedPos[1] }} />
                )}
              </Map>
            </div>

            {isSearching && (
              <div className="flex items-center justify-center gap-2 mt-4 text-primary animate-pulse">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs font-bold font-mono">Buscando endereço...</span>
              </div>
            )}

            {/* Address Preview */}
            {address && (
              <div className="mt-4 p-3.5 bg-surface/50 border border-glassBorder rounded-2xl flex items-start gap-2.5 text-left">
                <MapPin className="text-primary shrink-0 mt-0.5" size={16} />
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-primary/70 uppercase block tracking-wider">Endereço Selecionado</span>
                  <p className="font-sans font-bold text-xs text-textLight truncate leading-snug">{address}</p>
                </div>
              </div>
            )}

            <Button
              className="w-full mt-4 rounded-full py-3.5 shadow-lg shadow-primary/10 hover:scale-[1.02] active:scale-95 transition-all"
              onClick={() => setShowMapModal(false)}
              disabled={!address}
            >
              Confirmar Localização
            </Button>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {cropModalOpen && (
        <div className="fixed inset-0 z-[99999] bg-background/95 backdrop-blur-md flex flex-col pt-12 pb-6 px-4">
          <div className="flex justify-between items-center mb-6">
            <div className="text-left">
              <h2 className="font-serifDisplay italic font-bold text-xl text-textLight">Ajustar Imagem</h2>
              <p className="text-xs text-textMuted">Recorte para exibição perfeita no Feed</p>
            </div>
            <button
              type="button"
              onClick={() => { setCropModalOpen(false); setImageSrc(''); setCurrentFile(null); }}
              className="bg-primary/10 p-2 rounded-full text-primary"
              title="Cancelar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="relative flex-1 bg-black/5 rounded-3xl overflow-hidden mb-6 border border-glassBorder shadow-inner">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={16 / 9}
              onCropChange={setCrop}
              onCropComplete={(_: any, croppedAreaPixels: any) => setCroppedAreaPixels(croppedAreaPixels)}
              onZoomChange={setZoom}
            />
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              className="flex-1 rounded-full py-4 border border-glassBorder text-textLight font-bold hover:bg-surfaceHover transition-all neo-click"
              onClick={() => { setCropModalOpen(false); setImageSrc(''); setCurrentFile(null); }}
            >
              Cancelar
            </button>
            <Button
              type="button"
              className="flex-1 rounded-full py-4 shadow-xl"
              onClick={handleCropConfirm}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="animate-spin mx-auto" size={24} /> : 'Confirmar Corte'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const PlaceAutocomplete = ({ onPlaceSelect }: { onPlaceSelect: (place: google.maps.places.Place) => void }) => {
  const [inputValue, setInputValue] = useState('');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const places = useMapsLibrary('places');
  const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!places) return;
    setSessionToken(new places.AutocompleteSessionToken());
  }, [places]);

  const fetchPredictions = async (input: string) => {
    if (!input || !places) {
      setPredictions([]);
      return;
    }

    const { AutocompleteSuggestion } = places;
    const request: google.maps.places.AutocompleteRequest = {
      input,
      sessionToken: sessionToken!,
      includedRegionCodes: ['BR'],
      locationBias: new google.maps.LatLngBounds(
        { lat: -17.0, lng: -58.0 },
        { lat: -15.0, lng: -56.0 }
      )
    };

    try {
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      setPredictions(suggestions || []);
    } catch (err) {
      console.error('Autocomplete error:', err);
    }
  };

  const handleSelect = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!places || !suggestion.placePrediction) return;

    setInputValue(suggestion.placePrediction.text.text);
    setPredictions([]);

    const place = suggestion.placePrediction.toPlace();
    await place.fetchFields({
      fields: ['location', 'displayName', 'formattedAddress']
    });

    onPlaceSelect(place);
  };

  return (
    <div className="relative">
      <div className="relative group">
        <input
          type="text"
          placeholder="Pesquisar local ou endereço..."
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            fetchPredictions(e.target.value);
          }}
          className="w-full h-12 bg-white/90 backdrop-blur-md border border-glassBorder rounded-2xl px-12 text-sm shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-textLight"
        />
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40" size={18} />
        {inputValue && (
          <button
            onClick={() => { setInputValue(''); setPredictions([]); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/20 hover:text-primary transition-colors"
            title="Limpar Pesquisa"
            aria-label="Limpar Pesquisa"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {predictions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-glassBorder rounded-[1.5rem] shadow-2xl z-[120] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {predictions.map((p, idx) => (
            <button
              key={p.placePrediction?.placeId || idx}
              className="w-full text-left px-5 py-3 hover:bg-primary/5 text-xs border-b border-glassBorder last:border-0 flex flex-col gap-0.5"
              onClick={() => handleSelect(p)}
            >
              <span className="font-bold text-textLight">{p.placePrediction?.text.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
