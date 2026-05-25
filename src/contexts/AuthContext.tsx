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
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  logout: async () => { },
  updateUser: () => { }
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
          // Se não tem no localStorage ou o id não bate (acontece no exato momento do login), 
          // não desloga! Busca o perfil novamente para restaurar a sessão.
          const email = firebaseUser.email || '';
          const isAppAdmin = email.toLowerCase() === 'admin@atche.com.br';
          const profile = await storage.getProfileById(firebaseUser.uid);

          const newUser: User = {
            id: firebaseUser.uid,
            name: profile?.name || firebaseUser.displayName || 'Usuário',
            username: email,
            role: profile?.type === 'admin' || isAppAdmin ? 'admin' : (profile && profile.type !== 'user' ? 'partner' : 'user'),
            mustChangePassword: profile?.mustChangePassword ?? false,
            imageUrl: profile?.imageUrl || '',
            profileId: profile?.id
          };

          setUser(newUser);
          localStorage.setItem('@atche:user', JSON.stringify(newUser));
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

  const handleUpdateUser = (newUser: User) => {
    setUser(newUser);
    localStorage.setItem('@atche:user', JSON.stringify(newUser));
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout: handleLogout, updateUser: handleUpdateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
