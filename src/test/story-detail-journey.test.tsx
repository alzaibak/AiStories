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

/** The server sends the reading-order status of every part; the page only renders it. */
function storyWithStatuses(
  statuses: Array<'completed' | 'current' | 'available' | 'locked_sequence' | 'locked_subscription' | 'login_required' | 'coming_soon'>,
  progress: { completedCount: number; currentPartNumber: number | null; finished: boolean; newPartAvailable?: boolean },
  partsOverride?: Array<{ partNumber: number; title: string }>
) {
  return {
    id: 7,
    collectionId: 2,
    title: 'حكاية اختبار',
    slug: 'sample-story',
    summary: 'ملخص الحكاية',
    cover: null,
    type: 'history',
    sourceBadge: 'historical_source',
    isFree: true,
    parts: statuses.map((status, index) => ({
      id: 11 + index,
      partNumber: index + 1,
      title: partsOverride?.[index]?.title || ['الجزء الأول', 'الجزء الثاني', 'الجزء الثالث', 'الجزء الرابع'][index],
      estimatedReadingMinutes: 3 + index,
      status
    })),
    progress: {
      completedParts: [],
      totalParts: statuses.filter((status) => status !== 'coming_soon').length,
      ...progress
    }
  };
}

const story = storyWithStatuses(
  ['current', 'locked_sequence', 'locked_sequence', 'locked_sequence'],
  { completedCount: 0, currentPartNumber: 1, finished: false }
);

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
      if (path === '/stories/sample-story') {
        return Promise.resolve(storyWithStatuses(
          ['completed', 'current', 'locked_sequence', 'locked_sequence'],
          { completedCount: 1, currentPartNumber: 2, finished: false }
        ));
      }
      if (path === '/reading-progress') {
        return Promise.resolve([
          { id: 1, storyId: 7, completedParts: [11], lastPartId: 11 }
        ]);
      }
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    await renderStoryDetail();

    expect(actionLink('تابع القراءة', '/ar/stories/sample-story/read/2')).toBeTruthy();
    expect(actionLink('تابع القراءة', '/ar/stories/sample-story/read/1')).toBeFalsy();
    expect(container?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
    // Locked by order: a disabled action naming the part to finish first.
    const lockedButton = Array.from(container?.querySelectorAll('button') || []).find((button) => button.textContent?.includes('أكمل الجزء'));
    expect(lockedButton?.disabled).toBe(true);
  });

  it('shows a completed state and next steps instead of a next-step card at 100%', async () => {
    mocks.auth.user = { id: 5, email: 'reader@example.com' };
    mocks.get.mockImplementation((path: string) => {
      if (path === '/stories/sample-story') {
        return Promise.resolve(storyWithStatuses(
          ['completed', 'completed', 'completed', 'completed'],
          { completedCount: 4, currentPartNumber: null, finished: true }
        ));
      }
      if (path === '/reading-progress') {
        return Promise.resolve([{ id: 1, storyId: 7, completedParts: [11, 12, 13, 14], lastPartId: 14, finished: true }]);
      }
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    await renderStoryDetail();

    expect(actionLink('تابع القراءة', '/ar/stories/sample-story/read/1')).toBeFalsy();
    expect(actionLink('أعد القراءة', '/ar/stories/sample-story/read/4#quiz')).toBeTruthy();
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

  it('shows the coming-soon episode instead of "finished" when a placeholder remains', async () => {
    mocks.auth.user = { id: 5, email: 'reader@example.com' };
    const withUpcoming = {
      ...storyWithStatuses(
        ['completed', 'coming_soon'],
        { completedCount: 1, currentPartNumber: null, finished: true }
      ),
      upcomingPart: { id: 99, partNumber: 2, title: 'الحلقة القادمة', expectedAt: '2027-01-15T00:00:00.000Z', teaser: 'قريبًا جدًا' }
    };
    mocks.get.mockImplementation((path: string) => {
      if (path === '/stories/sample-story') return Promise.resolve(withUpcoming);
      if (path === '/reading-progress') {
        return Promise.resolve([{ id: 1, storyId: 7, completedParts: [11], lastPartId: 11, finished: true }]);
      }
      return Promise.reject(new Error(`Unexpected API path: ${path}`));
    });

    await renderStoryDetail();

    expect(container?.textContent).toContain('الحلقة القادمة قريبًا');
    expect(container?.textContent).toContain('2027');
    expect(actionLink('أعد القراءة', '/ar/stories/sample-story/read/1#quiz')).toBeFalsy();
    expect(container?.textContent).not.toContain('مكتملة');
  });
});
