import { cn } from '../../lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Placeholder de carregamento com brilho "scanline" (definido em index.css via .skeleton-dark).
 * Use para reservar o espaço do conteúdo real e reduzir a percepção de espera.
 */
export const Skeleton = ({ className, ...props }: SkeletonProps) => {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton-dark rounded-2xl', className)}
      {...props}
    />
  );
};

/** Esqueleto pronto no formato de um EventCard (imagem + bloco de informações). */
export const EventCardSkeleton = () => (
  <div className="glass border border-glassBorder rounded-3xl overflow-hidden shadow-glass-shadow">
    <Skeleton className="h-44 rounded-none" />
    <div className="p-4 space-y-3 border-t border-glassBorder">
      <Skeleton className="h-5 w-3/4 rounded-lg" />
      <Skeleton className="h-4 w-1/2 rounded-lg" />
    </div>
  </div>
);
