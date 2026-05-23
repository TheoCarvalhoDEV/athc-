import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { storage } from '../lib/storage';
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
          navigate('/feed');
        }
      } else {
        alert('Credenciais inválidas!');
      }
    } catch (error) {
      console.error("Erro no login:", error);
      alert('Ocorreu um erro ao tentar fazer login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo Icon */}
        <div className="stagger-el mb-6 w-24 h-24 border-4 border-primary rounded-full flex flex-col items-center justify-center bg-primary/5 shadow-lg">
           <div className="w-12 h-2 bg-primary rounded-full mb-1"></div>
           <div className="w-2 h-8 bg-primary"></div>
           <div className="w-8 h-2 bg-primary rounded-full mt-1"></div>
        </div>
        
        <h1 className="stagger-el font-serif text-5xl italic text-primary mb-12">Atchê</h1>

        <form onSubmit={handleLogin} className="w-full space-y-6">
          <div className="stagger-el space-y-2">
            <label className="text-sm font-sans text-textDark ml-4">E-mail ou Usuário</label>
            <Input 
              placeholder="Seu usuário" 
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

        <p className="stagger-el mt-8 text-sm text-textDark/70 font-mono">
          Não tem uma conta? <Link to="/register" className="text-primary font-bold hover:underline">Crie uma conta agora!</Link>
        </p>
      </div>
    </div>
  );
};
