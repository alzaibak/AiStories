import { describe, expect, it } from 'vitest';
import { localizeAuthError } from '@/lib/authErrors';
import { ApiError } from '@/lib/api';

describe('messages d’authentification localisés', () => {
  it.each([
    ['fr', 'Cette adresse e-mail est déjà associée à un compte.'],
    ['en', 'This email address is already linked to an account.'],
    ['ar', 'عنوان البريد هذا مرتبط بحساب بالفعل.']
  ] as const)('traduit le conflit d’adresse en %s', (language, expected) => {
    expect(localizeAuthError(
      new Error('Cette adresse e-mail est déjà utilisée.'),
      language
    )).toContain(expected);
  });

  it.each([
    ['fr', 'Les deux mots de passe ne correspondent pas.'],
    ['en', 'The passwords do not match.'],
    ['ar', 'كلمتا المرور غير متطابقتين.']
  ] as const)('traduit les erreurs de formulaire en %s', (language, expected) => {
    expect(localizeAuthError(new Error('The passwords do not match.'), language)).toBe(expected);
  });

  it.each([
    ['fr', 'L’envoi des e-mails est temporairement indisponible.'],
    ['en', 'Email delivery is temporarily unavailable.'],
    ['ar', 'إرسال البريد الإلكتروني غير متاح مؤقتاً.']
  ] as const)('traduit l’indisponibilité du service e-mail en %s', (language, expected) => {
    expect(localizeAuthError(
      new ApiError('Une erreur serveur est survenue.', 'EMAIL_SERVICE_UNAVAILABLE'),
      language
    )).toContain(expected);
  });
});
