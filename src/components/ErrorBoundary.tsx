import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="text-red-500 w-10 h-10" />
          </div>
          <h1 className="font-sans font-bold text-2xl text-textDark mb-2">
            Oops, algo deu errado!
          </h1>
          <p className="text-textDark/60 text-sm mb-8 max-w-sm">
            Um erro inesperado aconteceu e travou a tela. Nossa equipe já deve estar ciente, mas recarregar a página costuma resolver.
          </p>
          
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition-all"
          >
            <RefreshCcw size={18} />
            Recarregar Aplicativo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
