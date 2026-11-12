import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { ApiError, api } from '@/lib/api';
import { translateText, translateTree } from '@/lib/localization';

type Language = 'ar' | 'en' | 'fr';
type LocalizedFields = Record<Language, Record<string, string>>;
type Collection = {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  isFree?: boolean;
  isActive?: boolean;
  translations?: Partial<Record<Language, Record<string, string>>>;
};
type Part = {
  id: number;
  partNumber: number;
  title: string;
  content: string;
  endingHook: string;
  translations: Partial<Record<Language, Record<string, string>>>;
  estimatedReadingMinutes: number;
  isFree: boolean;
};
type Story = {
  id: number;
  title: string;
  summary?: string;
  slug: string;
  status: string;
  collectionId?: number;
  type?: string;
  sourceBadge?: string;
  sourceReferences?: Array<{ reference: string }>;
  isFree?: boolean;
  translations?: Partial<Record<Language, Record<string, string>>>;
  parts: Part[];
};
type Book = {
  id: number;
  title: string;
  description?: string | null;
  slug: string;
  format: string;
  price: string | number;
  currency: string;
  stockQuantity: number | null;
  isPublished: boolean;
  fileStorageKey: string | null;
  translations: Partial<Record<Language, Record<string, string>>>;
};
type MediaUploadResponse = {
  upload: { driver: 'local' | 's3'; url: string; fields: Record<string, string> };
  completeUrl: string;
};

const languages: Array<{ code: Language; label: string }> = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' }
];
const emptyFields = (keys: string[]): LocalizedFields =>
  Object.fromEntries(languages.map(({ code }) => [code, Object.fromEntries(keys.map((key) => [key, '']))])) as LocalizedFields;
const slugFromTitle = (value: string) => value.normalize('NFKD').toLowerCase()
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

