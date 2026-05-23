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
      <nav className="bg-primary/90 backdrop-blur-md border border-primary/50 shadow-2xl rounded-full px-6 py-3 flex items-center gap-8">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 p-2 rounded-full transition-all duration-300",
                isActive 
                  ? "text-accent bg-background/10 scale-110 shadow-[0_0_15px_rgba(212,175,55,0.4)]" 
                  : "text-textLight hover:text-accent hover:bg-background/5"
              )
            }
          >
            {({ isActive }) => (
              <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
