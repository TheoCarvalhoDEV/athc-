import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-full border border-primary/20 bg-background px-4 py-2 text-sm text-textDark transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-textDark/50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
