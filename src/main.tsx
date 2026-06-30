import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerSW } from 'virtual:pwa-register';

// Valida variáveis de ambiente obrigatórias antes do início da renderização do app
// Evita falhas silenciosas difíceis de depurar quando o arquivo .env está incompleto
function validateEnv() {
  const envs: Record<string, string | undefined> = {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  
  const missing = Object.entries(envs)
    .filter(([_, val]) => !val)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error(
      `⚠️ Erro de Infraestrutura: As seguintes variáveis de ambiente estão ausentes: ${missing.join(', ')}`
    );
  }
}

// Executa a validação de ambiente na inicialização
validateEnv();

// Registra o Service Worker (PWA) em modo autoUpdate: ao detectar um novo deploy, o Workbox
// instala a nova versão, assume o controle (skipWaiting + clientsClaim) e recarrega a página
// automaticamente — sem depender de o usuário clicar em nada. Isso evita que bundles antigos
// fiquem em cache servindo código desatualizado após cada deploy.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      // App pronto para uso offline (PWA). Sem log em produção.
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Força a checagem por nova versão (deploy) sem depender de o usuário recarregar:
      // ao retomar o foco no app, ao reconectar à internet e periodicamente.
      const checkForUpdate = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          registration.update().catch(() => {});
        }
      };

      document.addEventListener('visibilitychange', checkForUpdate);
      window.addEventListener('online', checkForUpdate);

      // Fallback periódico (a cada 30 min) para sessões longas que ficam abertas em primeiro plano.
      setInterval(checkForUpdate, 30 * 60 * 1000);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
