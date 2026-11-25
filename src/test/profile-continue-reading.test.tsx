import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      id: 5,
      email: 'reader@example.com',
      firstName: 'Sam',
      lastName: 'Reader',
      role: 'READER',
      subscriptions: []
    },
    isLoading: false,
    logout: vi.fn(),
    refreshUser: vi.fn(),
    error: null
  },
  get: vi.fn()
}));

vi.mock('@/contexts/StoryAuthContext', () => ({
  useStoryAuth: () => mocks.auth
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: {
    get: mocks.get,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getBlob: vi.fn()
  }
}));

import ProfilePage from '@/pages/stories/ProfilePage';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

const summary = {
  user: {
    id: 5,
    firstName: 'Sam',
    lastName: 'Reader',
    email: 'reader@example.com',
    language: 'ar',
    avatarUrl: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    points: 120
  },
  plan: { name: 'Free', status: 'free', expiresAt: null, cancelAtPeriodEnd: false },
  level: { level: 2, name: 'قارئ', points: 120, nextLevel: { level: 3, points: 150 }, pointsToNext: 30, progressPercent: 40 },
  stats: { storiesCompleted: 3, quizPoints: 200, currentStreak: 5, badgesEarned: 3, badgesTotal: 13, partsRead: 12, quizzesCompleted: 2, certificates: 0 },
  streak: { current: 5, best: 7, week: [{ date: '2026-01-01', status: 'done' }] },
  continueReading: {
    storyId: 7,
    slug: 'sample-story',
    title: 'حكاية اختبار',
    coverImageUrl: null,
    completedParts: 2,
    totalParts: 3,
    progressPercent: 66,
    nextPartNumber: 3,
    nextPartTitle: null,
    lastReadAt: '2026-01-01T10:00:00.000Z'
  },
  featuredBadges: [],
  nextBadges: [],
  recentAchievements: [],
  certificates: { earned: 0, inProgress: 0 },
  badges: []
};

async function renderProfile() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={['/ar/account']}>
        <Routes>
          <Route path="/:locale/account" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe('profile continue reading', () => {
  it('links the continue-reading card to the next unread part', async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path === '/me/profile-summary') return Promise.resolve(summary);
      return Promise.resolve([]);
    });

    await renderProfile();

    const continueLink = container?.querySelector<HTMLAnchorElement>('a[href="/ar/stories/sample-story/read/3"]');
    expect(continueLink).toBeTruthy();
    expect(container?.textContent).toContain('حكاية اختبار');
  });
});
