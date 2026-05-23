import { useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import gsap from 'gsap';

export const Register = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('@atche:user', JSON.stringify({ id: '1', name: 'Usuário', username: 'usuario', role: 'user' }));
    navigate('/feed');
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background flex flex-col items-center justify-center p-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo Icon */}
        <div className="stagger-el mb-4 w-16 h-16 border-2 border-primary rounded-full flex flex-col items-center justify-center bg-primary/5">
           <div className="w-8 h-1 bg-primary rounded-full mb-1"></div>
           <div className="w-1 h-5 bg-primary"></div>
           <div className="w-5 h-1 bg-primary rounded-full mt-1"></div>
        </div>
        
        <h1 className="stagger-el font-serif text-3xl italic text-primary mb-8">Atchê</h1>

        <form onSubmit={handleRegister} className="w-full space-y-4">
          <div className="stagger-el space-y-1">
            <label className="text-xs font-sans text-textDark ml-4">Nome Completo</label>
            <Input placeholder="Nome Completo" required />
          </div>
          
          <div className="stagger-el space-y-1">
            <label className="text-xs font-sans text-textDark ml-4">Data de Nascimento</label>
            <Input type="date" required />
          </div>

          <div className="stagger-el space-y-1">
            <label className="text-xs font-sans text-textDark ml-4">Nome de Usuário</label>
            <Input placeholder="Nome de Usuário" required />
          </div>

          <div className="stagger-el space-y-1">
            <label className="text-xs font-sans text-textDark ml-4">Senha</label>
            <Input type="password" placeholder="Senha" required />
          </div>

          <div className="stagger-el flex items-center mt-4 ml-2">
            <input type="checkbox" id="terms" required className="mr-2 accent-primary" />
            <label htmlFor="terms" className="text-xs font-mono text-textDark/80">Eu aceito os termos de Políticas de Privacidade.</label>
          </div>

          <div className="stagger-el pt-6 flex justify-center">
            <Button type="submit" className="w-3/4 rounded-full py-4 font-bold shadow-xl">
              Entrar
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
