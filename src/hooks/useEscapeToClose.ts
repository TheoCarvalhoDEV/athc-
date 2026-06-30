import { useEffect } from 'react';

// Fecha um modal/overlay ao pressionar Escape, enquanto `active` for true.
// Acessibilidade: diálogos devem ser dispensáveis pelo teclado (WCAG 2.1.2 / padrão de dialog).
export function useEscapeToClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, onClose]);
}
