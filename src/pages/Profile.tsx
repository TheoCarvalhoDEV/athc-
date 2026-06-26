import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem, Registration } from '../lib/storage';
import gsap from 'gsap';
import { User, LogOut, Calendar, MapPin, Clock, Trash2, Navigation, Ticket, Camera, X, Users, Edit2, Mail, Download, Plus, ScanLine, Wallet, ChevronRight } from 'lucide-react';
import { InstagramIcon } from '../components/InstagramIcon';
import { TicketModal } from '../components/TicketModal';
import { NotificationToggle } from '../components/NotificationToggle';
import { useAuth } from '../contexts/AuthContext';
import { compressImage, dataURLtoBlob } from '../lib/imageUtils';
import toast from 'react-hot-toast';

const formatCPF = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value;
};

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
  const [activeTab, setActiveTab] = useState<'public' | 'test'>('public');

  // Estados do Ticket
  const [myRegistrations, setMyRegistrations] = useState<Registration[]>([]);
  const [selectedRegForTicket, setSelectedRegForTicket] = useState<Registration | null>(null);
  const [selectedEventForTicket, setSelectedEventForTicket] = useState<EventItem | null>(null);
  const [showTicketModal, setShowTicketModal] = useState<boolean>(false);

  // Estados de Geração Manual de Ingressos
  const [showManualTicketModal, setShowManualTicketModal] = useState<boolean>(false);
  const [manualName, setManualName] = useState<string>('');
  const [manualEmail, setManualEmail] = useState<string>('');
  const [manualPhone, setManualPhone] = useState<string>('');
  const [manualCpf, setManualCpf] = useState<string>('');
  const [manualTicketTypeId, setManualTicketTypeId] = useState<string>('');
  const [manualPaymentStatus, setManualPaymentStatus] = useState<string>('Cortesia');
  const [isGeneratingManualTicket, setIsGeneratingManualTicket] = useState<boolean>(false);

  const [editData, setEditData] = useState({
    name: user?.name || '',
    description: '',
    instagram: '',
    imageUrl: user?.imageUrl || ''
  });



  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingPhoto(true);
      try {
        if (file.size > 10 * 1024 * 1024) { // 10MB
          toast.error("A imagem é muito grande. Escolha uma foto de até 10MB.");
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
        toast.error("Erro ao enviar imagem de perfil.");
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
  const [participantsLastDoc, setParticipantsLastDoc] = useState<any>(null);
  const [hasMoreParticipants, setHasMoreParticipants] = useState<boolean>(true);
  const [isLoadingMoreParticipants, setIsLoadingMoreParticipants] = useState<boolean>(false);

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
      } else if (currentUserId) {
        const myRegs = await storage.getRegistrationsForUser(currentUserId);
        setMyRegistrations(myRegs);
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
      toast.error("Erro ao salvar informações do perfil.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenParticipants = async (event: EventItem) => {
    setSelectedEventForParticipants(event);
    setShowParticipantsModal(true);
    setIsLoadingParticipants(true);
    setParticipantsList([]);
    setParticipantsLastDoc(null);
    setHasMoreParticipants(true);
    try {
      const { registrations: list, lastDoc } = await storage.getPaginatedRegistrationsForEvent(event.id, null, 10);
      // Ordena por data decrescente (já ordenado pelo Firestore no webhook, mas garantimos aqui)
      const sorted = list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setParticipantsList(sorted);
      setParticipantsLastDoc(lastDoc);
      if (list.length < 10) {
        setHasMoreParticipants(false);
      }
    } catch (error) {
      console.error("Erro ao buscar participantes:", error);
    } finally {
      setIsLoadingParticipants(false);
    }
  };

  const handleLoadMoreParticipants = async () => {
    if (!selectedEventForParticipants || isLoadingMoreParticipants || !hasMoreParticipants) return;
    setIsLoadingMoreParticipants(true);
    try {
      const { registrations: list, lastDoc } = await storage.getPaginatedRegistrationsForEvent(
        selectedEventForParticipants.id,
        participantsLastDoc,
        10
      );
      const sorted = list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setParticipantsList(prev => [...prev, ...sorted]);
      setParticipantsLastDoc(lastDoc);
      if (list.length < 10) {
        setHasMoreParticipants(false);
      }
    } catch (error) {
      console.error("Erro ao buscar mais participantes:", error);
    } finally {
      setIsLoadingMoreParticipants(false);
    }
  };

  const handleGenerateManualTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventForParticipants) return;
    if (!manualName) {
      toast.error("Preencha o nome do participante.");
      return;
    }

    setIsGeneratingManualTicket(true);
    
    // Encontrar nome do lote/tipo do ticket selecionado
    let ticketTypeName = 'Geral';
    if (manualTicketTypeId && selectedEventForParticipants.tickets) {
      const selectedTicket = selectedEventForParticipants.tickets.find(t => t.id === manualTicketTypeId);
      if (selectedTicket) {
        ticketTypeName = selectedTicket.name;
      }
    }

    const cleanCpf = manualCpf.replace(/\D/g, '');
    const cleanPhone = manualPhone.replace(/\D/g, '');

    const newRegistration: Registration = {
      id: `man_${Date.now()}`,
      eventId: selectedEventForParticipants.id,
      userId: `guest-manual-${Date.now()}`,
      userName: manualName,
      userEmail: manualEmail || '',
      userPhone: cleanPhone || '',
      userCpf: cleanCpf || '',
      paymentStatus: manualPaymentStatus, // Cortesia / Pago (Dinheiro) / Pago (Pix Manual)
      timestamp: new Date().toISOString(),
      ticketTypeId: manualTicketTypeId || '',
      ticketTypeName: ticketTypeName
    };

    try {
      // Salvar no banco
      const realDocId = await storage.saveRegistration(newRegistration);
      
      // Atualizar o ID real retornado
      const regWithRealId = { ...newRegistration, id: realDocId };

      // Se um lote foi selecionado, atualizar a quantidade vendida de ingressos no evento
      if (manualTicketTypeId && selectedEventForParticipants.tickets) {
        const updatedTickets = selectedEventForParticipants.tickets.map(t => {
          if (t.id === manualTicketTypeId) {
            const newSold = (t.sold || 0) + 1;
            return {
              ...t,
              sold: newSold,
              status: newSold >= t.capacity ? 'sold_out' as const : t.status
            };
          }
          return t;
        });

        // Atualizar o evento
        const updatedEvent = { ...selectedEventForParticipants, tickets: updatedTickets };
        await storage.saveEvent(updatedEvent);
        setSelectedEventForParticipants(updatedEvent);
      }

      // Adicionar à lista local de participantes exibida na tela
      setParticipantsList(prev => [regWithRealId, ...prev]);

      // Resetar form
      setManualName('');
      setManualEmail('');
      setManualPhone('');
      setManualCpf('');
      setManualTicketTypeId('');
      setManualPaymentStatus('Cortesia');
      
      setShowManualTicketModal(false);
      toast.success("Ingresso manual gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar ingresso manual:", error);
      toast.error("Erro ao gerar ingresso manual.");
    } finally {
      setIsGeneratingManualTicket(false);
    }
  };

  const exportToCSV = async () => {
    if (!selectedEventForParticipants) return;
    setIsLoadingParticipants(true);
    try {
      // Para o CSV, buscamos a lista completa para garantir a exportação correta de todos os participantes
      const fullList = await storage.getRegistrationsForEvent(selectedEventForParticipants.id);
      if (fullList.length === 0) {
        toast.error("Nenhum participante confirmado para exportar.");
        return;
      }
      const sorted = fullList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const headers = ['Nome;E-mail;Telefone;CPF;Situação de Pagamento;Data da Inscrição'];
      const rows = sorted.map(p => {
        const name = p.userName || '';
        const email = p.userEmail || '';
        const phone = p.userPhone || '';
        const cpf = p.userCpf || '';
        const status = p.paymentStatus || 'Gratuito';
        const date = new Date(p.timestamp).toLocaleString('pt-BR');
        
        // Formata os campos e envolve com ="..." para forçar o Excel a tratá-los como texto de forma segura
        const formattedPhone = phone ? `="${formatPhone(phone)}"` : '""';
        const formattedCpf = cpf ? `="${formatCPF(cpf)}"` : '""';
        
        return `${name};${email};${formattedPhone};${formattedCpf};${status};${date}`;
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
    } catch (error) {
      console.error("Erro ao exportar CSV:", error);
      toast.error("Ocorreu um erro ao exportar a lista.");
    } finally {
      setIsLoadingParticipants(false);
    }
  };

  const openMaps = (event: EventItem) => {
    const query = event.address || event.location;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
  };

  const openWhatsApp = (event: EventItem) => {
    const contacts = event.whatsappContacts && event.whatsappContacts.length > 0
      ? event.whatsappContacts
      : (event.whatsappNumber ? [{ name: (event as any).whatsappName || '', phone: event.whatsappNumber }] : []);
    const contact = contacts[0];
    if (!contact) return;
    let cleanPhone = contact.phone.replace(/\D/g, '');
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = `55${cleanPhone}`;
    }
    const message = `Olá${contact.name ? ` ${contact.name}` : ''}! Gostaria de comprar ingresso para o evento *${event.title}* (${event.time} - ${event.location}).`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const filteredEvents = myEvents.filter(event => {
    if (userRole !== 'admin') return true;
    if (activeTab === 'public') return !event.isTestEvent;
    return !!event.isTestEvent;
  });

  return (
    <div ref={containerRef} className="min-h-screen bg-background pb-28 relative">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 relative z-10 md:hidden">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img 
              src={`${import.meta.env.BASE_URL}logo.png?v=5`} 
              alt="Atchêi" 
              className="w-auto h-14 object-contain brightness-110 drop-shadow-sm" 
            />
          </div>
          {user && (
            <button
              onClick={handleLogout}
              className="w-12 h-12 bg-surface border border-glassBorder text-primary rounded-xl flex items-center justify-center shadow-sm hover:border-danger/40 hover:text-danger hover:-translate-y-0.5 transition-all duration-200 neo-click cursor-pointer"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Profile Card */}
      <div className="profile-el mx-5 mb-6 relative z-10">
        {user ? (
          <div className="surface rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center gap-5 relative z-10">
              {/* Foto do Perfil com Botão de Alteração */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-surface/40 flex items-center justify-center border border-glassBorder overflow-hidden relative shadow-md">
                  {imageUrl && !imgFailed ? (
                    <img 
                      src={imageUrl} 
                      className="w-full h-full object-cover" 
                      alt={user?.name} 
                      onError={() => setImgFailed(true)}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-background/10 to-background/30 flex items-center justify-center text-textMuted font-sans font-bold text-2xl italic">
                      {user?.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : <User size={36} />}
                    </div>
                  )}
                </div>
                {userRole !== 'user' && (
                  <button 
                    onClick={() => setShowEditModal(true)}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-surface/85 border border-glassBorder text-accent flex items-center justify-center shadow-md hover:bg-surfaceHover hover:scale-110 hover:border-accent/40 active:scale-95 transition-all duration-300 cursor-pointer"
                    title="Alterar Foto de Perfil"
                  >
                    <Camera size={12} />
                  </button>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h2 className="font-display font-semibold text-2xl text-textLight">{user.name}</h2>
                <p className="font-mono text-xs text-textMuted mt-0.5 truncate">@{user.username}</p>
                {userRole !== 'user' && editData.description && (
                  <p className="text-xs font-sans text-textLight font-medium mt-2 max-w-[200px] line-clamp-2 leading-relaxed">{editData.description}</p>
                )}
                
                {/* Social icons in profile card (only for partners/admins) */}
                {userRole !== 'user' && (editData.instagram || user.username) && (
                  <div className="flex items-center gap-2.5 mt-2.5">
                    {editData.instagram && (
                      <a href={`https://instagram.com/${editData.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primaryHover hover:scale-110 transition-all" title="Instagram">
                        <InstagramIcon size={14} />
                      </a>
                    )}
                    {user.username && (
                      <a href={`mailto:${user.username}`} className="text-primary hover:text-primaryHover hover:scale-110 transition-all" title="E-mail">
                        <Mail size={14} />
                      </a>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2.5">
                  <Calendar size={13} className="text-accent" />
                  <span className="text-xs text-textMuted font-medium">
                    {userRole === 'user' ? (
                      `${myEvents.length} presença${myEvents.length !== 1 ? 's' : ''} confirmada${myEvents.length !== 1 ? 's' : ''}`
                    ) : (
                      `${myEvents.length} evento${myEvents.length !== 1 ? 's' : ''} criado${myEvents.length !== 1 ? 's' : ''}`
                    )}
                  </span>
                </div>
                
                {userRole !== 'user' && (
                  <button 
                    onClick={() => setShowEditModal(true)}
                    className="flex items-center gap-1.5 mt-3.5 px-3 py-1.5 bg-surface border border-glassBorder hover:border-accent/40 rounded-lg font-sans text-xs font-medium text-textLight hover:text-accent transition-all duration-200 cursor-pointer hover:-translate-y-0.5 active:translate-y-0 neo-click"
                  >
                    <Edit2 size={12} />
                    Editar perfil
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="surface rounded-2xl p-8 text-center flex flex-col items-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 mb-6">
              <User className="text-primary" size={36} />
            </div>
            <h2 className="font-display font-semibold text-xl text-accent mb-2">Área do parceiro</h2>
            <p className="font-sans text-sm text-textMuted mb-6 max-w-xs leading-relaxed">
              Faça login para gerenciar seus eventos, ver participantes e destacar suas festas.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full max-w-[200px] py-3.5 rounded-xl bg-primary text-textDark font-sans font-semibold text-sm hover:bg-primaryHover hover:-translate-y-0.5 active:scale-95 transition-all duration-200 neo-click cursor-pointer"
            >
              Fazer login
            </button>
          </div>
        )}
      </div>

      {/* Acesso ao painel financeiro (parceiros/admin) — também disponível na sidebar do desktop */}
      {user && userRole !== 'user' && (
        <div className="profile-el mx-5 mb-6 relative z-10">
          <button
            onClick={() => navigate('/financeiro')}
            className="w-full surface surface-hover rounded-2xl p-4 flex items-center gap-4 text-left cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Wallet size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-sans font-semibold text-sm text-textLight">Painel financeiro</p>
              <p className="text-xs text-textMuted mt-0.5 leading-relaxed">Vendas e faturamento dos seus eventos</p>
            </div>
            <ChevronRight size={18} className="text-textMuted group-hover:text-primary transition-colors shrink-0" />
          </button>
        </div>
      )}

      {/* Toggle de notificações push (só aparece se houver suporte e chave VAPID) */}
      {user && (
        <div className="profile-el mx-5 mb-6 relative z-10">
          <NotificationToggle />
        </div>
      )}

      {/* Events Section - only for logged in users */}
      {user && (
        <div className="relative z-10">
          {userRole === 'admin' ? (
            <div className="profile-el px-5 mb-6 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-glassBorder/40 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-5 bg-primary/40 rounded-full" />
                  <h2 className="font-display font-semibold text-xl text-textLight">
                    Painel de Eventos
                  </h2>
                </div>
                
                <div className="flex bg-surface/40 p-1 rounded-xl border border-glassBorder self-start sm:self-auto">
                  <button
                    onClick={() => setActiveTab('public')}
                    className={`px-4 py-2 rounded-lg font-sans text-xs font-medium transition-all duration-200 cursor-pointer ${
                      activeTab === 'public'
                        ? 'bg-primary text-textDark font-semibold'
                        : 'text-textMuted hover:text-textLight'
                    }`}
                  >
                    Públicos ({myEvents.filter(e => !e.isTestEvent).length})
                  </button>
                  <button
                    onClick={() => setActiveTab('test')}
                    className={`px-4 py-2 rounded-lg font-sans text-xs font-medium transition-all duration-200 cursor-pointer ${
                      activeTab === 'test'
                        ? 'bg-accent text-textDark font-semibold'
                        : 'text-textMuted hover:text-textLight'
                    }`}
                  >
                    Testes ({myEvents.filter(e => !!e.isTestEvent).length})
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="profile-el flex items-center gap-2.5 px-5 mb-4">
              <div className="w-1 h-5 bg-primary/40 rounded-full" />
              <h2 className="font-display font-semibold text-xl text-textLight">
                {userRole === 'user' ? 'Minha Agenda' : 'Meus Eventos'}
              </h2>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-5">
            {filteredEvents.map((event) => (
              <div key={event.id} className="profile-el surface surface-hover rounded-2xl overflow-hidden text-left">
                <div 
                  className="p-5 cursor-pointer hover:bg-surfaceHover/15 transition-colors group/card"
                  onClick={() => navigate(`/event/${event.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {event.isTestEvent ? (
                          <span className="bg-accent/10 border border-accent/25 text-accent text-[11px] px-2.5 py-0.5 rounded-full font-medium">
                            Evento de teste (Admin)
                          </span>
                        ) : (
                          <span className="bg-primary/10 border border-primary/20 text-primary text-[11px] px-2.5 py-0.5 rounded-full font-medium">
                            Confirmado
                          </span>
                        )}
                      </div>
                      <h3 className="font-display font-semibold text-lg text-textLight leading-tight">{event.title}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3 text-textMuted">
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className="text-primary" />
                      <span className="font-mono text-xs font-bold text-primary">{event.time}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); openMaps(event); }} className="flex items-center gap-1.5 text-accent hover:text-accentHover transition-colors cursor-pointer">
                      <MapPin size={13} className="text-accent" />
                      <span className="font-mono text-xs hover:underline">{event.location}</span>
                    </button>
                  </div>

                  {event.address && (
                    <button onClick={(e) => { e.stopPropagation(); openMaps(event); }} className="mt-1.5 flex items-center gap-1 text-textMuted hover:text-textLight transition-colors cursor-pointer">
                      <MapPin size={11} className="shrink-0" />
                      <span className="text-[11px] truncate">{event.address}</span>
                    </button>
                  )}

                  <p className="font-sans text-sm text-textMuted mt-3.5 line-clamp-2 leading-relaxed">
                    {event.description}
                  </p>
                </div>

                <div className="flex border-t border-glassBorder bg-surface/30">
                  {user?.role === 'admin' || event.creatorId === (user?.profileId || user?.id) ? (
                    <>
                      <button
                        onClick={() => handleOpenParticipants(event)}
                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-accent font-sans font-medium text-[11px] hover:bg-surface/50 transition-colors cursor-pointer"
                      >
                        <Users size={14} />
                        Inscritos
                      </button>
                      <div className="w-[1px] bg-glassBorder" />
                      <button
                        onClick={() => navigate(`/edit/${event.id}`)}
                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-textLight font-sans font-medium text-[11px] hover:bg-surface/50 transition-colors cursor-pointer"
                      >
                        <Edit2 size={14} />
                        Editar
                      </button>
                      <div className="w-[1px] bg-glassBorder" />
                      <button
                        onClick={() => setDeleteConfirm(event.id)}
                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-danger font-sans font-medium text-[11px] hover:bg-danger/10 transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} />
                        Excluir
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          const reg = myRegistrations.find(r => r.eventId === event.id);
                          if (reg) {
                            setSelectedRegForTicket(reg);
                            setSelectedEventForTicket(event);
                            setShowTicketModal(true);
                          } else {
                            openWhatsApp(event);
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 text-success font-sans font-semibold text-xs hover:bg-success/10 transition-colors cursor-pointer"
                      >
                        <Ticket size={14} />
                        Ver Ingresso
                      </button>
                      <div className="w-[1px] bg-glassBorder" />
                      <button
                        onClick={() => openMaps(event)}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 text-primary font-sans font-semibold text-xs hover:bg-primary/10 transition-colors cursor-pointer"
                      >
                        <Navigation size={14} />
                        Como chegar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4 col-span-full">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Calendar size={24} className="text-primary/40" />
                </div>
                <p className="font-sans text-textMuted text-sm mb-4">
                  {userRole === 'admin'
                    ? (activeTab === 'public' ? 'Nenhum evento público cadastrado.' : 'Nenhum evento de teste cadastrado.')
                    : (userRole === 'user' ? 'Você ainda não confirmou presença em nenhum evento.' : 'Você ainda não criou eventos.')
                  }
                </p>
                {userRole === 'user' && (
                  <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2.5 bg-surface hover:bg-primary text-primary hover:text-textDark border border-glassBorder rounded-full font-sans text-sm font-medium transition-all active:scale-95 cursor-pointer"
                  >
                    Explorar eventos
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
            className="glass rounded-[2rem] p-6 max-w-sm w-full relative overflow-hidden backdrop-blur-2xl border border-glassBorder"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-danger/10 text-danger border border-danger/20 flex items-center justify-center mb-4 shadow-md">
                <Trash2 size={22} />
              </div>
              <h3 className="font-display text-xl font-semibold text-accent mb-2">Excluir Evento?</h3>
              <p className="font-sans text-sm text-textMuted mb-6 leading-relaxed">
                Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3.5 rounded-xl border border-glassBorder text-textLight bg-surface hover:bg-surfaceHover font-sans font-semibold text-xs shadow-sm hover:-translate-y-0.5 active:scale-95 transition-all duration-200 neo-click cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-3.5 rounded-xl bg-danger text-textDark border border-danger/20 font-sans font-semibold text-xs shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-300 neo-click cursor-pointer"
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
        <div className="fixed inset-0 z-[100] modal-backdrop flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div
            className="glass rounded-[2.5rem] p-6 max-w-md w-full relative flex flex-col max-h-[90vh] backdrop-blur-3xl border border-glassBorder"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              title="Fechar"
              aria-label="Fechar"
              onClick={() => setShowEditModal(false)} 
              className="absolute top-6 right-6 p-2 bg-surface/50 border border-glassBorder rounded-xl text-textLight hover:bg-surfaceHover transition-all duration-300 cursor-pointer z-10 neo-click"
            >
              <X size={16} />
            </button>

            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center text-primary mx-auto mb-2.5">
                <Edit2 size={20} />
              </div>
              <h3 className="font-display text-xl font-semibold text-accent">Editar Perfil</h3>
              <p className="text-xs text-textMuted mt-1">Atualize as informações públicas da sua marca</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 flex-1 overflow-y-auto pr-1 scrollbar-hide py-2 text-left">
              {/* Foto de Perfil Upload */}
              <div className="flex flex-col items-center gap-2 pb-4 border-b border-glassBorder">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-surface/40 border border-dashed border-glassBorder overflow-hidden flex items-center justify-center relative shadow-inner">
                    {editData.imageUrl ? (
                      <img src={editData.imageUrl} className="w-full h-full object-cover" alt="Prévia" />
                    ) : (
                      <User size={30} className="text-textMuted" />
                    )}
                    {isUploadingPhoto && (
                      <div className="absolute inset-0 bg-background/65 flex items-center justify-center text-primary">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {editData.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditData({ ...editData, imageUrl: '' })}
                      className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-danger border border-danger/20 text-textDark flex items-center justify-center shadow-md hover:bg-danger/90 hover:scale-105 active:scale-95 transition-all cursor-pointer z-10"
                      title="Remover foto"
                    >
                      <X size={10} strokeWidth={3} />
                    </button>
                  )}
                  <label htmlFor="profile-photo-upload" className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-accent border border-glassBorder text-textDark flex items-center justify-center shadow-md hover:scale-105 transition-all cursor-pointer hover:border-accent/40 duration-300">
                    <Camera size={13} />
                    <input id="profile-photo-upload" title="Mudar Foto" aria-label="Mudar Foto" type="file" className="hidden" accept="image/*" disabled={isUploadingPhoto} onChange={handleProfilePhotoChange} />
                  </label>
                </div>
                <span className="text-[9px] font-sans font-medium text-accent">Clique no ícone para alterar</span>
              </div>

              {/* Informações Gerais */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-textMuted ml-1 block">Nome do Perfil</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome do seu estabelecimento ou atlética"
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="w-full h-12 bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 text-sm font-sans text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary placeholder:text-textMuted/50 transition-all duration-300"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-textMuted ml-1 block">Descrição / Sobre</label>
                  <textarea
                    placeholder="Escreva um breve texto sobre o estabelecimento ou atlética..."
                    value={editData.description}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    className="w-full min-h-[90px] bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 py-3 text-sm font-sans text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary resize-none placeholder:text-textMuted/50 transition-all duration-300"
                  />
                </div>
              </div>

              {/* Redes Sociais */}
              <div className="space-y-4 pt-3 border-t border-glassBorder">
                <h4 className="text-xs font-medium text-textMuted ml-1">Redes sociais</h4>
                
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center bg-surfaceHover/50 border border-glassBorder rounded-xl px-3 focus-within:border-primary/40 focus-within:shadow-glow-primary transition-all duration-300">
                    <InstagramIcon size={14} className="text-primary mr-2 shrink-0" />
                    <input
                      type="text"
                      placeholder="Instagram (Ex: @seu.perfil)"
                      value={editData.instagram}
                      onChange={(e) => setEditData({ ...editData, instagram: e.target.value })}
                      className="w-full h-11 bg-transparent border-0 px-1 text-sm font-sans text-textLight focus:outline-none placeholder:text-textMuted/50"
                    />
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-3 pt-4 border-t border-glassBorder mt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3.5 rounded-xl border border-glassBorder text-textLight font-sans font-semibold text-xs bg-surface/50 hover:bg-surfaceHover transition-all duration-300 active:scale-95 cursor-pointer shadow-glass-shadow"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isUploadingPhoto}
                  className="flex-1 py-3.5 rounded-xl bg-primary text-textDark font-sans font-semibold text-xs hover:bg-primaryHover hover:-translate-y-0.5 transition-all duration-200 active:scale-95 disabled:opacity-50 cursor-pointer"
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
        <div className="fixed inset-0 z-[100] modal-backdrop flex items-center justify-center p-6" onClick={() => setShowParticipantsModal(false)}>
          <div
            className="glass rounded-[2rem] p-5 md:p-8 max-w-lg md:max-w-2xl w-full relative flex flex-col max-h-[85vh] border border-glassBorder backdrop-blur-3xl shadow-float bg-surface/98"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-5 right-5 md:top-6 md:right-6 flex items-center gap-1.5 md:gap-2">
              <button 
                onClick={exportToCSV}
                disabled={participantsList.length === 0 || isLoadingParticipants}
                className="p-2 md:p-2.5 bg-surface/50 border border-glassBorder text-accent rounded-xl hover:bg-surfaceHover hover:border-accent/40 active:scale-95 transition-all duration-300 neo-click cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar CSV"
              >
                <Download className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]" />
              </button>
              <button 
                onClick={() => setShowManualTicketModal(true)}
                className="p-2 md:p-2.5 bg-surface/50 border border-glassBorder text-primary rounded-xl hover:bg-surfaceHover hover:border-primary/40 active:scale-95 transition-all duration-300 neo-click cursor-pointer"
                title="Gerar Ingresso Manual"
              >
                <Plus className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]" />
              </button>
              <button 
                title="Fechar"
                aria-label="Fechar"
                onClick={() => setShowParticipantsModal(false)} 
                className="p-2 md:p-2.5 bg-surface/50 border border-glassBorder rounded-xl text-textLight hover:bg-surfaceHover hover:border-primary/40 active:scale-95 transition-all duration-300 neo-click cursor-pointer"
              >
                <X className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]" />
              </button>
            </div>

            <div className="text-center mb-4 md:mb-6">
              <div className="w-11 h-11 md:w-16 md:h-16 bg-primary/20 border border-primary/20 rounded-xl md:rounded-2xl flex items-center justify-center text-primary mx-auto mb-2 md:mb-3">
                <Users className="w-5 h-5 md:w-7 md:h-7" />
              </div>
              <h3 className="font-display text-base md:text-xl font-semibold text-accent truncate px-10 md:px-16">{selectedEventForParticipants.title}</h3>
              <p className="text-xs text-textMuted mt-0.5 font-sans">Lista de presenças confirmadas</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide space-y-3.5 min-h-[160px] max-h-[50vh] md:max-h-[58vh] text-left">
              {isLoadingParticipants ? (
                <div className="flex flex-col items-center justify-center py-12 md:py-16 text-primary gap-2">
                  <div className="w-8 h-8 md:w-10 md:h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="font-sans text-xs text-textMuted">Carregando lista…</span>
                </div>
              ) : participantsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center text-textMuted">
                  <div className="w-10 h-10 md:w-14 md:h-14 bg-primary/5 border border-glassBorder rounded-2xl flex items-center justify-center mb-3">
                    <User className="w-5 h-5 md:w-6 md:h-6 text-primary/30" />
                  </div>
                  <p className="font-sans text-sm md:text-base font-semibold text-textLight">Nenhum participante ainda</p>
                  <p className="font-sans text-[10px] md:text-xs text-textMuted mt-1">As confirmações aparecerão aqui</p>
                </div>
              ) : (
                <div className="space-y-2.5 md:space-y-3">
                  <div className="flex justify-between items-center px-1 mb-1 md:mb-2">
                    <span className="text-[9px] md:text-[10px] font-sans font-medium text-accent">Participante</span>
                    <span className="font-sans text-xs text-textLight bg-surface px-2 md:px-3 py-0.5 md:py-1 border border-glassBorder rounded-lg font-medium">{participantsList.length} confirmado(s)</span>
                  </div>
                  {participantsList.map((reg) => {
                    const isPaid = reg.paymentStatus === 'Pago' || reg.paymentStatus?.includes('Pago');
                    const hasOverbooking = reg.paymentStatus?.includes('Overbooking');
                    
                    return (
                      <div key={reg.id} className="p-4 md:p-5 bg-white/80 border border-glassBorder/40 rounded-2xl space-y-2.5 md:space-y-3.5 text-left shadow-glass-shadow hover:bg-white/95 transition-colors duration-300">
                        <div className="flex items-center justify-between gap-2.5 md:gap-3">
                          <div className="flex items-center gap-2.5 md:gap-3.5 min-w-0">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-primary/20 border border-primary/20 text-primary flex items-center justify-center font-bold text-xs md:text-sm shrink-0 shadow-sm">
                              {reg.userName ? reg.userName.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-sans font-bold text-xs md:text-base text-textLight truncate leading-tight">{reg.userName || 'Usuário Anônimo'}</p>
                              <p className="font-mono text-[10px] md:text-xs text-textMuted truncate mt-0.5 md:mt-1 leading-none">{reg.userEmail || 'Sem e-mail'}</p>
                            </div>
                          </div>
                          <span className={`px-2 md:px-3 py-0.5 md:py-1 border rounded-lg text-[11px] font-sans font-semibold shrink-0 ${
                            hasOverbooking
                              ? 'bg-danger/10 text-danger border-danger/20'
                              : isPaid 
                                ? 'bg-success/10 text-success border-success/20' 
                                : 'bg-surface/50 text-textLight border-glassBorder'
                          }`}>
                            {reg.paymentStatus || 'Gratuito'}
                          </span>
                        </div>
                        
                        {reg.ticketTypeName && (
                          <div className="px-2 md:px-3 py-1 bg-accent/5 border border-accent/10 rounded-lg md:rounded-xl inline-block">
                            <span className="text-[8px] md:text-[9px] font-sans font-medium text-accent">Setor/Lote: {reg.ticketTypeName}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 md:gap-4 pt-2 md:pt-3 text-[10px] md:text-xs font-mono text-textLight">
                          <div>
                            <span className="text-[8px] md:text-[9px] font-bold text-primary/70 uppercase block mb-0.5 tracking-wider">Telefone</span>
                            <span className="text-[10px] md:text-sm font-semibold">{reg.userPhone ? formatPhone(reg.userPhone) : '-'}</span>
                          </div>
                          <div>
                            <span className="text-[8px] md:text-[9px] font-bold text-primary/70 uppercase block mb-0.5 tracking-wider">CPF</span>
                            <span className="text-[10px] md:text-sm font-semibold">{reg.userCpf ? formatCPF(reg.userCpf) : '-'}</span>
                          </div>
                        </div>
                        <div className="text-[11px] font-sans text-textMuted/70 text-right pt-1.5">
                          Confirmado em: {new Date(reg.timestamp).toLocaleDateString('pt-BR')} {new Date(reg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Botão Carregar Mais para Paginação de Inscrições */}
                  {hasMoreParticipants && (
                    <button
                      onClick={handleLoadMoreParticipants}
                      disabled={isLoadingMoreParticipants}
                      className="w-full py-3.5 rounded-xl border border-glassBorder text-textLight hover:text-accent hover:border-accent/40 font-sans text-xs font-medium bg-surface hover:bg-surfaceHover active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer neo-click"
                    >
                      {isLoadingMoreParticipants ? (
                        <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Carregar mais participantes'
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 md:pt-4 border-t border-glassBorder mt-3 md:mt-4 flex gap-3">
              <button
                onClick={() => navigate(`/validar/${selectedEventForParticipants.id}`)}
                className="flex-1 flex items-center justify-center gap-2 py-3 md:py-4 rounded-xl bg-primary text-textDark font-sans font-semibold text-sm hover:bg-primaryHover active:scale-95 transition-all duration-200 neo-click cursor-pointer"
              >
                <ScanLine size={16} /> Validar ingressos
              </button>
              <button
                onClick={() => setShowParticipantsModal(false)}
                className="px-5 py-3 md:py-4 rounded-xl bg-surface border border-glassBorder text-textLight font-sans font-medium text-sm hover:bg-surfaceHover active:scale-95 transition-all duration-200 neo-click cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerar Ingresso Manual */}
      {showManualTicketModal && selectedEventForParticipants && (
        <div className="fixed inset-0 z-[110] modal-backdrop flex items-center justify-center p-4">
          <div className="glass rounded-[2.5rem] p-6 md:p-8 max-w-md w-full relative border border-glassBorder backdrop-blur-3xl shadow-float bg-surface/98 text-left animate-in zoom-in duration-300">
            <button
              onClick={() => setShowManualTicketModal(false)}
              className="absolute top-6 right-6 p-2 bg-surface/50 border border-glassBorder rounded-xl text-textLight hover:bg-surfaceHover hover:border-primary/40 active:scale-95 transition-all duration-300 cursor-pointer neo-click z-10"
              title="Fechar"
            >
              <X size={16} />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center text-primary mx-auto mb-3">
                <Ticket size={24} />
              </div>
              <h3 className="font-display text-xl font-semibold text-textLight">Gerar ingresso manual</h3>
              <p className="text-sm text-textMuted font-sans mt-1">Crie credenciais ou cortesias para o evento</p>
            </div>

            <form onSubmit={handleGenerateManualTicket} className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 scrollbar-hide">
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-medium text-textMuted ml-1 block">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Nome do participante"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  className="w-full h-11 bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 text-sm text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all duration-300 font-sans"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs font-medium text-textMuted ml-1 block">E-mail (Opcional)</label>
                <input
                  type="email"
                  placeholder="participante@email.com"
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  className="w-full h-11 bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 text-sm text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all duration-300 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-medium text-textMuted ml-1 block">Telefone (Opcional)</label>
                  <input
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={manualPhone}
                    onChange={e => setManualPhone(e.target.value)}
                    className="w-full h-11 bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 text-sm text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all duration-300 font-sans"
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-medium text-textMuted ml-1 block">CPF (Opcional)</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={manualCpf}
                    onChange={e => setManualCpf(formatCPF(e.target.value))}
                    className="w-full h-11 bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 text-sm text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all duration-300 font-mono"
                  />
                </div>
              </div>

              {selectedEventForParticipants.tickets && selectedEventForParticipants.tickets.length > 0 && (
                <div className="space-y-1.5 text-left">
                  <label htmlFor="manual-ticket-select" className="text-xs font-medium text-textMuted ml-1 block">Setor / Lote</label>
                  <select
                    id="manual-ticket-select"
                    className="w-full h-11 bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 text-xs font-mono text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all duration-300"
                    value={manualTicketTypeId}
                    onChange={e => setManualTicketTypeId(e.target.value)}
                  >
                    <option value="">(Ingresso Geral - Sem Lote)</option>
                    {selectedEventForParticipants.tickets.map(t => {
                      const available = t.capacity - (t.sold || 0);
                      return (
                        <option key={t.id} value={t.id} disabled={available <= 0} className="text-stone-900 bg-white">
                          {t.name} - R$ {t.price.toFixed(2)} ({available} restam)
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="space-y-1.5 text-left">
                <label htmlFor="manual-payment-select" className="text-xs font-medium text-textMuted ml-1 block">Tipo de Ingresso / Pagamento</label>
                <select
                  id="manual-payment-select"
                  className="w-full h-11 bg-surfaceHover/50 border border-glassBorder rounded-xl px-4 text-xs font-mono text-textLight focus:outline-none focus:border-primary/40 focus:shadow-glow-primary transition-all duration-300"
                  value={manualPaymentStatus}
                  onChange={e => setManualPaymentStatus(e.target.value)}
                >
                  <option value="Cortesia" className="text-stone-900 bg-white">Cortesia / VIP</option>
                  <option value="Pago (Dinheiro)" className="text-stone-900 bg-white">Pago (Dinheiro)</option>
                  <option value="Pago (Pix Manual)" className="text-stone-900 bg-white">Pago (Pix Manual)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-glassBorder">
                <button
                  type="button"
                  onClick={() => setShowManualTicketModal(false)}
                  className="flex-1 py-3 rounded-xl border border-glassBorder text-textLight font-sans font-semibold text-xs bg-surface/50 hover:bg-surfaceHover transition-all duration-300 active:scale-95 cursor-pointer shadow-glass-shadow"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingManualTicket}
                  className="flex-1 py-3 rounded-xl bg-primary text-textDark font-sans font-semibold text-xs hover:bg-primaryHover hover:-translate-y-0.5 transition-all duration-200 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isGeneratingManualTicket ? 'Gerando...' : 'Gerar Ingresso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedRegForTicket && selectedEventForTicket && (
        <TicketModal
          isOpen={showTicketModal}
          onClose={() => setShowTicketModal(false)}
          event={selectedEventForTicket}
          registration={selectedRegForTicket}
        />
      )}
    </div>
  );
};
