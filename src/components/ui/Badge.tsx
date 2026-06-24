import { cn } from '../../lib/utils';

type BadgeVariant = 'primary' | 'accent' | 'success' | 'danger' | 'neutral';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  primary: 'bg-primary/10 text-primary border-primary/20',
  accent: 'bg-accent/10 text-accent border-accent/20',
  success: 'bg-success/10 text-success border-success/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  neutral: 'bg-surface/60 text-textMuted border-glassBorder',
};

/** Selo padronizado para status, contadores e rótulos. */
export const Badge = ({ variant = 'primary', icon, className, children, ...props }: BadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-sans text-[11px] font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
};
