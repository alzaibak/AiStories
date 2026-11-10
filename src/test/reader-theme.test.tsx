import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: null, isLoading: false, logout: vi.fn() },
  get: vi.fn()
}));

vi.mock('@/contexts/StoryAuthContext', () => ({
  useStoryAuth: () => mocks.auth
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: mocks.get, post: vi.fn(), put: vi.fn() }
}));

import { ReaderPage } from '@/pages/stories/StoryPlatform';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  localStorage.removeItem('reader-theme');
  vi.clearAllMocks();
});

describe('reader appearance preference', () => {
  it('restores the saved dark mode and persists a user toggle', async () => {
    localStorage.setItem('reader-theme', 'dark');
    mocks.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith('/parts/1')
        ? { id: 8, partNumber: 1, title: 'Sample part', content: 'Reading text', estimatedReadingMinutes: 2 }
        : { id: 3, slug: 'sample-story', title: 'Sample story', parts: [{ id: 8, partNumber: 1 }] }
    ));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={['/en/stories/sample-story/read/1']}>
          <Routes>
            <Route path="/:locale/stories/:slug/read/:partNumber" element={<ReaderPage />} />
          </Routes>
        </MemoryRouter>
      );
      await Promise.resolve();
    });

    const main = container.querySelector('main');
    const themeButton = container.querySelector<HTMLButtonElement>('button[aria-pressed]');
    expect(main?.getAttribute('data-reading-theme')).toBe('dark');
    expect(themeButton?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => themeButton?.click());
    expect(main?.getAttribute('data-reading-theme')).toBe('light');
    expect(localStorage.getItem('reader-theme')).toBe('light');
  });
});
