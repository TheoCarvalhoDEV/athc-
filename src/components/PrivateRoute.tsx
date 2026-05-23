import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { BottomNav } from './BottomNav';

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
    <div className="relative min-h-screen bg-background">
      <Outlet />
      {withNav && <BottomNav />}
    </div>
  );
};
