import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import type { EventItem, Registration } from '../lib/storage';
import { Button } from '../components/ui/Button';
import { Calendar, Users, Settings, Trash2, Search as SearchIcon, Building2, UserPlus, Mail, Lock, ShieldCheck, X, Copy, Check } from 'lucide-react';
import gsap from 'gsap';
import { Input } from '../components/ui/Input';
import { cn } from '../lib/utils';
import type { AppProfile } from '../lib/storage';

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [profiles, setProfiles] = useState<AppProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'events' | 'partners'>('events');
  const [query, setQuery] = useState('');
  
  // Partner Form State
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [newPartner, setNewPartner] = useState({
    name: '',
    type: 'estabelecimento' as 'estabelecimento' | 'atletica',
    description: '',
    imageUrl: ''
  });
  const [lastGenerated, setLastGenerated] = useState<{ email: string; pass: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingPartner, setEditingPartner] = useState<AppProfile | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning'
  });
  
  // Basic auth check for MVP
  const currentUser = storage.getCurrentUser();
  const userId = currentUser?.id;

  const loadData = useCallback(async () => {
    if (!userId || currentUser?.role !== 'admin') {
      navigate('/feed');
      return;
    }
    
    try {
      const [allEvents, allRegs, allProfiles] = await Promise.all([
        storage.getEvents(),
        storage.getRegistrations(),
        storage.getProfiles()
      ]);
      
      setEvents(allEvents);
      setRegistrations(allRegs);
      setProfiles(allProfiles);
    } catch (error) {
      console.error("Erro ao carregar dados do admin:", error);
    }
  }, [userId, navigate, currentUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (containerRef.current) {
      const ctx = gsap.context(() => {
        if (containerRef.current?.querySelectorAll('.admin-anim').length) {
          gsap.from('.admin-anim', {
            y: 20,
            opacity: 0,
            duration: 0.5,
            stagger: 0.05,
            ease: 'power2.out',
          });
        }
      }, containerRef);
      return () => ctx.revert();
    }
  }, []); // Run only once on mount

  const handleDelete = async (id: string) => {
    setConfirmModal({
      show: true,
      title: 'Excluir Evento?',
      message: 'Esta ação removerá o evento permanentemente e cancelará todas as inscrições.',
      type: 'danger',
      onConfirm: async () => {
        await storage.deleteEvent(id);
        const updatedEvents = await storage.getEvents();
        setEvents(updatedEvents);
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  const handleDeleteProfile = async (id: string) => {
    setConfirmModal({
      show: true,
      title: 'Excluir Parceiro?',
      message: 'Todos os acessos e dados deste parceiro serão removidos do sistema.',
      type: 'danger',
      onConfirm: async () => {
        await storage.deleteProfile(id);
        setProfiles(prev => prev.filter(p => p.id !== id));
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = `${newPartner.name.toLowerCase().replace(/\s+/g, '')}@atche.com.br`;
    const password = Math.random().toString(36).slice(-8);

    try {
      // 1. Criar usuário no Firebase Auth usando instância secundária para não deslogar o Admin
      const { initializeApp } = await import('firebase/app');
      const { getAuth, createUserWithEmailAndPassword, signOut } = await import('firebase/auth');
      const { firebaseConfig } = await import('../lib/firebase');
      
      const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = userCredential.user.uid;
      
      await signOut(secondaryAuth); // Finaliza a sessão temporária

      // 2. Salvar o perfil no Firestore usando o UID real
      const profile: AppProfile = {
        id: uid,
        ...newPartner,
        email,
        mustChangePassword: true
      };

      await storage.saveProfile(profile);
      const allProfiles = await storage.getProfiles();
      setProfiles(allProfiles);
      setLastGenerated({ email, pass: password }); // A senha fica só na tela, nunca no banco
      
      setNewPartner({ name: '', type: 'estabelecimento', description: '', imageUrl: '' });
    } catch (error: any) {
      console.error("Erro ao adicionar parceiro:", error);
      if (error?.code === 'auth/email-already-in-use') {
        alert("Este parceiro já existe! Tente adicionar um número ou sobrenome no nome para gerar um e-mail diferente.");
      } else {
        alert("Erro ao criar parceiro no Firebase. Verifique o console.");
      }
    }
  };

  const handleEditPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner) return;
    try {
      const updates: Partial<AppProfile> = {
        name: editingPartner.name,
        type: editingPartner.type,
        description: editingPartner.description || '',
        mustChangePassword: editingPartner.mustChangePassword || false
      };
      
      // Apenas adicionar o password na atualização se ele foi digitado (não estiver vazio)
      if (editingPartner.password) {
        updates.password = editingPartner.password;
      }

      await storage.updateProfile(editingPartner.id, updates);
      const allProfiles = await storage.getProfiles();
      setProfiles(allProfiles);
      setEditingPartner(null);
      alert('Perfil atualizado com sucesso!');
    } catch (error) {
      console.error("Erro ao atualizar parceiro:", error);
      alert("Erro ao atualizar parceiro no banco de dados.");
    }
  };

  const filteredEvents = events.filter(e => e.title.toLowerCase().includes(query.toLowerCase()));
  const filteredProfiles = profiles.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

  const totalRegistrations = registrations.length;

  return (
    <>
    <div ref={containerRef} className="min-h-screen bg-background pb-28 pt-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 admin-anim">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Settings size={24} />
        </div>
        <div>
          <h1 className="font-sans text-2xl font-bold text-textDark">Painel de Controle</h1>
          <p className="text-sm text-textDark/60">Gerencie seus eventos e inscrições</p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6 admin-anim">
        <div className="bg-background border border-primary/10 rounded-[1.5rem] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Calendar size={18} />
            <span className="font-bold text-sm">Total Eventos</span>
          </div>
          <span className="font-sans text-3xl font-bold text-textDark">{events.length}</span>
        </div>
        <div className="bg-background border border-primary/10 rounded-[1.5rem] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Users size={18} />
            <span className="font-bold text-sm">Inscrições</span>
          </div>
          <span className="font-sans text-3xl font-bold text-textDark">{totalRegistrations}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 admin-anim">
        <button 
          onClick={() => setActiveTab('events')}
          className={cn(
            "flex-1 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2",
            activeTab === 'events' ? "bg-primary text-textLight shadow-lg" : "bg-primary/5 text-textDark/60"
          )}
        >
          <Calendar size={18} />
          Eventos
        </button>
        <button 
          onClick={() => setActiveTab('partners')}
          className={cn(
            "flex-1 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2",
            activeTab === 'partners' ? "bg-primary text-textLight shadow-lg" : "bg-primary/5 text-textDark/60"
          )}
        >
          <Building2 size={18} />
          Parceiros
        </button>
      </div>

      <div className="relative mb-4 admin-anim">
        <Input 
          placeholder={activeTab === 'events' ? "Buscar eventos..." : "Buscar parceiros..."} 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12"
        />
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/50" size={18} />
      </div>

      {activeTab === 'events' ? (
        <>
          <div className="flex justify-between items-center mb-3 admin-anim">
            <h2 className="font-sans font-bold text-textDark">Gerenciar Eventos</h2>
            <Button onClick={() => navigate('/create')} className="text-xs px-3 py-1.5 h-auto rounded-full">
              + Novo Evento
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {filteredEvents.map(event => {
              const eventRegs = registrations.filter(r => r.eventId === event.id).length;
              
              return (
                <div key={event.id} className="bg-background border border-primary/10 p-4 rounded-2xl flex flex-col gap-3 admin-anim shadow-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-textDark truncate">{event.title}</h3>
                      <p className="text-xs text-textDark/60 font-mono mt-0.5">{event.date} • {event.publicType}</p>
                    </div>
                    <div className="bg-primary/5 px-2 py-1 rounded-md flex items-center gap-1.5 shrink-0">
                      <Users size={12} className="text-primary" />
                      <span className="font-mono text-xs font-bold text-primary">{eventRegs}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-2 border-t border-primary/5">
                    <button 
                      onClick={() => navigate(`/event/${event.id}`)}
                      className="flex-1 py-1.5 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors"
                    >
                      Ver Página
                    </button>
                    <button 
                      onClick={() => handleDelete(event.id)}
                      className="px-3 text-textDark/40 hover:text-red-500 transition-colors"
                      title="Excluir Evento"
                      aria-label="Excluir Evento"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
            
            {filteredEvents.length === 0 && (
              <div className="text-center py-10 admin-anim">
                <p className="text-textDark/50 text-sm">Nenhum evento encontrado.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-between items-center mb-3 admin-anim">
            <h2 className="font-sans font-bold text-textDark">Gerenciar Parceiros</h2>
            <Button onClick={() => { setLastGenerated(null); setShowPartnerModal(true); }} className="text-xs px-3 py-1.5 h-auto rounded-full">
              + Novo Parceiro
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {filteredProfiles.map(profile => (
              <div key={profile.id} className="bg-background border border-primary/10 p-4 rounded-2xl flex items-center gap-4 admin-anim shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary overflow-hidden shrink-0">
                  {profile.imageUrl ? <img src={profile.imageUrl} alt={`Foto de ${profile.name}`} className="w-full h-full object-cover" /> : <Building2 size={24} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-textDark truncate">{profile.name}</h3>
                  <p className="text-[10px] text-textDark/40 uppercase tracking-widest font-bold">{profile.type}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 text-[10px] text-primary font-mono bg-primary/5 px-2 py-0.5 rounded mb-1">
                    <Mail size={10} />
                    {profile.email || 'N/A'}
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setEditingPartner(profile)}
                      className="p-1.5 text-textDark/40 hover:text-primary transition-colors bg-textDark/5 rounded-full"
                      title="Editar Parceiro"
                    >
                      <Settings size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteProfile(profile.id)}
                      className="p-1.5 text-textDark/40 hover:text-red-500 transition-colors bg-textDark/5 rounded-full"
                      title="Excluir Parceiro"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredProfiles.length === 0 && (
              <div className="text-center py-10 admin-anim">
                <p className="text-textDark/50 text-sm">Nenhum parceiro encontrado.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Editar Parceiro */}
      {editingPartner && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="bg-background border border-primary/10 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setEditingPartner(null)} className="absolute top-6 right-6 p-2 hover:bg-primary/5 rounded-full">
              <X size={20} />
            </button>

            <form onSubmit={handleEditPartner} className="space-y-4 mt-2">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-3">
                  <Settings size={32} />
                </div>
                <h3 className="font-sans text-2xl font-bold text-textDark">Editar Parceiro</h3>
                <p className="text-xs text-textDark/50">Modifique as informações e acessos</p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-primary uppercase ml-2">Nome do Parceiro</label>
                <Input 
                  required 
                  value={editingPartner.name}
                  onChange={e => setEditingPartner(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-primary uppercase ml-2">Tipo</label>
                <select 
                  className="w-full h-12 bg-primary/5 border border-primary/10 rounded-2xl px-4 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={editingPartner.type}
                  onChange={e => setEditingPartner(prev => prev ? ({ ...prev, type: e.target.value as any }) : null)}
                >
                  <option value="user">Usuário Comum</option>
                  <option value="estabelecimento">Estabelecimento</option>
                  <option value="atletica">Atlética</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-primary uppercase ml-2">Nova Senha (Opcional)</label>
                <Input 
                  placeholder="Digite para alterar" 
                  value={editingPartner.password || ''}
                  onChange={e => setEditingPartner(prev => prev ? ({ ...prev, password: e.target.value }) : null)}
                />
              </div>

              <div className="flex items-center gap-2 mt-4 px-2">
                <input 
                  type="checkbox" 
                  id="mustChangePassword"
                  checked={editingPartner.mustChangePassword}
                  onChange={e => setEditingPartner(prev => prev ? ({ ...prev, mustChangePassword: e.target.checked }) : null)}
                  className="accent-primary w-4 h-4"
                />
                <label htmlFor="mustChangePassword" className="text-xs text-textDark/80">
                  Obrigar usuário a redefinir a senha ao logar
                </label>
              </div>

              <Button type="submit" className="w-full rounded-full py-4 mt-6">
                Salvar Alterações
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo Parceiro */}
      {showPartnerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="bg-background border border-primary/10 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl relative">
            <button aria-label="Fechar Modal" title="Fechar Modal" onClick={() => setShowPartnerModal(false)} className="absolute top-6 right-6 p-2 hover:bg-primary/5 rounded-full">
              <X size={20} />
            </button>

            {!lastGenerated ? (
              <form onSubmit={handleAddPartner} className="space-y-4">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-3">
                    <UserPlus size={32} />
                  </div>
                  <h3 className="font-sans text-2xl font-bold text-textDark">Cadastrar Parceiro</h3>
                  <p className="text-xs text-textDark/50">Crie acesso para novos estabelecimentos</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-primary uppercase ml-2">Nome do Parceiro</label>
                  <Input 
                    required 
                    placeholder="Ex: Velvet Club" 
                    value={newPartner.name}
                    onChange={e => setNewPartner(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="partner-type" className="text-[10px] font-bold text-primary uppercase ml-2">Tipo</label>
                  <select 
                    id="partner-type"
                    className="w-full h-12 bg-primary/5 border border-primary/10 rounded-2xl px-4 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newPartner.type}
                    onChange={e => setNewPartner(prev => ({ ...prev, type: e.target.value as any }))}
                  >
                    <option value="user">Usuário Comum</option>
                    <option value="estabelecimento">Estabelecimento</option>
                    <option value="atletica">Atlética</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-primary uppercase ml-2">Descrição Curta</label>
                  <Input 
                    required 
                    placeholder="Ex: O melhor lounge da cidade" 
                    value={newPartner.description}
                    onChange={e => setNewPartner(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-primary uppercase ml-2">URL da Imagem (Opcional)</label>
                  <Input 
                    placeholder="https://..." 
                    value={newPartner.imageUrl}
                    onChange={e => setNewPartner(prev => ({ ...prev, imageUrl: e.target.value }))}
                  />
                </div>

                <Button type="submit" className="w-full rounded-full py-4 mt-4 shadow-xl">
                  Gerar Acesso e Salvar
                </Button>
              </form>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck size={32} />
                </div>
                <h3 className="font-sans text-2xl font-bold text-textDark mb-2">Parceiro Criado!</h3>
                <p className="text-sm text-textDark/60 mb-6">Salve os dados de acesso abaixo:</p>
                
                <div className="bg-primary/5 p-4 rounded-2xl space-y-3 text-left border border-primary/10 mb-8 relative">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`Email: ${lastGenerated.email}\nSenha: ${lastGenerated.pass}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="absolute top-4 right-4 p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                    title="Copiar dados"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                  
                  <div>
                    <p className="text-[10px] font-bold text-primary uppercase">E-mail de Acesso</p>
                    <p className="font-mono text-sm font-bold text-textDark flex items-center gap-2">
                      <Mail size={14} className="text-primary/40" />
                      {lastGenerated.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-primary uppercase">Senha Temporária</p>
                    <p className="font-mono text-sm font-bold text-textDark flex items-center gap-2">
                      <Lock size={14} className="text-primary/40" />
                      {lastGenerated.pass}
                    </p>
                  </div>
                </div>

                <Button onClick={() => setShowPartnerModal(false)} className="w-full rounded-full">
                  Concluído
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>

    {/* Custom Confirm Modal */}
    {confirmModal.show && (
      <div className="fixed inset-0 z-[100] modal-backdrop flex items-center justify-center p-6" onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}>
        <div 
          className="bg-background rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-primary/10 animate-in zoom-in duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center text-center">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center mb-6",
              confirmModal.type === 'danger' ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
            )}>
              <Trash2 size={32} />
            </div>
            <h3 className="font-sans text-2xl font-bold text-textDark mb-3">{confirmModal.title}</h3>
            <p className="text-sm text-textDark/60 mb-8 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                className="flex-1 py-4 rounded-full border border-primary/10 text-textDark font-bold text-sm hover:bg-primary/5 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                className={cn(
                  "flex-1 py-4 rounded-full text-white font-bold text-sm shadow-lg transition-all active:scale-95",
                  confirmModal.type === 'danger' ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90"
                )}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
