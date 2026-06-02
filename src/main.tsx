import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerSW } from 'virtual:pwa-register';

// Valida variáveis de ambiente obrigatórias antes do início da renderização do app
// Evita falhas silenciosas difíceis de depurar quando o arquivo .env está incompleto
function validateEnv() {
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_APP_ID',
  ];
  
  const missing = required.filter((key) => !import.meta.env[key]);
  if (missing.length > 0) {
    console.error(
      `⚠️ Erro de Infraestrutura: As seguintes variáveis de ambiente estão ausentes: ${missing.join(', ')}`
    );
  }
}

// Executa a validação de ambiente na inicialização
validateEnv();

// Registra o Service Worker (PWA) de forma customizada com prompt de atualização manual
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    onNeedRefresh() {
      // Exibe uma confirmação para recarregar o app com o novo bundle disponível
      const shouldUpdate = window.confirm(
        'Uma nova versão do Atchêi está disponível. Deseja atualizar o aplicativo agora?'
      );
      if (shouldUpdate) {
        updateSW(true);
      }
    },
    onOfflineReady() {
      console.log('Atchêi pronto para funcionar em modo Offline!');
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
