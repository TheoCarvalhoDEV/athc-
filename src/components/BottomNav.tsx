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
    <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 px-4">
      <nav className="bg-white/30 backdrop-blur-lg border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.06)] rounded-full px-5 py-1.5 flex items-center gap-4 md:gap-6">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "relative flex items-center justify-center p-3 rounded-full transition-all duration-300",
                isActive 
                  ? "text-primary bg-primary/10 scale-105 shadow-[0_0_15px_rgba(106,19,36,0.08)]" 
                  : "text-primary/60 hover:text-primary hover:bg-white/20"
              )
            }
          >
            {({ isActive }) => (
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
