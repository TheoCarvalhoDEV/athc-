import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from './ui/Button';

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
          <div className="w-20 h-20 bg-danger/10 border border-danger/20 rounded-2xl flex items-center justify-center mb-6">
            <AlertTriangle className="text-danger w-10 h-10" />
          </div>
          <h1 className="font-display font-semibold text-2xl text-textLight mb-2">
            Algo deu errado
          </h1>
          <p className="text-textMuted text-sm mb-8 max-w-sm leading-relaxed">
            Um erro inesperado travou a tela. Nossa equipe já deve estar ciente, mas recarregar a página costuma resolver.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button
              variant="primary"
              fullWidth
              onClick={() => window.location.reload()}
            >
              <RefreshCcw size={18} />
              Recarregar
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => { window.location.href = '/'; }}
            >
              Voltar ao Início
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
