import { useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';

export type BlockLanguage = 'ar' | 'en' | 'fr';

export type LocalizedBlockText = { ar: string; en: string; fr: string };

export type PartBlockImage = {
  url: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  placeholder?: string;
};

export type PartBlock = {
  id?: number | string;
  type: 'text' | 'image' | 'quote';
  text?: Partial<LocalizedBlockText>;
  image?: PartBlockImage | null;
  alt?: Partial<LocalizedBlockText>;
  caption?: Partial<LocalizedBlockText>;
  reference?: Partial<LocalizedBlockText>;
  credit?: string;
  layout?: 'full' | 'wide';
  decorative?: boolean;
};

const LANGUAGES: Array<{ code: BlockLanguage; label: string; dir: 'rtl' | 'ltr' }> = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' }
];

const emptyLocalized = (): LocalizedBlockText => ({ ar: '', en: '', fr: '' });

export function emptyBlock(type: PartBlock['type']): PartBlock {
  if (type === 'image') {
    return { type: 'image', image: null, alt: emptyLocalized(), caption: emptyLocalized(), credit: '', layout: 'full', decorative: false };
  }
  if (type === 'quote') {
    return { type: 'quote', text: emptyLocalized(), reference: emptyLocalized() };
  }
  return { type: 'text', text: emptyLocalized() };
}

/** Blocks that can be stored: no empty text, no image block without a file. */
export function usableBlocks(blocks: PartBlock[]): PartBlock[] {
  return blocks.filter((block) => {
    if (block.type === 'image') return Boolean(block.image?.url);
    return Boolean(block.text?.ar?.trim());
  });
}

/** The legacy `content` column, kept in sync for search and old readers. */
export function plainContent(blocks: PartBlock[]): string {
  return usableBlocks(blocks)
    .filter((block) => block.type === 'text')
    .map((block) => block.text?.ar?.trim() || '')
    .filter(Boolean)
    .join('\n\n');
}

export function blocksForApi(blocks: PartBlock[]): PartBlock[] {
  return usableBlocks(blocks);
}

export function blocksInvalid(blocks: PartBlock[]): string | null {
  const usable = usableBlocks(blocks);
  if (!usable.length) return 'أضف كتلة نص واحدة على الأقل.';
  if (!usable.some((block) => block.type === 'text')) return 'أضف كتلة نص واحدة على الأقل.';
  for (const block of usable) {
    if (block.type === 'image' && !block.decorative && !block.alt?.ar?.trim() && !block.alt?.en?.trim() && !block.alt?.fr?.trim()) {
      return 'لكل صورة نص بديل، أو علّمها كصورة زخرفية.';
    }
    if (block.type === 'quote' && !block.reference?.ar?.trim()) {
      return 'حدّد مرجع الآية أو الحديث.';
    }
  }
  return null;
}

const typeLabels: Record<PartBlock['type'], string> = {
  text: 'نص',
  image: 'صورة',
  quote: 'اقتباس'
};

function LanguageTabs({ value, onChange }: { value: BlockLanguage; onChange: (language: BlockLanguage) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-emerald-950/10 bg-slate-50 p-0.5" role="tablist">
      {LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          role="tab"
          aria-selected={value === language.code}
          onClick={() => onChange(language.code)}
          className={`rounded-md px-2.5 py-1 text-xs font-bold ${value === language.code ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-500'}`}
        >
          {language.label}
          {language.code === 'ar' && <span aria-hidden="true" className="text-red-600"> *</span>}
        </button>
      ))}
    </div>
  );
}

function LocalizedField({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
  hint
}: {
  label: string;
  value: Partial<LocalizedBlockText> | undefined;
  onChange: (patch: Partial<LocalizedBlockText>) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
}) {
  const [language, setLanguage] = useState<BlockLanguage>('ar');
  const current = value || emptyLocalized();
  const text = current[language] || '';
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-bold text-emerald-950">{label}</label>
        <LanguageTabs value={language} onChange={setLanguage} />
      </div>
      <textarea
        rows={rows}
        dir={language === 'ar' ? 'rtl' : 'ltr'}
        value={text}
        maxLength={20000}
        placeholder={placeholder}
        onChange={(event) => onChange({ [language]: event.target.value })}
        className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2 text-sm leading-7"
      />
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{hint}</span>
        <span dir="ltr">{text.length} / 20000</span>
      </div>
    </div>
  );
}

