import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { storage } from '../lib/storage';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useRateLimit } from '../hooks/useRateLimit';
import gsap from 'gsap';

export const Register = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { isLimited, remainingMs, trigger: triggerCooldown } = useRateLimit(5000);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.stagger-el', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'expo.out',
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLimited) return;
    triggerCooldown();
    setIsLoading(true);
    try {
      await storage.register(email, password, name);
      toast.success('Conta criada com sucesso!');
      navigate('/feed');
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Este e-mail já está em uso.');
      } else if (error.code === 'auth/weak-password') {
        toast.error('A senha deve ter pelo menos 6 caracteres.');
      } else if (error?.code === 'auth/too-many-requests') {
        toast.error('Tente novamente mais tarde.');
      } else {
        toast.error('Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background flex flex-col items-center justify-center p-6 py-12 relative overflow-hidden">
      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        <div className="flex flex-col items-center gap-2 stagger-el mb-8">
          <img src={`${import.meta.env.BASE_URL}logo.png?v=5`} alt="Atchêi" className="w-24 h-24 object-contain brightness-110 drop-shadow-[0_4px_20px_rgba(90,18,46,0.15)]" />
          <h2 className="font-display font-semibold text-2xl text-accent mt-2">Criar conta</h2>
        </div>

        <form onSubmit={handleRegister} className="w-full surface rounded-2xl p-6 space-y-4">
          <div className="stagger-el space-y-1.5">
            <label className="text-xs font-medium text-textMuted block ml-1">Nome completo</label>
            <Input placeholder="Nome completo" required value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="stagger-el space-y-1.5">
            <label className="text-xs font-medium text-textMuted block ml-1">E-mail</label>
            <Input type="email" placeholder="E-mail" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="stagger-el space-y-1.5">
            <label className="text-xs font-medium text-textMuted block ml-1">Senha</label>
            <Input type="password" placeholder="Senha (mín. 6 caracteres)" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <div className="stagger-el flex items-center mt-4 ml-1">
            <input type="checkbox" id="terms" required className="mr-2.5 accent-accent h-4 w-4 border border-glassBorder bg-surface rounded cursor-pointer" />
            <label htmlFor="terms" className="text-xs text-textMuted leading-tight cursor-pointer select-none">Eu aceito as políticas de privacidade.</label>
          </div>

          <div className="stagger-el pt-4">
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isLoading}
              disabled={isLimited}
              className="py-4 text-sm"
            >
              {isLoading ? 'Criando conta...' : isLimited ? `Aguarde ${Math.ceil(remainingMs / 1000)}s...` : 'Criar minha conta'}
            </Button>
          </div>
        </form>

        <div className="stagger-el mt-6 text-center w-full">
           <Link to="/login" className="text-xs font-medium text-accent hover:text-accentHover underline transition-colors">Voltar para o login</Link>
        </div>
      </div>
    </div>
  );
};
