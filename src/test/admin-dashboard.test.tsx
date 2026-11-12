import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    fields?: Record<string, string>;
    existingPart?: { id: number; partNumber: number };
  }
  return { api: apiMock, ApiError };
});

vi.mock('@/contexts/StoryAuthContext', () => ({
  useStoryAuth: () => ({
    user: {
      id: 1,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.test',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: null,
      language: 'en'
    },
    isLoading: false,
    logout: vi.fn()
  })
}));

import AdminLayout from '@/pages/stories/AdminLayout';
import { AdminStoriesPage } from '@/pages/stories/AdminDashboardPages';
import AdminContentPage from '@/pages/stories/AdminContentPage';

const stories = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  title: index === 0 ? 'Published example' : `Draft story ${index + 1}`,
  slug: `story-${index + 1}`,
  status: index === 0 ? 'published' : 'draft',
  parts: [],
  collection: { title: 'Test collection' }
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderAt(path: string) {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:locale/admin" element={<AdminLayout />}>
            <Route path="content/stories" element={<AdminStoriesPage />} />
            <Route path="content/stories/new" element={<AdminContentPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  apiMock.get.mockImplementation((path: string) => {
    if (path === '/admin/content/stories') return Promise.resolve(stories);
    return Promise.resolve([]);
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe('admin dashboard layout', () => {
  it('renders the localized RTL shell and filters story rows', async () => {
    await renderAt('/ar/admin/content/stories');
    expect(container?.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(container?.querySelector('[aria-label="التنقل الإداري"]')).toBeTruthy();
    expect(container?.textContent).toContain('القصص');
    expect(container?.textContent).toContain('Published example');
    expect(container?.textContent).not.toContain('Draft story 12');

    const nextPage = Array.from(container?.querySelectorAll('button') || []).find((button) => button.textContent?.includes('التالي'));
    expect(nextPage).toBeTruthy();
    await act(async () => Simulate.click(nextPage!));
    expect(container?.textContent).toContain('Draft story 12');

    const search = container?.querySelector<HTMLInputElement>('input[aria-label="البحث عن القصص"]');
    expect(search).toBeTruthy();
    await act(async () => {
      search!.value = 'Published example';
      Simulate.change(search!);
    });
    expect(container?.textContent).toContain('Published example');
    expect(container?.textContent).not.toContain('Draft story 12');
  });

  it('uses the LTR layout for English and exposes collapsible navigation', async () => {
    await renderAt('/en/admin/content/stories');
    expect(container?.querySelector('[dir="ltr"]')).toBeTruthy();
    expect(container?.querySelector('[aria-label="Admin navigation"]')).toBeTruthy();
    expect(container?.querySelector('button[aria-label="Collapse sidebar"]')).toBeTruthy();
  });

  it('uses optional English tabs and suggests a slug from the entered title', async () => {
    await renderAt('/ar/admin/content/stories/new');
    const arabicTitle = container?.querySelector<HTMLInputElement>('[role="tabpanel"] input');
    expect(arabicTitle?.required).toBe(true);
    await act(async () => {
      arabicTitle!.value = 'قصة النبي';
      Simulate.change(arabicTitle!);
    });
    const englishTab = Array.from(container?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || [])
      .find((button) => button.textContent?.includes('English'));
    expect(englishTab).toBeTruthy();
    await act(async () => Simulate.click(englishTab!));

    const englishTitle = container?.querySelector<HTMLInputElement>('[role="tabpanel"] input');
    expect(englishTitle?.required).toBe(false);
    await act(async () => {
      englishTitle!.value = 'The Prophet Story';
      Simulate.change(englishTitle!);
    });
    expect(container?.querySelector<HTMLInputElement>('input[pattern]')?.value).toBe('the-prophet-story');

    const previewButton = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') || [])
      .find((button) => button.textContent?.includes('معاينة'));
    await act(async () => Simulate.click(previewButton!));
    expect(container?.textContent).toContain('قصة النبي');
  });
});
