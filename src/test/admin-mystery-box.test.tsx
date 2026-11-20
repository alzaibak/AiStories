import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  getBlob: vi.fn()
}));

vi.mock('@/lib/api', () => {
  class ApiError extends Error {}
  return { api: apiMock, ApiError };
});

import { AdminMysteryBoxEditorPage, AdminMysteryBoxesPage } from '@/pages/stories/AdminMysteryBoxPages';

const boxes = [
  {
    id: 7,
    slug: 'ramadan-gift-box',
    title: 'صندوق رمضان',
    seasonLabel: 'رمضان 1448',
    state: 'active',
    status: 'active',
    startAt: '2027-02-01T00:00:00.000Z',
    endAt: '2027-03-01T00:00:00.000Z',
    price: '39.00',
    currency: 'EUR',
    salesCount: 12,
    revenue: '468.00',
    stockLimit: 50,
    remainingStock: 38
  },
  {
    id: 8,
    slug: 'draft-box',
    title: 'مسودة هدية',
    state: 'draft',
    status: 'draft',
    price: '25.00',
    currency: 'EUR',
    salesCount: 0,
    revenue: '0.00',
    stockLimit: null,
    remainingStock: null
  }
];

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
          <Route path="/:locale/admin/shop/mystery-boxes" element={<AdminMysteryBoxesPage />} />
          <Route path="/:locale/admin/shop/mystery-boxes/new" element={<AdminMysteryBoxEditorPage />} />
        </Routes>
      </MemoryRouter>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  apiMock.get.mockImplementation((path: string) => {
    if (path.startsWith('/admin/mystery-boxes')) return Promise.resolve({ items: boxes, total: boxes.length, page: 1, limit: 100 });
    if (path === '/admin/content/books') return Promise.resolve([{ id: 1, title: 'كتاب تجريبي', format: 'ebook' }]);
    if (path === '/admin/content/stories') return Promise.resolve([{ id: 1, title: 'قصة تجريبية' }]);
    if (path === '/admin/community/badges') return Promise.resolve([{ id: 1, name: 'شارة' }]);
    if (path.startsWith('/admin/money/donation-campaigns')) return Promise.resolve({ items: [] });
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

describe('admin mystery boxes', () => {
  it('renders the box list and filters it by search', async () => {
    await renderAt('/ar/admin/shop/mystery-boxes');
    expect(container?.textContent).toContain('صناديق الغموض');
    expect(container?.textContent).toContain('صندوق رمضان');
    expect(container?.textContent).toContain('مسودة هدية');
    expect(container?.textContent).toContain('نشط');
    expect(container?.textContent).toContain('38 / 50');

    const search = container?.querySelector<HTMLInputElement>('input[aria-label="ابحث بالاسم أو الموسم"]');
    expect(search).toBeTruthy();
    await act(async () => {
      search!.value = 'رمضان';
      Simulate.change(search!);
    });
    expect(container?.textContent).toContain('صندوق رمضان');
    expect(container?.textContent).not.toContain('مسودة هدية');

    const guideButton = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') || [])
      .find((button) => button.textContent?.includes('كيف يعمل؟'));
    expect(guideButton).toBeTruthy();
    await act(async () => Simulate.click(guideButton!));
    expect(container?.textContent).toContain('ابنِ صندوقك في ثلاث مراحل');
  });

  it('enables delivery price and country settings for a physically shipped box', async () => {
    await renderAt('/ar/admin/shop/mystery-boxes/new');

    const shippingTab = Array.from(container?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || [])
      .find((button) => button.textContent?.includes('الشحن'));
    expect(shippingTab).toBeTruthy();
    await act(async () => Simulate.click(shippingTab!));

    expect(container?.textContent).toContain('الصندوق يُشحن فعليًا');
    const toggle = Array.from(container?.querySelectorAll('label') || [])
      .find((label) => label.textContent?.includes('الصندوق يُشحن فعليًا'))
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(toggle).toBeTruthy();

    await act(async () => {
      toggle!.checked = true;
      Simulate.change(toggle!);
    });

    expect(container?.textContent).toContain('رسوم الشحن');
    expect(container?.textContent).toContain('الدول المسموح الشحن إليها');
  });

  it('renders the editor tabs and updates the live header preview', async () => {
    await renderAt('/ar/admin/shop/mystery-boxes/new');
    expect(container?.textContent).toContain('إنشاء صندوق غموض');
    expect(container?.textContent).toContain('تقدّم الإعداد');
    expect(container?.textContent).toContain('المرحلة 1');
    expect(container?.textContent).toContain('الخطوة 1 / 8');
    expect(container?.textContent).toContain('المحتويات');
    expect(container?.textContent).toContain('النشر');

    const title = container?.querySelector<HTMLInputElement>('input[required]');
    expect(title).toBeTruthy();
    await act(async () => {
      title!.value = 'صندوق اختبار';
      Simulate.change(title!);
    });

    const appearanceTab = Array.from(container?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || [])
      .find((button) => button.textContent?.includes('المظهر'));
    expect(appearanceTab).toBeTruthy();
    await act(async () => Simulate.click(appearanceTab!));

    expect(container?.textContent).toContain('معاينة حيّة');
    expect(container?.textContent).toContain('صندوق اختبار');
  });
});
