import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/lib/tenderApi';

describe('erreurs API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('explique clairement qu’un e-mail existe déjà et indique quoi faire', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Cette adresse e-mail est déjà utilisée.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    )));

    await expect(request('/buyer/auth/register/request-code', {
      method: 'POST',
      body: JSON.stringify({ email: 'existing@example.test' })
    })).rejects.toThrow(
      'Cette adresse e-mail est déjà associée à un compte. Connectez-vous si vous avez déjà un compte, ou utilisez une autre adresse.'
    );
  });
});
