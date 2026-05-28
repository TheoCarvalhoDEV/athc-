import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-2xl font-display font-extrabold tracking-wider transition-all duration-300 focus:outline-none cursor-pointer neo-click",
          {
            'bg-gradient-to-r from-primary to-primaryHover text-textDark border border-primary/20 shadow-glow-primary hover:shadow-glow-primary-lg': variant === 'primary',
            'bg-surface/50 border border-accent/20 text-accent shadow-glass-shadow hover:bg-accent hover:text-textDark hover:border-accent/40 hover:shadow-glow-accent': variant === 'outline',
            'text-accent hover:bg-accent/5 hover:text-accentHover': variant === 'ghost',
            'px-4 py-2 text-xs': size === 'sm',
            'px-6 py-3 text-sm': size === 'md',
            'px-8 py-4 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
