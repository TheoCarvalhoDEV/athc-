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

        // 1. Carrega rápido do localStorage para não travar a UI inicial
        const localUser = storage.getCurrentUser();
        if (localUser && localUser.id === firebaseUser.uid) {
          const currentRole = isAppAdmin ? 'admin' : localUser.role;
          if (localUser.role !== currentRole) {
            localUser.role = currentRole;
            localStorage.setItem('@atche:user', JSON.stringify(localUser));
          }
          setUser(localUser);
          setIsLoading(false);
        }

        // 2. Busca o perfil atualizado do Firestore em background
        try {
          const profile = await storage.getProfileById(firebaseUser.uid);

          // Garantir que admins sempre existam na coleção profiles como type admin
          if (isAppAdmin) {
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
          }

          const updatedUser: User = {
            id: firebaseUser.uid,
            name: profile?.name || firebaseUser.displayName || localUser?.name || 'Usuário',
            username: email,
            role: profile?.type === 'admin' || isAppAdmin ? 'admin' : (profile && (profile.type as string) !== 'user' ? 'partner' : 'user'),
            mustChangePassword: profile?.mustChangePassword ?? false,
            imageUrl: profile?.imageUrl || '',
            profileId: profile?.id
          };

          // Verifica se houve alguma alteração real nos dados (ex: nova URL da foto)
          const hasChanges = !localUser ||
            localUser.name !== updatedUser.name ||
            localUser.role !== updatedUser.role ||
            localUser.imageUrl !== updatedUser.imageUrl ||
            localUser.mustChangePassword !== updatedUser.mustChangePassword;

          if (hasChanges) {
            setUser(updatedUser);
            localStorage.setItem('@atche:user', JSON.stringify(updatedUser));
          }
        } catch (error) {
          console.error("Erro ao sincronizar perfil do Firestore:", error);
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
