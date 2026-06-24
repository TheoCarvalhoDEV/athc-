import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  /** Mostra spinner e desabilita o botão (mantém a largura). */
  loading?: boolean;
  /** Ocupa 100% da largura disponível. */
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, fullWidth = false, disabled, children, ...props }, ref) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 rounded-xl font-sans font-semibold transition-all duration-200 outline-none cursor-pointer neo-click",
          // Acessibilidade: anel de foco visível por teclado, sem afetar o clique do mouse
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          // Estado desabilitado padronizado (loading reutiliza o mesmo)
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none disabled:translate-y-0",
          {
            'bg-primary text-textDark hover:bg-primaryHover shadow-sm focus-visible:ring-primary/50': variant === 'primary',
            'bg-surface border border-glassBorder text-textLight shadow-sm hover:bg-surfaceHover hover:border-primary/30 focus-visible:ring-primary/30': variant === 'secondary',
            'bg-transparent border border-accent/30 text-accent hover:bg-accent hover:text-textDark hover:border-accent focus-visible:ring-accent/40': variant === 'outline',
            'text-accent hover:bg-accent/5 hover:text-accentHover focus-visible:ring-accent/30': variant === 'ghost',
            'bg-success text-textDark hover:brightness-95 shadow-sm focus-visible:ring-success/50': variant === 'success',
            'bg-danger text-white hover:brightness-95 shadow-sm focus-visible:ring-danger/50': variant === 'danger',
            'px-4 py-2 text-xs': size === 'sm',
            'px-6 py-3 text-sm': size === 'md',
            'px-8 py-4 text-base': size === 'lg',
            'w-full': fullWidth,
          },
          className
        )}
        {...props}
      >
        {loading && (
          <span
            aria-hidden="true"
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
          />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
