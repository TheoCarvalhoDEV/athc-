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
  createUserWithEmailAndPassword,
  updatePassword
} from 'firebase/auth';

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

export interface TicketType {
  id: string;
  name: string;
  price: number;
  capacity: number;
  sold: number;
  status: 'active' | 'sold_out' | 'paused';
}

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
  registrationCount?: number;
  tickets?: TicketType[]; // Múltiplos tipos de ingressos e lotes
  hasPresence?: boolean;
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
  ticketTypeId?: string;   // ID do tipo de ingresso (lote) adquirido
  ticketTypeName?: string; // Nome do tipo de ingresso (lote) adquirido
  pedidoId?: string;       // ID do pedido de pagamento
  checkedIn?: boolean;     // Ingresso já validado na portaria?
  checkedInAt?: string;    // Quando foi validado (ISO)
  checkedInBy?: string;    // Quem validou (nome do operador)
  isTeste?: boolean;       // Ingresso de teste (gerado por admin, fora do faturamento real)
};

// Pedido de pagamento (Pix via Mercado Pago). Criado e alterado exclusivamente pelas
// Cloud Functions; o cliente apenas lê (dono do pedido, admin ou criador do evento).
export type Pedido = {
  id: string;
  valor: number;
  eventId: string;
  eventTitle?: string;
  userId: string;
  clienteNome?: string;
  clienteEmail?: string;
  // pendente | pago | estornado | chargeback | cancelado | rejeitado
  status: string;
  itensComprados?: { id: string; name?: string; quantity: number }[];
  overbooked?: boolean;
  isTeste?: boolean; // Pedido de teste (gerado por admin) — não entra no faturamento real
  dataCriacao?: any;
  dataPagamento?: any;
  dataEstorno?: any;
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
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data } as EventItem;
    });
  },

  getPaginatedEvents: async (lastVisibleDoc: any = null, pageSize: number = 10) => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const eventsRef = collection(db, 'events');
    const q = lastVisibleDoc
      ? query(
          eventsRef,
          where('date', '>=', todayStr),
          orderBy('date', 'asc'),
          startAfter(lastVisibleDoc),
          limit(pageSize)
        )
      : query(
          eventsRef,
          where('date', '>=', todayStr),
          orderBy('date', 'asc'),
          limit(pageSize)
        );

    const querySnapshot = await getDocs(q);
    const events = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data } as EventItem;
    });
    const lastDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

    return { events, lastDoc };
  },

  getUpcomingEvents: async (): Promise<EventItem[]> => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('date', '>=', todayStr),
      orderBy('date', 'asc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data } as EventItem;
    });
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

  getEventById: async (id: string): Promise<EventItem | undefined> => {
    const docSnap = await getDoc(doc(db, 'events', id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as EventItem;
    }
    return undefined;
  },

  getAgendaByProfileId: async (profileId: string): Promise<EventItem[]> => {
    const q = query(collection(db, 'events'), where('creatorId', '==', profileId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data } as EventItem;
    });
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

  saveRegistration: async (registration: Registration): Promise<string> => {
    const { id, ...data } = registration;
    const docRef = await addDoc(collection(db, 'registrations'), data);
    return docRef.id;
  },

  getRegistrationsForEvent: async (eventId: string): Promise<Registration[]> => {
    const q = query(collection(db, 'registrations'), where('eventId', '==', eventId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration));
  },

  // Pedidos de pagamento de um evento (usado no painel financeiro do parceiro).
  // Filtra o status em memória para não exigir índice composto no Firestore.
  getPedidosForEvent: async (eventId: string): Promise<Pedido[]> => {
    const q = query(collection(db, 'pedidos'), where('eventId', '==', eventId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pedido));
  },

  // Busca um ingresso/inscrição pelo ID do documento (usado na leitura do QR Code)
  getRegistrationById: async (id: string): Promise<Registration | null> => {
    const trimmed = (id || '').trim();
    if (!trimmed) return null;
    try {
      const docSnap = await getDoc(doc(db, 'registrations', trimmed));
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Registration;
      }
      return null;
    } catch (error) {
      console.error('Erro ao buscar inscrição por ID:', error);
      return null;
    }
  },

  // Marca um ingresso como validado/usado (check-in na portaria)
  checkInRegistration: async (id: string, byName?: string): Promise<void> => {
    await updateDoc(doc(db, 'registrations', id), {
      checkedIn: true,
      checkedInAt: new Date().toISOString(),
      checkedInBy: byName || '',
    });
  },

  // Busca inscrições paginadas de um evento específico para otimizar desempenho e custo
  getPaginatedRegistrationsForEvent: async (eventId: string, lastVisibleDoc: any = null, pageSize: number = 20) => {
    const regsRef = collection(db, 'registrations');
    const q = lastVisibleDoc
      ? query(
          regsRef,
          where('eventId', '==', eventId),
          startAfter(lastVisibleDoc),
          limit(pageSize)
        )
      : query(
          regsRef,
          where('eventId', '==', eventId),
          limit(pageSize)
        );

    const querySnapshot = await getDocs(q);
    const registrations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Registration));
    const lastDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

    return { registrations, lastDoc };
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


