import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  value: {
    user: null as null | { role: 'BUYER' | 'SELLER' | 'ADMIN' | 'SUPER_ADMIN' },
    isLoading: false
  }
}));
type TestRole = 'BUYER' | 'SELLER' | 'ADMIN' | 'SUPER_ADMIN';

vi.mock('@/contexts/TenderAuthContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/contexts/TenderAuthContext')>();
  return {
    ...original,
    TenderAuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    useTenderAuth: () => authState.value
  };
});

vi.mock('@/pages/tendering/WorkspacePage', () => ({
  default: () => <div>workspace-view</div>
}));
vi.mock('@/pages/tendering/AuthPage', () => ({
  default: ({ mode, role }: { mode: string; role?: string }) => <div>auth-{mode}-{role || 'none'}</div>
}));
vi.mock('@/pages/tendering/LandingPage', () => ({
  default: () => <div>landing-view</div>
}));
vi.mock('@/pages/NotFound', () => ({
  default: () => <div>not-found-view</div>,
  StatusPage: () => <div>status-view</div>
}));

import App from '@/App';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function renderAt(path: string, role: TestRole | null) {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  window.history.replaceState({}, '', path);
  authState.value = { user: role ? { role } : null, isLoading: false };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  window.history.replaceState({}, '', '/');
});

describe('redirection et cloisonnement des espaces', () => {
  it('redirige un vendeur qui ouvre une route acheteur vers son tableau de bord', async () => {
    await renderAt('/buyer/dashboard', 'SELLER');
    expect(window.location.pathname).toBe('/seller/dashboard');
    expect(container?.textContent).toContain('workspace-view');
  });

  it('redirige un acheteur qui ouvre une route vendeur vers son tableau de bord', async () => {
    await renderAt('/seller/dashboard', 'BUYER');
    expect(window.location.pathname).toBe('/buyer/dashboard');
    expect(container?.textContent).toContain('workspace-view');
  });

  it('envoie chaque rôle vers son tableau de bord après ouverture de /workspace', async () => {
    await renderAt('/workspace', 'SELLER');
    expect(window.location.pathname).toBe('/seller/dashboard');
    expect(container?.textContent).toContain('workspace-view');
  });

  it('envoie également un acheteur vers son propre tableau de bord', async () => {
    await renderAt('/workspace', 'BUYER');
    expect(window.location.pathname).toBe('/buyer/dashboard');
    expect(container?.textContent).toContain('workspace-view');
  });

  it('redirige un visiteur non connecté vers la connexion depuis une route protégée', async () => {
    await renderAt('/buyer/dashboard', null);
    expect(window.location.pathname).toBe('/login');
    expect(container?.textContent).toContain('auth-login');
  });

  it('redirige les anciennes routes de connexion vers /login', async () => {
    await renderAt('/seller/login', null);
    expect(window.location.pathname).toBe('/login');
    expect(container?.textContent).toContain('auth-login');
  });

  it('redirige une ancienne route d’inscription acheteur vers la nouvelle page', async () => {
    await renderAt('/buyer/register', null);
    expect(window.location.pathname).toBe('/register/buyer');
    expect(container?.textContent).toContain('auth-register-BUYER');
  });

  it('redirige aussi une ancienne route d’inscription vendeur', async () => {
    await renderAt('/seller/register', null);
    expect(window.location.pathname).toBe('/register/seller');
    expect(container?.textContent).toContain('auth-register-SELLER');
  });

  it('monte séparément les formulaires d’inscription acheteur et vendeur', async () => {
    await renderAt('/register/buyer', null);
    expect(container?.textContent).toContain('auth-register-BUYER');
    await renderAt('/register/seller', null);
    expect(container?.textContent).toContain('auth-register-SELLER');
  });

  it('permet au rôle correspondant d’ouvrir son espace vendeur ou acheteur', async () => {
    await renderAt('/buyer/dashboard', 'BUYER');
    expect(container?.textContent).toContain('workspace-view');
    await renderAt('/seller/dashboard', 'SELLER');
    expect(container?.textContent).toContain('workspace-view');
  });

  it('redirige un utilisateur client hors de l’espace administrateur', async () => {
    await renderAt('/admin/dashboard', 'SELLER');
    expect(window.location.pathname).toBe('/seller/dashboard');
    expect(container?.textContent).toContain('workspace-view');
  });

  it('redirige ADMIN vers son espace s’il ouvre les invitations réservées au SUPER_ADMIN', async () => {
    await renderAt('/admin/invitations', 'ADMIN');
    expect(window.location.pathname).toBe('/admin/dashboard');
    expect(container?.textContent).toContain('workspace-view');
  });

  it('réserve l’écran d’invitations au SUPER_ADMIN', async () => {
    await renderAt('/admin/invitations', 'SUPER_ADMIN');
    expect(container?.textContent).toContain('auth-admin-invite');
  });

  it('monte l’écran de connexion administrateur dédié', async () => {
    await renderAt('/admin/login', null);
    expect(container?.textContent).toContain('auth-admin-login-none');
  });

  it('monte l’accueil, la page 403 et la page introuvable', async () => {
    await renderAt('/', null);
    expect(container?.textContent).toContain('landing-view');
    await renderAt('/403', null);
    expect(container?.textContent).toContain('status-view');
    await renderAt('/route-inconnue', null);
    expect(container?.textContent).toContain('not-found-view');
  });
});
