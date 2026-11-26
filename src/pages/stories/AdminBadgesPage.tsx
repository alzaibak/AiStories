import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Award, Check, Copy, Image as ImageIcon, Loader2, Medal, Plus, Power,
  ScrollText, Search, Settings2, Trash2, X
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';
import { BadgeCircle, BADGE_ICON_KEYS, COLOR_PRESETS, type BadgeTier, type BadgeView } from '@/components/badges/BadgeCircle';

type LocalizedText = { name: string; description: string; howToEarn: string };
type Translations = Record<'ar' | 'en' | 'fr', LocalizedText>;

const LANGUAGES: Array<'ar' | 'en' | 'fr'> = ['ar', 'en', 'fr'];
const LANGUAGE_NAMES: Record<string, string> = { ar: 'العربية', en: 'English', fr: 'Français' };
const TIERS: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum', 'special'];
const TIER_NAMES: Record<BadgeTier, string> = {
  bronze: 'برونزي', silver: 'فضي', gold: 'ذهبي', platinum: 'بلاتيني', special: 'خاص'
};
const CATEGORIES = ['reading', 'quiz', 'streak', 'collection', 'competition', 'community', 'supporter', 'event'] as const;
const CATEGORY_NAMES: Record<string, string> = {
  reading: 'القراءة', quiz: 'الاختبارات', streak: 'الاستمرارية', collection: 'المجموعات',
  competition: 'المسابقات', community: 'المجتمع', supporter: 'الدعم', event: 'الفعاليات'
};
const CRITERIA_NAMES: Record<string, string> = {
  stories_completed: 'حكايات مكتملة',
  parts_read: 'أجزاء مقروءة',
  streak_days: 'أيام متتالية',
  quizzes_completed: 'اختبارات ناجحة',
  perfect_quiz_scores: 'علامات كاملة',
  collection_completed: 'مجموعة مكتملة',
  weekly_challenge_rank: 'مركز في تحدي أسبوعي',
  team_joined: 'الانضمام إلى فريق',
  early_supporter: 'دعم مبكر',
  event_participation: 'مشاركة في فعالية',
  manual: 'منح يدوي'
};

type BadgeRecord = BadgeView & {
  code: string;
  name: string;
  translations?: Translations;
  howToEarnTranslations?: Record<string, string>;
  colorTheme?: { preset?: string; from?: string; to?: string };
  iconType?: 'library' | 'upload';
  criteria: { type: string; threshold?: number; collectionId?: number | null; eventTag?: string | null };
  points: number;
  isActive: boolean;
  isSecret: boolean;
  sortOrder: number;
  eventTag?: string | null;
};

type BadgesResponse = {
  badges: BadgeRecord[];
  levels: Array<{ level: number; points: number; names: Record<string, string> }>;
  filters: { tiers: string[]; categories: string[]; criteriaTypes: string[] };
  totalAwards: number;
};

type Draft = {
  id?: number;
  code: string;
  translations: Translations;
  iconType: 'library' | 'upload';
  iconKey: string;
  imageUrl: string;
  tier: BadgeTier;
  category: string;
  colorTheme: { preset: string; from: string; to: string };
  criteria: { type: string; threshold: number; collectionId?: number | null; eventTag?: string | null };
  points: number;
  isSecret: boolean;
  isActive: boolean;
  sortOrder: number;
  eventTag: string;
};

type CertificateCollection = {
  id: number;
  title: string;
  slug?: string;
  storiesCount: number;
  enabled: boolean;
  certificateTitle: string;
};

function emptyLocalized(): LocalizedText {
  return { name: '', description: '', howToEarn: '' };
}

function emptyDraft(): Draft {
  return {
    code: '',
    translations: { ar: emptyLocalized(), en: emptyLocalized(), fr: emptyLocalized() },
    iconType: 'library',
    iconKey: 'book-open',
    imageUrl: '',
    tier: 'bronze',
    category: 'reading',
    colorTheme: { preset: 'emerald', from: '', to: '' },
    criteria: { type: 'stories_completed', threshold: 1 },
    points: 20,
    isSecret: false,
    isActive: true,
    sortOrder: 0,
    eventTag: ''
  };
}

