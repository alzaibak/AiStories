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
  api: { get: mocks.get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

import { AccountPage } from '@/pages/stories/StoryPlatform';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderAccount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={['/ar/account']}>
        <Routes>
          <Route path="/:locale/account" element={<AccountPage />} />
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

describe('account continue reading', () => {
  it('links each progress card to the next unread part', async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path === '/reading-progress') {
        return Promise.resolve([{
          id: 1,
          storyId: 7,
          completedParts: [11, 12],
          nextPart: { id: 13, partNumber: 3 },
          story: { title: 'حكاية اختبار', slug: 'sample-story' }
        }]);
      }
      if (path.startsWith('/teams/me')) return Promise.resolve(null);
      return Promise.resolve([]);
    });

    await renderAccount();

    const continueLink = container?.querySelector<HTMLAnchorElement>('a[href="/ar/stories/sample-story/read/3"]');
    expect(continueLink).toBeTruthy();
    expect(continueLink?.textContent).toContain('حكاية اختبار');
    expect(continueLink?.textContent).toContain('التالي 3');
  });
});
