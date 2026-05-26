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
        const email = firebaseUser.email || '';
        const isAppAdmin = storage.isAdminEmail(email);

        // Garantir que admins sempre existam na coleção profiles como type admin
        if (isAppAdmin) {
          try {
            const profile = await storage.getProfileById(firebaseUser.uid);
            if (profile && profile.type !== 'admin') {
              await storage.updateProfile(firebaseUser.uid, { type: 'admin', name: profile.name || 'Administrador' });
            } else if (!profile) {
              await storage.saveProfile({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'Administrador',
                type: 'admin',
                description: 'Administrador do Sistema',
                email: email
              });
            }
          } catch (error) {
            console.error("Erro ao sincronizar perfil de admin:", error);
          }
        }

        // Verifica se a sessão do localStorage confere com o firebase
        const localUser = storage.getCurrentUser();
        if (localUser && localUser.id === firebaseUser.uid) {
          const currentRole = isAppAdmin ? 'admin' : localUser.role;
          if (localUser.role !== currentRole) {
            localUser.role = currentRole;
            localStorage.setItem('@atche:user', JSON.stringify(localUser));
          }
          setUser(localUser);
        } else {
          // Se não tem no localStorage ou o id não bate (acontece no exato momento do login), 
          // não desloga! Busca o perfil novamente para restaurar a sessão.
          const email = firebaseUser.email || '';
          const isAppAdmin = storage.isAdminEmail(email);
          const profile = await storage.getProfileById(firebaseUser.uid);

          const newUser: User = {
            id: firebaseUser.uid,
            name: profile?.name || firebaseUser.displayName || 'Usuário',
            username: email,
            role: profile?.type === 'admin' || isAppAdmin ? 'admin' : (profile && (profile.type as string) !== 'user' ? 'partner' : 'user'),
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