function draftFromRecord(record: BadgeRecord): Draft {
  const translations = record.translations || {
    ar: { name: record.name, description: record.description || '', howToEarn: record.howToEarn || '' },
    en: emptyLocalized(),
    fr: emptyLocalized()
  };
  return {
    id: record.id,
    code: record.code,
    translations: {
      ar: { ...emptyLocalized(), ...translations.ar },
      en: { ...emptyLocalized(), ...translations.en },
      fr: { ...emptyLocalized(), ...translations.fr }
    },
    iconType: record.iconType === 'upload' ? 'upload' : 'library',
    iconKey: record.iconKey || 'award',
    imageUrl: record.imageUrl || '',
    tier: (record.tier || 'bronze') as BadgeTier,
    category: record.category || 'reading',
    colorTheme: {
      preset: record.colorTheme?.preset || 'emerald',
      from: record.colorTheme?.from || '',
      to: record.colorTheme?.to || ''
    },
    criteria: {
      type: record.criteria?.type || 'manual',
      threshold: record.criteria?.threshold || 1,
      collectionId: record.criteria?.collectionId || null,
      eventTag: record.criteria?.eventTag || null
    },
    points: record.points || 0,
    isSecret: Boolean(record.isSecret),
    isActive: record.isActive !== false,
    sortOrder: record.sortOrder || 0,
    eventTag: record.eventTag || ''
  };
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function draftToPreview(draft: Draft, state: 'locked' | 'in_progress' | 'unlocked'): BadgeView {
  return {
    id: draft.id || 0,
    code: draft.code,
    name: draft.translations.ar.name || draft.translations.en.name || translateText('شارة جديدة', 'ar'),
    description: draft.translations.ar.description,
    howToEarn: draft.translations.ar.howToEarn,
    iconKey: draft.iconKey,
    imageUrl: draft.iconType === 'upload' ? draft.imageUrl : null,
    tier: draft.tier,
    category: draft.category,
    state,
    unlocked: state === 'unlocked',
    isSecret: draft.isSecret,
    points: draft.points,
    progress: state === 'in_progress'
      ? { currentValue: Math.round(draft.criteria.threshold * 0.6), targetValue: draft.criteria.threshold || 1, ratio: 0.6 }
      : { currentValue: state === 'unlocked' ? draft.criteria.threshold : 0, targetValue: draft.criteria.threshold || 1, ratio: state === 'unlocked' ? 1 : 0 },
    colorTheme: draft.colorTheme
  } as BadgeView;
}

function criteriaSentence(draft: Draft, language: SiteLanguage) {
  const threshold = draft.criteria.threshold;
  switch (draft.criteria.type) {
    case 'stories_completed':
      return `${translateText('تُمنح عندما يكمل القارئ', language)} ${threshold} ${translateText('حكاية', language)}`;
    case 'parts_read':
      return `${translateText('تُمنح عندما يقرأ القارئ', language)} ${threshold} ${translateText('جزءًا', language)}`;
    case 'streak_days':
      return `${translateText('تُمنح عند قراءة', language)} ${threshold} ${translateText('أيام متتالية', language)}`;
    case 'quizzes_completed':
      return `${translateText('تُمنح بعد النجاح في', language)} ${threshold} ${translateText('اختبارات', language)}`;
    case 'perfect_quiz_scores':
      return `${translateText('تُمنح عند الحصول على علامة كاملة', language)} (${threshold})`;
    case 'collection_completed':
      return translateText('تُمنح عند إكمال مجموعة كاملة', language);
    case 'weekly_challenge_rank':
      return `${translateText('تُمنح عند الوصول إلى المركز', language)} ${threshold} ${translateText('أو أفضل في تحدي أسبوعي', language)}`;
    case 'team_joined':
      return translateText('تُمنح عند الانضمام إلى فريق قراءة', language);
    case 'early_supporter':
      return translateText('تُمنح عند الاشتراك أو التبرع لدعم المشروع', language);
    case 'event_participation':
      return `${translateText('تُمنح عند المشاركة في فعالية', language)}${draft.criteria.eventTag ? `: ${draft.criteria.eventTag}` : ''}`;
    default:
      return translateText('منح يدوي من الإدارة', language);
  }
}

export function AdminBadgesPage() {
  const { locale = 'ar' } = useParams();
  const language = (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as SiteLanguage;
  const t = useCallback((text: string) => translateText(text, language), [language]);

  const [tab, setTab] = useState<'badges' | 'certificates'>('badges');
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [formLanguage, setFormLanguage] = useState<'ar' | 'en' | 'fr'>('ar');
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [collections, setCollections] = useState<Array<{ id: number; title: string }>>([]);
  const [previewDark, setPreviewDark] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [sampleBusy, setSampleBusy] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<BadgeRecord | null>(null);
  const [awardTarget, setAwardTarget] = useState<{ badge: BadgeRecord; mode: 'award' | 'revoke' } | null>(null);
  const [awardEmail, setAwardEmail] = useState('');
  const [awardReason, setAwardReason] = useState('');
  const [awardBusy, setAwardBusy] = useState(false);

  const [levelsOpen, setLevelsOpen] = useState(false);
  const [levels, setLevels] = useState<Array<{ level: number; points: number; names: Record<string, string> }>>([]);
  const [levelsSaving, setLevelsSaving] = useState(false);

  const [certificateData, setCertificateData] = useState<{ enabled: boolean; collections: CertificateCollection[] } | null>(null);
  const [certificatesLoading, setCertificatesLoading] = useState(false);
  const [certificatesSaving, setCertificatesSaving] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<BadgesResponse>('/admin/community/badges');
      setData(response);
      setLevels(response.levels || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحميل الشارات.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api.get<Array<{ id: number; title: string }>>('/admin/content/collections?limit=100')
      .then((response) => setCollections(Array.isArray(response) ? response : []))
      .catch(() => setCollections([]));
  }, []);

  useEffect(() => {
    if (tab !== 'certificates' || certificateData) return;
    setCertificatesLoading(true);
    api.get<{ enabled: boolean; collections: CertificateCollection[] }>('/admin/community/certificates')
      .then(setCertificateData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل الشهادات.')))
      .finally(() => setCertificatesLoading(false));
  }, [certificateData, t, tab]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    drawerRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const badges = useMemo(() => data?.badges || [], [data]);
  const filtered = useMemo(() => badges.filter((badge) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [badge.name, badge.code, badge.translations?.en?.name, badge.translations?.fr?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
    const matchesCategory = categoryFilter === 'all' || badge.category === categoryFilter;
    const matchesTier = tierFilter === 'all' || badge.tier === tierFilter;
    const matchesActive = activeFilter === 'all'
      || (activeFilter === 'active' && badge.isActive)
      || (activeFilter === 'inactive' && !badge.isActive);
    return matchesSearch && matchesCategory && matchesTier && matchesActive;
  }), [activeFilter, badges, categoryFilter, search, tierFilter]);

  function openCreate() {
    setDraft(emptyDraft());
    setFormLanguage('ar');
    setFormErrors({});
    setDrawerOpen(true);
  }

  function openEdit(badge: BadgeRecord) {
    setDraft(draftFromRecord(badge));
    setFormLanguage('ar');
    setFormErrors({});
    setDrawerOpen(true);
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateTranslation(field: keyof LocalizedText, value: string) {
    setDraft((current) => ({
      ...current,
      translations: {
        ...current.translations,
        [formLanguage]: { ...current.translations[formLanguage], [field]: value }
      }
    }));
  }

  function validate() {
    const errors: Record<string, string> = {};
    if (!draft.translations.ar.name.trim()) errors['ar.name'] = t('الاسم بالعربية مطلوب.');
    if (!draft.translations.ar.description.trim()) errors['ar.description'] = t('الوصف بالعربية مطلوب.');
    if (!draft.code.trim() && !draft.translations.ar.name.trim()) errors.code = t('الكود مطلوب.');
    if (draft.iconType === 'upload' && !draft.imageUrl) errors.imageUrl = t('اختر صورة للشارة.');
    if (draft.criteria.type !== 'manual' && draft.criteria.type !== 'collection_completed'
      && draft.criteria.type !== 'team_joined' && draft.criteria.type !== 'early_supporter'
      && draft.criteria.type !== 'event_participation' && !(draft.criteria.threshold > 0)) {
      errors.threshold = t('أدخل رقمًا أكبر من صفر.');
    }
    if (draft.iconType === 'upload' && draft.imageUrl.length > 300000) errors.imageUrl = t('حجم الصورة كبير جدًا (الحد 200 كيلوبايت).');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: draft.code || slugify(draft.translations.en.name || draft.translations.ar.name),
        translations: draft.translations,
        iconType: draft.iconType,
        iconKey: draft.iconKey,
        imageUrl: draft.iconType === 'upload' ? draft.imageUrl : null,
        tier: draft.tier,
        category: draft.category,
        colorTheme: draft.colorTheme,
        criteria: draft.criteria,
        points: draft.points,
        isSecret: draft.isSecret,
        isActive: draft.isActive,
        sortOrder: draft.sortOrder,
        eventTag: draft.eventTag
      };
      if (draft.id) await api.patch(`/admin/community/badges/${draft.id}`, payload);
      else await api.post('/admin/community/badges', payload);
      setToast(draft.id ? t('تم تحديث الشارة.') : t('تم إنشاء الشارة.'));
      setDrawerOpen(false);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields) setFormErrors(caught.fields);
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ الشارة.'));
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(badge: BadgeRecord) {
    try {
      await api.post(`/admin/community/badges/${badge.id}/duplicate`, {});
      setToast(t('تم نسخ الشارة.'));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر نسخ الشارة.'));
    }
  }

  async function toggleActive(badge: BadgeRecord) {
    try {
      await api.patch(`/admin/community/badges/${badge.id}`, { isActive: !badge.isActive });
      setToast(!badge.isActive ? t('تم تفعيل الشارة.') : t('تم تعطيل الشارة.'));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث الشارة.'));
    }
  }

  async function remove(badge: BadgeRecord, force: boolean) {
    try {
      await api.delete(`/admin/community/badges/${badge.id}${force ? '?force=true' : ''}`);
      setConfirmDelete(null);
      setToast(t('تم حذف الشارة.'));
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'BADGE_IN_USE') {
        setConfirmDelete(badge);
        setError(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : t('تعذر حذف الشارة.'));
      }
    }
  }

  async function submitAward() {
    if (!awardTarget) return;
    if (!awardReason.trim() || !awardEmail.trim()) return;
    setAwardBusy(true);
    try {
      if (awardTarget.mode === 'award') {
        await api.post(`/admin/community/badges/${awardTarget.badge.id}/award`, {
          email: awardEmail.trim(),
          reason: awardReason.trim()
        });
        setToast(t('تم منح الشارة.'));
      } else {
        const userId = Number(awardEmail.trim());
        if (!Number.isSafeInteger(userId) || userId < 1) throw new Error(t('أدخل معرّف القارئ الرقمي.'));
        await api.delete(`/admin/community/badges/${awardTarget.badge.id}/award/${userId}?reason=${encodeURIComponent(awardReason.trim())}`);
        setToast(t('تم سحب الشارة.'));
      }
      setAwardTarget(null);
      setAwardEmail('');
      setAwardReason('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تنفيذ العملية.'));
    } finally {
      setAwardBusy(false);
    }
  }

  async function saveLevels() {
    setLevelsSaving(true);
    try {
      await api.put('/admin/community/badges/settings', { levels });
      setToast(t('تم حفظ المستويات.'));
      setLevelsOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ المستويات.'));
    } finally {
      setLevelsSaving(false);
    }
  }

  async function downloadSampleCertificate() {
    setSampleBusy(true);
    try {
      const blob = await api.getBlob('/admin/community/certificates/sample.pdf');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'certificate-sample.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تنزيل النموذج.'));
    } finally {
      setSampleBusy(false);
    }
  }

  async function saveCertificates() {
    if (!certificateData) return;
    setCertificatesSaving(true);
    try {
      await api.put('/admin/community/certificates', {
        enabled: certificateData.enabled,
        collections: Object.fromEntries(certificateData.collections.map((collection) => [String(collection.id), {
          enabled: collection.enabled,
          title: collection.certificateTitle
        }]))
      });
      setToast(t('تم حفظ إعدادات الشهادات.'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ الإعدادات.'));
    } finally {
      setCertificatesSaving(false);
    }
  }

  function onPickImage(file: File | null) {
    if (!file) return;
    if (!['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'].includes(file.type)) {
      setFormErrors((current) => ({ ...current, imageUrl: t('الصيغ المقبولة: PNG أو SVG أو WebP.') }));
      return;
    }
    if (file.size > 200 * 1024) {
      setFormErrors((current) => ({ ...current, imageUrl: t('حجم الصورة كبير جدًا (الحد 200 كيلوبايت).') }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateDraft({ imageUrl: String(reader.result || ''), iconType: 'upload' });
    reader.readAsDataURL(file);
  }

  const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-white/15 dark:bg-slate-900 dark:text-white';
  const labelClass = 'block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{t('الشارات والشهادات')}</p>
          <h1 className="text-3xl font-black text-slate-950 dark:text-white">{t('الشارات')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {badges.length} {t('شارة')} · {data?.totalAwards || 0} {t('منح')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setLevelsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10">
            <Settings2 size={16} /> {t('المستويات')}
          </button>
          {tab === 'badges' && (
            <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
              <Plus size={16} /> {t('إنشاء شارة')}
            </button>
          )}
        </div>
      </header>

      <div className="flex gap-2 border-b border-slate-200 dark:border-white/10">
        {(['badges', 'certificates'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition ${tab === item ? 'border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
          >
            {item === 'badges' ? t('الشارات') : t('الشهادات')}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-100">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={t('إغلاق')}><X size={16} /></button>
        </div>
      )}
      {toast && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100">
          <Check size={16} /> {toast}
        </div>
      )}

      {tab === 'badges' && (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <label className="relative min-w-[12rem] flex-1">
              <span className="sr-only">{t('بحث')}</span>
              <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('بحث عن شارة')} className={`${inputClass} ps-9`} />
            </label>
            <select aria-label={t('الفئة')} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={`${inputClass} w-auto`}>
              <option value="all">{t('كل الفئات')}</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{t(CATEGORY_NAMES[category])}</option>)}
            </select>
            <select aria-label={t('المستوى')} value={tierFilter} onChange={(event) => setTierFilter(event.target.value)} className={`${inputClass} w-auto`}>
              <option value="all">{t('كل المستويات')}</option>
              {TIERS.map((tier) => <option key={tier} value={tier}>{t(TIER_NAMES[tier])}</option>)}
            </select>
            <select aria-label={t('الحالة')} value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className={`${inputClass} w-auto`}>
              <option value="all">{t('الكل')}</option>
              <option value="active">{t('نشط')}</option>
              <option value="inactive">{t('معطل')}</option>
            </select>
          </section>

          {loading
            ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                  <div key={index} className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5" />
                ))}
              </div>
            )
            : filtered.length === 0
              ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-white/15 dark:bg-slate-900">
                  <Medal className="mx-auto text-slate-300" size={40} />
                  <p className="mt-3 font-bold text-slate-700 dark:text-slate-200">{t('لا توجد شارات مطابقة.')}</p>
                  <button type="button" onClick={openCreate} className="mt-4 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white">{t('إنشاء شارة')}</button>
                </div>
              )
              : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filtered.map((badge) => (
                    <article key={badge.id} className="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900">
                      <BadgeCircle
                        badge={{ ...badge, state: 'unlocked', unlocked: true, progress: { currentValue: 1, targetValue: 1, ratio: 1 } }}
                        size="md"
                        language={language}
                        interactive={false}
                      />
                      <h2 className="mt-3 line-clamp-1 text-base font-black text-slate-950 dark:text-white">{badge.name}</h2>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t(CATEGORY_NAMES[badge.category] || '')} · {t(TIER_NAMES[(badge.tier || 'bronze') as BadgeTier])}</p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{badge.earnedCount || 0} {t('قارئًا حصلوا عليها')}</p>
                      <div className="mt-3 flex items-center gap-1.5">
                        <button type="button" onClick={() => openEdit(badge)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10">
                          {t('تعديل')}
                        </button>
                        <button type="button" onClick={() => void toggleActive(badge)} aria-label={badge.isActive ? t('تعطيل') : t('تفعيل')} className={`rounded-lg p-1.5 ${badge.isActive ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300' : 'text-slate-400 hover:bg-slate-100'}`}>
                          <Power size={15} />
                        </button>
                        <button type="button" onClick={() => void duplicate(badge)} aria-label={t('نسخ')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><Copy size={15} /></button>
                        <button type="button" onClick={() => { setAwardTarget({ badge, mode: 'award' }); setAwardEmail(''); setAwardReason(''); }} aria-label={t('منح')} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"><Award size={15} /></button>
                        <button type="button" onClick={() => setConfirmDelete(badge)} aria-label={t('حذف')} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                      </div>
                      <span className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                        {badge.isActive ? t('نشط') : t('معطل')}
                      </span>
                    </article>
                  ))}
                </div>
              )}
        </>
      )}

      {tab === 'certificates' && (
        <section className="space-y-5">
          {certificatesLoading && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">{t('جارٍ التحميل…')}</p>}
          {certificateData && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={certificateData.enabled}
                    onChange={(event) => setCertificateData({ ...certificateData, enabled: event.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t('تفعيل شهادات المجموعات')}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={downloadSampleCertificate} disabled={sampleBusy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60 dark:border-white/15 dark:text-slate-200">
                    {sampleBusy ? <Loader2 size={15} className="animate-spin" /> : null}
                    {t('تنزيل نموذج PDF')}
                  </button>
                  <button type="button" onClick={saveCertificates} disabled={certificatesSaving} className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                    {certificatesSaving ? t('جارٍ الحفظ…') : t('حفظ')}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  {certificateData.collections.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">{t('لا توجد مجموعات بعد.')}</p>}
                  {certificateData.collections.map((collection) => (
                    <div key={collection.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                      <ScrollText size={18} className="text-emerald-700 dark:text-emerald-300" />
                      <div className="min-w-[10rem] flex-1">
                        <p className="font-bold text-slate-900 dark:text-white">{collection.title}</p>
                        <p className="text-xs text-slate-500">{collection.storiesCount} {t('حكاية')}</p>
                      </div>
                      <input
                        aria-label={t('عنوان الشهادة')}
                        value={collection.certificateTitle}
                        onChange={(event) => setCertificateData({
                          ...certificateData,
                          collections: certificateData.collections.map((item) => item.id === collection.id ? { ...item, certificateTitle: event.target.value } : item)
                        })}
                        className={`${inputClass} max-w-[14rem]`}
                      />
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={collection.enabled}
                          onChange={(event) => setCertificateData({
                            ...certificateData,
                            collections: certificateData.collections.map((item) => item.id === collection.id ? { ...item, enabled: event.target.checked } : item)
                          })}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {t('مفعّلة')}
                      </label>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-amber-200 bg-[#fffdf7] p-6 dark:border-amber-500/30 dark:bg-slate-900">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">{t('معاينة القالب')}</p>
                  <div className="mt-4 rounded-xl border-4 border-double border-amber-300 p-5 text-center">
                    <Award className="mx-auto text-amber-600" size={28} />
                    <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">{certificateData.collections[0]?.certificateTitle || t('شهادة إتمام')}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t('تُمنح إلى')} <span className="font-bold">{t('اسم القارئ')}</span></p>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{new Date().toLocaleDateString(language)} · {t('رقم الشهادة')} CERT-0000</p>
                  </div>
                  <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    {t('تُصدر الشهادة تلقائيًا عند إكمال كل حكايات المجموعة، ويمكن للقارئ تنزيلها بصيغة PDF من ملفه.')}
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40 backdrop-blur-sm" role="presentation" onClick={() => setDrawerOpen(false)}>
          <div
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? t('تعديل شارة') : t('إنشاء شارة')}
            onClick={(event) => event.stopPropagation()}
            className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-[#f6faf8] shadow-2xl dark:bg-slate-950"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <h2 className="text-lg font-black text-slate-950 dark:text-white">{draft.id ? t('تعديل شارة') : t('إنشاء شارة')}</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label={t('إغلاق')} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18} /></button>
            </header>

            <div className="grid flex-1 gap-5 overflow-y-auto p-4 lg:grid-cols-[1fr_16rem]">
              <div className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800 dark:text-emerald-300">{t('الهوية')}</h3>
                  <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
                    {LANGUAGES.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setFormLanguage(code)}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${formLanguage === code ? 'bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}
                      >
                        {LANGUAGE_NAMES[code]}{code === 'ar' ? ' *' : ''}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-3">
                    <label className={labelClass}>
                      {t('الاسم')}
                      <input dir={formLanguage === 'ar' ? 'rtl' : 'ltr'} value={draft.translations[formLanguage].name} onChange={(event) => updateTranslation('name', event.target.value)} className={inputClass} />
                      {formErrors[`${formLanguage}.name`] && <span className="text-xs font-semibold text-red-600">{formErrors[`${formLanguage}.name`]}</span>}
                    </label>
                    <label className={labelClass}>
                      {t('الوصف')}
                      <textarea dir={formLanguage === 'ar' ? 'rtl' : 'ltr'} rows={2} value={draft.translations[formLanguage].description} onChange={(event) => updateTranslation('description', event.target.value)} className={inputClass} />
                      {formErrors[`${formLanguage}.description`] && <span className="text-xs font-semibold text-red-600">{formErrors[`${formLanguage}.description`]}</span>}
                    </label>
                    <label className={labelClass}>
                      {t('كيف تحصل عليها')}
                      <textarea dir={formLanguage === 'ar' ? 'rtl' : 'ltr'} rows={2} value={draft.translations[formLanguage].howToEarn} onChange={(event) => updateTranslation('howToEarn', event.target.value)} className={inputClass} />
                    </label>
                  </div>
                  <label className={`${labelClass} mt-3`}>
                    {t('الكود')}
                    <input dir="ltr" value={draft.code} onChange={(event) => updateDraft({ code: slugify(event.target.value) })} placeholder="first-story" className={`${inputClass} font-mono`} />
                    {formErrors.code && <span className="text-xs font-semibold text-red-600">{formErrors.code}</span>}
                  </label>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800 dark:text-emerald-300">{t('المظهر')}</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={labelClass}>
                      {t('المستوى')}
                      <select value={draft.tier} onChange={(event) => updateDraft({ tier: event.target.value as BadgeTier })} className={inputClass}>
                        {TIERS.map((tier) => <option key={tier} value={tier}>{t(TIER_NAMES[tier])}</option>)}
                      </select>
                    </label>
                    <label className={labelClass}>
                      {t('الفئة')}
                      <select value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })} className={inputClass}>
                        {CATEGORIES.map((category) => <option key={category} value={category}>{t(CATEGORY_NAMES[category])}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
                    <button type="button" onClick={() => updateDraft({ iconType: 'library' })} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${draft.iconType === 'library' ? 'bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}>
                      {t('مكتبة الأيقونات')}
                    </button>
                    <button type="button" onClick={() => updateDraft({ iconType: 'upload' })} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${draft.iconType === 'upload' ? 'bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}>
                      {t('صورة مرفوعة')}
                    </button>
                  </div>

                  {draft.iconType === 'library'
                    ? (
                      <div className="mt-3 space-y-2">
                        <input
                          value={iconSearch}
                          onChange={(event) => setIconSearch(event.target.value)}
                          placeholder={t('بحث في الأيقونات')}
                          aria-label={t('بحث في الأيقونات')}
                          className={inputClass}
                        />
                        <div className="grid grid-cols-6 gap-2">
                        {BADGE_ICON_KEYS.filter((key) => !iconSearch.trim() || key.includes(iconSearch.trim().toLowerCase())).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => updateDraft({ iconKey: key })}
                            aria-label={key}
                            aria-pressed={draft.iconKey === key}
                            className={`flex aspect-square items-center justify-center rounded-xl border p-2 ${draft.iconKey === key ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'border-slate-200 text-slate-500 dark:border-white/10'}`}
                          >
                            <BadgeCircle badge={draftToPreview({ ...draft, iconType: 'library' }, 'unlocked')} size="xs" interactive={false} showProgressLabel={false} />
                          </button>
                        ))}
                        </div>
                      </div>
                    )
                    : (
                      <div className="mt-3 space-y-2">
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-600 hover:border-emerald-500 dark:border-white/15 dark:text-slate-300">
                          <ImageIcon size={16} />
                          {t('اختر PNG أو SVG (512×512، حتى 200 كيلوبايت)')}
                          <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="sr-only" onChange={(event) => onPickImage(event.target.files?.[0] || null)} />
                        </label>
                        <input dir="ltr" value={draft.imageUrl.startsWith('data:') ? '' : draft.imageUrl} onChange={(event) => updateDraft({ imageUrl: event.target.value })} placeholder="https://…" className={inputClass} />
                        {formErrors.imageUrl && <span className="text-xs font-semibold text-red-600">{formErrors.imageUrl}</span>}
                      </div>
                    )}

                  <div className="mt-4">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('لون الشارة')}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(COLOR_PRESETS).map(([key, colors]) => (
                        <button
                          key={key}
                          type="button"
                          aria-label={key}
                          aria-pressed={draft.colorTheme.preset === key}
                          onClick={() => updateDraft({ colorTheme: { preset: key, from: '', to: '' } })}
                          className={`h-8 w-8 rounded-full ring-offset-2 ${draft.colorTheme.preset === key ? 'ring-2 ring-emerald-600' : ''}`}
                          style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
                        />
                      ))}
                      <label className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                        {t('مخصص')}
                        <input type="color" value={draft.colorTheme.from || '#0f766e'} onChange={(event) => updateDraft({ colorTheme: { ...draft.colorTheme, from: event.target.value } })} className="h-8 w-8 rounded border" aria-label={t('اللون الأول')} />
                        <input type="color" value={draft.colorTheme.to || '#5eead4'} onChange={(event) => updateDraft({ colorTheme: { ...draft.colorTheme, to: event.target.value } })} className="h-8 w-8 rounded border" aria-label={t('اللون الثاني')} />
                      </label>
                    </div>
                  </div>

                  <label className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={draft.isSecret} onChange={(event) => updateDraft({ isSecret: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                    {t('شارة سرية (تُخفى حتى الحصول عليها)')}
                  </label>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800 dark:text-emerald-300">{t('المعايير')}</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={labelClass}>
                      {t('نوع المعيار')}
                      <select value={draft.criteria.type} onChange={(event) => updateDraft({ criteria: { ...draft.criteria, type: event.target.value } })} className={inputClass}>
                        {Object.entries(CRITERIA_NAMES).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
                      </select>
                    </label>
                    {['stories_completed', 'parts_read', 'streak_days', 'quizzes_completed', 'perfect_quiz_scores', 'weekly_challenge_rank'].includes(draft.criteria.type) && (
                      <label className={labelClass}>
                        {t('الحد المطلوب')}
                        <input type="number" min={1} value={draft.criteria.threshold} onChange={(event) => updateDraft({ criteria: { ...draft.criteria, threshold: Number(event.target.value) } })} className={inputClass} />
                        {formErrors.threshold && <span className="text-xs font-semibold text-red-600">{formErrors.threshold}</span>}
                      </label>
                    )}
                    {draft.criteria.type === 'collection_completed' && (
                      <label className={labelClass}>
                        {t('المجموعة')}
                        <select value={draft.criteria.collectionId || ''} onChange={(event) => updateDraft({ criteria: { ...draft.criteria, collectionId: event.target.value ? Number(event.target.value) : null } })} className={inputClass}>
                          <option value="">{t('أي مجموعة')}</option>
                          {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
                        </select>
                      </label>
                    )}
                    {draft.criteria.type === 'event_participation' && (
                      <label className={labelClass}>
                        {t('وسم الفعالية')}
                        <input dir="ltr" value={draft.criteria.eventTag || ''} onChange={(event) => updateDraft({ criteria: { ...draft.criteria, eventTag: event.target.value } })} placeholder="ramadan" className={`${inputClass} font-mono`} />
                      </label>
                    )}
                  </div>
                  <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
                    {criteriaSentence(draft, language)}
                  </p>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <h3 className="text-sm font-black uppercase tracking-wide text-emerald-800 dark:text-emerald-300">{t('المكافآت')}</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className={labelClass}>
                      {t('النقاط')}
                      <input type="number" min={0} value={draft.points} onChange={(event) => updateDraft({ points: Number(event.target.value) })} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      {t('الترتيب')}
                      <input type="number" value={draft.sortOrder} onChange={(event) => updateDraft({ sortOrder: Number(event.target.value) })} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      {t('فعالية أو موسم')}
                      <input dir="ltr" value={draft.eventTag} onChange={(event) => updateDraft({ eventTag: event.target.value })} placeholder="ramadan" className={`${inputClass} font-mono`} />
                    </label>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={draft.isActive} onChange={(event) => updateDraft({ isActive: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                    {t('نشطة')}
                  </label>
                </section>
              </div>

              <aside className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-slate-700 dark:text-slate-200">{t('معاينة حية')}</p>
                  <button type="button" onClick={() => setPreviewDark((value) => !value)} className="rounded-full border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-600 dark:border-white/15 dark:text-slate-300">
                    {previewDark ? t('فاتح') : t('داكن')}
                  </button>
                </div>
                <div className={`space-y-4 rounded-2xl border p-4 ${previewDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                  {(['unlocked', 'in_progress', 'locked'] as const).map((state) => (
                    <div key={state} className="flex items-center gap-3">
                      <BadgeCircle badge={draftToPreview(draft, state)} size="md" language={language} interactive={false} reveal={state === 'unlocked'} />
                      <div>
                        <p className={`text-xs font-bold ${previewDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          {state === 'unlocked' ? t('مفتوحة') : state === 'in_progress' ? t('قيد التقدم') : t('مقفلة')}
                        </p>
                        <p className={`text-[11px] ${previewDark ? 'text-slate-400' : 'text-slate-500'}`}>{draft.criteria.threshold} {t('مطلوب')}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-end justify-center gap-3 border-t border-dashed pt-4">
                    <BadgeCircle badge={draftToPreview(draft, 'unlocked')} size="sm" language={language} interactive={false} showProgressLabel={false} />
                    <BadgeCircle badge={draftToPreview(draft, 'unlocked')} size="lg" language={language} interactive={false} showProgressLabel={false} />
                  </div>
                </div>
              </aside>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 dark:border-white/15 dark:text-slate-200">{t('إلغاء')}</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? t('جارٍ الحفظ…') : t('حفظ')}
              </button>
            </footer>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onClick={() => setConfirmDelete(null)}>
          <div role="dialog" aria-modal="true" aria-label={t('حذف الشارة')} onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h2 className="text-lg font-black text-slate-950 dark:text-white">{t('حذف الشارة')}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {confirmDelete.earnedCount
                ? `${confirmDelete.earnedCount} ${t('قارئًا حصلوا على هذه الشارة. سيُحذف سجلهم أيضًا.')}`
                : t('هل تريد حذف هذه الشارة؟')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 dark:border-white/15 dark:text-slate-200">{t('إلغاء')}</button>
              <button type="button" onClick={() => void remove(confirmDelete, Boolean(confirmDelete.earnedCount))} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">{t('حذف')}</button>
            </div>
          </div>
        </div>
      )}

      {awardTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onClick={() => setAwardTarget(null)}>
          <div role="dialog" aria-modal="true" aria-label={t('منح الشارة')} onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h2 className="text-lg font-black text-slate-950 dark:text-white">{awardTarget.mode === 'award' ? t('منح الشارة') : t('سحب الشارة')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{awardTarget.badge.name}</p>
            <label className={`${labelClass} mt-3`}>
              {awardTarget.mode === 'award' ? t('بريد القارئ') : t('معرّف القارئ')}
              <input dir="ltr" inputMode={awardTarget.mode === 'award' ? 'email' : 'numeric'} value={awardEmail} onChange={(event) => setAwardEmail(event.target.value)} className={inputClass} />
            </label>
            <label className={`${labelClass} mt-3`}>
              {t('السبب (مطلوب)')}
              <textarea rows={3} value={awardReason} onChange={(event) => setAwardReason(event.target.value)} className={inputClass} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAwardTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 dark:border-white/15 dark:text-slate-200">{t('إلغاء')}</button>
              <button type="button" onClick={submitAward} disabled={awardBusy || !awardEmail.trim() || !awardReason.trim()} className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {awardBusy ? t('جارٍ التنفيذ…') : t('تأكيد')}
              </button>
            </div>
            {awardTarget.mode === 'award' && (
              <button type="button" onClick={() => setAwardTarget({ ...awardTarget, mode: 'revoke' })} className="mt-3 text-xs font-bold text-red-600 underline">
                {t('سحب الشارة بدلًا من ذلك')}
              </button>
            )}
          </div>
        </div>
      )}

      {levelsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onClick={() => setLevelsOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('المستويات')} onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h2 className="text-lg font-black text-slate-950 dark:text-white">{t('مستويات النقاط')}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('كل مستوى يحتاج عددًا من النقاط، ويُحتسب من مجموع نقاط الشارات.')}</p>
            <div className="mt-3 space-y-2">
              {levels.map((level, index) => (
                <div key={index} className="grid grid-cols-[3rem_5rem_1fr] items-center gap-2">
                  <input aria-label={t('رقم المستوى')} type="number" value={level.level} onChange={(event) => setLevels(levels.map((item, position) => position === index ? { ...item, level: Number(event.target.value) } : item))} className={inputClass} />
                  <input aria-label={t('النقاط')} type="number" value={level.points} onChange={(event) => setLevels(levels.map((item, position) => position === index ? { ...item, points: Number(event.target.value) } : item))} className={inputClass} />
                  <input aria-label={t('الاسم')} value={level.names?.ar || ''} onChange={(event) => setLevels(levels.map((item, position) => position === index ? { ...item, names: { ...item.names, ar: event.target.value } } : item))} className={inputClass} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between">
              <button type="button" onClick={() => setLevels([...levels, { level: levels.length + 1, points: (levels[levels.length - 1]?.points || 0) + 250, names: { ar: '', en: '', fr: '' } }])} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 dark:border-white/15 dark:text-slate-200">
                {t('إضافة مستوى')}
              </button>
              <button type="button" onClick={saveLevels} disabled={levelsSaving} className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {levelsSaving ? t('جارٍ الحفظ…') : t('حفظ')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminBadgesPage;
