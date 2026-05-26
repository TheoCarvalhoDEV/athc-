import { auth, db, storageRef } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  addDoc,
  deleteDoc,
  query,
  where,
  updateDoc,
  limit,
  startAfter,
  orderBy
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword
} from 'firebase/auth';

export type ProfileType = 'user' | 'estabelecimento' | 'atletica';

export interface AppProfile {
  id: string;
  name: string;
  type: 'user' | 'atletica' | 'estabelecimento' | 'admin';
  description: string;
  imageUrl?: string;
  email?: string;
  password?: string;
  mustChangePassword?: boolean;
  instagram?: string;
};

export type User = {
  id: string;
  name: string;
  username: string;
  role: 'user' | 'partner' | 'admin';
  mustChangePassword?: boolean;
  imageUrl?: string;
  profileId?: string;
};

export type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  address?: string;
  mediaUrls?: string[];
  publicType: 'Aberto' | 'Geral' | 'Universitário';
  description: string;
  creatorId: string;
  hasTickets?: boolean;
  hasPixTickets?: boolean;
  ticketPrice?: string;
  pixTicketPrice?: string;
  whatsappNumber?: string;
  whatsappName?: string;
  whatsappContacts?: { name: string; phone: string }[];
  isTestEvent?: boolean;
};

export type Registration = {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  userCpf?: string;
  paymentStatus?: string;
  timestamp: string;
};

