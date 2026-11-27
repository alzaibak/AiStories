import { describe, expect, it } from 'vitest';
import {
  blocksForApi,
  blocksInvalid,
  emptyBlock,
  plainContent,
  usableBlocks,
  type PartBlock
} from '@/components/content/PartBlocksEditor';

const image = {
  url: '/uploads/public/covers/2b1e4a60-1111-4222-8333-944455556666-1200.webp',
  thumbUrl: '/uploads/public/covers/2b1e4a60-1111-4222-8333-944455556666-600.webp',
  width: 1200,
  height: 800
};

function textBlock(ar: string, en = ''): PartBlock {
  return { type: 'text', text: { ar, en: en || '', fr: '' } };
}

describe('part block editor helpers', () => {
  it('keeps empty drafts out of the payload but preserves written text', () => {
    const blocks = [textBlock('الفقرة الأولى'), emptyBlock('text'), textBlock('الفقرة الثانية')];
    expect(usableBlocks(blocks)).toHaveLength(2);
    expect(plainContent(blocks)).toBe('الفقرة الأولى\n\nالفقرة الثانية');
  });

  it('builds the legacy plain content from Arabic paragraphs only', () => {
    expect(plainContent([textBlock('نص'), { type: 'quote', text: { ar: 'آية', fr: '' } }])).toBe('نص');
  });

  it('drops a paragraph block without Arabic text from the payload', () => {
    expect(usableBlocks([{ type: 'text', text: { ar: '   ', en: 'Only English', fr: '' } }])).toHaveLength(0);
  });

  it('requires an image file before sending an image block', () => {
    const draft: PartBlock = { type: 'image', image: null, alt: { ar: 'صورة', en: '', fr: '' } };
    expect(usableBlocks([textBlock('نص'), draft])).toHaveLength(1);
  });

  it('sends image blocks without any representation confirmation field', () => {
    const block: PartBlock = { type: 'image', image, alt: { ar: 'سفينة', en: '', fr: '' } };
    const [sent] = blocksForApi([block]);
    expect(sent.image).toEqual(image);
  });

  it('flags missing text and alt text before saving', () => {
    expect(blocksInvalid([])).toMatch(/كتلة نص/);
    expect(blocksInvalid([{ type: 'image', image }])).toMatch(/كتلة نص/);
    expect(blocksInvalid([textBlock('نص'), { type: 'image', image, decorative: false }])).toMatch(/نص بديل/);
    expect(blocksInvalid([textBlock('نص'), { type: 'quote', text: { ar: 'آية' } }])).toMatch(/مرجع/);
    expect(blocksInvalid([
      textBlock('نص'),
      { type: 'image', image, alt: { ar: 'صورة' } },
      { type: 'quote', text: { ar: 'آية' }, reference: { ar: 'التوبة: 40' } }
    ])).toBeNull();
  });
});
