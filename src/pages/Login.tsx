import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import gsap from 'gsap';

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
    <div ref={containerRef} className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center">

        <div className="flex flex-col items-center gap-3 stagger-el mb-12">
          <img src={`${import.meta.env.BASE_URL}logo.png?v=3`} alt="Atchê" className="w-32 h-32 object-contain mix-blend-multiply" />
        </div>

        <form onSubmit={handleLogin} className="w-full space-y-6">
          <div className="stagger-el space-y-2">
            <label className="text-sm font-sans text-textDark ml-4">E-mail</label>
            <Input 
              type="email"
              placeholder="Seu e-mail" 
              required 
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          
          <div className="stagger-el space-y-2">
            <label className="text-sm font-sans text-textDark ml-4">Senha</label>
            <Input 
              type="password" 
              placeholder="Sua senha" 
              required 
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div className="stagger-el pt-4 flex justify-center">
            <Button 
              type="submit" 
              className="w-3/4 rounded-full py-6 font-bold shadow-xl"
              disabled={isLoading}
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
