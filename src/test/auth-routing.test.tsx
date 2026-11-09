import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/StoryAuthContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/contexts/StoryAuthContext')>();
  return {
    ...original,
    StoryAuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>
  };
});

vi.mock('@/pages/stories/StoryPlatform', () => ({
  LandingPage: () => <div>home-view</div>,
  StoriesPage: () => <div>stories-view</div>,
  StoryDetailPage: () => <div>story-view</div>,
  ReaderPage: () => <div>reader-view</div>,
  BooksPage: () => <div>books-view</div>,
  BookDetailPage: () => <div>book-view</div>,
  ReaderAuthPage: ({ mode }: { mode: string }) => <div>auth-{mode}</div>,
  AdminLoginPage: () => <div>admin-login-view</div>,
  AdminStoreOrdersPage: () => <div>admin-orders-view</div>,
  AdminSubscriptionsPage: () => <div>admin-subscriptions-view</div>,
  AccountPage: () => <div>account-view</div>,
  MembershipPage: () => <div>membership-view</div>,
  CheckoutResultPage: () => <div>checkout-result-view</div>,
  PolicyPage: ({ kind }: { kind: string }) => <div>policy-{kind}</div>
}));
vi.mock('@/pages/NotFound', () => ({ default: () => <div>not-found-view</div> }));

import App from '@/App';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderAt(path: string) {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  window.history.replaceState({}, '', path);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<App />));
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  window.history.replaceState({}, '', '/');
});

describe('routes de la plateforme de récits', () => {
  it('monte la page d’accueil et les pages de découverte', async () => {
    await renderAt('/ar');
    expect(container?.textContent).toContain('home-view');
    await renderAt('/fr/stories');
    expect(container?.textContent).toContain('stories-view');
    await renderAt('/en/stories/histoire-exemple');
    expect(container?.textContent).toContain('story-view');
    await renderAt('/ar/stories/histoire-exemple/read/1');
    expect(container?.textContent).toContain('reader-view');
  });

  it('monte la boutique et ses fiches livres', async () => {
    await renderAt('/fr/books');
    expect(container?.textContent).toContain('books-view');
    await renderAt('/en/books/livre-exemple');
    expect(container?.textContent).toContain('book-view');
  });

  it('monte les formulaires lecteur, le compte et les politiques', async () => {
    await renderAt('/ar/login');
    expect(container?.textContent).toContain('auth-login');
    await renderAt('/fr/register');
    expect(container?.textContent).toContain('auth-register');
    await renderAt('/en/account');
    expect(container?.textContent).toContain('account-view');
    await renderAt('/ar/membership');
    expect(container?.textContent).toContain('membership-view');
    await renderAt('/fr/policy/sources');
    expect(container?.textContent).toContain('policy-sources');
    await renderAt('/en/policy/depiction');
    expect(container?.textContent).toContain('policy-depiction');
  });

  it('redirige l’ancien espace vers le compte et affiche une page introuvable autrement', async () => {
    await renderAt('/workspace');
    expect(window.location.pathname).toBe('/ar/account');
    expect(container?.textContent).toContain('account-view');
    await renderAt('/ar/route-inconnue');
    expect(container?.textContent).toContain('not-found-view');
  });
});