function LanguageFields({
  values,
  onChange,
  field,
  fieldPrefix = 'translations',
  errors = {},
  label,
  multiline = false,
  disabled = false
}: {
  values: LocalizedFields;
  onChange: (language: Language, value: string) => void;
  field: string;
  fieldPrefix?: string;
  errors?: Record<string, string>;
  label: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
  const activeLabel = languages.find(({ code }) => code === activeLanguage)?.label;
  const fieldId = useId();
  return <div>
    <div role="tablist" aria-label={`${label} — ${activeLabel}`} className="mb-3 flex gap-2 border-b border-emerald-950/10">
      {languages.map(({ code, label: languageLabel }) => <button
        key={code}
        type="button"
        role="tab"
        id={`${fieldId}-${code}-tab`}
        aria-selected={activeLanguage === code}
        aria-controls={`${fieldId}-${code}-panel`}
        onClick={() => setActiveLanguage(code)}
        className={`border-b-2 px-3 py-2 text-sm font-bold ${activeLanguage === code ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-slate-500'}`}
      >{languageLabel}{code === 'ar' ? ' *' : ''}</button>)}
    </div>
    {languages.filter(({ code }) => code === activeLanguage).map(({ code, label: languageLabel }) => <div key={code} role="tabpanel" id={`${fieldId}-${code}-panel`} aria-labelledby={`${fieldId}-${code}-tab`}>
      <label className="block text-sm font-semibold text-slate-700">
      {label} — {languageLabel}
      {multiline
        ? <textarea required={code === 'ar'} disabled={disabled} rows={code === 'ar' ? 5 : 4} value={values[code][field] || ''} onChange={(event) => onChange(code, event.target.value)} dir={code === 'ar' ? 'rtl' : 'ltr'} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 font-normal disabled:bg-slate-50" />
        : <input required={code === 'ar'} disabled={disabled} value={values[code][field] || ''} onChange={(event) => onChange(code, event.target.value)} dir={code === 'ar' ? 'rtl' : 'ltr'} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 font-normal disabled:bg-slate-50" />}
      {errors[`${fieldPrefix}.${code}.${field}`] && <span className="mt-1 block text-xs text-red-700">{errors[`${fieldPrefix}.${code}.${field}`]}</span>}
      </label>
    </div>)}
  </div>;
}

function languageRecord(values: LocalizedFields) {
  return Object.fromEntries(languages.map(({ code }) => [
    code,
    Object.fromEntries(Object.entries(values[code]).filter(([, value]) => value.trim() !== ''))
  ]).filter(([, localizedValues]) => Object.keys(localizedValues as Record<string, string>).length > 0));
}

function FieldError({ errors, field }: { errors: Record<string, string>; field: string }) {
  const message = errors[field];
  return message ? <span className="mt-1 block text-xs font-normal text-red-700">{message}</span> : null;
}

export default function AdminContentPage() {
  const { locale = 'ar', storyId, collectionId, bookId } = useParams();
  const { user, isLoading } = useStoryAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldErrorScope, setFieldErrorScope] = useState<'collection' | 'story' | 'part' | 'book' | null>(null);
  const [conflictingPart, setConflictingPart] = useState<{ id: number; partNumber: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState(emptyFields(['title', 'description']));
  const [collectionSlug, setCollectionSlug] = useState('');
  const [storyText, setStoryText] = useState(emptyFields(['title', 'summary']));
  const [storyForm, setStoryForm] = useState({ collectionId: '', slug: '', type: 'history', sourceBadge: 'historical_source', sourceReference: '', isFree: false });
  const [partText, setPartText] = useState(emptyFields(['title', 'content', 'endingHook']));
  const [partForm, setPartForm] = useState({ storyId: '', partNumber: '1', estimatedReadingMinutes: '5', isFree: false });
  const [editingPartId, setEditingPartId] = useState<number | null>(null);
  const [bookText, setBookText] = useState(emptyFields(['title', 'description']));
  const [bookForm, setBookForm] = useState({ slug: '', format: 'ebook', price: '', currency: 'EUR', stockQuantity: '', isPublished: false });
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [pendingBookId, setPendingBookId] = useState<number | null>(null);
  const [bookHasPdf, setBookHasPdf] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const isCollectionForm = location.pathname.endsWith('/content/collections/new') || location.pathname.includes('/content/collections/') && location.pathname.endsWith('/edit');
  const isBookForm = location.pathname.startsWith(`/${locale}/admin/shop/books/`) &&
    (location.pathname.endsWith('/new') || location.pathname.endsWith('/edit'));
  const isPartForm = location.pathname.endsWith('/parts/new');
  const isStoryForm = location.pathname.endsWith('/content/stories/new') || location.pathname.endsWith('/edit');

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  async function loadContent() {
    setLoadError(null);
    try {
      const [nextCollections, nextStories, nextBooks] = await Promise.all([
        api.get<Collection[]>('/admin/content/collections'),
        api.get<Story[]>('/admin/content/stories'),
        api.get<Book[]>('/admin/content/books')
      ]);
      setCollections(nextCollections);
      setStories(nextStories);
      setBooks(nextBooks);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'تعذر تحميل المحتوى.');
    }
  }

  useEffect(() => {
    void loadContent();
  }, []);

  useEffect(() => {
    if (!collectionId || !collections.length) return;
    const collection = collections.find((candidate) => String(candidate.id) === collectionId);
    if (!collection) return;
    const localized = (language: Language, field: string) =>
      collection.translations?.[language]?.[field] || (language === 'ar' ? collection[field as keyof Collection] as string || '' : '');
    setCollectionTitle({
      ar: { title: localized('ar', 'title'), description: localized('ar', 'description') },
      en: { title: localized('en', 'title'), description: localized('en', 'description') },
      fr: { title: localized('fr', 'title'), description: localized('fr', 'description') }
    });
    setCollectionSlug(collection.slug);
  }, [collections, collectionId]);

  useEffect(() => {
    if (!bookId || !books.length) return;
    const book = books.find((candidate) => String(candidate.id) === bookId);
    if (!book) return;
    const localized = (language: Language, field: string) =>
      book.translations?.[language]?.[field] || (language === 'ar' ? book[field as keyof Book] as string || '' : '');
    setBookText({
      ar: { title: localized('ar', 'title'), description: localized('ar', 'description') },
      en: { title: localized('en', 'title'), description: localized('en', 'description') },
      fr: { title: localized('fr', 'title'), description: localized('fr', 'description') }
    });
    setBookForm({
      slug: book.slug,
      format: book.format,
      price: String(book.price),
      currency: book.currency,
      stockQuantity: book.stockQuantity == null ? '' : String(book.stockQuantity),
      isPublished: book.isPublished
    });
    setPendingBookId(book.id);
    setBookHasPdf(Boolean(book.fileStorageKey));
  }, [books, bookId]);

  useEffect(() => {
    if (!storyId || !stories.length) return;
    const story = stories.find((candidate) => String(candidate.id) === storyId);
    if (!story) return;
    if (isPartForm) {
      const nextPartNumber = Math.max(0, ...(story.parts || []).map((part) => part.partNumber)) + 1;
      setPartForm((current) => ({ ...current, storyId, partNumber: String(nextPartNumber) }));
      return;
    }
    if (isStoryForm && location.pathname.endsWith('/edit')) {
      const localized = (language: Language, field: string) =>
        story.translations?.[language]?.[field] || (language === 'ar' ? story[field as keyof Story] as string || '' : '');
      setStoryText({
        ar: { title: localized('ar', 'title'), summary: localized('ar', 'summary') },
        en: { title: localized('en', 'title'), summary: localized('en', 'summary') },
        fr: { title: localized('fr', 'title'), summary: localized('fr', 'summary') }
      });
      setStoryForm({
        collectionId: String(story.collectionId || ''),
        slug: story.slug,
        type: story.type || 'history',
        sourceBadge: story.sourceBadge || 'historical_source',
        sourceReference: story.sourceReferences?.[0]?.reference || '',
        isFree: Boolean(story.isFree)
      });
    }
  }, [stories, storyId, isPartForm, isStoryForm, location.pathname]);

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

  async function submit(
    event: FormEvent,
    action: () => Promise<void>,
    successMessage: string,
    scope: 'collection' | 'story' | 'part' | 'book'
  ): Promise<boolean> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setFieldErrorScope(scope);
    setConflictingPart(null);
    setNotice(null);
    try {
      await action();
      setHasUnsavedChanges(false);
      setNotice(successMessage);
      await loadContent();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ المحتوى.');
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fields || {});
        setConflictingPart(caught.existingPart || null);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadBookPdf(bookId: number, file: File) {
    if (file.type !== 'application/pdf') {
      throw new Error(translateText('اختر ملف PDF صالحًا.', locale as Language));
    }
    const upload = await api.post<MediaUploadResponse>('/admin/content/media/upload-url', {
      bookId,
      mediaType: 'ebook',
      fileName: file.name,
      mimeType: file.type,
      depictionPolicyConfirmed: true
    });
    if (upload.upload.driver === 'local') {
      await api.uploadFile(upload.upload.url, file);
    } else {
      const formData = new FormData();
      Object.entries(upload.upload.fields).forEach(([name, value]) => formData.append(name, value));
      formData.append('file', file);
      const response = await fetch(upload.upload.url, { method: 'POST', body: formData });
      if (!response.ok) {
        throw new Error(translateText('فشل رفع ملف PDF. تحقق من التخزين وحاول مرة أخرى.', locale as Language));
      }
    }
    await api.post(upload.completeUrl, {});
  }

  async function saveBook(event: FormEvent) {
    const saved = await submit(event, async () => {
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
        isPublished: bookForm.format === 'ebook' && !bookId ? false : bookForm.isPublished
      };
      if (bookForm.format === 'ebook') {
        if (bookForm.isPublished && !bookFile && !bookHasPdf) {
          throw new Error(translateText('أضف ملف PDF للكتاب الإلكتروني.', locale as Language));
        }
        let targetBookId = bookId ? Number(bookId) : pendingBookId;
        if (targetBookId) {
          await api.patch(`/admin/content/books/${targetBookId}`, details);
        } else {
          const created = await api.post<{ id: number }>('/admin/content/books', details);
          targetBookId = created.id;
          setPendingBookId(targetBookId);
        }
        if (!bookFile && !bookHasPdf) return;
        if (bookFile) {
          await uploadBookPdf(targetBookId, bookFile);
          setBookHasPdf(true);
        }
        if (bookForm.isPublished) await api.patch(`/admin/content/books/${targetBookId}`, { isPublished: true });
      } else {
        if (bookId) await api.patch(`/admin/content/books/${bookId}`, details);
        else await api.post('/admin/content/books', details);
      }
      setPendingBookId(null);
      setBookHasPdf(false);
      setBookFile(null);
      setFileInputKey((key) => key + 1);
      setBookText(emptyFields(['title', 'description']));
      setBookForm({ slug: '', format: 'ebook', price: '', currency: 'EUR', stockQuantity: '', isPublished: false });
    }, bookForm.format === 'ebook' && !bookFile && !bookHasPdf
      ? 'تم حفظ مسودة الكتاب. أعد اختيار ملف PDF لإكمال الرفع.'
      : bookForm.format === 'ebook' && bookForm.isPublished
        ? 'تم رفع ملف الكتاب ونشره للبيع.'
        : 'تم حفظ الكتاب باللغات التي أدخلتها.', 'book');
    if (saved && (bookId || bookForm.format === 'print' || bookFile)) {
      navigate(`/${locale}/admin/shop/books`);
    }
  }

  function editPart(part: Part, storyId: number) {
    const localized = (language: Language, field: string) =>
      part.translations?.[language]?.[field] || (language === 'ar' ? part[field as keyof Part] as string : '');
    setPartForm({
      storyId: String(storyId),
      partNumber: String(part.partNumber),
      estimatedReadingMinutes: String(part.estimatedReadingMinutes),
      isFree: part.isFree
    });
    setPartText({
      ar: {
        title: localized('ar', 'title'),
        content: localized('ar', 'content'),
        endingHook: localized('ar', 'endingHook')
      },
      en: {
        title: localized('en', 'title'),
        content: localized('en', 'content'),
        endingHook: localized('en', 'endingHook')
      },
      fr: {
        title: localized('fr', 'title'),
        content: localized('fr', 'content'),
        endingHook: localized('fr', 'endingHook')
      }
    });
    setEditingPartId(part.id);
    setFieldErrors({});
    setConflictingPart(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function runPartAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setFieldErrorScope('part');
    setConflictingPart(null);
    setNotice(null);
    try {
      await action();
      await loadContent();
      setNotice(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الجزء.');
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fields || {});
        setConflictingPart(caught.existingPart || null);
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5';
  const selectClass = 'mt-2 w-full rounded-xl border border-emerald-950/15 bg-white px-3 py-2.5';
  const submitClass = 'rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50';
  const selectedStory = stories.find((story) => String(story.id) === partForm.storyId);
  const errorsFor = (scope: 'collection' | 'story' | 'part' | 'book') =>
    fieldErrorScope === scope ? fieldErrors : {};

  const pageTitle = isCollectionForm ? collectionId ? 'تعديل المجموعة' : 'إنشاء مجموعة قصصية'
    : isBookForm ? bookId ? 'تعديل الكتاب' : 'إضافة كتاب'
      : isPartForm ? editingPartId ? 'تعديل الجزء' : 'إضافة جزء إلى قصة'
        : storyId ? 'تعديل القصة' : 'إنشاء قصة';
  const bookDraftLocked = pendingBookId !== null && !bookId;
  const storyEditorBase = storyId ? `/${locale}/admin/content/stories/${storyId}` : null;
  const content = <main className="space-y-6 text-slate-900">
      <header>
        <p className="font-bold text-emerald-700">{translateText('إدارة المحتوى', locale as Language)}</p>
        <h1 className="mt-1 text-3xl font-black text-emerald-950">{translateText(pageTitle, locale as Language)}</h1>
        <p className="mt-2 text-sm text-slate-600">{translateText('أدخل المحتوى يدويًا لكل لغة. لا تُنشأ ترجمات تلقائية.', locale as Language)}</p>
      </header>
      {(isStoryForm || isPartForm) && <nav aria-label={translateText('أقسام محرر القصة', locale as Language)} className="flex flex-wrap gap-2 border-b border-emerald-950/10">
        <Link aria-current={isStoryForm ? 'page' : undefined} to={storyEditorBase ? `${storyEditorBase}/edit` : `/${locale}/admin/content/stories/new`} className={`rounded-t-xl px-4 py-2 text-sm font-bold ${isStoryForm ? 'bg-white text-emerald-900' : 'text-slate-500'}`}>{translateText('عام', locale as Language)}</Link>
        {storyEditorBase ? <Link aria-current={isPartForm ? 'page' : undefined} to={`${storyEditorBase}/parts/new`} className={`rounded-t-xl px-4 py-2 text-sm font-bold ${isPartForm ? 'bg-white text-emerald-900' : 'text-slate-500'}`}>{translateText('الأجزاء', locale as Language)}</Link> : <button type="button" disabled className="rounded-t-xl px-4 py-2 text-sm font-bold text-slate-400">{translateText('الأجزاء', locale as Language)}</button>}
        {['الاختبارات', 'الفيديو', 'المصدر والمراجعة', 'الوصول والأسعار'].map((tab) => <button key={tab} type="button" disabled className="rounded-t-xl px-4 py-2 text-sm font-bold text-slate-400">{translateText(tab, locale as Language)} · {translateText('قريبًا', locale as Language)}</button>)}
      </nav>}
      {loadError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{loadError}</p>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" aria-live="assertive">
        <p className="font-semibold">{error}</p>
        {conflictingPart && <button type="button" onClick={() => {
          const story = stories.find((candidate) => candidate.id === Number(partForm.storyId));
          const part = story?.parts.find((candidate) => candidate.id === conflictingPart.id);
          if (story && part) editPart(part, story.id);
        }} className="mt-2 font-bold underline">
          {translateText('تعديل الجزء الموجود', locale as Language)} ({conflictingPart.partNumber})
        </button>}
      </div>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}

      {isCollectionForm && <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-emerald-950">{collectionId ? 'تعديل المجموعة' : 'إنشاء مجموعة قصصية'}</h2>
        <form onChange={() => setHasUnsavedChanges(true)} onSubmit={async (event) => {
          const saved = await submit(event, async () => {
          const payload = {
            title: collectionTitle.ar.title,
            description: collectionTitle.ar.description,
            slug: collectionSlug,
            translations: languageRecord(collectionTitle),
            ...(collectionId ? {} : { sortOrder: collections.length })
          };
          if (collectionId) await api.patch(`/admin/content/collections/${collectionId}`, payload);
          else await api.post('/admin/content/collections', { ...payload, isFree: false });
          }, 'تم إنشاء المجموعة باللغات التي أدخلتها.', 'collection');
          if (saved) navigate(`/${locale}/admin/content/collections`);
        }} className="space-y-5">
          <LanguageFields values={collectionTitle} onChange={(lang, value) => updateFields(setCollectionTitle, 'title', lang, value)} field="title" label="عنوان المجموعة" errors={errorsFor('collection')} />
          <LanguageFields values={collectionTitle} onChange={(lang, value) => updateFields(setCollectionTitle, 'description', lang, value)} field="description" label="الوصف" multiline errors={errorsFor('collection')} />
          <label className="block max-w-md text-sm font-semibold">الرابط المختصر (slug)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={collectionSlug} onChange={(event) => setCollectionSlug(event.target.value)} dir="ltr" className={inputClass} /><FieldError errors={errorsFor('collection')} field="slug" /></label>
          <button disabled={busy} className={submitClass}>{translateText(collectionId ? 'حفظ التعديلات' : 'إنشاء المجموعة', locale as Language)}</button>
        </form>
      </section>}

      {isStoryForm && <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-emerald-950">إضافة قصة مستقلة بلغاتها</h2>
        <form onChange={() => setHasUnsavedChanges(true)} onSubmit={async (event) => {
          let createdStoryId: number | null = null;
          const saved = await submit(event, async () => {
          const payload = {
            collectionId: Number(storyForm.collectionId),
            title: storyText.ar.title,
            summary: storyText.ar.summary,
            translations: languageRecord(storyText),
            slug: storyForm.slug,
            type: storyForm.type,
            sourceBadge: storyForm.sourceBadge,
            sourceReferences: storyForm.sourceReference ? [{ reference: storyForm.sourceReference }] : [],
            isFree: storyForm.isFree
          };
          if (storyId) {
            await api.patch(`/admin/content/stories/${storyId}`, payload);
          } else {
            const created = await api.post<{ id: number }>('/admin/content/stories', payload);
            createdStoryId = created.id;
          }
          }, storyId ? 'تم حفظ القصة.' : 'أُضيفت القصة كمسودة. أضف أجزاءها ثم أرسلها للمراجعة.', 'story');
          if (saved && createdStoryId) navigate(`/${locale}/admin/content/stories/${createdStoryId}/edit`, { replace: true });
        }} className="space-y-5">
          <LanguageFields values={storyText} onChange={(lang, value) => {
            const previousSuggestedSlug = slugFromTitle(storyText[lang].title);
            updateFields(setStoryText, 'title', lang, value);
            const suggestedSlug = slugFromTitle(value);
            if (!storyId && (!storyForm.slug || storyForm.slug === previousSuggestedSlug) && suggestedSlug) {
              setStoryForm((current) => ({ ...current, slug: suggestedSlug }));
            }
          }} field="title" label="عنوان القصة" errors={errorsFor('story')} />
          <LanguageFields values={storyText} onChange={(lang, value) => updateFields(setStoryText, 'summary', lang, value)} field="summary" label="الملخص" multiline errors={errorsFor('story')} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">المجموعة<select required value={storyForm.collectionId} onChange={(event) => setStoryForm({ ...storyForm, collectionId: event.target.value })} className={selectClass}><option value="">اختر مجموعة</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select><FieldError errors={errorsFor('story')} field="collectionId" /></label>
            <label className="text-sm font-semibold">الرابط المختصر (slug)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={storyForm.slug} onChange={(event) => setStoryForm({ ...storyForm, slug: event.target.value })} dir="ltr" className={inputClass} /><FieldError errors={errorsFor('story')} field="slug" /></label>
            <label className="text-sm font-semibold">نوع القصة<select value={storyForm.type} onChange={(event) => setStoryForm({ ...storyForm, type: event.target.value })} className={selectClass}><option value="quran">قرآنية</option><option value="sunnah">من السنة</option><option value="history">تاريخية</option><option value="new">جديدة</option></select><FieldError errors={errorsFor('story')} field="type" /></label>
            <label className="text-sm font-semibold">نوع المصدر<select value={storyForm.sourceBadge} onChange={(event) => setStoryForm({ ...storyForm, sourceBadge: event.target.value })} className={selectClass}><option value="quran_verse">آية قرآنية</option><option value="authentic_hadith">حديث صحيح</option><option value="historical_source">مصدر تاريخي</option><option value="inspired_story">قصة مستوحاة</option></select><FieldError errors={errorsFor('story')} field="sourceBadge" /></label>
            <label className="text-sm font-semibold md:col-span-2">مرجع المصدر<input value={storyForm.sourceReference} onChange={(event) => setStoryForm({ ...storyForm, sourceReference: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('story')} field="sourceReferences.0.reference" /></label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={storyForm.isFree} onChange={(event) => setStoryForm({ ...storyForm, isFree: event.target.checked })} /> قصة مجانية</label>
          <div className="flex flex-wrap gap-3">
            <button disabled={busy || !collections.length} className={submitClass}>{busy ? translateText('جارٍ الحفظ…', locale as Language) : translateText(storyId ? 'حفظ المسودة' : 'حفظ كمسودة', locale as Language)}</button>
            {storyId && <button type="button" onClick={() => navigate(`/${locale}/admin/content/stories/${storyId}/parts/new`)} className="rounded-full border border-emerald-950/15 px-5 py-3 font-bold">{translateText('إضافة جزء', locale as Language)}</button>}
            <button type="button" onClick={() => setPreviewVisible((visible) => !visible)} className="rounded-full border border-emerald-950/15 px-5 py-3 font-bold">{translateText(previewVisible ? 'إغلاق المعاينة' : 'معاينة', locale as Language)}</button>
          </div>
        </form>
        {previewVisible && <div role="region" aria-label={translateText('معاينة', locale as Language)} className="mt-6 rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-bold text-emerald-700">{translateText('معاينة', locale as Language)}</p>
          <h3 className="mt-2 text-xl font-black text-emerald-950">{storyText[locale as Language].title || storyText.ar.title || translateText('عنوان القصة', locale as Language)}</h3>
          <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">{storyText[locale as Language].summary || storyText.ar.summary || translateText('الملخص', locale as Language)}</p>
        </div>}
      </section>}

      {isPartForm && <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-emerald-950">{editingPartId ? 'تعديل الجزء' : 'إضافة جزء إلى قصة'}</h2>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <form onChange={() => setHasUnsavedChanges(true)} onSubmit={(event) => submit(event, async () => {
            const payload = {
            partNumber: Number(partForm.partNumber),
            title: partText.ar.title,
            content: partText.ar.content,
            endingHook: partText.ar.endingHook,
            translations: languageRecord(partText),
            estimatedReadingMinutes: Number(partForm.estimatedReadingMinutes),
            isFree: partForm.isFree
            };
            if (editingPartId) {
              await api.patch(`/admin/content/parts/${editingPartId}`, payload);
            } else {
              await api.post(`/admin/content/stories/${partForm.storyId}/parts`, payload);
            }
            setPartText(emptyFields(['title', 'content', 'endingHook']));
            setEditingPartId(null);
            const updatedStory = stories.find((story) => String(story.id) === partForm.storyId);
            const nextNumber = updatedStory
              ? Math.max(Number(partForm.partNumber), ...updatedStory.parts.map((part) => part.partNumber)) + 1
              : Number(partForm.partNumber) + 1;
            setPartForm({ ...partForm, partNumber: String(nextNumber) });
          }, editingPartId ? 'تم تحديث الجزء.' : 'تمت إضافة الجزء بمحتواه اليدوي لكل لغة.', 'part')} className="space-y-5">
            <label className="block text-sm font-semibold">القصة<select required disabled={Boolean(storyId) || editingPartId !== null} value={partForm.storyId} onChange={(event) => {
              const storyId = event.target.value;
              const story = stories.find((candidate) => String(candidate.id) === storyId);
              const nextNumber = story ? Math.max(0, ...story.parts.map((part) => part.partNumber)) + 1 : 1;
              setPartForm({ ...partForm, storyId, partNumber: String(nextNumber) });
            }} className={selectClass}><option value="">اختر قصة</option>{stories.map((story) => <option key={story.id} value={story.id}>{story.title} — {story.status}</option>)}</select><FieldError errors={errorsFor('part')} field="storyId" /></label>
            <LanguageFields values={partText} onChange={(lang, value) => updateFields(setPartText, 'title', lang, value)} field="title" label="عنوان الجزء" errors={errorsFor('part')} />
            <LanguageFields values={partText} onChange={(lang, value) => updateFields(setPartText, 'content', lang, value)} field="content" label="النص" multiline errors={errorsFor('part')} />
            <LanguageFields values={partText} onChange={(lang, value) => updateFields(setPartText, 'endingHook', lang, value)} field="endingHook" label="نهاية الجزء" multiline errors={errorsFor('part')} />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">رقم الجزء<input required type="number" min="1" value={partForm.partNumber} onChange={(event) => setPartForm({ ...partForm, partNumber: event.target.value })} className={inputClass} />
                {errorsFor('part').partNumber && <span className="mt-1 block text-xs text-red-700">{errorsFor('part').partNumber}</span>}
              </label>
              <label className="text-sm font-semibold">دقائق القراءة<input required type="number" min="1" max="120" value={partForm.estimatedReadingMinutes} onChange={(event) => setPartForm({ ...partForm, estimatedReadingMinutes: event.target.value })} className={inputClass} />
                {errorsFor('part').estimatedReadingMinutes && <span className="mt-1 block text-xs text-red-700">{errorsFor('part').estimatedReadingMinutes}</span>}
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={partForm.isFree} onChange={(event) => setPartForm({ ...partForm, isFree: event.target.checked })} /> جزء مجاني</label>
            <div className="flex flex-wrap gap-3">
              <button disabled={busy || !stories.length} className={submitClass}>{editingPartId ? 'حفظ التعديل' : 'إضافة الجزء'}</button>
              {editingPartId && <button type="button" onClick={() => {
                setEditingPartId(null);
                setPartText(emptyFields(['title', 'content', 'endingHook']));
                setFieldErrors({});
                setConflictingPart(null);
              }} className="rounded-full border border-emerald-950/15 px-5 py-3 font-bold">إلغاء</button>}
            </div>
          </form>
          <aside className="rounded-2xl bg-emerald-50/70 p-4">
            <h3 className="font-bold text-emerald-950">الأجزاء الموجودة</h3>
            {!partForm.storyId && <p className="mt-3 text-sm text-slate-600">اختر قصة لعرض أجزائها.</p>}
            {partForm.storyId && !selectedStory?.parts?.length && <p className="mt-3 text-sm text-slate-600">لا توجد أجزاء بعد.</p>}
            <ol className="mt-3 space-y-3">
              {[...(selectedStory?.parts || [])].sort((a, b) => a.partNumber - b.partNumber).map((part, index, parts) => <li key={part.id} className="rounded-xl border border-emerald-950/10 bg-white p-3">
                <p className="font-semibold">{part.partNumber}. {part.title}</p>
                <p className="mt-1 text-xs text-slate-500">{part.estimatedReadingMinutes} د · {part.isFree ? 'مجاني' : 'مميز'}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={() => editPart(part, selectedStory!.id)} className="font-bold text-emerald-800 underline">تعديل</button>
                  <button type="button" disabled={busy || index === 0} onClick={() => runPartAction(
                    () => api.post(`/admin/content/parts/${part.id}/move`, { direction: 'up' }),
                    'تم تغيير ترتيب الأجزاء.'
                  )} className="font-bold text-emerald-800 underline disabled:opacity-40">↑</button>
                  <button type="button" disabled={busy || index === parts.length - 1} onClick={() => runPartAction(
                    () => api.post(`/admin/content/parts/${part.id}/move`, { direction: 'down' }),
                    'تم تغيير ترتيب الأجزاء.'
                  )} className="font-bold text-emerald-800 underline disabled:opacity-40">↓</button>
                  <button type="button" disabled={busy} onClick={() => runPartAction(
                    () => api.post(`/admin/content/parts/${part.id}/duplicate`, {}),
                    'تم نسخ الجزء إلى نهاية القصة.'
                  )} className="font-bold text-emerald-800 underline">نسخ</button>
                  <button type="button" disabled={busy} onClick={() => {
                    if (window.confirm(translateText('هل تريد حذف هذا الجزء؟', locale as Language))) {
                      void runPartAction(
                        () => api.delete(`/admin/content/parts/${part.id}`),
                        'تم حذف الجزء.'
                      );
                    }
                  }} className="font-bold text-red-700 underline">حذف</button>
                </div>
              </li>)}
            </ol>
          </aside>
        </div>
      </section>}

      {isBookForm && <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-emerald-950">{bookId ? 'تعديل الكتاب' : pendingBookId ? 'استكمال رفع ملف PDF' : 'إضافة كتاب بلغاته'}</h2>
        <form onChange={() => setHasUnsavedChanges(true)} onSubmit={saveBook} className="space-y-5">
          <LanguageFields values={bookText} onChange={(lang, value) => updateFields(setBookText, 'title', lang, value)} field="title" label="عنوان الكتاب" disabled={bookDraftLocked} errors={errorsFor('book')} />
          <LanguageFields values={bookText} onChange={(lang, value) => updateFields(setBookText, 'description', lang, value)} field="description" label="الوصف" multiline disabled={bookDraftLocked} errors={errorsFor('book')} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">الرابط المختصر<input required disabled={bookDraftLocked} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={bookForm.slug} onChange={(event) => setBookForm({ ...bookForm, slug: event.target.value })} dir="ltr" className={inputClass} /><FieldError errors={errorsFor('book')} field="slug" /></label>
            <label className="text-sm font-semibold">النوع<select disabled={bookDraftLocked} value={bookForm.format} onChange={(event) => setBookForm({ ...bookForm, format: event.target.value })} className={selectClass}><option value="ebook">إلكتروني</option><option value="print">ورقي</option></select><FieldError errors={errorsFor('book')} field="format" /></label>
            <label className="text-sm font-semibold">السعر<input required disabled={bookDraftLocked} type="number" min="0" step="0.01" value={bookForm.price} onChange={(event) => setBookForm({ ...bookForm, price: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('book')} field="price" /></label>
            <label className="text-sm font-semibold">العملة<input required disabled={bookDraftLocked} minLength={3} maxLength={3} value={bookForm.currency} onChange={(event) => setBookForm({ ...bookForm, currency: event.target.value.toUpperCase() })} className={inputClass} /><FieldError errors={errorsFor('book')} field="currency" /></label>
            {bookForm.format === 'print' && <label className="text-sm font-semibold">المخزون<input required disabled={bookDraftLocked} type="number" min="0" value={bookForm.stockQuantity} onChange={(event) => setBookForm({ ...bookForm, stockQuantity: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('book')} field="stockQuantity" /></label>}
          </div>
          {bookForm.format === 'ebook' && <label className="block text-sm font-semibold">ملف الكتاب الإلكتروني (PDF)<input key={fileInputKey} type="file" accept="application/pdf,.pdf" onChange={(event) => setBookFile(event.target.files?.[0] || null)} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2`} /><span className="mt-1 block text-xs font-normal text-slate-500">{bookHasPdf ? 'يمكنك اختيار ملف جديد لاستبدال PDF الحالي.' : 'يمكن حفظ الكتاب كمسودة وإرفاق PDF لاحقًا.'} يُرفع الملف إلى التخزين الخاص، ولا يُتاح إلا بعد الشراء.</span>
            {(errorsFor('book').file || errorsFor('book').mimeType) && <span className="mt-1 block text-xs text-red-700">{errorsFor('book').file || errorsFor('book').mimeType}</span>}
          </label>}
          {pendingBookId && !bookHasPdf && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">تم حفظ مسودة الكتاب رقم {pendingBookId}. أعد اختيار ملف PDF لإكمال الرفع.</p>}
          <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={bookForm.isPublished} onChange={(event) => setBookForm({ ...bookForm, isPublished: event.target.checked })} /> نشر الكتاب الآن<FieldError errors={errorsFor('book')} field="isPublished" /></label>
          <button disabled={busy || bookForm.format === 'ebook' && bookForm.isPublished && !bookFile && !bookHasPdf} className={submitClass}>{translateText(bookId ? 'حفظ التعديلات' : 'حفظ الكتاب', locale as Language)}</button>
        </form>
      </section>}
  </main>;
  return translateTree(content, locale as Language);
}
