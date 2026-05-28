import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, PlusSquare, User, Settings, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export const Sidebar = () => {
  useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isPartner = user?.role === 'partner' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Até logo!');
      navigate('/login');
    } catch (error) {
      console.error('Erro ao sair:', error);
      toast.error('Erro ao sair da conta.');
    }
  };

  const navItems = [
    { icon: Home, path: '/', label: 'Início' },
    { icon: Search, path: '/search', label: 'Pesquisar' },
    ...(isPartner ? [{ icon: PlusSquare, path: '/create', label: 'Criar Evento' }] : []),
    ...(isAdmin ? [{ icon: Settings, path: '/admin', label: 'Painel Admin' }] : []),
    { icon: User, path: '/profile', label: 'Meu Perfil' },
  ];

  return (
    <aside className="w-64 h-screen sticky top-0 bg-white/80 border-r border-glassBorder/40 p-6 flex flex-col justify-between hidden md:flex shrink-0 z-40 backdrop-blur-xl">
      {/* Luz decorativa sutil no fundo da sidebar */}
      <div className="absolute -left-10 -bottom-10 w-32 h-32 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
      <div className="absolute -right-10 -top-10 w-24 h-24 rounded-full bg-accent/3 blur-xl pointer-events-none" />

      <div className="flex flex-col gap-8 relative z-10">
        {/* Logo Section */}
        <div className="flex items-center gap-3 px-2 pt-2">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png?v=3`} 
            alt="Atchêi" 
            className="w-auto h-16 object-contain brightness-110 drop-shadow-sm" 
          />
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-4 px-5 py-3.5 rounded-2xl font-display font-black text-xs uppercase tracking-wider transition-all duration-300 neo-click border",
                  isActive 
                    ? "text-primary bg-primary/10 border-primary/20 shadow-glow-primary scale-[1.02]" 
                    : "text-textMuted border-transparent hover:text-primary hover:bg-surfaceHover/50"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? "text-primary" : "text-textMuted"} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Profile & Footer Info */}
      <div className="flex flex-col gap-4 relative z-10">
        {user && (
          <div className="glass rounded-2xl p-4 border border-glassBorder/60 flex items-center justify-between gap-3 shadow-glass-shadow bg-gradient-to-br from-white/90 to-white/40">
            <div className="flex items-center gap-3 min-w-0">
              <div 
                onClick={() => navigate('/profile')}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primaryHover text-textDark border border-primary/20 flex items-center justify-center font-display font-extrabold text-sm overflow-hidden shadow-sm hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer shrink-0"
              >
                {user.imageUrl ? (
                  <img src={user.imageUrl} className="w-full h-full object-cover" alt={user.name} />
                ) : (
                  user.name?.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <div className="min-w-0 flex flex-col text-left">
                <span className="font-display font-bold text-xs text-textLight truncate">{user.name}</span>
                <span className="text-[9px] font-mono font-bold text-accent uppercase tracking-wider mt-0.5">{user.role === 'admin' ? 'Admin' : user.role === 'partner' ? 'Parceiro' : 'Membro'}</span>
              </div>
            </div>

            <button 
              onClick={handleLogout}
              className="p-2 rounded-lg text-textMuted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
              title="Sair da Conta"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
        <div className="text-center">
          <p className="text-[8px] font-mono text-textMuted/60 uppercase tracking-widest">Atchêi 2.0 • Sunset Warm</p>
        </div>
      </div>
    </aside>
  );
};
