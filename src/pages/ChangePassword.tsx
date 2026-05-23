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
    <div ref={containerRef} className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Icon */}
        <div className="stagger-el mb-6 w-24 h-24 border-4 border-primary rounded-full flex items-center justify-center bg-primary/5 shadow-lg">
          <ShieldCheck size={40} className="text-primary" />
        </div>

        <h1 className="stagger-el font-serif text-3xl italic text-primary mb-2">Primeiro Acesso</h1>
        <p className="stagger-el text-sm text-textDark/60 text-center mb-8">
          Defina uma nova senha para a sua conta.<br />
          A senha temporária não poderá mais ser usada.
        </p>

        <form onSubmit={handleSubmit} className="w-full space-y-5">
          <div className="stagger-el space-y-2">
            <label className="text-sm font-sans text-textDark ml-4 flex items-center gap-2">
              <Lock size={14} className="text-primary/60" />
              Nova Senha
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mínimo 6 caracteres"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-textDark/40 hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="stagger-el space-y-2">
            <label className="text-sm font-sans text-textDark ml-4 flex items-center gap-2">
              <Lock size={14} className="text-primary/60" />
              Confirmar Senha
            </label>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Repita a nova senha"
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="stagger-el bg-red-500/10 border border-red-500/20 text-red-600 text-sm font-sans px-4 py-3 rounded-2xl text-center">
              {error}
            </div>
          )}

          <div className="stagger-el pt-4 flex justify-center">
            <Button type="submit" className="w-3/4 rounded-full py-6 font-bold shadow-xl">
              Definir Nova Senha
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
