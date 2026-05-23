import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { storage } from '../lib/storage';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import gsap from 'gsap';

export const Register = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
      } else {
        toast.error('Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background flex flex-col items-center justify-center p-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="flex flex-col items-center gap-2 stagger-el mb-8">
          <img src={`${import.meta.env.BASE_URL}logo.png?v=3`} alt="Atchê" className="w-32 h-32 object-contain mix-blend-multiply" />
        </div>

        <form onSubmit={handleRegister} className="w-full space-y-4">
          <div className="stagger-el space-y-1">
            <label className="text-xs font-sans text-textDark ml-4">Nome Completo</label>
            <Input placeholder="Nome Completo" required value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="stagger-el space-y-1">
            <label className="text-xs font-sans text-textDark ml-4">E-mail</label>
            <Input type="email" placeholder="E-mail" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="stagger-el space-y-1">
            <label className="text-xs font-sans text-textDark ml-4">Senha</label>
            <Input type="password" placeholder="Senha (Mín 6 caracteres)" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <div className="stagger-el flex items-center mt-4 ml-2">
            <input type="checkbox" id="terms" required className="mr-2 accent-primary" />
            <label htmlFor="terms" className="text-xs font-mono text-textDark/80">Eu aceito os termos de Políticas de Privacidade.</label>
          </div>

          <div className="stagger-el pt-6 flex justify-center">
            <Button type="submit" disabled={isLoading} className="w-3/4 rounded-full py-4 font-bold shadow-xl">
              {isLoading ? 'Criando...' : 'Criar Conta'}
            </Button>
          </div>
        </form>
        
        <div className="stagger-el mt-6 text-center w-full">
           <Link to="/" className="text-xs text-primary underline">Voltar para o Login</Link>
        </div>
      </div>
    </div>
  );
};
