import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, PlusSquare, User, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export const BottomNav = () => {
  // useLocation forces re-render on every route change, so user role is always fresh
  useLocation();
  const { user } = useAuth();
  const isPartner = user?.role === 'partner' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { icon: Home, path: '/', label: 'Início' },
    { icon: Search, path: '/search', label: 'Pesquisa' },
    ...(isPartner ? [{ icon: PlusSquare, path: '/create', label: 'Criar' }] : []),
    ...(isAdmin ? [{ icon: Settings, path: '/admin', label: 'Admin' }] : []),
    { icon: User, path: '/profile', label: 'Perfil' },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 z-[9999] px-4 md:hidden w-max max-w-[calc(100vw-2rem)]" style={{ transform: 'translate3d(-50%, 0, 0)', backfaceVisibility: 'hidden' }}>
      <nav className="glass rounded-[2rem] px-5 py-2.5 flex items-center gap-4 md:gap-6 shadow-glass-shadow relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "relative flex items-center justify-center p-3 rounded-2xl transition-all duration-300 neo-click z-10",
                isActive 
                  ? "text-primary bg-primary/10 border border-primary/20 shadow-glow-primary scale-105" 
                  : "text-textMuted hover:text-primary hover:bg-surfaceHover/40"
              )
            }
          >
            {({ isActive }) => (
              <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
