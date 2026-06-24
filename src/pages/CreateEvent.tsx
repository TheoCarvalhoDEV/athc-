import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { storage } from '../lib/storage';
import type { AppProfile, TicketType } from '../lib/storage';
import { cn } from '../lib/utils';
import gsap from 'gsap';
import {
  ArrowLeft, Image as ImageIcon, MapPin, X, Plus, Clock, Loader2,
  Search as SearchIcon, CalendarPlus, CheckCircle, Upload,
  Trash2, AlertTriangle, FileText, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown
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
  publicType: z.string().optional(),
  description: z.string().min(10, "A descrição deve ter no mínimo 10 caracteres"),
  hasTickets: z.boolean(),
  hasPixTickets: z.boolean().optional(),
  ticketPrice: z.string().optional(),
  pixTicketPrice: z.string().optional(),
  isTestEvent: z.boolean().optional(),
  hasPresence: z.boolean().optional(),
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
      hasPresence: true,
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
  const hasPresence = watch('hasPresence') ?? true;
  const dateValue = watch('date');
  const timeValue = watch('time');



  const [tickets, setTickets] = useState<TicketType[]>([]);

  const handleAddTicketType = () => {
    setTickets(prev => [
      ...prev,
      {
        id: `tkt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: '',
        price: 0,
        capacity: 100,
        sold: 0,
        status: 'active'
      }
    ]);
  };

  const handleRemoveTicketType = (index: number) => {
    setTickets(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateTicketType = (index: number, field: keyof TicketType, value: any) => {
    setTickets(prev => prev.map((t, i) => {
      if (i === index) {
        if (field === 'price' || field === 'capacity') {
          return { ...t, [field]: Number(value) || 0 };
        }
        return { ...t, [field]: value };
      }
      return t;
    }));
  };

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

  // Date Picker States
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedTempDate, setSelectedTempDate] = useState<Date | null>(null);
  const [selectedTempTime, setSelectedTempTime] = useState<string>('20:00');

  useEffect(() => {
    if (showDatePickerModal) {
      if (dateValue) {
        const parts = dateValue.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          setSelectedTempDate(new Date(year, month, day));
          setCurrentMonth(new Date(year, month, 1));
        }
      } else {
        const today = new Date();
        setSelectedTempDate(today);
        setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
      }

      if (timeValue) {
        setSelectedTempTime(timeValue);
      } else {
        setSelectedTempTime('20:00');
      }
    }
  }, [showDatePickerModal, dateValue, timeValue]);

  const formatDateToLocal = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const generateCalendarCells = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const totalDays = getDaysInMonth(year, month);
    const firstDayIndex = getFirstDayOfMonth(year, month);

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevTotalDays = getDaysInMonth(prevYear, prevMonth);

    const cells = [];

    // Prev month days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      cells.push({
        day: prevTotalDays - i,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
        date: new Date(prevYear, prevMonth, prevTotalDays - i)
      });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      cells.push({
        day: d,
        month: month,
        year: year,
        isCurrentMonth: true,
        date: new Date(year, month, d)
      });
    }

    // Next month days
    const remaining = 42 - cells.length;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        day: d,
        month: nextMonth,
        year: nextYear,
        isCurrentMonth: false,
        date: new Date(nextYear, nextMonth, d)
      });
    }

    return cells;
  };

  const handleMonthPrev = () => {
    setCurrentMonth(prev => {
      const year = prev.getFullYear();
      const month = prev.getMonth();
      return month === 0 ? new Date(year - 1, 11, 1) : new Date(year, month - 1, 1);
    });
  };

  const handleMonthNext = () => {
    setCurrentMonth(prev => {
      const year = prev.getFullYear();
      const month = prev.getMonth();
      return month === 11 ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
    });
  };

  const handleDatePickerConfirm = () => {
    if (selectedTempDate) {
      const y = selectedTempDate.getFullYear();
      const m = String(selectedTempDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedTempDate.getDate()).padStart(2, '0');
      const formattedDate = `${y}-${m}-${d}`;
      setValue('date', formattedDate, { shouldValidate: true });
    }
    setValue('time', selectedTempTime, { shouldValidate: true });
    setShowDatePickerModal(false);
  };

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
              hasPresence: ev.hasPresence ?? true,
              whatsappContacts: ev.whatsappContacts || (ev.whatsappNumber ? [{ name: ev.whatsappName || '', phone: ev.whatsappNumber }] : [{ name: '', phone: '' }]),
              whatsappNumber: ev.whatsappNumber || ''
            });
            setTickets(ev.tickets || []);
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
      tickets: data.hasPixTickets ? tickets : [],
      whatsappContacts: data.whatsappContacts?.filter(c => c.phone.trim() !== '') || [],
      publicType: data.publicType || 'Aberto',
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
      const url = await storage.uploadFile(croppedFile, 'events');
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
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-4 md:pt-6 px-3 md:px-4 relative">
      <button
        type="button"
        onClick={() => navigate(-1)}
        title="Voltar"
        aria-label="Voltar"
        className="w-9 h-9 md:w-10 md:h-10 mb-4 md:mb-6 rounded-xl bg-surface border border-glassBorder text-textLight flex items-center justify-center shadow-sm hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer relative z-10"
      >
        <ArrowLeft size={18} />
      </button>

      <div className="max-w-2xl mx-auto">
        <div className="create-anim flex items-center gap-2.5 md:gap-3.5 mb-4 md:mb-6 relative z-10 text-left">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center border border-accent/20">
            <CalendarPlus size={18} className="md:hidden" />
            <CalendarPlus size={22} className="hidden md:block" />
          </div>
          <div>
            <h1 className="font-display font-semibold text-lg md:text-2xl text-textLight leading-tight animate-fade-in">
              {isEdit ? 'Editar evento' : 'Criar evento'}
            </h1>
            <p className="text-xs text-textMuted mt-0.5">Configure os detalhes do seu evento</p>
          </div>
        </div>

        {user ? (
          <form onSubmit={formSubmit(onSubmit, onError)} className="space-y-3.5 md:space-y-5 relative z-10">
            {/* Admin Select Partner */}
            {userRole === 'admin' && (
              <div className="create-anim space-y-1 text-left">
                <label htmlFor="creator-select" className="text-xs font-medium text-textMuted ml-1 block">
                  Criar evento pelo estabelecimento:
                </label>
                <select
                  id="creator-select"
                  title="Selecione o estabelecimento criador"
                  className="w-full h-10 md:h-12 bg-surface border border-glassBorder rounded-xl px-3 md:px-4 text-xs md:text-sm font-sans focus:outline-none focus:border-primary/40 transition-all text-textLight"
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
              <label className="text-xs font-medium text-textMuted ml-1 flex items-center gap-1.5">
                <ImageIcon size={12} />
                Fotos do evento
              </label>
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                {mediaUrls.map((url: string, i: number) => (
                  <div key={i} className="aspect-square rounded-2xl bg-surface border border-glassBorder shadow-sm relative overflow-hidden group">
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
                        <span className="text-[11px] font-medium mt-1">Enviar</span>
                      </>
                    )}
                    <input type="file" className="hidden" accept="image/*" disabled={isUploading} onChange={handleFileChange} />
                  </label>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="create-anim space-y-1 text-left">
              <label className="text-xs font-medium text-textMuted ml-1 flex items-center gap-1.5">
                <FileText size={12} />
                Nome do evento
              </label>
              <Input
                placeholder="Ex: Sunset Party"
                className="bg-surface border-glassBorder text-textLight"
                {...register('title')}
              />
            </div>

            {/* Description */}
            <div className="create-anim space-y-1 text-left">
              <label className="text-xs font-medium text-textMuted ml-1">Descrição</label>
              <textarea
                placeholder="Descreva o evento..."
                className="w-full min-h-[90px] md:min-h-[120px] bg-surface border border-glassBorder rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-sans text-textLight focus:outline-none focus:border-primary/40 transition-all duration-300 resize-none placeholder:text-textMuted/50"
                {...register('description')}
              />
            </div>

            {/* Date & Time */}
            <div className="create-anim grid grid-cols-2 gap-2 md:gap-3 text-left">
              <div className="space-y-1">
                <label className="text-xs font-medium text-textMuted ml-1 flex items-center gap-1.5">
                  <CalendarPlus size={12} />
                  Data
                </label>
                <div
                  onClick={() => setShowDatePickerModal(true)}
                  className="cursor-pointer"
                >
                  <Input
                    readOnly
                    placeholder="Selecione a data"
                    className="bg-surface border-glassBorder text-textLight cursor-pointer pointer-events-none"
                    value={dateValue ? formatDateToLocal(dateValue) : ''}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-textMuted ml-1 flex items-center gap-1.5">
                  <Clock size={12} />
                  Horário
                </label>
                <div
                  onClick={() => setShowDatePickerModal(true)}
                  className="cursor-pointer"
                >
                  <Input
                    readOnly
                    placeholder="Selecione o horário"
                    className="bg-surface border-glassBorder text-textLight cursor-pointer pointer-events-none"
                    value={timeValue || ''}
                  />
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="create-anim grid grid-cols-[1fr_auto] gap-2 items-end text-left">
              <div className="space-y-1">
                <label className="text-xs font-medium text-textMuted ml-1 flex items-center gap-1.5">
                  <MapPin size={12} />
                  Local
                </label>
                <Input
                  placeholder="Ex: Pub Aurora"
                  className="bg-surface border-glassBorder text-textLight"
                  {...register('location')}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all border border-primary/20 shadow-sm cursor-pointer"
                title="Escolher no Mapa"
              >
                <MapPin size={18} />
              </button>
            </div>

            {/* Address */}
            <div className="create-anim space-y-1 text-left">
              <label className="text-xs font-medium text-textMuted ml-1">Endereço completo</label>
              <Input
                placeholder="Ex: Rua X, 123 - Bairro - Cidade/UF"
                className="bg-surface border-glassBorder text-textLight"
                {...register('address')}
              />
            </div>



            {/* Presence Toggle */}
            <div className="create-anim space-y-2.5 md:space-y-3.5 surface rounded-2xl p-3.5 md:p-5 text-left">
              <div className="flex items-center justify-between">
                <label className="text-xs md:text-sm font-display font-semibold text-textLight">Habilitar confirmação de presença?</label>
                <button
                  type="button"
                  onClick={() => setValue('hasPresence', !hasPresence, { shouldValidate: true })}
                  title="Habilitar Confirmação de Presença"
                  aria-label="Habilitar Confirmação de Presença"
                  className={cn(
                    "w-12 h-7 rounded-full transition-all relative border border-glassBorder cursor-pointer",
                    hasPresence ? 'bg-primary/20 border-primary/45' : 'bg-surfaceHover/50'
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full absolute top-[3px] transition-all",
                      hasPresence ? 'right-[3px] bg-primary' : 'left-[3px] bg-textMuted'
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Tickets Toggle */}
            <div className="create-anim space-y-2.5 md:space-y-3.5 surface rounded-2xl p-3.5 md:p-5 text-left">
              <div className="flex items-center justify-between">
                <label className="text-xs md:text-sm font-display font-semibold text-textLight">Possui ingressos?</label>
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
                      hasTickets ? 'right-[3px] bg-primary' : 'left-[3px] bg-textMuted'
                    )}
                  />
                </button>
              </div>

              {hasTickets && (
                <div className="space-y-4 pt-4 border-t border-glassBorder">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-textMuted ml-1 block">Preço do ingresso</label>
                    <Input
                      placeholder="Ex: R$ 30,00 ou Lote 1 R$20 / Lote 2 R$30"
                      className="bg-surface border-glassBorder text-textLight"
                      {...register('ticketPrice')}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-medium text-textMuted ml-1 block">Promoters de venda (WhatsApp)</label>
                    {(watch('whatsappContacts') || []).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          placeholder="Nome"
                          className="flex-1 text-sm font-sans bg-surface border-glassBorder text-textLight"
                          {...register(`whatsappContacts.${i}.name` as const)}
                        />
                        <Input
                          placeholder="(00) 00000-0000"
                          className="flex-1 text-sm font-mono bg-surface border-glassBorder text-textLight"
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
                            className="text-danger hover:text-red-400 p-2.5 border border-glassBorder bg-surface hover:bg-surfaceHover rounded-xl transition-all duration-300"
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
                        className="w-full py-3 rounded-xl border border-dashed border-primary/45 text-primary font-sans font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-primary/10 transition-colors cursor-pointer duration-300"
                      >
                        <Plus size={14} />
                        Adicionar promoter
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* PIX Section — Admin Only */}
            {userRole === 'admin' && (
              <div className="create-anim space-y-2.5 md:space-y-3.5 surface rounded-2xl p-3.5 md:p-5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs md:text-sm font-display font-semibold text-textLight flex items-center gap-1.5 md:gap-2">
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
                        hasPixTickets ? 'right-[3px] bg-success' : 'left-[3px] bg-textMuted'
                      )}
                    />
                  </button>
                </div>

                {hasPixTickets && (
                  <div className="space-y-4 pt-4 border-t border-glassBorder">
                    <div className="space-y-1.5 mb-3">
                      <label className="text-xs font-medium text-textMuted ml-1 block">Valor PIX padrão (R$)</label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="30.00"
                        className="bg-surface border-glassBorder text-textLight"
                        {...register('pixTicketPrice')}
                      />
                      <p className="text-[11px] text-textMuted mt-1">Usado como valor fallback caso não existam lotes específicos cadastrados abaixo.</p>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-glassBorder/40">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-textMuted ml-1 block">Setores e lotes de ingressos</label>
                        <button
                          type="button"
                          onClick={handleAddTicketType}
                          className="py-1.5 px-3 bg-success/15 border border-success/35 text-success rounded-xl font-sans text-[11px] font-semibold hover:bg-success/20 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={10} /> Adicionar lote/setor
                        </button>
                      </div>
                      
                      {tickets.length > 0 ? (
                        <div className="space-y-3">
                          {tickets.map((t, idx) => (
                            <div key={t.id || idx} className="flex gap-2 items-end bg-surface p-3 rounded-2xl border border-glassBorder">
                              <div className="flex-1 space-y-1">
                                <label className="text-[11px] font-medium text-textMuted ml-1 block">Nome / lote</label>
                                <Input
                                  placeholder="Ex: VIP - 1º Lote"
                                  className="text-xs bg-surface border-glassBorder text-textLight"
                                  value={t.name}
                                  onChange={e => handleUpdateTicketType(idx, 'name', e.target.value)}
                                />
                              </div>
                              <div className="w-24 space-y-1">
                                <label className="text-[11px] font-medium text-textMuted ml-1 block">Preço (R$)</label>
                                <Input
                                  type="number"
                                  placeholder="0.00"
                                  className="text-xs bg-surface border-glassBorder text-textLight"
                                  value={t.price || ''}
                                  onChange={e => handleUpdateTicketType(idx, 'price', e.target.value)}
                                />
                              </div>
                              <div className="w-20 space-y-1">
                                <label className="text-[11px] font-medium text-textMuted ml-1 block">Capacidade</label>
                                <Input
                                  type="number"
                                  placeholder="100"
                                  className="text-xs bg-surface border-glassBorder text-textLight"
                                  value={t.capacity || ''}
                                  onChange={e => handleUpdateTicketType(idx, 'capacity', e.target.value)}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveTicketType(idx)}
                                title="Remover lote"
                                aria-label="Remover lote"
                                className="text-danger hover:text-red-400 p-2.5 border border-glassBorder bg-surface hover:bg-surfaceHover rounded-xl transition-all duration-300 cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 bg-surfaceHover/30 rounded-xl border border-dashed border-glassBorder text-[11px] text-textMuted">
                          Nenhum lote ou setor configurado. Cadastre lotes para habilitar múltiplos preços.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Test Event — Admin Only */}
            {userRole === 'admin' && (
              <div className="create-anim flex items-center gap-2.5 md:gap-3.5 surface rounded-2xl p-3.5 md:p-5 text-left">
                <input
                  type="checkbox"
                  id="testEvent"
                  className="accent-primary w-4 h-4 md:w-5 md:h-5 cursor-pointer border border-glassBorder rounded-md"
                  checked={!!isTestEvent}
                  onChange={e => setValue('isTestEvent', e.target.checked, { shouldValidate: true })}
                />
                <label htmlFor="testEvent" className="text-xs md:text-sm text-textMuted flex items-center gap-1.5 md:gap-2 cursor-pointer select-none font-medium">
                  <AlertTriangle size={14} className="text-accent" />
                  Evento de teste (só admin vê)
                </label>
              </div>
            )}

            <div className="create-anim pt-3 md:pt-4">
              <Button type="submit" loading={isSubmitting} fullWidth className="rounded-xl py-3 md:py-4 text-sm md:text-base">
                {isSubmitting ? (isEdit ? 'Salvando...' : 'Criando...') : (isEdit ? 'Salvar alterações' : 'Criar evento')}
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
        <div className="modal-backdrop fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="bg-background w-full max-w-lg h-[80vh] rounded-3xl border border-glassBorder shadow-md flex flex-col p-6 relative overflow-hidden animate-in zoom-in duration-300">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div className="text-left">
                <h3 className="font-display font-semibold text-xl text-textLight">Escolher localização</h3>
                <p className="text-xs text-textMuted">Busque ou clique no mapa para marcar</p>
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
            <div className="relative flex-1 rounded-2xl overflow-hidden border border-glassBorder bg-primary/5 shadow-inner flex flex-col">
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
              <div className="flex items-center justify-center gap-2 mt-4 text-primary">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs font-medium">Buscando endereço...</span>
              </div>
            )}

            {/* Address Preview */}
            {address && (
              <div className="mt-4 p-3.5 bg-surface border border-glassBorder rounded-2xl flex items-start gap-2.5 text-left">
                <MapPin className="text-primary shrink-0 mt-0.5" size={16} />
                <div className="min-w-0">
                  <span className="text-xs font-medium text-textMuted block">Endereço selecionado</span>
                  <p className="font-sans font-semibold text-xs text-textLight truncate leading-snug">{address}</p>
                </div>
              </div>
            )}

            <Button
              fullWidth
              className="mt-4 rounded-xl py-3.5"
              onClick={() => setShowMapModal(false)}
              disabled={!address}
            >
              Confirmar localização
            </Button>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {cropModalOpen && (
        <div className="fixed inset-0 z-[99999] bg-background/95 backdrop-blur-md flex flex-col pt-12 pb-6 px-4">
          <div className="flex justify-between items-center mb-6">
            <div className="text-left">
              <h2 className="font-display font-semibold text-xl text-textLight">Ajustar imagem</h2>
              <p className="text-xs text-textMuted">Recorte para exibição perfeita no feed</p>
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
            <Button
              type="button"
              variant="secondary"
              className="flex-1 rounded-xl py-4"
              onClick={() => { setCropModalOpen(false); setImageSrc(''); setCurrentFile(null); }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              loading={isUploading}
              className="flex-1 rounded-xl py-4"
              onClick={handleCropConfirm}
            >
              {isUploading ? 'Enviando...' : 'Confirmar corte'}
            </Button>
          </div>
        </div>
      )}

      {/* Custom Date Picker Modal */}
      {showDatePickerModal && (() => {
        const MONTHS_PT = [
          'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
          'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const tempHour = selectedTempTime.split(':')[0] || '20';
        const tempMinute = selectedTempTime.split(':')[1] || '00';

        return (
          <div className="modal-backdrop fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <div className="bg-background w-full max-w-[440px] rounded-3xl border border-glassBorder shadow-md flex flex-col p-5 sm:p-6 relative overflow-hidden animate-in zoom-in duration-300">
              {/* Header */}
              <div className="flex justify-between items-center mb-5">
                <div className="text-left">
                  <h3 className="font-display font-semibold text-xl text-textLight">Escolher data/horário</h3>
                  <p className="text-xs text-textMuted">Defina o dia e a hora do evento</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDatePickerModal(false)}
                  className="bg-primary/10 p-2.5 rounded-full text-primary hover:bg-primary/20 hover:scale-110 active:scale-95 transition-all cursor-pointer border-0"
                  title="Fechar"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Calendar Controls */}
              <div className="flex justify-between items-center mb-5 bg-surfaceHover/40 p-2 rounded-2xl border border-glassBorder/40">
                <button
                  type="button"
                  onClick={handleMonthPrev}
                  className="p-1.5 rounded-xl hover:bg-primary/10 hover:text-primary text-textLight transition-all border-0 bg-transparent cursor-pointer flex items-center justify-center active:scale-95"
                  title="Mês anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="font-display font-semibold text-sm text-textLight">
                  {MONTHS_PT[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </span>
                <button
                  type="button"
                  onClick={handleMonthNext}
                  className="p-1.5 rounded-xl hover:bg-primary/10 hover:text-primary text-textLight transition-all border-0 bg-transparent cursor-pointer flex items-center justify-center active:scale-95"
                  title="Próximo mês"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Calendar Grid Weekdays */}
              <div className="grid grid-cols-7 gap-1.5 text-center mb-3">
                {WEEKDAYS_PT.map((day) => (
                  <span key={day} className="text-[11px] sm:text-xs font-medium text-textMuted">
                    {day}
                  </span>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center mb-6">
                {generateCalendarCells(currentMonth).map((cell, idx) => {
                  const isSelected = selectedTempDate &&
                    cell.date.getDate() === selectedTempDate.getDate() &&
                    cell.date.getMonth() === selectedTempDate.getMonth() &&
                    cell.date.getFullYear() === selectedTempDate.getFullYear();

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedTempDate(cell.date);
                        if (!cell.isCurrentMonth) {
                          setCurrentMonth(new Date(cell.year, cell.month, 1));
                        }
                      }}
                      className={cn(
                        "w-10 h-10 xs:w-11 xs:h-11 sm:w-12 sm:h-12 flex items-center justify-center text-xs sm:text-sm font-sans rounded-full transition-all mx-auto cursor-pointer border-0 bg-transparent",
                        !cell.isCurrentMonth && "text-textMuted/30 hover:bg-surfaceHover/30",
                        cell.isCurrentMonth && !isSelected && "text-textLight hover:bg-surfaceHover font-semibold",
                        isSelected && "bg-primary text-textDark font-semibold shadow-sm hover:bg-primaryHover"
                      )}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>

              {/* Time Picker */}
              <div className="bg-surface text-textLight rounded-2xl p-4 flex flex-col items-center justify-center gap-3 mb-6 shadow-sm border border-glassBorder">
                <label className="text-xs font-medium text-textMuted flex items-center gap-1.5">
                  <Clock size={12} className="text-primary" />
                  Horário do evento
                </label>
                <div className="flex items-center justify-center gap-6 bg-surfaceHover/50 px-8 py-2 rounded-xl border border-glassBorder">
                  {/* Hour Control */}
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        let h = parseInt(tempHour, 10) + 1;
                        if (h > 23) h = 0;
                        setSelectedTempTime(`${String(h).padStart(2, '0')}:${tempMinute}`);
                      }}
                      className="p-1 rounded-xl bg-surface/50 border border-glassBorder hover:bg-primary/10 hover:text-primary text-textMuted transition-all cursor-pointer"
                      title="Aumentar hora"
                    >
                      <ChevronUp size={18} />
                    </button>
                    <span className="font-mono text-4xl font-semibold text-textLight select-none w-12 text-center leading-none">
                      {tempHour}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        let h = parseInt(tempHour, 10) - 1;
                        if (h < 0) h = 23;
                        setSelectedTempTime(`${String(h).padStart(2, '0')}:${tempMinute}`);
                      }}
                      className="p-1 rounded-xl bg-surface/50 border border-glassBorder hover:bg-primary/10 hover:text-primary text-textMuted transition-all cursor-pointer"
                      title="Diminuir hora"
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>

                  {/* Colon */}
                  <span className="text-textMuted font-mono text-3xl font-semibold mb-1 select-none">:</span>

                  {/* Minute Control */}
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        let m = parseInt(tempMinute, 10) + 5;
                        if (m > 59) m = 0;
                        setSelectedTempTime(`${tempHour}:${String(m).padStart(2, '0')}`);
                      }}
                      className="p-1 rounded-xl bg-surface/50 border border-glassBorder hover:bg-primary/10 hover:text-primary text-textMuted transition-all cursor-pointer"
                      title="Aumentar minuto"
                    >
                      <ChevronUp size={18} />
                    </button>
                    <span className="font-mono text-4xl font-semibold text-textLight select-none w-12 text-center leading-none">
                      {tempMinute}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        let m = parseInt(tempMinute, 10) - 5;
                        if (m < 0) m = 55;
                        setSelectedTempTime(`${tempHour}:${String(m).padStart(2, '0')}`);
                      }}
                      className="p-1 rounded-xl bg-surface/50 border border-glassBorder hover:bg-primary/10 hover:text-primary text-textMuted transition-all cursor-pointer"
                      title="Diminuir minuto"
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Confirm Button */}
              <Button
                type="button"
                fullWidth
                className="rounded-xl py-4"
                onClick={handleDatePickerConfirm}
              >
                Confirmar horário
              </Button>
            </div>
          </div>
        );
      })()}
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
          className="w-full h-12 bg-white/90 backdrop-blur-md border border-glassBorder rounded-xl px-12 text-sm shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-textLight"
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
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-glassBorder rounded-2xl shadow-md z-[120] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {predictions.map((p, idx) => (
            <button
              key={p.placePrediction?.placeId || idx}
              className="w-full text-left px-5 py-3 hover:bg-primary/5 text-xs border-b border-glassBorder last:border-0 flex flex-col gap-0.5"
              onClick={() => handleSelect(p)}
            >
              <span className="font-semibold text-textLight">{p.placePrediction?.text.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
