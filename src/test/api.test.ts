import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/lib/api';

describe('erreurs API', () => {
  afterEach(() => {
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
});
