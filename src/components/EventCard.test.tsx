import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { EventCard } from './EventCard';
import type { EventItem } from '../lib/storage';

// Mock useNavigate do react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

const mockEvent: EventItem = {
  id: 'event-123',
  title: 'Show Sertanejo',
  date: '2026-12-25',
  time: '22:00',
  location: 'Clube Aliança',
  address: 'Rua das Flores, 123',
  mediaUrls: ['https://mockurl.com/event.jpg'],
  publicType: 'Geral',
  description: 'Um grande show sertanejo na região.',
  creatorId: 'creator-999',
};

describe('EventCard component', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    // Mock do window.open
    vi.stubGlobal('open', vi.fn());
  });

  it('renders event basic details in default variant', () => {
    render(
      <MemoryRouter>
        <EventCard event={mockEvent} />
      </MemoryRouter>
    );

    expect(screen.getByText('Show Sertanejo')).toBeInTheDocument();
    expect(screen.getByText('25/12/2026 22:00')).toBeInTheDocument();
    expect(screen.getByText('Clube Aliança')).toBeInTheDocument();
  });

  it('navigates to event details when image section is clicked', async () => {
    render(
      <MemoryRouter>
        <EventCard event={mockEvent} />
      </MemoryRouter>
    );

    const imageSection = screen.getByAltText('Show Sertanejo');
    await userEvent.click(imageSection);

    expect(mockNavigate).toHaveBeenCalledWith('/event/event-123');
  });

  it('opens Google Maps when clicking on location', async () => {
    render(
      <MemoryRouter>
        <EventCard event={mockEvent} />
      </MemoryRouter>
    );

    const locationButton = screen.getByRole('button', { name: /clube aliança/i });
    await userEvent.click(locationButton);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('google.com/maps/dir'),
      '_blank'
    );
  });

  it('renders highlight variant correctly', () => {
    render(
      <MemoryRouter>
        <EventCard event={mockEvent} variant="highlight" />
      </MemoryRouter>
    );

    expect(screen.getByText('Show Sertanejo')).toBeInTheDocument();
    // No highlight, a data/hora e o local aparecem juntos formatados
    expect(screen.getByText('25/12/2026 22:00')).toBeInTheDocument();
    expect(screen.getByText('Clube Aliança')).toBeInTheDocument();
  });
});
