import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Feed } from './pages/Feed';
import { Search } from './pages/Search';
import { CreateEvent } from './pages/CreateEvent';
import { EventDetails } from './pages/EventDetails';
import { AdminDashboard } from './pages/AdminDashboard';
import { Profile } from './pages/Profile';
import { Agenda } from './pages/Agenda';
import { ChangePassword } from './pages/ChangePassword';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { loadMercadoPago } from '@mercadopago/sdk-js';

// MainLayout agora é apenas para rotas que têm Nav Bar mas não são necessariamente protegidas
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
  useEffect(() => {
    const initMP = async () => {
      const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY;
      if (publicKey && publicKey !== 'APP_USR-COLOQUE_SUA_PUBLIC_KEY_AQUI') {
        try {
          await loadMercadoPago();
          new (window as any).MercadoPago(publicKey, { locale: 'pt-BR' });
          console.log("Mercado Pago SDK global inicializado com sucesso.");
        } catch (err) {
          console.error("Erro ao inicializar o Mercado Pago SDK global:", err);
        }
      }
    };
    initMP();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Toaster position="top-center" toastOptions={{ duration: 4000, style: { borderRadius: '16px', background: '#13131A', color: '#F0EDE8', border: '1px solid rgba(212,168,75,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' } }} />
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/event/:id" element={<EventDetails />} />
            
            {/* Rotas Públicas com Nav */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<Feed />} />
              <Route path="/feed" element={<Navigate to="/" replace />} />
              <Route path="/search" element={<Search />} />
            </Route>

            {/* Rotas Protegidas (Exigem Login e têm Nav) */}
            <Route element={<PrivateRoute />}>
              <Route path="/create" element={<CreateEvent />} />
              <Route path="/edit/:id" element={<CreateEvent />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/agenda/:id" element={<Agenda />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
