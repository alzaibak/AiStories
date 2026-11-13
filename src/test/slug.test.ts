import { describe, expect, it } from 'vitest';
import { slugFromTitle } from '@/lib/slug';

describe('Arabic slug transliteration', () => {
  it('transliterates all core Arabic letters and common Persian variants', () => {
    expect(slugFromTitle('ء ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ى ي ة'))
      .toBe('a-b-t-th-j-h-kh-d-dh-r-z-s-sh-s-d-t-z-a-gh-f-q-k-l-m-n-h-w-a-y-h');
    expect(slugFromTitle('پ چ ژ گ ک ی ڤ ە')).toBe('p-ch-zh-g-k-y-v-h');
    expect(slugFromTitle('قصص الأنبياء')).toBe('qss-alanbya');
  });
});
