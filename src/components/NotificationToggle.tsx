import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  notificationsSupported,
  getNotificationPermission,
  enableNotifications,
  disableNotifications,
} from '../lib/notifications';

// Só renderiza se a chave VAPID estiver configurada (sem ela o push não funciona).
const HAS_VAPID = !!import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const NotificationToggle = () => {
  const { user } = useAuth();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const ok = await notificationsSupported();
      if (!active) return;
      setSupported(ok);
      setPermission(getNotificationPermission());
    })();
    return () => {
      active = false;
    };
  }, []);

  // Não exibe nada quando não há suporte, chave ou usuário logado.
  if (!HAS_VAPID || !user || supported === false || permission === 'unsupported') {
    return null;
  }
  if (supported === null) return null; // ainda verificando

  const handleEnable = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const result = await enableNotifications(user.id);
      if (result === 'granted') {
        setPermission('granted');
        toast.success('Notificações ativadas!');
      } else if (result === 'denied') {
        setPermission('denied');
        toast.error('Permissão negada. Ative nas configurações do navegador.');
      } else {
        toast.error('Não foi possível ativar as notificações neste dispositivo.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await disableNotifications();
      toast.success('Notificações desativadas neste dispositivo.');
      // A permissão do navegador continua concedida; apenas removemos o token.
      setPermission('default');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface rounded-2xl p-4 flex items-center gap-4 text-left">
      <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
        {permission === 'granted' ? <BellRing size={20} /> : permission === 'denied' ? <BellOff size={20} /> : <Bell size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-sans font-semibold text-sm text-textLight">Notificações</p>
        <p className="text-xs text-textMuted mt-0.5 leading-relaxed">
          {permission === 'granted'
            ? 'Você recebe avisos de confirmação de ingressos.'
            : permission === 'denied'
              ? 'Bloqueadas. Libere nas configurações do navegador.'
              : 'Receba a confirmação dos seus ingressos.'}
        </p>
      </div>
      {permission === 'granted' ? (
        <button
          onClick={handleDisable}
          disabled={busy}
          className="px-3.5 py-2 rounded-xl border border-glassBorder bg-surface/50 text-textMuted hover:text-danger hover:border-danger/40 font-sans text-xs font-semibold transition-colors duration-200 cursor-pointer disabled:opacity-50 shrink-0"
        >
          {busy ? '...' : 'Desativar'}
        </button>
      ) : permission === 'default' ? (
        <button
          onClick={handleEnable}
          disabled={busy}
          className="px-3.5 py-2 rounded-xl bg-primary text-textDark font-sans text-xs font-semibold hover:bg-primaryHover transition-colors duration-200 cursor-pointer disabled:opacity-50 shrink-0"
        >
          {busy ? '...' : 'Ativar'}
        </button>
      ) : null}
    </div>
  );
};
