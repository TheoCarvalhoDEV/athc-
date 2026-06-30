import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import gsap from 'gsap';
import { Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export const ChangePassword = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const user = storage.getCurrentUser();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !user.mustChangePassword) {
      navigate('/feed');
      return;
    }
    const ctx = gsap.context(() => {
      gsap.from('.stagger-el', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: 'expo.out',
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (!user) return;

    try {
      await storage.updatePartnerPassword(user.id, newPassword);
      navigate('/feed');
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      setError("Erro ao atualizar senha no servidor.");
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        {/* Icon */}
        <div className="stagger-el mb-6 w-20 h-20 border border-primary/20 rounded-2xl flex items-center justify-center bg-primary/10 text-primary">
          <ShieldCheck size={36} />
        </div>

        <h1 className="stagger-el font-display italic font-semibold text-3xl text-textLight mb-2">Primeiro acesso</h1>
        <p className="stagger-el text-xs text-textMuted text-center mb-8 leading-relaxed">
          Defina uma nova senha para a sua conta.<br />
          A senha temporária não poderá mais ser usada.
        </p>

        <form onSubmit={handleSubmit} className="w-full space-y-5">
          <div className="stagger-el space-y-1.5 text-left">
            <label className="text-xs font-medium text-textMuted ml-1.5 flex items-center gap-2">
              <Lock size={14} className="text-primary" />
              Nova senha
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mínimo 6 caracteres"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-primary hover:text-accent transition-colors duration-300"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="stagger-el space-y-1.5 text-left">
            <label className="text-xs font-medium text-textMuted ml-1.5 flex items-center gap-2">
              <Lock size={14} className="text-primary" />
              Confirmar senha
            </label>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Repita a nova senha"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="stagger-el bg-danger/10 border border-danger/20 text-danger text-xs px-4 py-3 rounded-xl text-center shadow-sm">
              {error}
            </div>
          )}

          <div className="stagger-el pt-4 flex justify-center">
            <Button type="submit" variant="primary" fullWidth className="rounded-xl py-4 font-sans font-semibold text-base">
              Definir nova senha
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
