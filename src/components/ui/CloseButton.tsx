import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: number;
}

/** Botão de fechar padronizado para modais e painéis (com rótulo acessível). */
export const CloseButton = ({ className, size = 16, ...props }: CloseButtonProps) => {
  return (
    <button
      type="button"
      aria-label="Fechar"
      title="Fechar"
      className={cn(
        'p-2 bg-surface/50 border border-glassBorder rounded-xl text-textLight hover:bg-surfaceHover hover:border-primary/40 active:scale-95 transition-all duration-300 cursor-pointer neo-click',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none',
        className
      )}
      {...props}
    >
      <X size={size} />
    </button>
  );
};
