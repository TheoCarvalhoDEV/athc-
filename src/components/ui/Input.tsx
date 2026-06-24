import { forwardRef, useId } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Rótulo acima do campo (cria o wrapper acessível com htmlFor). */
  label?: string;
  /** Mensagem de erro: pinta a borda de danger e exibe o texto abaixo. */
  error?: string;
  /** Texto de ajuda discreto abaixo do campo (oculto quando há erro). */
  hint?: string;
  /** Ícone à esquerda dentro do campo. */
  leftIcon?: React.ReactNode;
  /** Slot à direita dentro do campo (ex.: botão mostrar/ocultar senha). */
  rightSlot?: React.ReactNode;
}

const baseField =
  "block h-11 md:h-14 w-full rounded-xl md:rounded-2xl border bg-surface/60 px-3.5 md:px-5 py-2 md:py-3 text-sm md:text-base text-textLight font-sans font-medium transition-all duration-300 outline-none disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-textMuted/60 backdrop-blur-md";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, hint, leftIcon, rightSlot, id, ...props }, ref) => {
    const reactId = useId();
    const inputId = id || reactId;
    const hasError = !!error;

    const stateClasses = hasError
      ? "border-danger/50 focus:border-danger focus-visible:ring-2 focus-visible:ring-danger/30 focus:shadow-[0_4px_20px_rgba(239,68,68,0.12)]"
      : "border-glassBorder focus:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25 focus:shadow-glow-primary";

    // Caso simples (uso legado): sem label/erro/hint/ícone → retorna o <input> puro.
    if (!label && !error && !hint && !leftIcon && !rightSlot) {
      return (
        <input
          id={inputId}
          type={type}
          ref={ref}
          className={cn(baseField, stateClasses, className)}
          {...props}
        />
      );
    }

    const field = (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <span className="absolute left-3.5 md:left-4 text-textMuted/70 pointer-events-none flex items-center">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          type={type}
          ref={ref}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            baseField,
            stateClasses,
            leftIcon && "pl-10 md:pl-12",
            rightSlot && "pr-11 md:pr-12",
            className
          )}
          {...props}
        />
        {rightSlot && (
          <span className="absolute right-2.5 md:right-3 flex items-center">{rightSlot}</span>
        )}
      </div>
    );

    if (!label && !error && !hint) return field;

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-textMuted block ml-1"
          >
            {label}
          </label>
        )}
        {field}
        {hasError ? (
          <p id={`${inputId}-error`} className="text-[10px] md:text-xs text-danger font-semibold ml-1 leading-snug">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-[10px] md:text-xs text-textMuted ml-1 leading-snug">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';
