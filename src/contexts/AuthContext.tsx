import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { storage } from '../lib/storage';
import type { User } from '../lib/storage';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  logout: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => storage.getCurrentUser());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChanged é a fonte da verdade se o token ainda é válido no backend
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Verifica se a sessão do localStorage confere com o firebase
        const localUser = storage.getCurrentUser();
        if (localUser && localUser.id === firebaseUser.uid) {
          setUser(localUser);
        } else {
          // Se não tem no localStorage ou o id não bate, força login novamente
          setUser(null);
          localStorage.removeItem('@atche:user');
        }
      } else {
        setUser(null);
        localStorage.removeItem('@atche:user');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await storage.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
