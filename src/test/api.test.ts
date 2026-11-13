import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken, getAuthToken, request, setAuthToken } from '@/lib/api';

describe('erreurs API', () => {
  afterEach(() => {
    clearAuthToken();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('explique clairement qu’un e-mail existe déjà et indique quoi faire', async () => {
    window.history.replaceState({}, '', '/fr/signup');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Cette adresse e-mail est déjà utilisée.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    )));

    await expect(request('/reader/auth/register/request-code', {
      method: 'POST',
      body: JSON.stringify({ email: 'existing@example.test' })
    })).rejects.toThrow(
      'Cette adresse e-mail est déjà associée à un compte. Connectez-vous ou utilisez une autre adresse.'
    );
    window.history.replaceState({}, '', '/');
  });

  it('envoie la langue de la route aux endpoints de lecture', async () => {
    window.history.replaceState({}, '', '/fr/stories');
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify([]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    vi.stubGlobal('fetch', fetchMock);

    await request('/stories');

    expect(fetchMock.mock.calls[0][0]).toContain('/stories?lang=fr');
    window.history.replaceState({}, '', '/');
  });

  it('efface la session et signale un jeton de session expiré', async () => {
    window.history.replaceState({}, '', '/fr/account');
    setAuthToken('expired-session-token');
    const expired = vi.fn();
    window.addEventListener('story-auth:expired', expired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Jeton invalide ou expiré.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )));

    await expect(request('/auth/me')).rejects.toThrow('Jeton invalide ou expiré.');

    expect(getAuthToken()).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener('story-auth:expired', expired);
    window.history.replaceState({}, '', '/');
  });

  it('ne déconnecte pas une session pour un jeton ponctuel de vérification', async () => {
    setAuthToken('reader-session-token');
    const expired = vi.fn();
    window.addEventListener('story-auth:expired', expired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Jeton invalide ou expiré.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )));

    await expect(request('/reader/auth/register', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { Authorization: 'Bearer verification-token' }
    }, 'verification-token')).rejects.toThrow('Jeton invalide ou expiré.');

    expect(getAuthToken()).toBe('reader-session-token');
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener('story-auth:expired', expired);
  });
});
