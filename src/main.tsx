import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerSW } from 'virtual:pwa-register';
import toast from 'react-hot-toast';

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

// Registra o Service Worker (PWA) de forma customizada com prompt de atualização manual
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    onNeedRefresh() {
      // Usamos um toast customizado persistente, garantindo compatibilidade total com mobile (iOS/Android)
      // onde diálogos nativos como window.confirm costumam ser bloqueados pelo sistema operacional
      toast((t) => (
        <div className="flex flex-col gap-2 p-1 text-left">
          <p className="text-xs font-semibold text-[#F0EDE8]">
            Uma nova versão do Atchêi está disponível!
          </p>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => {
                toast.dismiss(t.id);
                updateSW(true);
              }}
              className="px-3.5 py-1.5 text-[10px] font-bold text-black bg-primary rounded-xl uppercase tracking-wider transition-all hover:opacity-90 active:scale-95 cursor-pointer border-0"
            >
              Atualizar
            </button>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="px-3.5 py-1.5 text-[10px] font-bold text-[#F0EDE8]/60 hover:text-[#F0EDE8] bg-white/5 hover:bg-white/10 rounded-xl uppercase tracking-wider transition-colors cursor-pointer border-0"
            >
              Depois
            </button>
          </div>
        </div>
      ), {
        duration: Infinity, // Não fecha sozinho até o usuário interagir
        position: 'bottom-center',
      });
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
