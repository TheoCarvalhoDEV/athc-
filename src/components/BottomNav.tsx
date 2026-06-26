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
    <div className="fixed bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-1/2 z-[9999] px-4 md:hidden w-max max-w-[calc(100vw-2rem)] bottom-nav-container">
      <nav className="glass rounded-full px-5 py-2.5 flex items-center gap-4 md:gap-6 relative">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "relative flex items-center justify-center p-3 rounded-xl transition-all duration-200 neo-click z-10",
                isActive
                  ? "text-primary bg-primary/10 border border-primary/20"
                  : "text-textMuted hover:text-primary hover:bg-surfaceHover"
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
