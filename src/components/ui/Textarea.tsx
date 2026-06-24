import { forwardRef, useId } from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const baseField =
  "block w-full rounded-xl md:rounded-2xl border bg-surface/60 px-3.5 md:px-5 py-3 text-sm md:text-base text-textLight font-sans font-medium transition-all duration-300 outline-none disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-textMuted/60 backdrop-blur-md resize-y min-h-[96px] md:min-h-[120px]";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const reactId = useId();
    const fieldId = id || reactId;
    const hasError = !!error;

    const stateClasses = hasError
      ? "border-danger/50 focus:border-danger focus-visible:ring-2 focus-visible:ring-danger/30 focus:shadow-[0_4px_20px_rgba(239,68,68,0.12)]"
      : "border-glassBorder focus:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25 focus:shadow-glow-primary";

    const field = (
      <textarea
        id={fieldId}
        ref={ref}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(baseField, stateClasses, className)}
        {...props}
      />
    );

    if (!label && !error && !hint) return field;

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label
            htmlFor={fieldId}
            className="text-xs font-medium text-textMuted block ml-1"
          >
            {label}
          </label>
        )}
        {field}
        {hasError ? (
          <p id={`${fieldId}-error`} className="text-[10px] md:text-xs text-danger font-semibold ml-1 leading-snug">
            {error}
          </p>
        ) : hint ? (
          <p id={`${fieldId}-hint`} className="text-[10px] md:text-xs text-textMuted ml-1 leading-snug">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
