import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import gsap from 'gsap';
import { ArrowLeft } from 'lucide-react';

export const Login = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const user = await storage.login(email, password);
      if (user) {
        if (user.mustChangePassword) {
          navigate('/change-password');
        } else {
          toast.success('Bem-vindo de volta!');
          navigate('/feed');
        }
      } else {
        toast.error('Credenciais inválidas!');
      }
    } catch (error) {
      console.error("Erro no login:", error);
      toast.error('Ocorreu um erro ao tentar fazer login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="ambient-glow w-72 h-72 bg-primary/10 -top-36 left-1/2 -translate-x-1/2" />
      <div className="ambient-glow w-48 h-48 bg-accent/8 bottom-20 -right-20" />

      <button 
        onClick={() => navigate(-1)} 
        className="absolute top-8 left-6 p-2.5 rounded-2xl bg-surface/50 border border-glassBorder text-accent hover:border-accent/40 hover:shadow-glow-accent hover:bg-surface/70 transition-all duration-300 neo-click z-10"
        title="Voltar"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="w-full max-w-sm flex flex-col items-center relative z-10">

        <div className="flex flex-col items-center gap-3 stagger-el mb-8">
          <img src={`${import.meta.env.BASE_URL}logo.png?v=3`} alt="Atchêi" className="w-24 h-24 object-contain brightness-110 drop-shadow-[0_4px_20px_rgba(255,79,24,0.15)]" />
          <h2 className="font-display font-black text-2xl uppercase tracking-widest text-accent mt-2">Login</h2>
        </div>

        <form onSubmit={handleLogin} className="w-full glass rounded-[2rem] p-6 shadow-glass-shadow space-y-5">
          <div className="stagger-el space-y-1.5">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-primary block ml-1">E-mail</label>
            <Input 
              type="email"
              placeholder="Seu e-mail" 
              required 
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          
          <div className="stagger-el space-y-1.5">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-primary block ml-1">Senha</label>
            <Input 
              type="password" 
              placeholder="Sua senha" 
              required 
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div className="stagger-el pt-4">
            <Button 
              type="submit" 
              className="w-full py-4 text-sm"
              disabled={isLoading}
            >
              {isLoading ? 'Entrando...' : 'Entrar na Cena'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