export const storage = {
  // Profiles (Estabelecimentos, Atléticas)
  getProfiles: async (): Promise<AppProfile[]> => {
    const querySnapshot = await getDocs(collection(db, 'profiles'));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppProfile));
  },

  getProfileById: async (id: string): Promise<AppProfile | undefined> => {
    const docSnap = await getDoc(doc(db, 'profiles', id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as AppProfile;
    }
    return undefined;
  },

  saveProfile: async (profile: AppProfile) => {
    await setDoc(doc(db, 'profiles', profile.id), {
      name: profile.name,
      type: profile.type,
      description: profile.description,
      imageUrl: profile.imageUrl || '',
      email: profile.email || '',
      mustChangePassword: profile.mustChangePassword ?? false
    });
  },

  deleteProfile: async (id: string) => {
    await deleteDoc(doc(db, 'profiles', id));
  },

  updateProfile: async (id: string, data: Partial<AppProfile>) => {
    await updateDoc(doc(db, 'profiles', id), data);
  },
  // Events
  getEvents: async (): Promise<EventItem[]> => {
    const querySnapshot = await getDocs(collection(db, 'events'));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventItem));
  },

  getPaginatedEvents: async (lastVisibleDoc: any = null, pageSize: number = 10) => {
    const eventsRef = collection(db, 'events');
    const q = lastVisibleDoc
      ? query(eventsRef, orderBy('date', 'asc'), startAfter(lastVisibleDoc), limit(pageSize))
      : query(eventsRef, orderBy('date', 'asc'), limit(pageSize));

    const querySnapshot = await getDocs(q);
    const events = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventItem));
    const lastDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

    return { events, lastDoc };
  },

  saveEvent: async (event: EventItem) => {
    const { id, ...eventData } = event;
    if (id && id.length > 5) { // Se tiver um ID real, atualiza
      await setDoc(doc(db, 'events', id), eventData);
    } else { // Senão, cria novo
      await addDoc(collection(db, 'events'), eventData);
    }
  },

  deleteEvent: async (id: string) => {
    await deleteDoc(doc(db, 'events', id));
  },

  getAgendaByProfileId: async (profileId: string): Promise<EventItem[]> => {
    const q = query(collection(db, 'events'), where('creatorId', '==', profileId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventItem));
  },

  // Auth (Sessão mantida localmente para rapidez, sincronizada com Firebase)
  getCurrentUser: (): User | null => {
    const data = localStorage.getItem('@atche:user');
    if (!data) return null;
    const user = JSON.parse(data);
    if (!user.role) user.role = 'user';
    return user;
  },

  register: async (email: string, password: string, name: string): Promise<User | null> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;

      const isAppAdmin = storage.isAdminEmail(email);

      const user: User = {
        id: fbUser.uid,
        name: isAppAdmin ? 'Administrador' : name,
        username: email,
        role: isAppAdmin ? 'admin' : 'user',
        mustChangePassword: false,
      };

      await setDoc(doc(db, 'profiles', fbUser.uid), {
        name: isAppAdmin ? 'Administrador' : name,
        email,
        type: isAppAdmin ? 'admin' : 'user',
        mustChangePassword: false
      });

      localStorage.setItem('@atche:user', JSON.stringify(user));
      return user;
    } catch (error) {
      console.error("Erro no registro:", error);
      throw error;
    }
  },

  isAdminEmail: (email: string): boolean => {
    const adminEmails = [
      'admin@atche.com.br',
      'theotheteo@gmail.com',
      'allanjipa123@gmail.com'
    ];
    return adminEmails.includes(email.toLowerCase());
  },

  login: async (email: string, password?: string): Promise<User | null> => {
    try {
      // Usar exclusivament Firebase Auth (senhas e admins mockados removidos)
      const userCredential = await signInWithEmailAndPassword(auth, email, password || '');
      const fbUser = userCredential.user;

      // 4. Buscar perfil no Firestore para saber a role
      // Tenta buscar por ID ou por Email
      let profile = await storage.getProfileById(fbUser.uid);
      if (!profile) {
        const q = query(collection(db, 'profiles'), where('email', '==', email));
        const qs = await getDocs(q);
        if (!qs.empty) {
          profile = { id: qs.docs[0].id, ...qs.docs[0].data() } as AppProfile;
        }
      }

      const isAppAdmin = storage.isAdminEmail(email);

      const user: User = {
        id: fbUser.uid,
        name: isAppAdmin ? 'Administrador' : (profile?.name || fbUser.displayName || 'Usuário'),
        username: email,
        role: profile?.type === 'admin' || isAppAdmin ? 'admin' : (profile && (profile.type as string) !== 'user' ? 'partner' : 'user'),
        mustChangePassword: profile?.mustChangePassword ?? false,
        imageUrl: profile?.imageUrl || '',
        profileId: profile?.id
      };

      localStorage.setItem('@atche:user', JSON.stringify(user));
      return user;
    } catch (error) {
      console.error("Erro no login:", error);
      return null;
    }
  },

  logout: async () => {
    await signOut(auth);
    localStorage.removeItem('@atche:user');
  },

  updatePartnerPassword: async (partnerId: string, newPassword: string) => {
    // O partnerId aqui é o UID do Firebase Auth, mas o doc no Firestore
    // foi criado com um ID diferente (p12345...). Buscar pelo email.
    const currentUser = storage.getCurrentUser();
    const email = currentUser?.username;

    if (email) {
      // Buscar o documento do perfil pelo email
      const q = query(collection(db, 'profiles'), where('email', '==', email));
      const qs = await getDocs(q);

      if (!qs.empty) {
        const profileDocRef = qs.docs[0].ref;
        await updateDoc(profileDocRef, {
          mustChangePassword: false
        });
      }
    }

    // Atualizar a senha no Firebase Auth também
    if (auth.currentUser) {
      const { updatePassword } = await import('firebase/auth');
      await updatePassword(auth.currentUser, newPassword);
    }

    // Atualizar a sessão local
    if (currentUser && currentUser.id === partnerId) {
      currentUser.mustChangePassword = false;
      localStorage.setItem('@atche:user', JSON.stringify(currentUser));
    }
  },

  updatePartnerProfile: async (email: string, updates: Partial<AppProfile>): Promise<AppProfile | null> => {
    try {
      const q = query(collection(db, 'profiles'), where('email', '==', email));
      const qs = await getDocs(q);
      if (!qs.empty) {
        const docRef = qs.docs[0].ref;
        await updateDoc(docRef, updates);

        const currentUser = storage.getCurrentUser();
        if (currentUser && currentUser.username === email) {
          const updatedUser = {
            ...currentUser,
            name: updates.name || currentUser.name,
            imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : currentUser.imageUrl
          };
          localStorage.setItem('@atche:user', JSON.stringify(updatedUser));
        }

        return { id: qs.docs[0].id, ...qs.docs[0].data(), ...updates } as AppProfile;
      }
      return null;
    } catch (error) {
      console.error("Erro ao atualizar o perfil do parceiro:", error);
      return null;
    }
  },

  getProfileByEmail: async (email: string): Promise<AppProfile | null> => {
    try {
      const q = query(collection(db, 'profiles'), where('email', '==', email));
      const qs = await getDocs(q);
      if (!qs.empty) {
        return { id: qs.docs[0].id, ...qs.docs[0].data() } as AppProfile;
      }
      return null;
    } catch (e) {
      console.error("Erro ao buscar perfil por email:", e);
      return null;
    }
  },



  // Registrations (Inscrições/Presenças)
   getRegistrations: async (): Promise<Registration[]> => {
    const querySnapshot = await getDocs(collection(db, 'registrations'));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration));
  },

  getRegistrationsForUser: async (userId: string): Promise<Registration[]> => {
    const q = query(collection(db, 'registrations'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration));
  },

  saveRegistration: async (registration: Registration) => {
    const { id, ...data } = registration;
    await addDoc(collection(db, 'registrations'), data);
  },

  getRegistrationsForEvent: async (eventId: string): Promise<Registration[]> => {
    const q = query(collection(db, 'registrations'), where('eventId', '==', eventId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration));
  },

  getRegistrationCounts: async (): Promise<Map<string, number>> => {
    const querySnapshot = await getDocs(collection(db, 'registrations'));
    const counts = new Map<string, number>();
    querySnapshot.docs.forEach(doc => {
      const eventId = doc.data().eventId;
      if (eventId) {
        counts.set(eventId, (counts.get(eventId) || 0) + 1);
      }
    });
    return counts;
  },

  hasUserRegistered: async (eventId: string, userId: string): Promise<boolean> => {
    const q = query(
      collection(db, 'registrations'),
      where('eventId', '==', eventId),
      where('userId', '==', userId)
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  },

  uploadFile: async (file: File, folder: string): Promise<string> => {
    try {
      const currentUser = storage.getCurrentUser();
      const userId = currentUser ? currentUser.id : 'guest';
      const fileRef = ref(storageRef, `${folder}/${userId}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      return url;
    } catch (error) {
      console.error("Erro ao fazer upload do arquivo:", error);
      throw error;
    }
  }
};
