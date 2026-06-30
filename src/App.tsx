import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Feed } from './pages/Feed';
import { Search } from './pages/Search';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './components/ErrorBoundary';

// CARREGAMENTO PREGUIÇOSO (LAZY LOADING)
// Importações dinâmicas sob demanda para reduzir o tamanho inicial do bundle do app
const CreateEvent = React.lazy(() => import('./pages/CreateEvent').then(m => ({ default: m.CreateEvent })));
const EventDetails = React.lazy(() => import('./pages/EventDetails').then(m => ({ default: m.EventDetails })));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const Profile = React.lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Agenda = React.lazy(() => import('./pages/Agenda').then(m => ({ default: m.Agenda })));
const ChangePassword = React.lazy(() => import('./pages/ChangePassword').then(m => ({ default: m.ChangePassword })));
const ValidateTickets = React.lazy(() => import('./pages/ValidateTickets').then(m => ({ default: m.ValidateTickets })));
const Financeiro = React.lazy(() => import('./pages/Financeiro').then(m => ({ default: m.Financeiro })));
const RecuperarIngresso = React.lazy(() => import('./pages/RecuperarIngresso').then(m => ({ default: m.RecuperarIngresso })));

// Spinner simples de carregamento exibido enquanto uma página lazy é baixada
const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Layout principal unificado para páginas com barra de navegação lateral/inferior
const MainLayout = () => {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background w-full">
      <Sidebar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-0 md:px-8 py-6 relative overflow-x-hidden">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        {/* Notificações Toaster customizadas com visual premium */}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '16px',
              background: '#FFFFFF',
              color: '#1C1917',
              border: '1px solid rgba(28,25,23,0.08)',
              boxShadow: '0 12px 40px -10px rgba(28,25,23,0.12)'
            }
          }}
        />
        <Router>
          {/* Suspense envolve todas as rotas para tratar carregamentos lazy de forma assíncrona */}
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Rotas autônomas (sem barra de navegação) */}
              <Route path="/login" element={<Login />} />
              {/* Cadastro de usuário removido: a opção de criar conta foi desativada. */}
              <Route path="/register" element={<Navigate to="/login" replace />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/event/:id" element={<EventDetails />} />
              {/* Recuperação de ingresso por CPF (acesso público, sem login) */}
              <Route path="/ingresso" element={<RecuperarIngresso />} />
              {/* Scanner de validação em tela cheia (autenticação tratada na própria página) */}
              <Route path="/validar/:eventId" element={<ValidateTickets />} />
              
              {/* Rotas Públicas com barra de navegação */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<Feed />} />
                <Route path="/feed" element={<Navigate to="/" replace />} />
                <Route path="/search" element={<Search />} />
                <Route path="/agenda/:id" element={<Agenda />} />
              </Route>

              {/* Rotas Protegidas (Exigem Autenticação) */}
              <Route element={<PrivateRoute />}>
                <Route path="/create" element={<CreateEvent />} />
                <Route path="/edit/:id" element={<CreateEvent />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/financeiro" element={<Financeiro />} />
                <Route path="/profile" element={<Profile />} />
              </Route>
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
