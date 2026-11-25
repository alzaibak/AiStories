import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { ApiError, api } from '@/lib/api';
import { FormErrorSummary, LanguageErrorDot } from '@/lib/adminFormErrors';
import { translateText, translateTree } from '@/lib/localization';
import { slugFromTitle } from '@/lib/slug';
import { StoryImagesEditor, emptyStoryImages, type StoryImageValue } from './StoryImagesEditor';

type Language = 'ar' | 'en' | 'fr';
type LocalizedFields = Record<Language, Record<string, string>>;
type LocalizedAlt = Record<Language, string>;
type Collection = {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  isFree?: boolean;
  isActive?: boolean;
  coverImage?: string | null;
  bannerImage?: string | null;
  coverAlt?: Partial<LocalizedAlt> | null;
  bannerAlt?: Partial<LocalizedAlt> | null;
  focalPoint?: { x: number; y: number } | null;
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
  illustrationImage?: string | null;
  illustrationAlt?: Partial<LocalizedAlt> | null;
};
type Story = {
  id: number;
  title: string;
  summary?: string;
  slug: string;
  status: string;
  publishedAt?: string | null;
  rejectionReason?: string | null;
  collectionId?: number;
  type?: string;
  sourceBadge?: string;
  sourceReferences?: Array<{ reference: string }>;
  reviewChecklist?: {
    sourcesProvided?: boolean;
    reviewedBy?: string;
    reviewedAt?: string | null;
    representationConfirmed?: boolean;
  };
  isFree?: boolean;
  coverImage?: string | null;
  heroImage?: string | null;
  socialImage?: string | null;
  coverAlt?: Partial<Record<Language, string>>;
  coverVariants?: Array<{ width: number; url: string }>;
  focalPoint?: { x: number; y: number } | null;
  imageCredit?: string | null;
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
  isReturnable?: boolean;
  returnWindowDays?: number | null;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string | null;
  fileStorageKey: string | null;
  previewFileKey?: string | null;
  cover?: string | null;
  coverAlt?: Partial<LocalizedAlt> | null;
  weightGrams?: number | null;
  isbn?: string | null;
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
const storyStatusLabels: Record<Language, Record<string, string>> = {
  ar: { draft: 'مسودة', in_review: 'قيد المراجعة', published: 'منشورة', rejected: 'مرفوضة', archived: 'مؤرشفة' },
  en: { draft: 'Draft', in_review: 'In review', published: 'Published', rejected: 'Rejected', archived: 'Archived' },
  fr: { draft: 'Brouillon', in_review: 'En révision', published: 'Publiée', rejected: 'Rejetée', archived: 'Archivée' }
};

const storyEditorCopy = {
  ar: {
    basicsTitle: 'المعلومات الأساسية',
    basicsHint: 'العنوان والملخص والمجموعة والرابط العام. ابدأ من هنا.',
    imagesTitle: 'صور القصة',
    imagesHint: 'ارفع صورة الغلاف أولًا، ثم البانر إن أردت. المعاينة لا تُحفظ تلقائيًا.',
    imagesAfterSave: 'بعد رفع الصور اضغط «حفظ المسودة» في الأسفل لتثبيتها.',
    sourceTitle: 'المصدر والمراجعة',
    sourceHint: 'هذه المعلومات مطلوبة قبل إرسال القصة للمراجعة.',
    accessTitle: 'الوصول',
    accessHint: 'حدّد هل تُقرأ القصة مجانًا أم تحتاج اشتراكًا.',
    slugLabel: 'الرابط المختصر (slug)',
    slugHelp: 'هو الجزء الأخير من رابط الصفحة العامة، مثل companionship-in-the-cave. استخدم أحرفًا لاتينية صغيرة وأرقامًا وشرطات فقط.',
    slugLocked: 'لا يمكن تغيير الرابط بعد أول نشر لأنه قد يكون محفوظًا لدى القرّاء ومحركات البحث.',
    publicLink: 'الرابط العام',
    sidebarTitle: 'ملخص القصة',
    readyTitle: 'جاهزية النشر',
    relatedTitle: 'أدوات مرتبطة',
    parts: 'الأجزاء',
    quizzes: 'الاختبارات',
    video: 'الفيديو',
    unsaved: 'توجد تعديلات غير محفوظة',
    saved: 'كل التعديلات محفوظة',
    readyCount: 'مكتمل',
    checkTitle: 'العنوان العربي',
    checkSummary: 'الملخص العربي',
    checkCollection: 'المجموعة',
    checkSlug: 'الرابط المختصر',
    checkCover: 'صورة الغلاف',
    checkSource: 'مرجع المصدر',
    checkSourcesChecked: 'التحقق من المصادر',
    checkReview: 'بيانات المراجعة',
    checkRepresentation: 'سياسة التمثيل',
    checkParts: 'جزء واحد على الأقل'
  },
  en: {
    basicsTitle: 'Story details',
    basicsHint: 'Title, summary, collection and public link. Start here.',
    imagesTitle: 'Story images',
    imagesHint: 'Upload the cover first, then an optional banner. Previews are not saved automatically.',
    imagesAfterSave: 'After uploading, click “Save draft” at the bottom to keep these images.',
    sourceTitle: 'Source and review',
    sourceHint: 'These details are required before the story can be sent for review.',
    accessTitle: 'Access',
    accessHint: 'Choose whether the story is free or requires a subscription.',
    slugLabel: 'Public slug',
    slugHelp: 'The slug is the readable end of the public link, for example companionship-in-the-cave. Use lowercase Latin letters, numbers and hyphens.',
    slugLocked: 'It cannot be changed after the first publication because readers and search engines may already use it.',
    publicLink: 'Public link',
    sidebarTitle: 'Story summary',
    readyTitle: 'Publication readiness',
    relatedTitle: 'Related tools',
    parts: 'Parts',
    quizzes: 'Quizzes',
    video: 'Video',
    unsaved: 'You have unsaved changes',
    saved: 'All changes are saved',
    readyCount: 'complete',
    checkTitle: 'Arabic title',
    checkSummary: 'Arabic summary',
    checkCollection: 'Collection',
    checkSlug: 'Public slug',
    checkCover: 'Cover image',
    checkSource: 'Source reference',
    checkSourcesChecked: 'Sources verified',
    checkReview: 'Review details',
    checkRepresentation: 'Depiction policy',
    checkParts: 'At least one part'
  },
  fr: {
    basicsTitle: 'Informations principales',
    basicsHint: 'Titre, résumé, collection et lien public. Commencez ici.',
    imagesTitle: 'Images de l’histoire',
    imagesHint: 'Téléversez d’abord la couverture, puis une bannière si besoin. L’aperçu n’est pas enregistré automatiquement.',
    imagesAfterSave: 'Après le téléversement, cliquez sur « Enregistrer le brouillon » en bas pour conserver les images.',
    sourceTitle: 'Source et relecture',
    sourceHint: 'Ces informations sont obligatoires avant l’envoi en relecture.',
    accessTitle: 'Accès',
    accessHint: 'Choisissez si l’histoire est gratuite ou réservée aux abonnés.',
    slugLabel: 'Lien court (slug)',
    slugHelp: 'Le slug est la fin lisible du lien public, par exemple companionship-in-the-cave. Utilisez des minuscules latines, des chiffres et des tirets.',
    slugLocked: 'Il ne peut plus être modifié après la première publication, car des lecteurs et des moteurs de recherche peuvent déjà l’utiliser.',
    publicLink: 'Lien public',
    sidebarTitle: 'Résumé de l’histoire',
    readyTitle: 'Prêt pour publication',
    relatedTitle: 'Outils liés',
    parts: 'Parties',
    quizzes: 'Quiz',
    video: 'Vidéo',
    unsaved: 'Modifications non enregistrées',
    saved: 'Toutes les modifications sont enregistrées',
    readyCount: 'terminé',
    checkTitle: 'Titre arabe',
    checkSummary: 'Résumé arabe',
    checkCollection: 'Collection',
    checkSlug: 'Lien public',
    checkCover: 'Image de couverture',
    checkSource: 'Référence de la source',
    checkSourcesChecked: 'Sources vérifiées',
    checkReview: 'Détails de relecture',
    checkRepresentation: 'Politique de représentation',
    checkParts: 'Au moins une partie'
  }
} as const;

function LanguageFields({
  values,
  onChange,
  field,
  fieldPrefix = 'translations',
  errors = {},
  label,
  multiline = false,
  disabled = false,
  activeLanguage,
  onActiveLanguageChange
}: {
  values: LocalizedFields;
  onChange: (language: Language, value: string) => void;
  field: string;
  fieldPrefix?: string;
  errors?: Record<string, string>;
  label: string;
  multiline?: boolean;
  disabled?: boolean;
  activeLanguage?: Language;
  onActiveLanguageChange?: (language: Language) => void;
}) {
  const [localLanguage, setLocalLanguage] = useState<Language>('ar');
  const selectedLanguage = activeLanguage || localLanguage;
  const activeLabel = languages.find(({ code }) => code === selectedLanguage)?.label;
  const fieldId = useId();
  const errorKey = (code: Language) => `${fieldPrefix}.${code}.${field}`;
  const counts = {
    ar: errors[errorKey('ar')] || (field === 'title' ? errors.title : '') ? 1 : 0,
    en: errors[errorKey('en')] ? 1 : 0,
    fr: errors[errorKey('fr')] ? 1 : 0
  };
  const errorSignature = languages.map(({ code }) => errors[errorKey(code)] || '').join('|');
  useEffect(() => {
    const first = languages.find(({ code }) => counts[code])?.code;
    if (first && first !== selectedLanguage) {
      setLocalLanguage(first);
      onActiveLanguageChange?.(first);
    }
    // React only to the validation result, not to every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorSignature]);
  return <div>
    <div role="tablist" aria-label={`${label} — ${activeLabel}`} className="mb-3 flex gap-2 border-b border-emerald-950/10">
      {languages.map(({ code, label: languageLabel }) => <button
        key={code}
        type="button"
        role="tab"
        id={`${fieldId}-${code}-tab`}
        aria-selected={selectedLanguage === code}
        aria-controls={`${fieldId}-${code}-panel`}
        onClick={() => {
          setLocalLanguage(code);
          onActiveLanguageChange?.(code);
        }}
        className={`border-b-2 px-3 py-2 text-sm font-bold ${selectedLanguage === code ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-slate-500'}`}
      >{languageLabel}{code === 'ar' ? ' *' : ''}<LanguageErrorDot count={counts[code]} /></button>)}
    </div>
    {languages.filter(({ code }) => code === selectedLanguage).map(({ code, label: languageLabel }) => <div key={code} role="tabpanel" id={`${fieldId}-${code}-panel`} aria-labelledby={`${fieldId}-${code}-tab`}>
      <label className="block text-sm font-semibold text-slate-700">
      {label} — {languageLabel}
      {multiline
        ? <textarea required={code === 'ar'} disabled={disabled} rows={code === 'ar' ? 5 : 4} value={values[code][field] || ''} onChange={(event) => onChange(code, event.target.value)} dir={code === 'ar' ? 'rtl' : 'ltr'} data-field={errorKey(code)} aria-invalid={Boolean(errors[errorKey(code)])} className={`mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50 ${errors[errorKey(code)] ? 'border-red-500 bg-red-50/40' : 'border-emerald-950/15'}`} />
        : <input required={code === 'ar'} disabled={disabled} value={values[code][field] || ''} onChange={(event) => onChange(code, event.target.value)} dir={code === 'ar' ? 'rtl' : 'ltr'} data-field={errorKey(code)} aria-invalid={Boolean(errors[errorKey(code)])} className={`mt-2 w-full rounded-xl border px-3 py-2.5 font-normal disabled:bg-slate-50 ${errors[errorKey(code)] ? 'border-red-500 bg-red-50/40' : 'border-emerald-950/15'}`} />}
      {errors[errorKey(code)] && <span className="mt-1 block text-xs text-red-700">{errors[errorKey(code)]}</span>}
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

const emptyAlt = (): LocalizedAlt => ({ ar: '', en: '', fr: '' });

function localizedAltOrUndefined(alt: LocalizedAlt) {
  return Object.values(alt).some((value) => value.trim()) ? alt : undefined;
}

function storyImagesPayload(images: StoryImageValue) {
  const coverImage = images.coverImage.trim() || null;
  return {
    cover: coverImage,
    coverImage,
    heroImage: images.heroImage.trim() || null,
    socialImage: images.socialImage.trim() || null,
    coverAlt: localizedAltOrUndefined(images.coverAlt),
    coverVariants: images.coverVariants.filter((variant) => variant.url.trim() && variant.width > 0),
    focalPoint: images.focalPoint,
    imageCredit: images.imageCredit.trim()
  };
}

function AdminImageField({ label, hint, value, alt, ratio, role, onChange, onAltChange, disabled = false }: {
  label: string;
  hint?: string;
  value: string;
  alt: LocalizedAlt;
  ratio: '3:4' | '16:9' | '1:1';
  role: 'cover' | 'hero';
  onChange: (value: string) => void;
  onAltChange: (value: LocalizedAlt) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [altLanguage, setAltLanguage] = useState<Language>('ar');
  const ratioClass = ratio === '3:4' ? 'aspect-[3/4] max-w-[15rem]' : ratio === '1:1' ? 'aspect-square max-w-[18rem]' : 'aspect-video';

  async function upload(file: File | null) {
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('JPG أو PNG أو WebP، بحد أقصى 5 م.ب.');
      return;
    }
    setBusy(true);
    try {
      const uploaded = await api.uploadFile<{ url: string }>('/admin/content/images', file, { role });
      onChange(uploaded.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رفع الصورة.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return <div className="rounded-2xl border border-emerald-950/10 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="font-bold text-emerald-950">{label}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</div>
      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{ratio}</span>
    </div>
    <div className={`mt-3 overflow-hidden rounded-xl border border-emerald-950/10 bg-[#123b30] ${ratioClass}`}>
      {value ? <img src={value} alt={alt.ar} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="grid h-full min-h-28 place-items-center text-sm text-white/70">لا توجد صورة</div>}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy || disabled} onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'جارٍ الرفع…' : value ? 'استبدال الصورة' : 'رفع صورة'}</button>
      {value && <button type="button" disabled={busy || disabled} onClick={() => onChange('')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">إزالة</button>}
      <span className="text-[11px] text-slate-500">JPG / PNG / WebP · 5 م.ب</span>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0] || null)} />
    </div>
    {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">{error}</p>}
    <div className="mt-3" role="tablist" aria-label={`${label} — النص البديل`}>
      <div className="flex gap-1 border-b border-emerald-950/10 pb-2">
        {languages.map(({ code, label: languageLabel }) => <button key={code} type="button" role="tab" aria-selected={altLanguage === code} onClick={() => setAltLanguage(code)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${altLanguage === code ? 'bg-emerald-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{languageLabel}</button>)}
      </div>
      <label className="mt-2 block text-xs font-semibold text-slate-600">النص البديل — {languages.find(({ code }) => code === altLanguage)?.label}
        <input value={alt[altLanguage]} onChange={(event) => onAltChange({ ...alt, [altLanguage]: event.target.value })} dir={altLanguage === 'ar' ? 'rtl' : 'ltr'} maxLength={300} disabled={disabled} placeholder="صف الصورة دون ذكر وجوه أو أشخاص" className="mt-1 w-full rounded-lg border border-emerald-950/15 px-3 py-2 text-sm font-normal" />
      </label>
    </div>
  </div>;
}

function StorySectionHeader({ number, title, hint }: { number: string; title: string; hint: string }) {
  return <div className="flex items-start gap-3">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-900 text-sm font-black text-white">{number}</span>
    <div><h3 className="text-lg font-extrabold text-emerald-950">{title}</h3><p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p></div>
  </div>;
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
  const [collectionImages, setCollectionImages] = useState({
    coverImage: '', bannerImage: '', coverAlt: emptyAlt(), bannerAlt: emptyAlt()
  });
  const [storyText, setStoryText] = useState(emptyFields(['title', 'summary']));
  const [storyForm, setStoryForm] = useState({ collectionId: '', slug: '', type: 'history', sourceBadge: 'historical_source', sourceReference: '', isFree: false });
  const [storyImages, setStoryImages] = useState<StoryImageValue>(emptyStoryImages);
  const [reviewChecklist, setReviewChecklist] = useState({
    sourcesProvided: false,
    reviewedBy: '',
    reviewedAt: '',
    representationConfirmed: false
  });
  const [partText, setPartText] = useState(emptyFields(['title', 'content', 'endingHook']));
  const [partImage, setPartImage] = useState({ illustrationImage: '', illustrationAlt: emptyAlt() });
  const [partForm, setPartForm] = useState({ storyId: '', partNumber: '1', estimatedReadingMinutes: '5', isFree: false });
  const [partLanguage, setPartLanguage] = useState<Language>('ar');
  const [editingPartId, setEditingPartId] = useState<number | null>(null);
  const [highlightedPartId, setHighlightedPartId] = useState<number | null>(null);
  const [bookText, setBookText] = useState(emptyFields(['title', 'description']));
  const [bookForm, setBookForm] = useState({ slug: '', format: 'ebook', price: '', currency: 'EUR', stockQuantity: '', isPublished: false, isReturnable: true, returnWindowDays: '', cover: '', weightGrams: '', isbn: '', previewFileKey: '' });
  const [bookCoverAlt, setBookCoverAlt] = useState<LocalizedAlt>(emptyAlt);
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
    setCollectionImages({
      coverImage: collection.coverImage || '',
      bannerImage: collection.bannerImage || '',
      coverAlt: { ...emptyAlt(), ...collection.coverAlt },
      bannerAlt: { ...emptyAlt(), ...collection.bannerAlt }
    });
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
      isPublished: book.status === 'published',
      isReturnable: book.isReturnable !== false,
      returnWindowDays: book.returnWindowDays == null ? '' : String(book.returnWindowDays),
      cover: book.cover || '',
      weightGrams: book.weightGrams == null ? '' : String(book.weightGrams),
      isbn: book.isbn || '',
      previewFileKey: book.previewFileKey || ''
    });
    setBookCoverAlt({ ar: book.coverAlt?.ar || '', en: book.coverAlt?.en || '', fr: book.coverAlt?.fr || '' });
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
      setStoryImages({
        coverImage: story.coverImage || '',
        heroImage: story.heroImage || '',
        socialImage: story.socialImage || '',
        coverAlt: { ar: story.coverAlt?.ar || '', en: story.coverAlt?.en || '', fr: story.coverAlt?.fr || '' },
        coverVariants: story.coverVariants || [],
        focalPoint: story.focalPoint || { x: 50, y: 40 },
        imageCredit: story.imageCredit || ''
      });
      setReviewChecklist({
        sourcesProvided: Boolean(story.reviewChecklist?.sourcesProvided),
        reviewedBy: story.reviewChecklist?.reviewedBy || '',
        reviewedAt: story.reviewChecklist?.reviewedAt ? new Date(story.reviewChecklist.reviewedAt).toISOString().slice(0, 10) : '',
        representationConfirmed: Boolean(story.reviewChecklist?.representationConfirmed)
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
        isReturnable: bookForm.format === 'print' ? bookForm.isReturnable : false,
        ...(bookForm.cover.trim() ? { cover: bookForm.cover.trim(), coverAlt: bookCoverAlt } : { cover: null }),
        ...(bookForm.format === 'print' && bookForm.weightGrams ? { weightGrams: Number(bookForm.weightGrams) } : {}),
        ...(bookForm.format === 'print' && bookForm.isbn.trim() ? { isbn: bookForm.isbn.trim() } : {}),
        ...(bookForm.previewFileKey.trim() ? { previewFileKey: bookForm.previewFileKey.trim() } : {}),
        returnWindowDays: bookForm.format === 'print' && bookForm.returnWindowDays
          ? Number(bookForm.returnWindowDays)
          : null
      };
      let targetBookId = bookId ? Number(bookId) : pendingBookId;
      if (bookForm.format === 'ebook') {
        if (bookForm.isPublished && !bookFile && !bookHasPdf) {
          throw new Error(translateText('أضف ملف PDF للكتاب الإلكتروني.', locale as Language));
        }
        if (targetBookId) {
          await api.patch(`/admin/content/books/${targetBookId}`, details);
        } else {
          const created = await api.post<{ id: number }>('/admin/content/books', details);
          targetBookId = created.id;
          setPendingBookId(targetBookId);
        }
        if (bookFile) {
          await uploadBookPdf(targetBookId, bookFile);
          setBookHasPdf(true);
        }
      } else {
        if (targetBookId) await api.patch(`/admin/content/books/${targetBookId}`, details);
        else {
          const created = await api.post<{ id: number }>('/admin/content/books', details);
          targetBookId = created.id;
        }
      }
      if (!targetBookId) throw new Error(translateText('Impossible d’enregistrer le livre.', locale as Language));
      const currentBook = books.find((book) => book.id === targetBookId);
      if (bookForm.isPublished && currentBook?.status !== 'published') {
        await api.post(`/admin/content/books/${targetBookId}/publish`, {});
      } else if (!bookForm.isPublished && currentBook?.status === 'published') {
        await api.post(`/admin/content/books/${targetBookId}/unpublish`, {});
      }
      if (bookForm.format === 'ebook' && !bookFile && !bookHasPdf && !bookForm.isPublished) return;
      setPendingBookId(null);
      setBookHasPdf(false);
      setBookFile(null);
      setFileInputKey((key) => key + 1);
      setBookText(emptyFields(['title', 'description']));
      setBookForm({ slug: '', format: 'ebook', price: '', currency: 'EUR', stockQuantity: '', isPublished: false, isReturnable: true, returnWindowDays: '', cover: '', weightGrams: '', isbn: '', previewFileKey: '' });
      setBookCoverAlt(emptyAlt());
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
    setPartImage({
      illustrationImage: part.illustrationImage || '',
      illustrationAlt: { ...emptyAlt(), ...part.illustrationAlt }
    });
    setEditingPartId(part.id);
    setFieldErrors({});
    setConflictingPart(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function runPartAction<T>(action: () => Promise<T>, successMessage: string, onComplete?: (result: T) => void) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setFieldErrorScope('part');
    setConflictingPart(null);
    setNotice(null);
    try {
      const result = await action();
      await loadContent();
      setNotice(successMessage);
      onComplete?.(result);
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

  async function storyTransition(action: 'submit' | 'approve' | 'reject' | 'return' | 'unpublish') {
    if (!storyId) return;
    if (hasUnsavedChanges) {
      setError(translateText('احفظ التعديلات قبل تغيير الحالة.', locale as Language));
      return;
    }
    let comments = '';
    if (action === 'reject') {
      comments = window.prompt(translateText('أدخل سبب الرفض الإلزامي.', locale as Language))?.trim() || '';
      if (!comments) return;
    }
    if (action === 'unpublish' && !window.confirm(translateText('إزالة القصة من الموقع العام؟', locale as Language))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === 'submit') {
        await api.post(`/admin/content/stories/${storyId}/submit-review`, {});
      } else if (action === 'approve' || action === 'reject' || action === 'return') {
        await api.post(`/admin/content/stories/${storyId}/review`, {
          decision: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'return_to_draft',
          comments
        });
      } else {
        await api.post(`/admin/content/stories/${storyId}/unpublish`, {});
      }
      await loadContent();
      setNotice(translateText('تم تحديث حالة القصة.', locale as Language));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : translateText('Impossible de changer le statut.', locale as Language));
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5';
  const selectClass = 'mt-2 w-full rounded-xl border border-emerald-950/15 bg-white px-3 py-2.5';
  const submitClass = 'rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50';
  const selectedStory = stories.find((story) => String(story.id) === partForm.storyId);
  const editingStory = stories.find((story) => String(story.id) === storyId);
  const editingBook = books.find((book) => String(book.id) === bookId);
  const isPublisher = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const copy = storyEditorCopy[locale as Language] || storyEditorCopy.ar;
  const storyReadyItems = [
    { label: copy.checkTitle, done: Boolean(storyText.ar.title.trim()) },
    { label: copy.checkSummary, done: Boolean(storyText.ar.summary.trim()) },
    { label: copy.checkCollection, done: Boolean(storyForm.collectionId) },
    { label: copy.checkSlug, done: Boolean(storyForm.slug.trim()) },
    { label: copy.checkCover, done: Boolean(storyImages.coverImage) },
    { label: copy.checkSource, done: Boolean(storyForm.sourceReference.trim()) },
    { label: copy.checkSourcesChecked, done: reviewChecklist.sourcesProvided },
    { label: copy.checkReview, done: Boolean(reviewChecklist.reviewedBy.trim() && reviewChecklist.reviewedAt) },
    { label: copy.checkRepresentation, done: reviewChecklist.representationConfirmed },
    { label: copy.checkParts, done: Boolean(editingStory?.parts?.length) }
  ];
  const storyReadyCount = storyReadyItems.filter((item) => item.done).length;
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
      {(isStoryForm || isPartForm) && <nav aria-label={translateText('أقسام محرر القصة', locale as Language)} className="sticky top-0 z-20 -mx-2 flex flex-wrap gap-2 border-b border-emerald-950/10 bg-[#f7f6f0]/95 px-2 py-2 backdrop-blur">
        <Link aria-current={isStoryForm ? 'page' : undefined} to={storyEditorBase ? `${storyEditorBase}/edit` : `/${locale}/admin/content/stories/new`} className={`rounded-t-xl px-4 py-2 text-sm font-bold ${isStoryForm ? 'bg-white text-emerald-900' : 'text-slate-500'}`}>{translateText('عام', locale as Language)}</Link>
        {storyEditorBase ? <Link aria-current={isPartForm ? 'page' : undefined} to={`${storyEditorBase}/parts/new`} className={`rounded-t-xl px-4 py-2 text-sm font-bold ${isPartForm ? 'bg-white text-emerald-900' : 'text-slate-500'}`}>{translateText('الأجزاء', locale as Language)}</Link> : <button type="button" disabled className="rounded-t-xl px-4 py-2 text-sm font-bold text-slate-400">{translateText('الأجزاء', locale as Language)}</button>}
        {storyEditorBase
          ? <Link to={`/${locale}/admin/content/quizzes/new?storyId=${storyId}`} className="rounded-t-xl bg-white px-4 py-2 text-sm font-bold text-emerald-900">{translateText('الاختبارات', locale as Language)}</Link>
          : <button type="button" disabled className="rounded-t-xl px-4 py-2 text-sm font-bold text-slate-400">{translateText('الاختبارات', locale as Language)} · {translateText('احفظ القصة أولًا', locale as Language)}</button>}
        {storyEditorBase && <Link to={`/${locale}/admin/content/videos?storyId=${storyId}`} className="rounded-t-xl bg-white px-4 py-2 text-sm font-bold text-emerald-900">{translateText('الفيديو', locale as Language)}</Link>}
        {isStoryForm && <a href="#story-images" className="rounded-t-xl bg-white px-4 py-2 text-sm font-bold text-emerald-900">{translateText('الصور', locale as Language)}</a>}
        <a href="#source-review-checklist" className="rounded-t-xl bg-white px-4 py-2 text-sm font-bold text-emerald-900">{translateText('المصدر والمراجعة', locale as Language)}</a>
        <a href="#access-pricing" className="rounded-t-xl bg-white px-4 py-2 text-sm font-bold text-emerald-900">{translateText('الوصول والأسعار', locale as Language)}</a>
      </nav>}
      {loadError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{loadError}</p>}
      {Object.keys(fieldErrors).length > 0 && <FormErrorSummary
        errors={Object.entries(fieldErrors).map(([field, message]) => ({ field, code: 'invalid', message }))}
        message={error || undefined}
        language={locale as Language}
      />}
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
            coverImage: collectionImages.coverImage || null,
            bannerImage: collectionImages.bannerImage || null,
            coverAlt: localizedAltOrUndefined(collectionImages.coverAlt),
            bannerAlt: localizedAltOrUndefined(collectionImages.bannerAlt),
            translations: languageRecord(collectionTitle),
            ...(collectionId ? {} : { sortOrder: collections.length })
          };
          if (collectionId) await api.patch(`/admin/content/collections/${collectionId}`, payload);
          else await api.post('/admin/content/collections', { ...payload, isFree: false });
          }, 'تم إنشاء المجموعة باللغات التي أدخلتها.', 'collection');
          if (saved) navigate(`/${locale}/admin/content/collections`);
        }} className="space-y-5">
          <LanguageFields values={collectionTitle} onChange={(lang, value) => {
            const previous = slugFromTitle(collectionTitle.en.title || collectionTitle.ar.title);
            updateFields(setCollectionTitle, 'title', lang, value);
            const preferredTitle = lang === 'en' ? value : collectionTitle.en.title || (lang === 'ar' ? value : collectionTitle.ar.title);
            const suggested = slugFromTitle(preferredTitle);
            if (!collectionId && suggested && (!collectionSlug || collectionSlug === previous)) setCollectionSlug(suggested);
          }} field="title" label="عنوان المجموعة" errors={errorsFor('collection')} />
          <LanguageFields values={collectionTitle} onChange={(lang, value) => updateFields(setCollectionTitle, 'description', lang, value)} field="description" label="الوصف" multiline errors={errorsFor('collection')} />
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminImageField label="غلاف المجموعة" hint="يستخدم في بطاقات المجموعات وشبكات التصفح (3:4)." value={collectionImages.coverImage} alt={collectionImages.coverAlt} ratio="3:4" role="cover" onChange={(value) => setCollectionImages((current) => ({ ...current, coverImage: value }))} onAltChange={(coverAlt) => setCollectionImages((current) => ({ ...current, coverAlt }))} disabled={busy} />
            <AdminImageField label="بانر المجموعة" hint="يظهر أعلى صفحة المجموعة (16:9)." value={collectionImages.bannerImage} alt={collectionImages.bannerAlt} ratio="16:9" role="hero" onChange={(value) => setCollectionImages((current) => ({ ...current, bannerImage: value }))} onAltChange={(bannerAlt) => setCollectionImages((current) => ({ ...current, bannerAlt }))} disabled={busy} />
          </div>
          <label className="block max-w-md text-sm font-semibold">الرابط المختصر (slug)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={collectionSlug} onChange={(event) => setCollectionSlug(event.target.value)} dir="ltr" className={inputClass} /><FieldError errors={errorsFor('collection')} field="slug" /></label>
          <p className="text-sm text-slate-600">{translateText('Aperçu de l’URL', locale as Language)}: <a className="font-semibold text-emerald-800 underline" dir="ltr" href={`${import.meta.env.VITE_CLIENT_URL || ''}/${locale}/collections/${collectionSlug}`}>{`/${locale}/collections/${collectionSlug || 'slug'}`}</a></p>
          <button disabled={busy} className={submitClass}>{translateText(collectionId ? 'حفظ التعديلات' : 'إنشاء المجموعة', locale as Language)}</button>
        </form>
      </section>}

      {isStoryForm && <section className="space-y-6">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
        {editingStory?.status === 'rejected' && editingStory.rejectionReason && <p role="status" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-900">{translateText('سبب الرفض', locale as Language)}: {editingStory.rejectionReason}</p>}
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
            ...storyImagesPayload(storyImages),
            reviewChecklist: {
              ...reviewChecklist,
              reviewedAt: reviewChecklist.reviewedAt ? new Date(`${reviewChecklist.reviewedAt}T00:00:00.000Z`).toISOString() : null
            },
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
          <section id="story-basics" className="scroll-mt-28 space-y-5">
            <StorySectionHeader number="1" title={copy.basicsTitle} hint={copy.basicsHint} />
            <LanguageFields values={storyText} onChange={(lang, value) => {
              const previousSuggestedSlug = slugFromTitle(storyText.en.title || storyText.ar.title);
              updateFields(setStoryText, 'title', lang, value);
              const preferredTitle = lang === 'en' ? value : storyText.en.title || (lang === 'ar' ? value : storyText.ar.title);
              const suggestedSlug = slugFromTitle(preferredTitle);
              if (!storyId && (!storyForm.slug || storyForm.slug === previousSuggestedSlug) && suggestedSlug) {
                setStoryForm((current) => ({ ...current, slug: suggestedSlug }));
              }
            }} field="title" label="عنوان القصة" errors={errorsFor('story')} />
            <LanguageFields values={storyText} onChange={(lang, value) => updateFields(setStoryText, 'summary', lang, value)} field="summary" label="الملخص" multiline errors={errorsFor('story')} />
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold">المجموعة<select required value={storyForm.collectionId} onChange={(event) => setStoryForm({ ...storyForm, collectionId: event.target.value })} className={selectClass}><option value="">اختر مجموعة</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select><FieldError errors={errorsFor('story')} field="collectionId" /></label>
              <label className="text-sm font-semibold">نوع القصة<select value={storyForm.type} onChange={(event) => setStoryForm({ ...storyForm, type: event.target.value })} className={selectClass}><option value="quran">قرآنية</option><option value="sunnah">من السنة</option><option value="history">تاريخية</option><option value="new">جديدة</option></select><FieldError errors={errorsFor('story')} field="type" /></label>
              <label className="text-sm font-semibold">نوع المصدر<select value={storyForm.sourceBadge} onChange={(event) => setStoryForm({ ...storyForm, sourceBadge: event.target.value })} className={selectClass}><option value="quran_verse">آية قرآنية</option><option value="authentic_hadith">حديث صحيح</option><option value="historical_source">مصدر تاريخي</option><option value="inspired_story">قصة مستوحاة</option></select><FieldError errors={errorsFor('story')} field="sourceBadge" /></label>
            </div>
            <div className="rounded-2xl border border-emerald-950/10 bg-[#f7f6f0] p-4">
              <label className="block text-sm font-semibold">
                {copy.slugLabel}
                <input required disabled={Boolean(editingStory?.publishedAt)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={storyForm.slug} onChange={(event) => setStoryForm({ ...storyForm, slug: event.target.value })} dir="ltr" className={inputClass} placeholder="companionship-in-the-cave" />
                <FieldError errors={errorsFor('story')} field="slug" />
              </label>
              <p className="mt-2 text-xs leading-5 text-slate-600">{copy.slugHelp}</p>
              {editingStory?.publishedAt && <p className="mt-2 text-xs font-semibold text-amber-800">{copy.slugLocked}</p>}
              <p className="mt-2 text-xs text-slate-600">{copy.publicLink}: <a className="font-semibold text-emerald-800 underline" dir="ltr" href={`${import.meta.env.VITE_CLIENT_URL || ''}/${locale}/histoires/${storyForm.slug}`}>{`/${locale}/histoires/${storyForm.slug || 'slug'}`}</a></p>
            </div>
          </section>

          <section id="story-images" className="scroll-mt-28 space-y-3 border-t border-emerald-950/10 pt-6">
            <StorySectionHeader number="2" title={copy.imagesTitle} hint={copy.imagesHint} />
            <StoryImagesEditor
              value={storyImages}
              onChange={(next) => { setStoryImages(next); setHasUnsavedChanges(true); }}
              title={storyText[locale as Language]?.title || storyText.ar.title}
              language={locale as Language}
            />
            <p className="text-xs font-semibold text-amber-800">{copy.imagesAfterSave}</p>
          </section>

          <section id="source-review-checklist" className="scroll-mt-28 space-y-4 rounded-2xl border border-emerald-950/10 bg-slate-50 p-5">
            <StorySectionHeader number="3" title={copy.sourceTitle} hint={copy.sourceHint} />
            <label className="text-sm font-semibold">مرجع المصدر<input value={storyForm.sourceReference} onChange={(event) => setStoryForm({ ...storyForm, sourceReference: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('story')} field="sourceReferences.0.reference" /></label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={reviewChecklist.sourcesProvided} onChange={(event) => setReviewChecklist({ ...reviewChecklist, sourcesProvided: event.target.checked })} /> {translateText('تم إدخال المصادر والتحقق منها', locale as Language)}</label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">{translateText('اسم المراجع', locale as Language)}<input value={reviewChecklist.reviewedBy} onChange={(event) => setReviewChecklist({ ...reviewChecklist, reviewedBy: event.target.value })} className={inputClass} /></label>
              <label className="text-sm font-semibold">{translateText('تاريخ المراجعة', locale as Language)}<input type="date" value={reviewChecklist.reviewedAt} onChange={(event) => setReviewChecklist({ ...reviewChecklist, reviewedAt: event.target.value })} className={inputClass} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={reviewChecklist.representationConfirmed} onChange={(event) => setReviewChecklist({ ...reviewChecklist, representationConfirmed: event.target.checked })} /> {translateText('تم احترام سياسة التمثيل والمراجعة', locale as Language)}</label>
          </section>

          <section id="access-pricing" className="scroll-mt-28 space-y-4 rounded-2xl border border-emerald-950/10 bg-white p-5">
            <StorySectionHeader number="4" title={copy.accessTitle} hint={copy.accessHint} />
            <label className="flex items-start justify-between gap-4 rounded-xl border border-emerald-950/10 bg-emerald-50/60 p-4 text-sm font-semibold">
              <span>قصة مجانية<span className="mt-1 block text-xs font-normal text-slate-600">{copy.accessHint}</span></span>
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={storyForm.isFree} onChange={(event) => setStoryForm({ ...storyForm, isFree: event.target.checked })} />
            </label>
          </section>
          <div className="flex flex-wrap gap-3 rounded-2xl border border-emerald-950/10 bg-[#f7f6f0] p-3">
            <button disabled={busy || !collections.length} className={submitClass}>{busy ? translateText('جارٍ الحفظ…', locale as Language) : translateText(storyId ? 'حفظ المسودة' : 'حفظ كمسودة', locale as Language)}</button>
            {storyId && <button type="button" onClick={() => navigate(`/${locale}/admin/content/stories/${storyId}/parts/new`)} className="rounded-full border border-emerald-950/15 px-5 py-3 font-bold">{translateText('إضافة جزء', locale as Language)}</button>}
            <button type="button" onClick={() => setPreviewVisible((visible) => !visible)} className="rounded-full border border-emerald-950/15 px-5 py-3 font-bold">{translateText(previewVisible ? 'إغلاق المعاينة' : 'معاينة', locale as Language)}</button>
          </div>
          {storyId && editingStory && <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold">{storyStatusLabels[locale as Language][editingStory.status] || editingStory.status}</span>
            {['draft', 'rejected'].includes(editingStory.status) && <button type="button" disabled={busy || hasUnsavedChanges} onClick={() => void storyTransition('submit')} className="rounded-full bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{translateText(editingStory.status === 'rejected' ? 'إعادة الإرسال للمراجعة' : 'إرسال للمراجعة', locale as Language)}</button>}
            {editingStory.status === 'in_review' && isPublisher && <>
              <button type="button" disabled={busy || hasUnsavedChanges} onClick={() => void storyTransition('approve')} className="rounded-full bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{translateText('اعتماد ونشر', locale as Language)}</button>
              <button type="button" disabled={busy || hasUnsavedChanges} onClick={() => void storyTransition('reject')} className="rounded-full bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{translateText('رفض', locale as Language)}</button>
              <button type="button" disabled={busy || hasUnsavedChanges} onClick={() => void storyTransition('return')} className="rounded-full border border-slate-300 px-4 py-2.5 text-sm font-bold disabled:opacity-50">{translateText('إعادة إلى المسودة', locale as Language)}</button>
            </>}
            {editingStory.status === 'published' && isPublisher && <button type="button" disabled={busy || hasUnsavedChanges} onClick={() => void storyTransition('unpublish')} className="rounded-full border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50">{translateText('إلغاء النشر', locale as Language)}</button>}
          </div>}
        </form>
        </div>
        <aside className="space-y-4 self-start xl:sticky xl:top-24">
          <div className="rounded-3xl border border-emerald-950/10 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{copy.sidebarTitle}</p>
            <div className="mt-3 flex gap-3">
              <div className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl bg-emerald-950">
                {storyImages.coverImage ? <img src={storyImages.coverImage} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center px-2 text-center text-[10px] text-white/70">{copy.checkCover}</div>}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-3 font-bold text-emerald-950">{storyText[locale as Language]?.title || storyText.ar.title || translateText('عنوان القصة', locale as Language)}</p>
                <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{storyStatusLabels[locale as Language][editingStory?.status || 'draft'] || editingStory?.status || 'draft'}</p>
                <p className={`mt-3 text-xs font-semibold ${hasUnsavedChanges ? 'text-amber-700' : 'text-emerald-700'}`}>{hasUnsavedChanges ? copy.unsaved : copy.saved}</p>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-950/10 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-emerald-950">{copy.readyTitle}</h3>
              <span className="text-xs font-bold text-slate-500">{storyReadyCount}/{storyReadyItems.length} {copy.readyCount}</span>
            </div>
            <ul className="mt-3 space-y-2">
              {storyReadyItems.map((item, index) => <li key={item.label} className="flex items-center gap-2 text-sm">
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${item.done ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'}`}>{item.done ? '✓' : index + 1}</span>
                <span className={item.done ? 'text-slate-700' : 'text-slate-500'}>{item.label}</span>
              </li>)}
            </ul>
          </div>
          {storyId && <div className="rounded-3xl border border-emerald-950/10 bg-white p-5">
            <h3 className="font-bold text-emerald-950">{copy.relatedTitle}</h3>
            <div className="mt-3 grid gap-2 text-sm font-semibold">
              <Link className="rounded-xl border border-emerald-950/10 px-3 py-2 text-emerald-800 hover:bg-emerald-50" to={`/${locale}/admin/content/stories/${storyId}/parts/new`}>{copy.parts}</Link>
              <Link className="rounded-xl border border-emerald-950/10 px-3 py-2 text-emerald-800 hover:bg-emerald-50" to={`/${locale}/admin/content/quizzes/new?storyId=${storyId}`}>{copy.quizzes}</Link>
              <Link className="rounded-xl border border-emerald-950/10 px-3 py-2 text-emerald-800 hover:bg-emerald-50" to={`/${locale}/admin/content/videos?storyId=${storyId}`}>{copy.video}</Link>
            </div>
          </div>}
        </aside>
        </div>
        {previewVisible && <div role="region" aria-label={translateText('معاينة', locale as Language)} className="rounded-2xl bg-slate-50 p-5">
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
            illustrationImage: partImage.illustrationImage || null,
            illustrationAlt: localizedAltOrUndefined(partImage.illustrationAlt),
            estimatedReadingMinutes: Number(partForm.estimatedReadingMinutes),
            isFree: partForm.isFree
            };
            if (editingPartId) {
              await api.patch(`/admin/content/parts/${editingPartId}`, payload);
            } else {
              await api.post(`/admin/content/stories/${partForm.storyId}/parts`, payload);
            }
            setPartText(emptyFields(['title', 'content', 'endingHook']));
            setPartImage({ illustrationImage: '', illustrationAlt: emptyAlt() });
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
            }} className={selectClass}><option value="">اختر قصة</option>{stories.map((story) => <option key={story.id} value={story.id}>{story.title} — {storyStatusLabels[locale as Language][story.status] || storyStatusLabels.en[story.status] || story.status}</option>)}</select><FieldError errors={errorsFor('part')} field="storyId" /></label>
            <LanguageFields values={partText} activeLanguage={partLanguage} onActiveLanguageChange={setPartLanguage} onChange={(lang, value) => updateFields(setPartText, 'title', lang, value)} field="title" label="عنوان الجزء" errors={errorsFor('part')} />
            <LanguageFields values={partText} activeLanguage={partLanguage} onActiveLanguageChange={setPartLanguage} onChange={(lang, value) => updateFields(setPartText, 'content', lang, value)} field="content" label="النص" multiline errors={errorsFor('part')} />
            <LanguageFields values={partText} activeLanguage={partLanguage} onActiveLanguageChange={setPartLanguage} onChange={(lang, value) => updateFields(setPartText, 'endingHook', lang, value)} field="endingHook" label="نهاية الجزء" multiline errors={errorsFor('part')} />
            <AdminImageField label="صورة الجزء" hint="اختيارية، تظهر أعلى نص الجزء في القارئ (16:9)." value={partImage.illustrationImage} alt={partImage.illustrationAlt} ratio="16:9" role="hero" onChange={(value) => setPartImage((current) => ({ ...current, illustrationImage: value }))} onAltChange={(illustrationAlt) => setPartImage((current) => ({ ...current, illustrationAlt }))} disabled={busy} />
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
                setPartImage({ illustrationImage: '', illustrationAlt: emptyAlt() });
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
              {[...(selectedStory?.parts || [])].sort((a, b) => a.partNumber - b.partNumber).map((part, index, parts) => <li key={part.id} className={`rounded-xl border p-3 transition-colors ${highlightedPartId === part.id ? 'border-emerald-700 bg-emerald-100 ring-2 ring-emerald-300' : 'border-emerald-950/10 bg-white'}`}>
                <p className="font-semibold">{part.partNumber}. {part.title}</p>
                <p className="mt-1 text-xs text-slate-500">{part.estimatedReadingMinutes} {locale === 'ar' ? 'د' : 'min'} · {part.isFree ? 'مجاني' : 'مميز'}</p>
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
                    () => api.post<Part>(`/admin/content/parts/${part.id}/duplicate`, {}),
                    'تم نسخ الجزء إلى نهاية القصة.',
                    (duplicate) => {
                      setHighlightedPartId(duplicate.id);
                      editPart(duplicate, selectedStory!.id);
                    }
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
          <LanguageFields values={bookText} onChange={(lang, value) => {
            const previous = slugFromTitle(bookText.en.title || bookText.ar.title);
            updateFields(setBookText, 'title', lang, value);
            const preferredTitle = lang === 'en' ? value : bookText.en.title || (lang === 'ar' ? value : bookText.ar.title);
            const suggested = slugFromTitle(preferredTitle);
            if (!bookDraftLocked && !bookId && suggested && (!bookForm.slug || bookForm.slug === previous)) {
              setBookForm((current) => ({ ...current, slug: suggested }));
            }
          }} field="title" label="عنوان الكتاب" disabled={bookDraftLocked} errors={errorsFor('book')} />
          <LanguageFields values={bookText} onChange={(lang, value) => updateFields(setBookText, 'description', lang, value)} field="description" label="الوصف" multiline disabled={bookDraftLocked} errors={errorsFor('book')} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">الرابط المختصر<input required disabled={bookDraftLocked || Boolean(editingBook?.publishedAt)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={bookForm.slug} onChange={(event) => setBookForm({ ...bookForm, slug: event.target.value })} dir="ltr" className={inputClass} /><FieldError errors={errorsFor('book')} field="slug" /></label>
            <label className="text-sm font-semibold">النوع<select disabled={bookDraftLocked} value={bookForm.format} onChange={(event) => setBookForm({ ...bookForm, format: event.target.value })} className={selectClass}><option value="ebook">إلكتروني</option><option value="print">ورقي</option></select><FieldError errors={errorsFor('book')} field="format" /></label>
            <label className="text-sm font-semibold">السعر<input required disabled={bookDraftLocked} type="number" min="0" step="0.01" value={bookForm.price} onChange={(event) => setBookForm({ ...bookForm, price: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('book')} field="price" /></label>
            <label className="text-sm font-semibold">العملة<input required disabled={bookDraftLocked} minLength={3} maxLength={3} value={bookForm.currency} onChange={(event) => setBookForm({ ...bookForm, currency: event.target.value.toUpperCase() })} className={inputClass} /><FieldError errors={errorsFor('book')} field="currency" /></label>
            {bookForm.format === 'print' && <label className="text-sm font-semibold">المخزون<input required disabled={bookDraftLocked} type="number" min="0" value={bookForm.stockQuantity} onChange={(event) => setBookForm({ ...bookForm, stockQuantity: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('book')} field="stockQuantity" /></label>}
            <div className="md:col-span-2"><AdminImageField label="غلاف الكتاب" hint="يظهر في المتجر وصفحة الكتاب. عند تركه فارغًا يُستخدم غلاف بديل أنيق." value={bookForm.cover} alt={bookCoverAlt} ratio="3:4" role="cover" onChange={(value) => setBookForm({ ...bookForm, cover: value })} onAltChange={setBookCoverAlt} disabled={bookDraftLocked} /><FieldError errors={errorsFor('book')} field="cover" /></div>
            <label className="text-sm font-semibold">ملف المعاينة المجاني (مفتاح تخزين عام، اختياري)<input dir="ltr" disabled={bookDraftLocked} value={bookForm.previewFileKey} onChange={(event) => setBookForm({ ...bookForm, previewFileKey: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('book')} field="previewFileKey" /></label>
            {bookForm.format === 'print' && <><label className="text-sm font-semibold">الوزن بالغرام<input type="number" min="0" value={bookForm.weightGrams} onChange={(event) => setBookForm({ ...bookForm, weightGrams: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('book')} field="weightGrams" /></label><label className="text-sm font-semibold">ISBN (اختياري)<input dir="ltr" value={bookForm.isbn} onChange={(event) => setBookForm({ ...bookForm, isbn: event.target.value })} className={inputClass} /><FieldError errors={errorsFor('book')} field="isbn" /></label></>}
          </div>
          {bookForm.format === 'print' && <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <legend className="px-1 text-sm font-bold">الإرجاع والاسترداد</legend>
            <label className="flex items-start justify-between gap-3 text-sm font-semibold">
              <span>السماح بإرجاع هذا الكتاب<span className="mt-1 block text-xs font-normal text-slate-500">عند الإيقاف يظهر الكتاب في الطلبات دون زر إرجاع، مع شرح السبب للعميل.</span></span>
              <input type="checkbox" checked={bookForm.isReturnable} onChange={(event) => setBookForm({ ...bookForm, isReturnable: event.target.checked })} className="mt-1 h-4 w-4" />
            </label>
            <label className="block text-sm font-semibold">مدة إرجاع مخصصة (بالأيام، اختياري)
              <input type="number" min="1" max="365" disabled={!bookForm.isReturnable} value={bookForm.returnWindowDays} onChange={(event) => setBookForm({ ...bookForm, returnWindowDays: event.target.value })} className={inputClass} placeholder="اتركه فارغًا لاستخدام المدة الافتراضية للسياسة" />
              <span className="mt-1 block text-xs font-normal text-slate-500">تُحفظ هذه المدة في الطلب عند الشراء ولا تتأثر بتغيير السياسة لاحقًا.</span>
            </label>
          </fieldset>}
          <p className="text-sm text-slate-600">{translateText('معاينة الرابط', locale as Language)}: <a className="font-semibold text-emerald-800 underline" dir="ltr" href={`${import.meta.env.VITE_CLIENT_URL || ''}/${locale}/livres/${bookForm.slug}`}>{`/${locale}/livres/${bookForm.slug || 'slug'}`}</a></p>
          {bookForm.format === 'ebook' && <label className="block text-sm font-semibold">ملف الكتاب الإلكتروني (PDF)<input key={fileInputKey} type="file" accept="application/pdf,.pdf" onChange={(event) => setBookFile(event.target.files?.[0] || null)} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2`} /><span className="mt-1 block text-xs font-normal text-slate-500">{bookHasPdf ? 'يمكنك اختيار ملف جديد لاستبدال PDF الحالي.' : 'يمكن حفظ الكتاب كمسودة وإرفاق PDF لاحقًا.'} يُرفع الملف إلى التخزين الخاص، ولا يُتاح إلا بعد الشراء.</span>
            {(errorsFor('book').file || errorsFor('book').mimeType) && <span className="mt-1 block text-xs text-red-700">{errorsFor('book').file || errorsFor('book').mimeType}</span>}
          </label>}
          {pendingBookId && !bookHasPdf && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">تم حفظ مسودة الكتاب رقم {pendingBookId}. أعد اختيار ملف PDF لإكمال الرفع.</p>}
          <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={!isPublisher} checked={bookForm.isPublished} onChange={(event) => setBookForm({ ...bookForm, isPublished: event.target.checked })} /> نشر الكتاب الآن<FieldError errors={errorsFor('book')} field="isPublished" /></label>
          <button disabled={busy || bookForm.format === 'ebook' && bookForm.isPublished && !bookFile && !bookHasPdf} className={submitClass}>{translateText(bookId ? 'حفظ التعديلات' : 'حفظ الكتاب', locale as Language)}</button>
        </form>
      </section>}
  </main>;
  return translateTree(content, locale as Language);
}
