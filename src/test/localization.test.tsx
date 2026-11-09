import { describe, expect, it } from 'vitest';
import { translateText, translateTree } from '@/lib/localization';

describe('traduction de l’interface', () => {
  it('traduit les libellés de base dans les deux langues non arabes', () => {
    expect(translateText('القصص', 'en')).toBe('Stories');
    expect(translateText('القصص', 'fr')).toBe('Histoires');
    expect(translateText('القصص', 'ar')).toBe('القصص');
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
});
