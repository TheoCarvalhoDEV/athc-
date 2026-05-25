import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { storage } from '../lib/storage';
import type { AppProfile } from '../lib/storage';
import { cn } from '../lib/utils';
import gsap from 'gsap';
import { Image as ImageIcon, MapPin, X, Plus, Calendar as CalendarIcon, Clock, Map as MapIcon, Loader2, Search as SearchIcon } from 'lucide-react';
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
  ticketPrice: z.string().optional(),
  hasPixTickets: z.boolean().optional(),
  pixTicketPrice: z.string().optional(),
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
      ticketPrice: '',
      hasPixTickets: false,
      pixTicketPrice: '',
      whatsappContacts: [{ name: '', phone: '' }],
      whatsappNumber: ''
    }
  });
  
  const mediaUrls = watch('mediaUrls');
  const hasTickets = watch('hasTickets');
  const hasPixTickets = watch('hasPixTickets');
  const location = watch('location');
  const address = watch('address');
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([- 16.0669, -57.6868]); // Cuiabá center
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
  const [profiles, setProfiles] = useState<AppProfile[]>([]);
  const [originalCreatorId, setOriginalCreatorId] = useState<string | null>(null);

  useEffect(() => {
    const loadProfiles = async () => {
      const data = await storage.getProfiles();
      setProfiles(data);
    };
    loadProfiles();
  }, []);

  useEffect(() => {
    const loadEventData = async () => {
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
              whatsappContacts: ev.whatsappContacts || (ev.whatsappNumber ? [{ name: ev.whatsappName || '', phone: ev.whatsappNumber }] : [{ name: '', phone: '' }]),
              whatsappNumber: ev.whatsappNumber || ''
            });
            setOriginalCreatorId(ev.creatorId);
          }
        } catch (error) {
          console.error("Erro ao carregar dados do evento para edição:", error);
        }
      }
    };
    loadEventData();
  }, [id]);

  useEffect(() => {
    if (!userId || (userRole !== 'partner' && userRole !== 'admin')) {
      navigate('/feed');
      return;
    }
  }, [userId, userRole, navigate]);

  // Filter profiles that are establishments or athletics to show as suggestions
  const suggestions = profiles.map(p => ({
    name: p.name,
    addr: p.description || '', // Using description as fallback address
    coords: (p.id === 'p1' ? [-16.0669, -57.6868] :
      p.id === 'p2' ? [-16.0680, -57.6890] :
      p.id === 'p3' ? [-16.0650, -57.6850] :
      [-16.0669, -57.6868]) as [number, number]
  }));

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.form-el', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out',
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const onSubmit = async (data: EventFormValues) => {
    const targetCreatorId = user?.profileId || userId!;
    const eventData = {
      id: id || Date.now().toString(),
      ...data,
      whatsappContacts: data.whatsappContacts?.filter(c => c.phone.trim() !== '') || [],
      publicType: data.publicType as any,
      creatorId: id ? (originalCreatorId || targetCreatorId) : targetCreatorId,
    };
    await storage.saveEvent(eventData as any);
    toast.success('Evento salvo com sucesso!');
    navigate('/profile');
  };

  const onError = (errors: any) => {
    Object.values(errors).forEach((err: any) => {
      toast.error(err.message);
    });
  };
  const compressImage = (file: File, maxWidth: number = 600, maxHeight: number = 600, quality: number = 0.5): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        };
        img.onerror = () => {
          resolve(event.target?.result as string);
        };
      };
      reader.onerror = () => {
        resolve('');
      };
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
    // Reseta o input para permitir selecionar a mesma imagem se o modal for fechado
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

  const selectMockLocation = (loc: string, addr: string) => {
    setValue('location', loc); setValue('address', addr, { shouldValidate: true });
    setShowMapModal(false);
  };

  const getAddressFromCoords = async (lat: number, lng: number) => {
    setIsSearching(true);
    // Usando Geocoder do Google se disponível, senão fallback Nominatim
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data = await response.json();
      const addr = data.display_name;
      const name = data.address.road || data.address.suburb || "Local Selecionado";
      setValue('location', name); setValue('address', addr, { shouldValidate: true });
    } catch (error) {
      console.error("Error fetching address:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // Google Maps Click Handler
  const GoogleMapEvents = () => {
    const map = useMap();

    useEffect(() => {
      if (!map) return;

      const listener = map.addListener('click', async (e: any) => {
        const latlng = e.latLng.toJSON();
        setSelectedPos([latlng.lat, latlng.lng]);

        // Using Nominatim (free) instead of Google Geocoding API
        getAddressFromCoords(latlng.lat, latlng.lng);
      });

      return () => {
        // @ts-ignore
        if (typeof google !== 'undefined') {
          // @ts-ignore
          google.maps.event.removeListener(listener);
        }
      };
    }, [map]);

    if (!map) return null;

    return selectedPos ? <AdvancedMarker position={{ lat: selectedPos[0], lng: selectedPos[1] }} /> : null;
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-8 px-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 px-2">
        <div className="flex items-center gap-3">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png?v=3`} 
            alt="Atchê" 
            className="w-12 h-12 object-contain mix-blend-multiply" 
          />
          <h1 className="font-brand text-3xl text-primary font-bold tracking-tight">Atchê</h1>
        </div>
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-textLight flex items-center justify-center shadow-lg text-sm font-bold overflow-hidden">
          {user?.imageUrl ? (
            <img src={user.imageUrl} className="w-full h-full object-cover" alt={user.name} />
          ) : (
            user?.name?.charAt(0).toUpperCase() || 'U'
          )}
        </div>
      </div>

      {user ? (
        <form onSubmit={formSubmit(onSubmit, onError)} className="space-y-4 px-2">
          <div className="form-el">
            <Input
              placeholder="Nome do evento..."
              required
              {...register('title')}
            />
          </div>

          <div className="form-el flex gap-3">
            <div className="relative flex-1">
              <Input
                type="date"
                required
                className="pl-10"
                {...register('date')}
              />
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/60" size={18} />
            </div>
            <div className="relative flex-1">
              <Input
                type="time"
                required
                className="pl-10"
                {...register('time')}
              />
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/60" size={18} />
            </div>
          </div>

          <div className="form-el flex gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="Local (ex: Centro)..."
                required
                {...register('location')}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowMapModal(true)}
              className="bg-primary/10 text-primary p-3 rounded-full hover:bg-primary/20 transition-all flex items-center justify-center"
              title="Escolher no Mapa"
            >
              <MapIcon size={20} />
            </button>
          </div>

          <div className="form-el relative">
            <Input
              placeholder="Endereço exato..."
              required
              className="pl-10"
              {...register('address')}
            />
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/60" size={18} />
          </div>



          <div className="form-el">
            <div className="grid grid-cols-3 gap-3 mb-3">
              {mediaUrls.map((url: string, index: number) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-primary/20 shadow-sm group">
                  <img src={url} alt="Upload" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeMedia(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remover Imagem"
                    aria-label="Remover Imagem"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {mediaUrls.length < 6 && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-primary/30 flex flex-col items-center justify-center cursor-pointer hover:bg-primary/5 transition-colors">
                  {isUploading ? (
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="text-primary/60" size={24} />
                  )}
                  <span className="text-[10px] font-bold text-primary/60 mt-1">{isUploading ? '...' : 'Add'}</span>
                  <input type="file" className="hidden" accept="image/*" disabled={isUploading} onChange={handleFileChange} />
                </label>
              )}
            </div>
            {mediaUrls.length === 0 && (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-primary/40 rounded-2xl cursor-pointer hover:bg-primary/5 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {isUploading ? (
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-primary/60 mb-2" />
                  )}
                  <p className="text-sm text-textDark/70">
                    <span className="font-bold">{isUploading ? 'Enviando...' : 'Clique para enviar'}</span> {isUploading ? 'suas imagens' : 'fotos'}
                  </p>
                  <p className="text-[10px] text-textDark/40">Recorte de foto disponível. Máximo 6 imagens.</p>
                </div>
                <input type="file" className="hidden" accept="image/*" disabled={isUploading} onChange={handleFileChange} />
              </label>
            )}
          </div>

          <div className="form-el pt-2">
            <textarea
              placeholder="Descrição..."
              className="flex min-h-[120px] w-full rounded-[1.5rem] border border-primary/20 bg-background px-4 py-3 text-sm text-textDark transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              required
              {...register('description')}
            ></textarea>
          </div>

          <div className="form-el pt-4 flex flex-col justify-center">
            <div className="space-y-4 pt-4 border-t border-primary/10 form-el">
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-[1.5rem] border border-primary/10">
                <div>
                  <p className="font-bold text-textDark text-sm">Venda de Ingressos</p>
                  <p className="text-[10px] text-textDark/50">Ativar compra via WhatsApp</p>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('hasTickets', !hasTickets, { shouldValidate: true })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative flex items-center px-1",
                    hasTickets ? "bg-primary" : "bg-primary/20"
                  )}
                  title="Alternar venda de ingressos"
                  aria-label="Alternar venda de ingressos"
                >
                  <div className={cn(
                    "w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                    hasTickets ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>
              </div>

                {hasTickets && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-4 border border-primary/10 rounded-[1.5rem] bg-primary/5">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-primary uppercase ml-4">Preço do Ingresso (Opcional)</label>
                        <Input
                          placeholder="Ex: R$ 30,00 ou Lote 1 - 40,00"
                          {...register('ticketPrice')}
                          className="rounded-[1.5rem] bg-background"
                        />
                      </div>
                    </div>
                    {(watch('whatsappContacts') || [{name: '', phone: ''}]).map((_: {name: string, phone: string}, idx: number) => (
                      <div key={idx} className="p-4 border border-primary/10 rounded-[1.5rem] bg-primary/5 relative">
                        {(watch('whatsappContacts') || []).length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => {
                              const current = watch('whatsappContacts') || [];
                              setValue('whatsappContacts', current.filter((_: {name: string, phone: string}, i: number) => i !== idx));
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 z-10"
                          >
                            <X size={12} />
                          </button>
                        )}
                        <div className="space-y-2 mb-3">
                          <label className="text-xs font-bold text-primary uppercase ml-4">Número do WhatsApp</label>
                          <Input
                            type="tel"
                            placeholder="65 99999-9999"
                            {...register(`whatsappContacts.${idx}.phone` as const)}
                            className="rounded-[1.5rem] bg-background"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary uppercase ml-4">Tratar com (Nome)</label>
                          <Input
                            placeholder="Ex: João Silva ou Diretoria"
                            {...register(`whatsappContacts.${idx}.name` as const)}
                            className="rounded-[1.5rem] bg-background"
                          />
                        </div>
                      </div>
                    ))}
                    
                    {(watch('whatsappContacts') || []).length < 5 && (
                      <button
                        type="button"
                        onClick={() => {
                          const current = watch('whatsappContacts') || [];
                          setValue('whatsappContacts', [...current, { name: '', phone: '' }]);
                        }}
                        className="w-full py-3 rounded-full border-2 border-dashed border-primary/20 text-primary font-bold text-xs hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus size={16} /> Adicionar outro número
                      </button>
                    )}
                  </div>
                )}
            </div>
            
            {/* Venda Pix */}
            <div className="space-y-4 pt-4 border-t border-primary/10 form-el">
                <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-[1.5rem] border border-emerald-100">
                  <div>
                    <p className="font-bold text-emerald-800 text-sm">Venda Automática via Pix</p>
                    <p className="text-[10px] text-emerald-600/70">Ativar checkout de pagamento no app</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setValue('hasPixTickets', !hasPixTickets, { shouldValidate: true })}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative flex items-center px-1",
                      hasPixTickets ? "bg-emerald-500" : "bg-emerald-200"
                    )}
                    title="Alternar venda via Pix"
                    aria-label="Alternar venda via Pix"
                  >
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                      hasPixTickets ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>

                {hasPixTickets && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 p-4 border border-emerald-100 rounded-[1.5rem] bg-emerald-50/50">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-emerald-700 uppercase ml-4">Valor do Ingresso (R$)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ex: 50.00"
                        {...register('pixTicketPrice')}
                        className="rounded-[1.5rem] bg-white border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full mt-4 rounded-full py-4 shadow-lg text-lg">
            {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : (id ? 'Salvar Alterações' : 'Publicar Evento')}
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      )}

      {/* Modal do Mapa */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm p-4 flex flex-col pt-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-sans font-bold text-lg text-textDark">Escolher Local</h2>
            <button type="button" onClick={() => setShowMapModal(false)} className="bg-primary/10 p-2 rounded-full text-primary" title="Fechar Mapa" aria-label="Fechar Mapa">
              <X size={20} />
            </button>
          </div>

          <div className="relative flex-1 rounded-3xl overflow-hidden border border-primary/20 bg-primary/5 shadow-2xl flex flex-col">
            <div className="absolute top-4 left-4 right-4 z-10">
              <div className="bg-background rounded-full shadow-lg border border-primary/10 overflow-hidden relative">
                <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-textDark/40" />
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
            </div>
            <Map
                mapId={GOOGLE_MAP_ID}
                center={{ lat: mapCenter[0], lng: mapCenter[1] }}
                zoom={15}
                gestureHandling={'greedy'}
                disableDefaultUI={true}
                onIdle={() => {
                  // Update center state if needed
                }}
              >
                <GoogleMapEvents />
                {selectedPos && (
                  <AdvancedMarker position={{ lat: selectedPos[0], lng: selectedPos[1] }} />
                )}
              </Map>
            </div>

            {isSearching && (
              <div className="flex items-center justify-center gap-2 mb-4 text-primary animate-pulse">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs font-bold font-mono">Buscando endereço...</span>
              </div>
            )}

            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 scrollbar-hide">
              <p className="text-xs font-bold text-textDark/50 uppercase tracking-widest px-2">Sugestões de Parceiros</p>
              {suggestions.map((loc, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelectedPos(loc.coords);
                    setMapCenter(loc.coords);
                    selectMockLocation(loc.name, loc.addr);
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all text-left group"
                >
                  <MapPin size={18} className="text-primary/60 group-hover:scale-125 transition-transform" />
                  <div>
                    <p className="font-sans font-bold text-sm text-textDark">{loc.name}</p>
                    <p className="font-mono text-[10px] text-textDark/50">{loc.addr}</p>
                  </div>
                </button>
              ))}
            </div>

            <Button
              className="w-full mt-6 rounded-full py-3"
              onClick={() => setShowMapModal(false)}
              disabled={!address}
            >
              Confirmar Localização
            </Button>
        </div>
      )}

      {/* Crop Modal */}
      {cropModalOpen && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col pt-12 pb-6 px-4">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="font-sans font-bold text-xl text-textDark">Ajustar Imagem</h2>
              <p className="text-xs text-textDark/50">Recorte para exibição perfeita no Feed</p>
            </div>
            <button type="button" onClick={() => { setCropModalOpen(false); setImageSrc(''); setCurrentFile(null); }} className="bg-primary/10 p-2 rounded-full text-primary" title="Cancelar">
              <X size={20} />
            </button>
          </div>
          
          <div className="relative flex-1 bg-black/5 rounded-3xl overflow-hidden mb-6 border border-primary/20 shadow-inner">
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
              className="flex-1 rounded-full py-4 border-2 border-primary/20 text-primary font-bold hover:bg-primary/5 transition-all"
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
          className="w-full h-12 bg-white/90 backdrop-blur-md border border-primary/20 rounded-2xl px-12 text-sm shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
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
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-primary/10 rounded-[1.5rem] shadow-2xl z-[120] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {predictions.map((p, idx) => (
            <button
              key={p.placePrediction?.placeId || idx}
              className="w-full text-left px-5 py-3 hover:bg-primary/5 text-xs border-b border-primary/5 last:border-0 flex flex-col gap-0.5"
              onClick={() => handleSelect(p)}
            >
              <span className="font-bold text-textDark">{p.placePrediction?.text.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
