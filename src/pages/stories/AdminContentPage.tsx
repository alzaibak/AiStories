import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { api } from '@/lib/api';
import { translateTree } from '@/lib/localization';

type Language = 'ar' | 'en' | 'fr';
type LocalizedFields = Record<Language, Record<string, string>>;
type Collection = { id: number; title: string; slug: string };
type Story = { id: number; title: string; slug: string; status: string };
type MediaUploadResponse = {
  upload: { url: string; fields: Record<string, string> };
  completeUrl: string;
};

const languages: Array<{ code: Language; label: string }> = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' }
];
const emptyFields = (keys: string[]): LocalizedFields =>
  Object.fromEntries(languages.map(({ code }) => [code, Object.fromEntries(keys.map((key) => [key, '']))])) as LocalizedFields;

function LanguageFields({
  values,
  onChange,
  field,
  label,
  multiline = false,
  disabled = false
}: {
  values: LocalizedFields;
  onChange: (language: Language, value: string) => void;
  field: string;
  label: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return <div className="grid gap-3 lg:grid-cols-3">
    {languages.map(({ code, label: languageLabel }) => <label key={code} className="block text-sm font-semibold text-slate-700">
      {label} — {languageLabel}
      {multiline
        ? <textarea required disabled={disabled} rows={code === 'ar' ? 5 : 4} value={values[code][field] || ''} onChange={(event) => onChange(code, event.target.value)} dir={code === 'ar' ? 'rtl' : 'ltr'} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 font-normal disabled:bg-slate-50" />
        : <input required disabled={disabled} value={values[code][field] || ''} onChange={(event) => onChange(code, event.target.value)} dir={code === 'ar' ? 'rtl' : 'ltr'} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 font-normal disabled:bg-slate-50" />}
    </label>)}
  </div>;
}

function languageRecord(values: LocalizedFields) {
  return {
    ar: values.ar,
    en: values.en,
    fr: values.fr
  };
}

export default function AdminContentPage() {
  const { locale = 'ar' } = useParams();
  const { user, isLoading, logout } = useStoryAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState(emptyFields(['title', 'description']));
  const [collectionSlug, setCollectionSlug] = useState('');
  const [storyText, setStoryText] = useState(emptyFields(['title', 'summary']));
  const [storyForm, setStoryForm] = useState({ collectionId: '', slug: '', type: 'history', sourceBadge: 'historical_source', sourceReference: '', isFree: false });
  const [partText, setPartText] = useState(emptyFields(['title', 'content', 'endingHook']));
  const [partForm, setPartForm] = useState({ storyId: '', partNumber: '1', estimatedReadingMinutes: '5', isFree: false });
  const [bookText, setBookText] = useState(emptyFields(['title', 'description']));
  const [bookForm, setBookForm] = useState({ slug: '', format: 'ebook', price: '', currency: 'EUR', stockQuantity: '', isPublished: false });
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [pendingBookId, setPendingBookId] = useState<number | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  async function loadContent() {
    setLoadError(null);
    try {
      const [nextCollections, nextStories] = await Promise.all([
        api.get<Collection[]>('/admin/content/collections'),
        api.get<Story[]>('/admin/content/stories')
      ]);
      setCollections(nextCollections);
      setStories(nextStories);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'تعذر تحميل المحتوى.');
    }
  }

  useEffect(() => {
    void loadContent();
  }, []);

  if (isLoading) return translateTree(<main className="p-10 text-center">جارٍ التحميل…</main>, locale as Language);
  if (!user) return <Navigate to={`/${locale}/admin/login`} replace />;
  if (!['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role)) return <Navigate to={`/${locale}/account`} replace />;

  function updateFields(
    setter: typeof setCollectionTitle,
    field: string,
    language: Language,
    value: string
  ) {
    setter((current) => ({ ...current, [language]: { ...current[language], [field]: value } }));
  }

  async function submit(event: FormEvent, action: () => Promise<void>, successMessage: string) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      await loadContent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ المحتوى.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadBookPdf(bookId: number, file: File) {
    if (file.type !== 'application/pdf') throw new Error('اختر ملف PDF صالحًا.');
    const upload = await api.post<MediaUploadResponse>('/admin/content/media/upload-url', {
      bookId,
      mediaType: 'ebook',
      fileName: file.name,
      mimeType: file.type,
      depictionPolicyConfirmed: true
    });
    const formData = new FormData();
    Object.entries(upload.upload.fields).forEach(([name, value]) => formData.append(name, value));
    formData.append('file', file);
    const response = await fetch(upload.upload.url, { method: 'POST', body: formData });
    if (!response.ok) throw new Error('فشل رفع ملف PDF. تحقق من التخزين وحاول مرة أخرى.');
    await api.post(upload.completeUrl, {});
  }

  async function saveBook(event: FormEvent) {
    await submit(event, async () => {
      const translations = languageRecord(bookText);
      const details = {
        title: bookText.ar.title,
        description: bookText.ar.description,
        translations,
        slug: bookForm.slug,
        format: bookForm.format,
        price: Number(bookForm.price),
        currency: bookForm.currency,
        stockQuantity: bookForm.format === 'print' ? Number(bookForm.stockQuantity) : null,
        isPublished: bookForm.format === 'ebook' ? false : bookForm.isPublished
      };
      if (bookForm.format === 'ebook') {
        if (!bookFile) throw new Error('أضف ملف PDF للكتاب الإلكتروني.');
        let bookId = pendingBookId;
        if (!bookId) {
          const created = await api.post<{ id: number }>('/admin/content/books', details);
          bookId = created.id;
          setPendingBookId(bookId);
        }
        await uploadBookPdf(bookId, bookFile);
        if (bookForm.isPublished) await api.patch(`/admin/content/books/${bookId}`, { isPublished: true });
      } else {
        await api.post('/admin/content/books', details);
      }
      setPendingBookId(null);
      setBookFile(null);
      setFileInputKey((key) => key + 1);
      setBookText(emptyFields(['title', 'description']));
      setBookForm({ slug: '', format: 'ebook', price: '', currency: 'EUR', stockQuantity: '', isPublished: false });
    }, bookForm.format === 'ebook' && bookForm.isPublished
      ? 'تم رفع ملف الكتاب ونشره للبيع.'
      : 'تم حفظ الكتاب باللغات التي أدخلتها.');
  }

  const inputClass = 'mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5';
  const selectClass = 'mt-2 w-full rounded-xl border border-emerald-950/15 bg-white px-3 py-2.5';
  const submitClass = 'rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50';

  const content = <main className="min-h-screen bg-[#fbfaf6] py-10 text-slate-900">
    <div className="mx-auto max-w-7xl space-y-8 px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="font-bold text-emerald-700">إدارة المحتوى</p><h1 className="mt-2 text-3xl font-black text-emerald-950">القصص والكتب</h1><p className="mt-2 text-slate-600">أدخل المحتوى يدويًا لكل لغة. لا تُنشأ ترجمات تلقائية.</p></div>
        <nav className="flex flex-wrap gap-2">
          <Link to={`/${locale}/admin/subscriptions`} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold">الاشتراكات</Link>
          <Link to={`/${locale}/admin/orders`} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold">طلبات الكتب</Link>
          <button onClick={logout} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold">خروج</button>
        </nav>
      </header>
      {loadError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{loadError}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}

      <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-emerald-950">إنشاء مجموعة قصصية</h2>
        <form onSubmit={(event) => submit(event, async () => {
          await api.post('/admin/content/collections', {
            title: collectionTitle.ar.title,
            description: collectionTitle.ar.description,
            slug: collectionSlug,
            translations: languageRecord(collectionTitle),
            isFree: false,
            sortOrder: collections.length
          });
          setCollectionTitle(emptyFields(['title', 'description']));
          setCollectionSlug('');
        }, 'تم إنشاء المجموعة باللغات التي أدخلتها.')} className="space-y-5">
          <LanguageFields values={collectionTitle} onChange={(lang, value) => updateFields(setCollectionTitle, 'title', lang, value)} field="title" label="عنوان المجموعة" />
          <LanguageFields values={collectionTitle} onChange={(lang, value) => updateFields(setCollectionTitle, 'description', lang, value)} field="description" label="الوصف" multiline />
          <label className="block max-w-md text-sm font-semibold">الرابط المختصر (slug)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={collectionSlug} onChange={(event) => setCollectionSlug(event.target.value)} dir="ltr" className={inputClass} /></label>
          <button disabled={busy} className={submitClass}>إنشاء المجموعة</button>
        </form>
      </section>

      <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-emerald-950">إضافة قصة مستقلة بلغاتها</h2>
        <form onSubmit={(event) => submit(event, async () => {
          await api.post('/admin/content/stories', {
            collectionId: Number(storyForm.collectionId),
            title: storyText.ar.title,
            summary: storyText.ar.summary,
            translations: languageRecord(storyText),
            slug: storyForm.slug,
            type: storyForm.type,
            sourceBadge: storyForm.sourceBadge,
            sourceReferences: storyForm.sourceReference ? [{ reference: storyForm.sourceReference }] : [],
            isFree: storyForm.isFree
          });
          setStoryText(emptyFields(['title', 'summary']));
          setStoryForm({ collectionId: '', slug: '', type: 'history', sourceBadge: 'historical_source', sourceReference: '', isFree: false });
        }, 'أُضيفت القصة كمسودة. أضف أجزاءها ثم أرسلها للمراجعة.')} className="space-y-5">
          <LanguageFields values={storyText} onChange={(lang, value) => updateFields(setStoryText, 'title', lang, value)} field="title" label="عنوان القصة" />
          <LanguageFields values={storyText} onChange={(lang, value) => updateFields(setStoryText, 'summary', lang, value)} field="summary" label="الملخص" multiline />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">المجموعة<select required value={storyForm.collectionId} onChange={(event) => setStoryForm({ ...storyForm, collectionId: event.target.value })} className={selectClass}><option value="">اختر مجموعة</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select></label>
            <label className="text-sm font-semibold">الرابط المختصر (slug)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={storyForm.slug} onChange={(event) => setStoryForm({ ...storyForm, slug: event.target.value })} dir="ltr" className={inputClass} /></label>
            <label className="text-sm font-semibold">نوع القصة<select value={storyForm.type} onChange={(event) => setStoryForm({ ...storyForm, type: event.target.value })} className={selectClass}><option value="quran">قرآنية</option><option value="sunnah">من السنة</option><option value="history">تاريخية</option><option value="new">جديدة</option></select></label>
            <label className="text-sm font-semibold">نوع المصدر<select value={storyForm.sourceBadge} onChange={(event) => setStoryForm({ ...storyForm, sourceBadge: event.target.value })} className={selectClass}><option value="quran_verse">آية قرآنية</option><option value="authentic_hadith">حديث صحيح</option><option value="historical_source">مصدر تاريخي</option><option value="inspired_story">قصة مستوحاة</option></select></label>
            <label className="text-sm font-semibold md:col-span-2">مرجع المصدر<input value={storyForm.sourceReference} onChange={(event) => setStoryForm({ ...storyForm, sourceReference: event.target.value })} className={inputClass} /></label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={storyForm.isFree} onChange={(event) => setStoryForm({ ...storyForm, isFree: event.target.checked })} /> قصة مجانية</label>
          <button disabled={busy || !collections.length} className={submitClass}>إضافة القصة كمسودة</button>
        </form>
      </section>

      <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-emerald-950">إضافة جزء إلى قصة</h2>
        <form onSubmit={(event) => submit(event, async () => {
          await api.post(`/admin/content/stories/${partForm.storyId}/parts`, {
            partNumber: Number(partForm.partNumber),
            title: partText.ar.title,
            content: partText.ar.content,
            endingHook: partText.ar.endingHook,
            translations: languageRecord(partText),
            estimatedReadingMinutes: Number(partForm.estimatedReadingMinutes),
            isFree: partForm.isFree
          });
          setPartText(emptyFields(['title', 'content', 'endingHook']));
        }, 'تمت إضافة الجزء بمحتواه اليدوي لكل لغة.')} className="space-y-5">
          <label className="block text-sm font-semibold">القصة<select required value={partForm.storyId} onChange={(event) => setPartForm({ ...partForm, storyId: event.target.value })} className={selectClass}><option value="">اختر قصة</option>{stories.map((story) => <option key={story.id} value={story.id}>{story.title} — {story.status}</option>)}</select></label>
          <LanguageFields values={partText} onChange={(lang, value) => updateFields(setPartText, 'title', lang, value)} field="title" label="عنوان الجزء" />
          <LanguageFields values={partText} onChange={(lang, value) => updateFields(setPartText, 'content', lang, value)} field="content" label="النص" multiline />
          <LanguageFields values={partText} onChange={(lang, value) => updateFields(setPartText, 'endingHook', lang, value)} field="endingHook" label="نهاية الجزء" multiline />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">رقم الجزء<input required type="number" min="1" value={partForm.partNumber} onChange={(event) => setPartForm({ ...partForm, partNumber: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-semibold">دقائق القراءة<input required type="number" min="1" max="120" value={partForm.estimatedReadingMinutes} onChange={(event) => setPartForm({ ...partForm, estimatedReadingMinutes: event.target.value })} className={inputClass} /></label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={partForm.isFree} onChange={(event) => setPartForm({ ...partForm, isFree: event.target.checked })} /> جزء مجاني</label>
          <button disabled={busy || !stories.length} className={submitClass}>إضافة الجزء</button>
        </form>
      </section>

      <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-emerald-950">إضافة كتاب بلغاته</h2>
        <form onSubmit={saveBook} className="space-y-5">
          <LanguageFields values={bookText} onChange={(lang, value) => updateFields(setBookText, 'title', lang, value)} field="title" label="عنوان الكتاب" disabled={pendingBookId !== null} />
          <LanguageFields values={bookText} onChange={(lang, value) => updateFields(setBookText, 'description', lang, value)} field="description" label="الوصف" multiline disabled={pendingBookId !== null} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">الرابط المختصر<input required disabled={pendingBookId !== null} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={bookForm.slug} onChange={(event) => setBookForm({ ...bookForm, slug: event.target.value })} dir="ltr" className={inputClass} /></label>
            <label className="text-sm font-semibold">النوع<select disabled={pendingBookId !== null} value={bookForm.format} onChange={(event) => setBookForm({ ...bookForm, format: event.target.value })} className={selectClass}><option value="ebook">إلكتروني</option><option value="print">ورقي</option></select></label>
            <label className="text-sm font-semibold">السعر<input required disabled={pendingBookId !== null} type="number" min="0" step="0.01" value={bookForm.price} onChange={(event) => setBookForm({ ...bookForm, price: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-semibold">العملة<input required disabled={pendingBookId !== null} minLength={3} maxLength={3} value={bookForm.currency} onChange={(event) => setBookForm({ ...bookForm, currency: event.target.value.toUpperCase() })} className={inputClass} /></label>
            {bookForm.format === 'print' && <label className="text-sm font-semibold">المخزون<input required disabled={pendingBookId !== null} type="number" min="0" value={bookForm.stockQuantity} onChange={(event) => setBookForm({ ...bookForm, stockQuantity: event.target.value })} className={inputClass} /></label>}
          </div>
          {bookForm.format === 'ebook' && <label className="block text-sm font-semibold">ملف الكتاب الإلكتروني (PDF)<input key={fileInputKey} type="file" accept="application/pdf,.pdf" required onChange={(event) => setBookFile(event.target.files?.[0] || null)} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2`} /><span className="mt-1 block text-xs font-normal text-slate-500">يُرفع الملف إلى التخزين الخاص، ولا يُتاح إلا بعد الشراء.</span></label>}
          {pendingBookId && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">تم حفظ مسودة الكتاب رقم {pendingBookId}. أعد اختيار ملف PDF لإكمال الرفع.</p>}
          <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={bookForm.isPublished} onChange={(event) => setBookForm({ ...bookForm, isPublished: event.target.checked })} /> نشر الكتاب الآن</label>
          <button disabled={busy} className={submitClass}>حفظ الكتاب</button>
        </form>
      </section>
    </div>
  </main>;
  return translateTree(content, locale as Language);
}
