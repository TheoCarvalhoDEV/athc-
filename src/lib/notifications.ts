import { getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db, firebaseConfig } from './firebase';

// Chave pública VAPID do projeto (Firebase Console > Cloud Messaging > Web Push certificates).
// Sem ela, o registro de token falha — as notificações ficam silenciosamente desativadas.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

// Garante que o listener de foreground seja registrado uma única vez por sessão.
let foregroundBound = false;

export type EnableResult = 'granted' | 'denied' | 'unsupported' | 'error';

// Verifica suporte do navegador a push (Service Worker + Notification + FCM).
export const notificationsSupported = async (): Promise<boolean> => {
  try {
    if (typeof window === 'undefined') return false;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;
    return await isSupported();
  } catch {
    return false;
  }
};

export const getNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
};

// Registra o SW do FCM passando a config via query string (o SW não lê import.meta.env).
async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey || '',
    authDomain: firebaseConfig.authDomain || '',
    projectId: firebaseConfig.projectId || '',
    storageBucket: firebaseConfig.storageBucket || '',
    messagingSenderId: firebaseConfig.messagingSenderId || '',
    appId: firebaseConfig.appId || '',
  });
  // Escopo dedicado para não disputar o controle de cliente com o SW do vite-plugin-pwa (Workbox,
  // escopo '/'). O getToken recebe este registration explicitamente, então isolar o escopo não
  // afeta a obtenção do token. '/firebase-cloud-messaging-push-scope' é o escopo padrão do FCM.
  return navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}firebase-messaging-sw.js?${params.toString()}`,
    { scope: `${import.meta.env.BASE_URL}firebase-cloud-messaging-push-scope` }
  );
}

async function getMessagingSafe() {
  if (!(await notificationsSupported())) return null;
  try {
    return getMessaging(getApp());
  } catch {
    return null;
  }
}

// Persiste o token no Firestore. O id do documento é o próprio token (idempotente).
async function saveToken(userId: string, token: string) {
  await setDoc(
    doc(db, 'fcmTokens', token),
    {
      token,
      userId,
      userAgent: navigator.userAgent.slice(0, 200),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Exibe um toast quando a notificação chega com o app em primeiro plano.
function bindForeground(messaging: ReturnType<typeof getMessaging>) {
  if (foregroundBound) return;
  foregroundBound = true;
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Atchêi';
    const body = payload.notification?.body || '';
    toast(body ? `${title}\n${body}` : title, { duration: 6000, icon: '🔔' });
  });
}

// Solicita permissão ao usuário e registra o token de push. Acionado por um clique do usuário.
export async function enableNotifications(userId: string): Promise<EnableResult> {
  if (!VAPID_KEY) {
    console.warn('VITE_FIREBASE_VAPID_KEY ausente — notificações push desativadas.');
    return 'unsupported';
  }
  const messaging = await getMessagingSafe();
  if (!messaging) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const swReg = await registerFcmServiceWorker();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (!token) return 'error';

    await saveToken(userId, token);
    bindForeground(messaging);
    return 'granted';
  } catch (e) {
    console.error('Erro ao ativar notificações:', e);
    return 'error';
  }
}

// Sincroniza o token silenciosamente quando a permissão já foi concedida (chamado no login).
export async function syncNotificationToken(userId: string): Promise<void> {
  if (!VAPID_KEY || getNotificationPermission() !== 'granted') return;
  const messaging = await getMessagingSafe();
  if (!messaging) return;
  try {
    const swReg = await registerFcmServiceWorker();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token) {
      await saveToken(userId, token);
      bindForeground(messaging);
    }
  } catch (e) {
    console.error('Erro ao sincronizar token de notificação:', e);
  }
}

// Remove o token deste dispositivo do Firestore (ex.: ao desativar notificações).
export async function disableNotifications(): Promise<void> {
  const messaging = await getMessagingSafe();
  if (!messaging || !VAPID_KEY) return;
  try {
    const swReg = await registerFcmServiceWorker();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token) {
      await deleteDoc(doc(db, 'fcmTokens', token));
    }
  } catch (e) {
    console.error('Erro ao desativar notificações:', e);
  }
}
