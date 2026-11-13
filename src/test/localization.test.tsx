import { describe, expect, it } from 'vitest';
import { translateText, translateTree } from '@/lib/localization';

describe('traduction de l’interface', () => {
  it('traduit les libellés de base dans les deux langues non arabes', () => {
    expect(translateText('القصص', 'en')).toBe('Stories');
    expect(translateText('القصص', 'fr')).toBe('Histoires');
    expect(translateText('القصص', 'ar')).toBe('القصص');
    expect(translateText('كلمة المرور الجديدة', 'en')).toBe('New password');
    expect(translateText('كلمة المرور الجديدة', 'fr')).toBe('Nouveau mot de passe');
    expect(translateText('تنزيل الكتاب الإلكتروني', 'en')).toBe('Download e-book');
    expect(translateText('تنزيل الكتاب الإلكتروني', 'fr')).toBe('Télécharger l’ebook');
    expect(translateText('الأسعار والباقات', 'en')).toBe('Pricing and plans');
    expect(translateText('الأسعار والباقات', 'fr')).toBe('Tarifs et offres');
    expect(translateText('الوضع الداكن', 'en')).toBe('Dark reading mode');
    expect(translateText('الوضع الداكن', 'fr')).toBe('Mode de lecture sombre');
  });

  it('traduit les contenus textuels et les libellés accessibles', () => {
    const translated = translateTree(
      <button aria-label="فتح القائمة">المتجر</button>,
      'en'
    );
    expect(translated).toMatchObject({
      props: {
        'aria-label': 'Open menu',
        children: 'Books'
      }
    });
  });

  it('traduit les nouvelles commandes promotionnelles et les dons mensuels', () => {
    expect(translateText('رموز الخصم والهدايا', 'en')).toBe('Discount and gift codes');
    expect(translateText('رموز الخصم والهدايا', 'fr')).toBe('Codes de réduction et cadeaux');
    expect(translateText('اجعل التبرع شهريًا متكررًا', 'en')).toBe('Make this a monthly recurring donation');
    expect(translateText('اجعل التبرع شهريًا متكررًا', 'fr')).toBe('Faire un don mensuel récurrent');
    expect(translateText('تفضيلات البريد الإلكتروني', 'en')).toBe('Email preferences');
    expect(translateText('تفضيلات البريد الإلكتروني', 'fr')).toBe('Préférences e-mail');
    expect(translateText('تحديث النموذج', 'en')).toBe('Update template');
  });
});
