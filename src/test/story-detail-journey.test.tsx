import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as { id: number; email: string } | null,
    isLoading: false,
    logout: vi.fn()
  },
  get: vi.fn()
}));

vi.mock('@/contexts/StoryAuthContext', () => ({
  useStoryAuth: () => mocks.auth
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: mocks.get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { StoryDetailPage } from '@/pages/stories/StoryPlatform';

const story = {
  id: 7,
  collectionId: 2,
  title: 'حكاية اختبار',
  slug: 'sample-story',
  summary: 'ملخص الحكاية',
  cover: null,
  type: 'history',
  sourceBadge: 'historical_source',
  isFree: true,
  parts: [
    { id: 11, partNumber: 1, title: 'الجزء الأول', estimatedReadingMinutes: 3, accessible: true },
    { id: 12, partNumber: 2, title: 'الجزء الثاني', estimatedReadingMinutes: 4, accessible: false },
    { id: 13, partNumber: 3, title: 'الجزء الثالث', estimatedReadingMinutes: 5, accessible: true },
    { id: 14, partNumber: 4, title: 'الجزء الرابع', estimatedReadingMinutes: 6, accessible: true }
  ]
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderStoryDetail() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={['/ar/stories/sample-story']}>
        <Routes>
          <Route path="/:locale/stories/:slug" element={<StoryDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function actionLink(label: string, href: string) {
  return Array.from(container?.querySelectorAll('a') || []).find(
    (link) => link.getAttribute('href') === href && link.textContent?.includes(label)
  );
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  mocks.auth.user = null;
  vi.clearAllMocks();
});

describe('story detail journey action', () => {
  it('continues with the next readable part when earlier parts are completed', async () => {
    mocks.auth.user = { id: 5, email: 'reader@example.com' };
    mocks.get.mockImplementation((path: string) => {
      if (path === '/stories/sample-story') return Promise.resolve(story);
      if (path === '/reading-progress') {
        return Promise.resolve([
          { storyId: 7, completedParts: [11], lastPartId: 11 }
        ]);
      }
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    await renderStoryDetail();

    expect(actionLink('تابع القراءة', '/ar/stories/sample-story/read/3')).toBeTruthy();
    expect(actionLink('تابع القراءة', '/ar/stories/sample-story/read/1')).toBeFalsy();
    expect(container?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
  });

  it('shows a completed state and next steps instead of a next-step card at 100%', async () => {
    mocks.auth.user = { id: 5, email: 'reader@example.com' };
    mocks.get.mockImplementation((path: string) => {
      if (path === '/stories/sample-story') return Promise.resolve(story);
      if (path === '/reading-progress') {
        return Promise.resolve([{ storyId: 7, completedParts: [11, 12, 13, 14], lastPartId: 14 }]);
      }
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    await renderStoryDetail();

    expect(actionLink('تابع القراءة', '/ar/stories/sample-story/read/1')).toBeFalsy();
    expect(actionLink('اختبر فهمك', '/ar/stories/sample-story/read/4#quiz')).toBeTruthy();
    expect(container?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(container?.textContent).toContain('مكتملة');
  });

  it('starts at the first readable part for a guest without reading progress', async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path === '/stories/sample-story') return Promise.resolve(story);
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    await renderStoryDetail();

    expect(actionLink('ابدأ القراءة', '/ar/stories/sample-story/read/1')).toBeTruthy();
    expect(actionLink('ابدأ القراءة', '/ar/stories/sample-story/read/3')).toBeFalsy();
    expect(mocks.get).not.toHaveBeenCalledWith('/reading-progress');
    expect(container?.querySelector('[role="progressbar"]')).toBeNull();
  });
});
