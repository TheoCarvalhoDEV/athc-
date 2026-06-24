import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Feed } from './Feed';
import { storage } from '../lib/storage';
import type { User, EventItem } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';

// Mock GSAP
vi.mock('gsap', () => ({
  default: {
    context: vi.fn((fn) => {
      fn();
      return { revert: vi.fn() };
    }),
    from: vi.fn(),
  },
}));

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

// Mock AuthContext useAuth
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock storage
vi.mock('../lib/storage', () => ({
  storage: {
    getPaginatedEvents: vi.fn(),
  },
}));

describe('Feed Page', () => {
  const mockUser: User = {
    id: 'user-123',
    name: 'Test User',
    username: 'test@example.com',
    role: 'user',
  };

  const mockEvents: EventItem[] = [
    {
      id: 'event-1',
      title: 'Festival de Música',
      date: '2026-07-20',
      time: '18:00',
      location: 'Parque Central',
      address: 'Av. das Nações, 100',
      mediaUrls: [],
      publicType: 'Geral',
      description: 'Um ótimo festival.',
      creatorId: 'creator-1',
      registrationCount: 5,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      isLoading: false,
      logout: vi.fn(),
      updateUser: vi.fn(),
    });
    vi.mocked(storage.getPaginatedEvents).mockResolvedValue({
      events: mockEvents,
      lastDoc: null,
    });
  });

  it('renders feed and loads events', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <Feed />
        </MemoryRouter>
      );
    });

    expect(screen.getAllByText('Festival de Música')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Parque Central')[0]).toBeInTheDocument();
  });
});
