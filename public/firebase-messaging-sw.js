/* Service Worker do Firebase Cloud Messaging (FCM).
 *
 * A configuração do Firebase é recebida via query string no momento do registro
 * (ver src/lib/notifications.ts), porque um service worker não tem acesso às
 * variáveis de ambiente do Vite (import.meta.env).
 *
 * Mantemos este SW mínimo de propósito: ao instanciar firebase.messaging(), a SDK
 * compat registra automaticamente os listeners de "push" e "notificationclick",
 * exibindo a notificação e abrindo o link (webpush.fcmOptions.link) enviado pelo
 * backend. Implementar onBackgroundMessage aqui causaria notificações duplicadas.
 */
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

// Só inicializa se a config chegou completa (evita erro quando o SW é aberto direto).
if (firebaseConfig.projectId && firebaseConfig.messagingSenderId) {
  firebase.initializeApp(firebaseConfig);
  firebase.messaging();
}
