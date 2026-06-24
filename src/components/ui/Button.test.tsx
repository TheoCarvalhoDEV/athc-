import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button component', () => {
  it('renders children correctly', () => {
    render(<Button>Clique Aqui</Button>);
    expect(screen.getByRole('button', { name: /clique aqui/i })).toBeInTheDocument();
  });

  it('applies correct class for primary variant by default', () => {
    render(<Button>Enviar</Button>);
    const button = screen.getByRole('button', { name: /enviar/i });
    expect(button).toHaveClass('bg-primary');
  });

  it('applies correct class for outline variant', () => {
    render(<Button variant="outline">Voltar</Button>);
    const button = screen.getByRole('button', { name: /voltar/i });
    expect(button).toHaveClass('text-accent');
    expect(button).toHaveClass('border-accent/30');
  });

  it('triggers onClick handler when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Clique</Button>);
    const button = screen.getByRole('button', { name: /clique/i });
    
    await userEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not trigger onClick when disabled', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} disabled>Clique</Button>);
    const button = screen.getByRole('button', { name: /clique/i });
    
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
