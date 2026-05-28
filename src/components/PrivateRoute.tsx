import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

export const PrivateRoute = ({ withNav = true }: { withNav?: boolean }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    // Se o usuário não estiver logado, redireciona para o Login
    return <Navigate to="/login" replace />;
  }

  // Se estiver logado, renderiza as rotas filhas
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background w-full">
      {withNav && <Sidebar />}
      <main className="flex-1 w-full max-w-7xl mx-auto px-0 md:px-8 py-6 relative overflow-x-hidden">
        <Outlet />
      </main>
      {withNav && <BottomNav />}
    </div>
  );
};
