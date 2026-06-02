import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "block h-11 md:h-14 w-full rounded-xl md:rounded-2xl border border-glassBorder bg-surface/60 px-3.5 md:px-5 py-2 md:py-3 text-sm md:text-base text-textLight font-sans font-medium transition-all duration-300 focus:outline-none focus:border-primary/40 focus:shadow-glow-primary disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-textMuted/50 backdrop-blur-md",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
