import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    user: null,
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
  api: { get: mocks.get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

import { LandingPage } from '@/pages/stories/StoryPlatform';

const activeBox = {
  slug: 'ramadan-family-box',
  label: 'صندوق الغموض العائلي: رحلة عبر قصص الأنبياء والصحابة والمحطات التاريخية',
  seasonLabel: 'موسم رمضان',
  icon: '🎁',
  colorFrom: '#123b2e',
  colorTo: '#8b6b36',
  accentColor: '#f3e3b8',
  animationStyle: 'none',
  showCountdownInHeader: true,
  startsAt: new Date(Date.now() - 60_000).toISOString(),
  endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  serverTime: new Date().toISOString(),
  remaining: 7,
  almostSoldOut: true,
  price: { amount: '149', currency: 'SAR', tier: 'early_bird' },
  itemCount: 6
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderHome() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={['/ar']}>
        <Routes>
          <Route path="/:locale" element={<LandingPage />} />
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

describe('home active mystery-box hero', () => {
  it('renders the active box states as a static RTL card', async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/mystery-box/active')) return Promise.resolve({ box: activeBox });
      if (path === '/stories?limit=4') return Promise.resolve([]);
      if (path === '/books?limit=3') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await renderHome();

    const text = container?.textContent || '';
    expect(document.documentElement.dir).toBe('rtl');
    expect(text).toContain(activeBox.label);
    expect(text).toContain('سعر مبكر');
    expect(text).toContain('بقي 7');
    expect(text).toContain('اقترب النفاد');
    expect(text).toContain('ينتهي خلال');
    expect(text).toContain('يوم');
    expect(text).toContain('ساعة');
    expect(text).toContain('دقيقة');
    expect(text).toContain('ثانية');
    // The card announces the next step of the existing checkout, and the old
    // hard-coded "Soon" label must never come back while the box is live.
    const buyButton = Array.from(container?.querySelectorAll('button') || []).find((button) => button.textContent?.includes('متابعة الشراء'));
    expect(buyButton).toBeTruthy();
    expect(buyButton?.textContent).not.toContain('قريبًا');
    expect(text).toContain('متاح الآن');
    expect(container?.querySelector('a[href*="/mystery-box/ramadan-family-box"]')).not.toBeNull();
  });
});
