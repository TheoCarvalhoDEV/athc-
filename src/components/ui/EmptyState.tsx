import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Ação opcional (geralmente um <Button>). */
  action?: React.ReactNode;
  className?: string;
}

/** Estado vazio padronizado: ícone + título + descrição + ação opcional. */
export const EmptyState = ({ icon, title, description, action, className }: EmptyStateProps) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12 md:py-16 glass rounded-3xl border border-glassBorder shadow-glass-shadow',
        className
      )}
    >
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-primary/8 text-primary/70 flex items-center justify-center mb-5">
          {icon}
        </div>
      )}
      <h3 className="font-display font-semibold text-lg md:text-xl text-textLight">
        {title}
      </h3>
      {description && (
        <p className="text-xs md:text-sm text-textMuted font-sans mt-2 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
};
