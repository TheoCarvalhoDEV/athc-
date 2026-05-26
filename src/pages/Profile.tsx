import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem, Registration } from '../lib/storage';
import gsap from 'gsap';
import { User, LogOut, Calendar, MapPin, Clock, Trash2, Navigation, Ticket, Camera, X, Users, Edit2, Mail, Download } from 'lucide-react';
import { InstagramIcon } from '../components/InstagramIcon';
import { useAuth } from '../contexts/AuthContext';

export const Profile = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { user, updateUser } = useAuth();
  const userRole = user?.role;

  // Estados do Perfil e Imagem
  const [imageUrl, setImageUrl] = useState<string>(user?.imageUrl || '');
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);

  const [editData, setEditData] = useState({
    name: user?.name || '',
    description: '',
    instagram: '',
    imageUrl: user?.imageUrl || ''
  });

  const compressImage = (file: File, maxWidth: number = 400, maxHeight: number = 400, quality: number = 0.7): Promise<string> => {
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

  const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingPhoto(true);
      try {
        if (file.size > 10 * 1024 * 1024) { // 10MB
          alert("A imagem é muito grande. Escolha uma foto de até 10MB.");
          return;
        }
        const compressed = await compressImage(file, 400, 400, 0.7);
        if (compressed) {
          const blob = dataURLtoBlob(compressed);
          const compressedFile = new File([blob], `profile_${user?.id || 'partner'}.jpg`, { type: 'image/jpeg' });
          const url = await storage.uploadFile(compressedFile, 'profiles');
          setEditData(prev => ({ ...prev, imageUrl: url }));
        }
      } catch (error) {
        console.error("Erro ao fazer upload da foto de perfil:", error);
        alert("Erro ao enviar imagem de perfil.");
      } finally {
        setIsUploadingPhoto(false);
      }
    }
  };

  // Estados para Modal de Participantes
  const [showParticipantsModal, setShowParticipantsModal] = useState<boolean>(false);
  const [selectedEventForParticipants, setSelectedEventForParticipants] = useState<EventItem | null>(null);
  const [participantsList, setParticipantsList] = useState<Registration[]>([]);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState<boolean>(false);

  const loadEvents = useCallback(async () => {
    try {
      const all = await storage.getEvents();
      const currentUser = storage.getCurrentUser();
      const currentUserId = currentUser?.id;
      const currentUserRole = currentUser?.role;
      const currentProfileId = currentUser?.profileId;

      const visibleEvents = currentUserRole === 'admin' ? all : all.filter(e => !e.isTestEvent);

      if (currentUserRole === 'admin') {
        setMyEvents(visibleEvents);
      } else if (currentUserRole === 'partner') {
        const targetId = currentProfileId || currentUserId;
        setMyEvents(visibleEvents.filter(e => e.creatorId === targetId));
      } else {
        const registrations = await storage.getRegistrations();
        const myRegs = registrations.filter(r => r.userId === currentUserId);
        const myRegIds = myRegs.map(r => r.eventId);
        setMyEvents(visibleEvents.filter(e => myRegIds.includes(e.id)));
      }
    } catch (error) {
      console.error("Erro ao carregar eventos do perfil:", error);
    }
  }, []);

  // Sincronizar dados em tempo real do Firestore
  useEffect(() => {
    const syncProfile = async () => {
      if (user && userRole === 'partner' && user.username) {
        try {
          const remoteProfile = await storage.getProfileByEmail(user.username);
          if (remoteProfile) {
            setImageUrl(remoteProfile.imageUrl || '');
            setEditData({
              name: remoteProfile.name || '',
              description: remoteProfile.description || '',
              instagram: remoteProfile.instagram || '',
              imageUrl: remoteProfile.imageUrl || ''
            });
            
            // Sincronizar contexto
            if (remoteProfile.imageUrl !== user.imageUrl || remoteProfile.name !== user.name || !user.profileId) {
              const updatedUser = {
                ...user,
                name: remoteProfile.name,
                imageUrl: remoteProfile.imageUrl || '',
                profileId: remoteProfile.id
              };
              updateUser(updatedUser);
              loadEvents();
            }
          }
        } catch (error) {
          console.error("Erro ao sincronizar perfil:", error);
        }
      }
    };
    syncProfile();
  }, [userRole, loadEvents]);

  useEffect(() => {
    loadEvents();
    const ctx = gsap.context(() => {
      gsap.from('.profile-el', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out',
      });
    }, containerRef);
    return () => ctx.revert();
  }, [loadEvents]);

  const handleDelete = async (id: string) => {
    await storage.deleteEvent(id);
    setMyEvents(prev => prev.filter(e => e.id !== id));
    setDeleteConfirm(null);
  };

  const handleLogout = async () => {
    await storage.logout();
    navigate('/');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.username) return;
    setIsSaving(true);
    try {
      const updated = await storage.updatePartnerProfile(user.username, {
        name: editData.name,
        description: editData.description,
        instagram: editData.instagram,
        imageUrl: editData.imageUrl
      });
      if (updated) {
        setImageUrl(editData.imageUrl);
        setImgFailed(false);
        setShowEditModal(false);
        
        // Atualiza contexto caso mudou a foto/nome base
        if (user) {
          updateUser({
            ...user,
            name: editData.name,
            imageUrl: editData.imageUrl
          });
        }
        
        loadEvents();
      }
    } catch (error) {
      console.error("Erro ao salvar informações do perfil:", error);
      alert("Erro ao salvar informações do perfil.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenParticipants = async (event: EventItem) => {
    setSelectedEventForParticipants(event);
    setShowParticipantsModal(true);
    setIsLoadingParticipants(true);
    try {
      const list = await storage.getRegistrationsForEvent(event.id);
      const sorted = list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setParticipantsList(sorted);
    } catch (error) {
      console.error("Erro ao buscar participantes:", error);
    } finally {
      setIsLoadingParticipants(false);
    }
  };

  const exportToCSV = () => {
    if (!participantsList || participantsList.length === 0) return;
    const headers = ['Nome;E-mail;Telefone;CPF;Situação de Pagamento;Data da Inscrição'];
    const rows = participantsList.map(p => {
      const name = p.userName || '';
      const email = p.userEmail || '';
      const phone = p.userPhone || '';
      const cpf = p.userCpf || '';
      const status = p.paymentStatus || 'Gratuito';
      const date = new Date(p.timestamp).toLocaleString('pt-BR');
      return `${name};${email};${phone};${cpf};${status};${date}`;
    });
    const csvContent = '\uFEFF' + headers.concat(rows).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `participantes_${selectedEventForParticipants?.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openMaps = (event: EventItem) => {
    const query = event.address || event.location;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
  };

  const openWhatsApp = (event: EventItem) => {
    const message = `Olá! Gostaria de comprar ingresso para o evento *${event.title}* (${event.time} - ${event.location}).`;
    const url = `https://wa.me/5565996097252?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img 
              src={`${import.meta.env.BASE_URL}logo.png?v=3`} 
              alt="Atchê" 
              className="w-12 h-12 object-contain mix-blend-multiply" 
            />
            <h1 className="font-brand text-3xl text-primary font-bold tracking-tight">Atchê</h1>
          </div>
          {user && (
            <button
              onClick={handleLogout}
              className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all cursor-pointer"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Profile Card */}
      <div className="profile-el mx-5 mb-6">
        {user ? (
          <div className="bg-gradient-to-br from-primary to-primary/80 text-textLight rounded-[2rem] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 shimmer pointer-events-none" />
            <div className="flex items-center gap-4 relative z-10">
              {/* Foto do Perfil com Botão de Alteração */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-background/20 flex items-center justify-center backdrop-blur-sm border border-textLight/20 overflow-hidden relative">
                  {imageUrl && !imgFailed ? (
                    <img 
                      src={imageUrl} 
                      className="w-full h-full object-cover" 
                      alt={user?.name} 
                      onError={() => setImgFailed(true)}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/30 flex items-center justify-center text-textLight font-sans font-bold text-2xl italic">
                      {user?.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : <User size={36} />}
                    </div>
                  )}
                </div>
                {userRole !== 'user' && (
                  <button 
                    onClick={() => setShowEditModal(true)}
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-textLight text-primary flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-all cursor-pointer"
                    title="Alterar Foto de Perfil"
                  >
                    <Camera size={12} />
                  </button>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-sans font-bold text-2xl truncate">{user.name}</h2>
                <p className="font-mono text-sm opacity-70 truncate">@{user.username}</p>
                {userRole !== 'user' && editData.description && (
                  <p className="text-[11px] font-sans opacity-85 mt-1 max-w-[200px] line-clamp-2">{editData.description}</p>
                )}
                
                {/* Social icons in profile card (only for partners/admins) */}
                {userRole !== 'user' && (editData.instagram || user.username) && (
                  <div className="flex items-center gap-2.5 mt-2">
                    {editData.instagram && (
                      <a href={`https://instagram.com/${editData.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100 hover:scale-105 transition-all text-textLight" title="Instagram">
                        <InstagramIcon size={14} />
                      </a>
                    )}
                    {user.username && (
                      <a href={`mailto:${user.username}`} className="opacity-80 hover:opacity-100 hover:scale-105 transition-all text-textLight" title="E-mail">
                        <Mail size={14} />
                      </a>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <Calendar size={13} className="opacity-60" />
                  <span className="font-mono text-xs opacity-60">
                    {userRole === 'user' ? (
                      `${myEvents.length} presença${myEvents.length !== 1 ? 's' : ''} confirmada${myEvents.length !== 1 ? 's' : ''}`
                    ) : (
                      `${myEvents.length} evento${myEvents.length !== 1 ? 's' : ''}`
                    )}
                  </span>
                </div>
                
                {userRole !== 'user' && (
                  <button 
                    onClick={() => setShowEditModal(true)}
                    className="flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full font-mono text-[10px] text-textLight transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    <Edit2 size={10} />
                    Editar Perfil (Redes e Foto)
                  </button>
                )}


              </div>
            </div>
          </div>
        ) : (
          <div className="bg-background border border-primary/20 rounded-[2rem] p-8 shadow-xl text-center flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <User className="text-primary/40" size={36} />
            </div>
            <h2 className="font-sans font-bold text-xl text-textDark mb-2">Área do Estabelecimento</h2>
            <p className="font-sans text-sm text-textDark/60 mb-6">
              Faça login para gerenciar seus eventos e aparecer no destaque.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full max-w-[200px] py-3 rounded-full bg-primary text-textLight font-bold text-sm shadow-lg hover:shadow-primary/30 transition-all hover:scale-105"
            >
              Fazer Login
            </button>
          </div>
        )}
      </div>


      {/* Events Section - only for logged in users */}
      {user && (
        <div>
          <div className="profile-el flex items-center gap-2 px-5 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h2 className="font-sans font-bold text-base text-textDark">
              {userRole === 'user' ? 'Minha Agenda' : 'Meus Eventos'}
            </h2>
          </div>

          <div className="flex flex-col gap-3 px-5">
            {myEvents.map((event) => (
              <div key={event.id} className="profile-el bg-background border border-primary/15 rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-md transition-all press-effect">
                <div 
                  className="p-5 cursor-pointer hover:bg-primary/[0.02] transition-colors group/card"
                  onClick={() => navigate(`/event/${event.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="badge-open">
                          Aberto
                        </span>
                      </div>
                      <h3 className="font-sans font-bold text-lg text-textDark leading-tight">{event.title}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3 text-textDark/60">
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className="text-primary/60" />
                      <span className="font-mono text-xs font-bold text-primary">{event.time}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); openMaps(event); }} className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer group-hover/card:text-primary/80">
                      <MapPin size={13} className="text-primary/60" />
                      <span className="font-mono text-xs hover:underline">{event.location}</span>
                    </button>
                  </div>

                  {event.address && (
                    <button onClick={(e) => { e.stopPropagation(); openMaps(event); }} className="mt-1.5 flex items-center gap-1 text-textDark/40 hover:text-primary/60 transition-colors cursor-pointer">
                      <span className="font-mono text-[11px] truncate">📍 {event.address}</span>
                    </button>
                  )}

                  <p className="font-sans text-sm text-textDark/60 mt-3 line-clamp-2 leading-relaxed">
                    {event.description}
                  </p>
                </div>

                <div className="flex border-t border-primary/10">
                  {user?.role === 'admin' || event.creatorId === (user?.profileId || user?.id) ? (
                    <>
                      <button
                        onClick={() => handleOpenParticipants(event)}
                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-primary font-bold text-[11px] uppercase tracking-wider hover:bg-primary/5 transition-colors cursor-pointer"
                      >
                        <Users size={16} />
                        Inscritos
                      </button>
                      <div className="w-px bg-primary/10" />
                      <button
                        onClick={() => navigate(`/edit/${event.id}`)}
                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-textDark/80 font-bold text-[11px] uppercase tracking-wider hover:bg-primary/5 transition-colors cursor-pointer"
                      >
                        <Edit2 size={16} />
                        Editar
                      </button>
                      <div className="w-px bg-primary/10" />
                      <button
                        onClick={() => setDeleteConfirm(event.id)}
                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-red-500/80 font-bold text-[11px] uppercase tracking-wider hover:bg-red-500/5 transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                        Excluir
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openWhatsApp(event)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-green-600 font-bold text-sm hover:bg-green-500/5 transition-colors cursor-pointer"
                      >
                        <Ticket size={14} />
                        Ingresso
                      </button>
                      <div className="w-px bg-primary/10" />
                      <button
                        onClick={() => openMaps(event)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-primary font-bold text-sm hover:bg-primary/5 transition-colors cursor-pointer"
                      >
                        <Navigation size={14} />
                        Como chegar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {myEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Calendar size={24} className="text-primary/40" />
                </div>
                <p className="font-sans text-textDark/50 text-sm mb-4">
                  {userRole === 'user' 
                    ? 'Você ainda não confirmou presença em nenhum evento.' 
                    : 'Você ainda não criou eventos.'}
                </p>
                {userRole === 'user' && (
                  <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-textLight border border-primary/20 rounded-full font-mono text-xs font-bold transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
                  >
                    Explorar Eventos
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] modal-backdrop flex items-center justify-center p-6" onClick={() => setDeleteConfirm(null)}>
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
                Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 rounded-full border-2 border-primary/20 text-textDark font-bold text-sm hover:bg-primary/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-3 rounded-full bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors beat-hover"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Perfil Completo */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] modal-backdrop flex items-center justify-center p-4 bg-background/80 backdrop-blur-md" onClick={() => setShowEditModal(false)}>
          <div
            className="bg-background rounded-[2rem] p-6 max-w-md w-full shadow-2xl border border-primary/10 animate-in zoom-in duration-300 relative flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              title="Fechar"
              aria-label="Fechar"
              onClick={() => setShowEditModal(false)} 
              className="absolute top-6 right-6 p-2 hover:bg-primary/5 rounded-full text-textDark/60 transition-colors cursor-pointer z-10"
            >
              <X size={18} />
            </button>

            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-2">
                <Edit2 size={24} />
              </div>
              <h3 className="font-sans text-2xl font-bold text-textDark">Editar Perfil</h3>
              <p className="text-xs text-textDark/50 mt-1">Atualize as informações públicas da sua marca</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-hide py-2">
              {/* Foto de Perfil Upload */}
              <div className="flex flex-col items-center gap-2 pb-2 border-b border-primary/5">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-primary/5 border-2 border-dashed border-primary/20 overflow-hidden flex items-center justify-center relative shadow-inner">
                    {editData.imageUrl ? (
                      <img src={editData.imageUrl} className="w-full h-full object-cover" alt="Prévia" />
                    ) : (
                      <User size={32} className="text-primary/30" />
                    )}
                    {isUploadingPhoto && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {editData.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditData({ ...editData, imageUrl: '' })}
                      className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 hover:scale-105 active:scale-95 transition-all cursor-pointer z-10"
                      title="Remover foto"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>
                  )}
                  <label htmlFor="profile-photo-upload" className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-primary text-textLight flex items-center justify-center shadow-lg hover:scale-105 transition-all cursor-pointer">
                    <Camera size={14} />
                    <input id="profile-photo-upload" title="Mudar Foto" aria-label="Mudar Foto" type="file" className="hidden" accept="image/*" disabled={isUploadingPhoto} onChange={handleProfilePhotoChange} />
                  </label>
                </div>
                <span className="text-[10px] font-bold text-primary/60 uppercase">Clique no ícone para alterar a foto</span>
              </div>

              {/* Informações Gerais */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-primary uppercase ml-2">Nome do Perfil</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome do seu estabelecimento ou atlética"
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="w-full h-12 bg-primary/5 border border-primary/10 rounded-2xl px-4 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-primary uppercase ml-2">Descrição / Sobre</label>
                  <textarea
                    placeholder="Escreva um breve texto sobre o estabelecimento ou atlética..."
                    value={editData.description}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    className="w-full min-h-[80px] bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                  />
                </div>
              </div>

              {/* Redes Sociais */}
              <div className="space-y-3 pt-2 border-t border-primary/5">
                <h4 className="text-xs font-bold text-textDark/60 uppercase px-1">Redes Sociais</h4>
                
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center bg-primary/5 border border-primary/10 rounded-2xl px-3 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary">
                    <InstagramIcon size={16} className="text-primary/60 mr-2 shrink-0" />
                    <input
                      type="text"
                      placeholder="Instagram (Ex: @seu.perfil)"
                      value={editData.instagram}
                      onChange={(e) => setEditData({ ...editData, instagram: e.target.value })}
                      className="w-full h-11 bg-transparent border-0 px-1 text-sm font-sans focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-3 pt-4 border-t border-primary/10 mt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3.5 rounded-full border border-primary/10 text-textDark font-bold text-sm hover:bg-primary/5 transition-all active:scale-95 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isUploadingPhoto}
                  className="flex-1 py-3.5 rounded-full bg-primary text-white font-bold text-sm shadow-lg hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Participantes Inscritos */}
      {showParticipantsModal && selectedEventForParticipants && (
        <div className="fixed inset-0 z-[100] modal-backdrop flex items-center justify-center p-6 bg-background/80 backdrop-blur-md" onClick={() => setShowParticipantsModal(false)}>
          <div
            className="bg-background rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-primary/10 animate-in zoom-in duration-300 relative flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-6 right-6 flex items-center gap-2">
              <button 
                onClick={exportToCSV}
                disabled={participantsList.length === 0 || isLoadingParticipants}
                className="p-2 bg-primary/10 hover:bg-primary text-primary hover:text-textLight rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar CSV"
              >
                <Download size={18} />
              </button>
              <button 
                title="Fechar"
                aria-label="Fechar"
                onClick={() => setShowParticipantsModal(false)} 
                className="p-2 hover:bg-primary/5 rounded-full text-textDark/60 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-3">
                <Users size={28} />
              </div>
              <h3 className="font-sans text-2xl font-bold text-textDark truncate px-4">{selectedEventForParticipants.title}</h3>
              <p className="text-xs text-textDark/50 mt-1">Lista de Presenças Confirmadas</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-3 min-h-[150px] max-h-[40vh]">
              {isLoadingParticipants ? (
                <div className="flex flex-col items-center justify-center py-12 text-primary gap-2">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="font-mono text-xs font-bold animate-pulse">Carregando lista...</span>
                </div>
              ) : participantsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-textDark/40">
                  <div className="w-12 h-12 bg-primary/5 rounded-full flex items-center justify-center mb-3">
                    <User size={20} className="text-primary/30" />
                  </div>
                  <p className="font-sans text-sm font-semibold">Nenhum participante ainda</p>
                  <p className="font-sans text-[11px] text-textDark/50 mt-0.5">As confirmações aparecerão aqui</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1 mb-2">
                    <span className="text-[10px] font-bold text-primary uppercase">Nome do Participante</span>
                    <span className="font-mono text-[10px] text-primary/70 font-bold">{participantsList.length} confirmado(s)</span>
                  </div>
                  {participantsList.map((reg) => {
                    const isPaid = reg.paymentStatus === 'Pago';
                    return (
                      <div key={reg.id} className="p-4 bg-primary/5 border border-primary/10 rounded-[1.5rem] space-y-2 text-left">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                              {reg.userName ? reg.userName.charAt(0).toUpperCase() : <User size={14} />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-sans font-bold text-sm text-textDark truncate leading-snug">{reg.userName || 'Usuário Anônimo'}</p>
                              <p className="font-mono text-[10px] text-textDark/45 truncate leading-none mt-0.5">{reg.userEmail || 'Sem e-mail'}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide shrink-0 ${
                            isPaid 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          }`}>
                            {reg.paymentStatus || 'Gratuito'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-primary/5 text-[10px] font-mono text-textDark/60">
                          <div>
                            <span className="text-[8px] font-bold text-primary/70 uppercase block">Telefone</span>
                            <span>{reg.userPhone || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[8px] font-bold text-primary/70 uppercase block">CPF</span>
                            <span>{reg.userCpf || '-'}</span>
                          </div>
                        </div>
                        <div className="text-[9px] font-mono text-textDark/40 text-right pt-1">
                          Confirmado: {new Date(reg.timestamp).toLocaleDateString('pt-BR')} {new Date(reg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-primary/10 mt-4">
              <button
                onClick={() => setShowParticipantsModal(false)}
                className="w-full py-3.5 rounded-full bg-primary text-white font-bold text-sm shadow-lg hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
};