function ImageBlockEditor({
  block,
  onChange,
  disabled
}: {
  block: PartBlock;
  onChange: (patch: Partial<PartBlock>) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  async function upload(file: File | null) {
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('JPG أو PNG أو WebP فقط.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('الحد الأقصى 8 م.ب قبل التحويل.');
      return;
    }
    setBusy(true);
    try {
      const uploaded = await api.uploadFile<PartBlockImage & { thumbUrl?: string; width: number; height: number }>(
        '/admin/content/images',
        file,
        { role: 'block' }
      );
      const smallest = uploaded.url;
      onChange({
        image: { url: smallest, thumbUrl: uploaded.thumbUrl || smallest, width: uploaded.width, height: uploaded.height }
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رفع الصورة.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files?.[0] || null);
        }}
        className={`rounded-2xl border-2 border-dashed p-3 transition ${dragging ? 'border-emerald-700 bg-emerald-50' : 'border-emerald-950/15 bg-slate-50/60'}`}
      >
        {block.image?.url ? (
          <div className="flex flex-wrap items-start gap-3">
            <img
              src={block.image.url}
              alt=""
              className="h-28 w-44 rounded-xl border border-emerald-950/10 object-cover"
            />
            <div className="text-xs text-slate-600">
              <p dir="ltr" className="font-mono">{block.image.width}×{block.image.height}</p>
              <p className="mt-1">WebP · 1200 و600 بكسل</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy || disabled} onClick={() => input.current?.click()} className="rounded-lg bg-emerald-900 px-3 py-1.5 font-bold text-white disabled:opacity-50">استبدال</button>
                <button type="button" disabled={busy || disabled} onClick={() => onChange({ image: null })} className="rounded-lg border border-red-200 px-3 py-1.5 font-bold text-red-700 disabled:opacity-50">إزالة</button>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy || disabled} onClick={() => input.current?.click()} className="grid w-full place-items-center gap-1 py-6 text-sm font-semibold text-emerald-900">
            <span>{busy ? 'جارٍ الرفع…' : 'اسحب الصورة هنا أو اضغط للرفع'}</span>
            <span className="text-[11px] font-normal text-slate-500">JPG / PNG / WebP · حتى 8 م.ب · تُحوَّل إلى WebP</span>
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void upload(event.target.files?.[0] || null)}
        />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">{error}</p>}

      <LocalizedField label=" النص البديل (alt)" value={block.alt} onChange={(patch) => onChange({ alt: { ...block.alt, ...patch } })} rows={2} />
      <LocalizedField label="التعليق (اختياري)" value={block.caption} onChange={(patch) => onChange({ caption: { ...block.caption, ...patch } })} rows={2} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-emerald-950">المصدر / الحقوق
          <input value={block.credit || ''} maxLength={300} onChange={(event) => onChange({ credit: event.target.value })} className="mt-1 w-full rounded-xl border border-emerald-950/15 px-3 py-2 text-sm font-normal" placeholder="مثال: أرشيف الصور — مجاني" />
        </label>
        <fieldset>
          <legend className="text-xs font-bold text-emerald-950">العرض</legend>
          <div className="mt-1 flex gap-2">
            {([['full', 'بعرض النص'], ['wide', 'أعرض قليلًا']] as const).map(([value, label]) => (
              <label key={value} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${(block.layout || 'full') === value ? 'border-emerald-800 bg-emerald-50 text-emerald-900' : 'border-emerald-950/15'}`}>
                <input type="radio" name={`layout-${block.id || block.image?.url}`} checked={(block.layout || 'full') === value} onChange={() => onChange({ layout: value })} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="rounded-xl bg-emerald-50/60 p-3">
        <label className="flex items-start gap-2 text-xs font-semibold text-emerald-950">
          <input type="checkbox" checked={Boolean(block.decorative)} onChange={(event) => onChange({ decorative: event.target.checked })} className="mt-0.5" />
          صورة زخرفية (لا تحتاج نصًا بديلًا)
        </label>
      </div>
    </div>
  );
}

function PreviewBody({ blocks, language }: { blocks: PartBlock[]; language: BlockLanguage }) {
  const usable = usableBlocks(blocks);
  return (
    <div className="space-y-7">
      {usable.map((block, index) => {
        if (block.type === 'image' && block.image) {
          return (
            <figure key={index} className="space-y-2">
              <img src={block.image.url} alt={block.alt?.[language] || block.alt?.ar || ''} className="w-full rounded-[14px] border border-black/10" style={{ aspectRatio: block.image.width && block.image.height ? `${block.image.width} / ${block.image.height}` : undefined }} />
              {(block.caption?.[language] || block.caption?.ar) && <figcaption className="text-xs text-black/60">{block.caption?.[language] || block.caption?.ar}</figcaption>}
              {block.credit && <p className="text-[11px] text-black/45">الصورة: {block.credit}</p>}
            </figure>
          );
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={index} className="border-s-2 border-amber-600/70 ps-4">
              <p className="text-[1.15rem] leading-loose">{block.text?.[language] || block.text?.ar}</p>
              <p className="mt-1 text-xs text-black/55">{block.reference?.[language] || block.reference?.ar}</p>
            </blockquote>
          );
        }
        return (
          <div key={index} className="space-y-4 text-[1.05rem] leading-loose">
            {(block.text?.[language] || block.text?.ar || '').split(/\n{2,}/).filter(Boolean).map((paragraph, position) => (
              <p key={position}>{paragraph}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function PartBlocksEditor({
  blocks,
  onChange,
  disabled = false,
  title,
  readingMinutes,
  endingHook
}: {
  blocks: PartBlock[];
  onChange: (blocks: PartBlock[]) => void;
  disabled?: boolean;
  title?: string;
  readingMinutes?: number;
  endingHook?: string;
}) {
  const [preview, setPreview] = useState<null | { theme: 'light' | 'reading' | 'dark'; narrow: boolean; language: BlockLanguage }>(null);
  const problem = useMemo(() => blocksInvalid(blocks), [blocks]);

  const update = (index: number, patch: Partial<PartBlock>) => {
    onChange(blocks.map((block, position) => position === index ? { ...block, ...patch } : block));
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const duplicate = (index: number) => {
    const copy: PartBlock = { ...blocks[index], id: undefined };
    if (copy.image) copy.image = { ...copy.image };
    onChange([...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]);
  };
  const remove = (index: number) => {
    if (!window.confirm('هل تريد حذف هذه الكتلة؟')) return;
    onChange(blocks.filter((_, position) => position !== index));
  };

  const textCount = blocks.filter((block) => block.type === 'text').length;
  const imageCount = blocks.filter((block) => block.type === 'image' && block.image?.url).length;

  return (
    <section className="rounded-2xl border border-emerald-950/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-emerald-950">محتوى الجزء</h3>
          <p className="mt-1 text-xs text-slate-500">كتل مرتّبة: نص، صورة، اقتباس. الفرنسية والإنجليزية اختياريتان.</p>
          <p className="mt-1 text-[11px] text-slate-500">{textCount} نص · {imageCount} صورة · الحد الأقصى 40 كتلة و12 صورة</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled || blocks.length >= 40} onClick={() => onChange([...blocks, emptyBlock('text')])} className="rounded-lg border border-emerald-950/15 px-3 py-1.5 text-xs font-bold text-emerald-900 disabled:opacity-40">+ نص</button>
          <button type="button" disabled={disabled || blocks.length >= 40} onClick={() => onChange([...blocks, emptyBlock('image')])} className="rounded-lg border border-emerald-950/15 px-3 py-1.5 text-xs font-bold text-emerald-900 disabled:opacity-40">+ صورة</button>
          <button type="button" disabled={disabled || blocks.length >= 40} onClick={() => onChange([...blocks, emptyBlock('quote')])} className="rounded-lg border border-emerald-950/15 px-3 py-1.5 text-xs font-bold text-emerald-900 disabled:opacity-40">+ اقتباس</button>
          <button type="button" onClick={() => setPreview({ theme: 'light', narrow: false, language: 'ar' })} className="rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white">معاينة</button>
        </div>
      </div>

      {!blocks.length && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          لا توجد كتل بعد. أضف كتلة نص للبدء؛ الأجزاء القديمة تُعرض من نصها المحفوظ.
        </p>
      )}

      <ol className="mt-4 space-y-4">
        {blocks.map((block, index) => (
          <li key={block.id ?? `block-${index}`} className="rounded-2xl border border-emerald-950/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-xs font-bold text-emerald-900">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-900 text-[11px] text-white">{index + 1}</span>
                {typeLabels[block.type]}
              </p>
              <div className="flex items-center gap-1 text-xs">
                <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label="نقل لأعلى" className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-950/10 disabled:opacity-30">↑</button>
                <button type="button" disabled={disabled || index === blocks.length - 1} onClick={() => move(index, 1)} aria-label="نقل لأسفل" className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-950/10 disabled:opacity-30">↓</button>
                <button type="button" disabled={disabled} onClick={() => duplicate(index)} className="rounded-lg border border-emerald-950/10 px-2 py-1.5 font-bold">نسخ</button>
                <button type="button" disabled={disabled} onClick={() => remove(index)} className="rounded-lg border border-red-200 px-2 py-1.5 font-bold text-red-700">حذف</button>
              </div>
            </div>

            <div className="mt-3">
              {block.type === 'text' && (
                <LocalizedField
                  label="النص"
                  value={block.text}
                  rows={6}
                  hint="سطر فارغ بين الفقرات."
                  onChange={(patch) => update(index, { text: { ...block.text, ...patch } })}
                />
              )}
              {block.type === 'quote' && (
                <div className="space-y-3">
                  <LocalizedField label="نص الآية أو الحديث (يُحفظ كما هو)" value={block.text} rows={3} onChange={(patch) => update(index, { text: { ...block.text, ...patch } })} />
                  <LocalizedField label="المرجع" value={block.reference} rows={1} onChange={(patch) => update(index, { reference: { ...block.reference, ...patch } })} />
                </div>
              )}
              {block.type === 'image' && (
                <ImageBlockEditor block={block} disabled={disabled} onChange={(patch) => update(index, patch)} />
              )}
            </div>
          </li>
        ))}
      </ol>

      {problem && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-900">{problem}</p>}

      {preview && (
        <div role="dialog" aria-modal="true" aria-label="معاينة الجزء" className="fixed inset-0 z-[60] grid bg-slate-950/60 p-3 sm:p-6" onClick={() => setPreview(null)}>
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-950/10 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-emerald-950">معاينة القارئ</span>
                {(['light', 'reading', 'dark'] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setPreview({ ...preview, theme: value })} aria-pressed={preview.theme === value} className={`rounded-lg px-2.5 py-1 font-bold ${preview.theme === value ? 'bg-emerald-900 text-white' : 'border border-emerald-950/15'}`}>
                    {value === 'light' ? 'فاتح' : value === 'reading' ? 'قراءة' : 'داكن'}
                  </button>
                ))}
                <button type="button" onClick={() => setPreview({ ...preview, narrow: !preview.narrow })} className="rounded-lg border border-emerald-950/15 px-2.5 py-1 font-bold">{preview.narrow ? 'عرض الحاسوب' : 'عرض الهاتف'}</button>
                {(['ar', 'en', 'fr'] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setPreview({ ...preview, language: value })} aria-pressed={preview.language === value} className={`rounded-lg px-2 py-1 font-bold uppercase ${preview.language === value ? 'bg-emerald-900 text-white' : 'border border-emerald-950/15'}`}>{value}</button>
                ))}
              </div>
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-emerald-950/15 px-3 py-1 text-xs font-bold">إغلاق</button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-100 p-4">
              <div
                className={`mx-auto ${preview.narrow ? 'max-w-[24rem]' : 'max-w-3xl'}`}
                data-site-theme={preview.theme === 'light' ? 'light' : preview.theme === 'reading' ? 'sepia' : 'dark'}
                style={{ backgroundColor: 'rgb(var(--ds-canvas-rgb))' }}
              >
                <div className="site-root p-5" dir={preview.language === 'ar' ? 'rtl' : 'ltr'} style={{ color: 'rgb(var(--ds-ink-rgb))' }}>
                  <p className="text-[11px] font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--ds-ink-faint-rgb))' }}>الجزء</p>
                  <h4 className="mt-1 text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{title || 'عنوان الجزء'}</h4>
                  <p className="mt-1 text-xs" style={{ color: 'rgb(var(--ds-ink-muted-rgb))' }}>≈ {readingMinutes || 5} دقائق قراءة</p>
                  <div className="my-5 h-px" style={{ backgroundColor: 'rgb(var(--ds-line-rgb))' }} />
                  <div style={{ fontFamily: preview.language === 'ar' ? "'Amiri', serif" : "'Source Serif 4', serif" }}>
                    <PreviewBody blocks={blocks} language={preview.language} />
                  </div>
                  {endingHook && (
                    <div className="mt-7 border-s-2 ps-4" style={{ borderColor: 'rgb(var(--ds-gold-rgb))' }}>
                      <p className="text-[11px] font-bold" style={{ color: 'rgb(var(--ds-gold-ink-rgb))' }}>تأمّل</p>
                      <p className="mt-1 leading-loose" style={{ fontFamily: "'Amiri', serif" }}>{endingHook}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
