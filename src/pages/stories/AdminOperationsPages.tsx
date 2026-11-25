import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

type Language = SiteLanguage;
const languages: Language[] = ['ar', 'en', 'fr'];
const fieldClass = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5';
const blankLocalized = () => ({
  ar: { title: '', description: '' },
  en: { title: '', description: '' },
  fr: { title: '', description: '' }
});
const blankEventText = () => ({
  ar: { title: '', rules: '' },
  en: { title: '', rules: '' },
  fr: { title: '', rules: '' }
});
const blankMailText = () => ({
  ar: { subject: '', body: '' },
  en: { subject: '', body: '' },
  fr: { subject: '', body: '' }
});

function useAdminLanguage() {
  const { locale = 'ar' } = useParams();
  return (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as Language;
}

function t(text: string, language: Language) {
  return translateText(text, language);
}

function AdminPage({ title, children }: { title: string; children: React.ReactNode }) {
  const language = useAdminLanguage();
  return <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8" dir={language === 'ar' ? 'rtl' : 'ltr'}>
    <header><p className="text-sm font-bold text-emerald-700">{t('إدارة المنصة', language)}</p><h1 className="mt-1 text-3xl font-black">{t(title, language)}</h1></header>
    {children}
  </main>;
}

function AccessDenied() {
  const language = useAdminLanguage();
  return <p role="alert" className="rounded-xl bg-red-50 p-5 text-red-800">{t('إذن غير متاح.', language)}</p>;
}

type PageResponse<T> = { items: T[]; total: number; page: number; limit: number };
type CommunityEvent = {
  id: number;
  slug: string;
  status: string;
  startsAt: string;
  endsAt: string;
  translations: Partial<Record<Language, { title?: string; rules?: string }>>;
  winnerDisplayName?: string | null;
  winnerAnnouncement?: Partial<Record<Language, string>> | null;
};

export function AdminEventsPage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [quizId, setQuizId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [translations, setTranslations] = useState(blankEventText());
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
  const [winnerLanguage, setWinnerLanguage] = useState<Language>('ar');
  const [editingWinnerId, setEditingWinnerId] = useState<number | null>(null);
  const [winnerDisplayName, setWinnerDisplayName] = useState('');
  const [winnerAnnouncement, setWinnerAnnouncement] = useState<Record<Language, string>>({ ar: '', en: '', fr: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.get<PageResponse<CommunityEvent>>(`/admin/community/events?page=${page}&limit=20`);
      setEvents(result.items);
      setTotal(result.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحميل الفعاليات.', language));
    }
  }, [language, page]);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/community/events', {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        quizId: quizId ? Number(quizId) : null,
        status: 'draft',
        translations
      });
      setQuizId('');
      setTranslations(blankEventText());
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ الفعالية.', language));
    } finally {
      setBusy(false);
    }
  }

  async function activate(item: CommunityEvent) {
    try {
      await api.patch(`/admin/community/events/${item.id}`, { status: 'published' });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر نشر الفعالية.', language));
    }
  }

  function editWinner(item: CommunityEvent) {
    setEditingWinnerId(item.id);
    setWinnerDisplayName(item.winnerDisplayName || '');
    setWinnerAnnouncement({
      ar: item.winnerAnnouncement?.ar || '',
      en: item.winnerAnnouncement?.en || '',
      fr: item.winnerAnnouncement?.fr || ''
    });
  }

  async function saveWinner(event: FormEvent) {
    event.preventDefault();
    if (!editingWinnerId) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/community/events/${editingWinnerId}`, {
        winnerDisplayName: winnerDisplayName.trim() || null,
        winnerAnnouncement
      });
      setEditingWinnerId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ إعلان الفائز.', language));
    } finally {
      setBusy(false);
    }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <AdminPage title="المسابقات والفعاليات"><AccessDenied /></AdminPage>;
  return <AdminPage title="المسابقات والفعاليات">
    <form onSubmit={create} className={`${cardClass} grid gap-4 md:grid-cols-2`}>
      <label className="text-sm font-semibold">{t('رقم الاختبار المرتبط (اختياري)', language)}<input type="number" min="1" value={quizId} onChange={(event) => setQuizId(event.target.value)} className={fieldClass} /></label>
      <label className="text-sm font-semibold">{t('تاريخ البدء', language)}<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={fieldClass} /></label>
      <label className="text-sm font-semibold">{t('تاريخ الانتهاء', language)}<input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={fieldClass} /></label>
      <div className="md:col-span-2 flex gap-2 border-b">{languages.map((code) => <button key={code} type="button" onClick={() => setActiveLanguage(code)} className={`border-b-2 px-3 py-2 font-bold ${activeLanguage === code ? 'border-emerald-800' : 'border-transparent'}`}>{code.toUpperCase()}</button>)}</div>
      <label className="text-sm font-semibold">{t('العنوان', language)}<input required={activeLanguage === 'ar'} value={translations[activeLanguage].title} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], title: event.target.value } }))} className={fieldClass} /></label>
      <label className="text-sm font-semibold md:col-span-2">{t('القواعد', language)}<textarea required={activeLanguage === 'ar'} rows={3} value={translations[activeLanguage].rules} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], rules: event.target.value } }))} className={fieldClass} /></label>
      <button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-2">{busy ? t('جارٍ الحفظ…', language) : t('حفظ كمسودة', language)}</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <div className="space-y-3">{events.map((item) => <article key={item.id} className={`${cardClass} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{item.translations?.[language]?.title || item.translations?.ar?.title}</h2><p className="mt-1 text-sm text-slate-500">{item.slug} · {item.status} · {new Date(item.startsAt).toLocaleString(language)}</p>{item.winnerDisplayName && <p className="mt-1 text-sm text-emerald-800">{t('الفائز', language)}: {item.winnerDisplayName}</p>}</div><div className="flex gap-2">{item.status === 'draft' && <button onClick={() => void activate(item)} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-bold text-white">{t('نشر الفعالية', language)}</button>}<button type="button" onClick={() => editWinner(item)} className="rounded-lg border px-4 py-2 text-sm font-bold">{t('إعلان الفائز', language)}</button></div></div>
      {editingWinnerId === item.id && <form onSubmit={saveWinner} className="grid gap-3 border-t pt-4 md:grid-cols-2">
        <label className="text-sm font-semibold md:col-span-2">{t('اسم الفائز أو الاسم المستعار', language)}<input maxLength={120} value={winnerDisplayName} onChange={(event) => setWinnerDisplayName(event.target.value)} className={fieldClass} /></label>
        <div className="flex gap-2 border-b md:col-span-2">{languages.map((code) => <button key={code} type="button" onClick={() => setWinnerLanguage(code)} className={`border-b-2 px-3 py-2 font-bold ${winnerLanguage === code ? 'border-emerald-800' : 'border-transparent'}`}>{code.toUpperCase()}</button>)}</div>
        <label className="text-sm font-semibold md:col-span-2">{t('نص إعلان الفائز', language)}<textarea required={winnerLanguage === 'ar'} rows={3} value={winnerAnnouncement[winnerLanguage]} onChange={(event) => setWinnerAnnouncement((current) => ({ ...current, [winnerLanguage]: event.target.value }))} className={fieldClass} /></label>
        <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-bold text-white">{t('حفظ الإعلان', language)}</button><button type="button" onClick={() => setEditingWinnerId(null)} className="rounded-lg border px-4 py-2 text-sm font-bold">{t('إلغاء', language)}</button></div>
      </form>}
    </article>)}</div>
    <Pager page={page} total={total} onPage={setPage} language={language} />
  </AdminPage>;
}

type TeamSummary = { id: number; name: string; isActive: boolean; memberCount: number; members: Array<{ displayName: string; role: string }> };
export function AdminTeamsPage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [items, setItems] = useState<TeamSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<PageResponse<TeamSummary>>(`/admin/community/teams?page=${page}&limit=20${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then((result) => { setItems(result.items); setTotal(result.total); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل الفرق.', language)));
  }, [page, query, language]);
  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <AdminPage title="الفرق"><AccessDenied /></AdminPage>;
  return <AdminPage title="الفرق">
    <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder={t('بحث باسم الفريق', language)} className={fieldClass} />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2">{items.map((team) => <article key={team.id} className={cardClass}><h2 className="font-bold">{team.name}</h2><p className="mt-1 text-sm text-slate-500">{team.memberCount} · {t('الأعضاء', language)}</p><ul className="mt-3 flex flex-wrap gap-2">{team.members.map((member, index) => <li key={`${team.id}-${index}`} className="rounded-full bg-emerald-50 px-3 py-1 text-sm">{member.displayName}</li>)}</ul></article>)}</div>
    <Pager page={page} total={total} onPage={setPage} language={language} />
  </AdminPage>;
}

type Campaign = {
  id: number;
  slug: string;
  status: string;
  goalAmount: number | string;
  raisedAmount: number | string;
  currency: string;
  campaignType?: 'amount_goal' | 'items_goal' | 'both';
  targetUnits?: number | null;
  sponsoredUnits?: number;
  unitName?: string | null;
  costPerUnit?: number | string | null;
  extraCosts?: number | string | null;
  totalCost?: number | string | null;
  coverImage?: string | null;
  translations: Partial<Record<Language, { title?: string; description?: string }>>;
};
type DonationRecord = {
  id: number;
  amount: number | string;
  currency: string;
  status: string;
  createdAt: string;
  campaign?: { slug: string };
  user?: { firstName: string; lastName: string; email: string } | null;
};
type CampaignFull = Campaign & {
  tiers?: Array<{ id: number; amount: number | string; units: number | null; label?: Record<string, string>; isActive: boolean }>;
  places?: Array<{ id: number; name: string; type: string; city?: string | null; country?: string | null; plannedQuantity: number; status: string }>;
  updates?: Array<{ id: number; translations?: Record<string, { title?: string; body?: string }>; publishedAt?: string | null }>;
};
type RecurringDonationRecord = {
  id: number;
  amount: number | string;
  currency: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  campaign?: { slug: string };
  user?: { firstName: string; lastName: string; email: string } | null;
};
export function AdminDonationsPage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [recurringDonations, setRecurringDonations] = useState<RecurringDonationRecord[]>([]);
  const [recurringPage, setRecurringPage] = useState(1);
  const [recurringTotal, setRecurringTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [goalAmount, setGoalAmount] = useState('');
  const [targetUnits, setTargetUnits] = useState('300');
  const [unitName, setUnitName] = useState('كتاب');
  const [costPerUnit, setCostPerUnit] = useState('2.50');
  const [extraCosts, setExtraCosts] = useState('0');
  const [campaignType, setCampaignType] = useState<'amount_goal' | 'items_goal' | 'both'>('both');
  const [coverImage, setCoverImage] = useState('');
  const [translations, setTranslations] = useState(blankLocalized());
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ amount: '10', campaignId: '', source: 'manual_cash', displayName: '', isAnonymous: false });
  const [editingCampaign, setEditingCampaign] = useState<CampaignFull | null>(null);
  const [campaignForm, setCampaignForm] = useState({ goalAmount: '', targetUnits: '', costPerUnit: '', extraCosts: '', coverImage: '', status: 'draft' });
  const [tierDraft, setTierDraft] = useState({ amount: '10', units: '4', label: 'تبرع' });
  const [placeDraft, setPlaceDraft] = useState({ name: '', type: 'school', city: '', country: 'MA', plannedQuantity: '50' });
  const [updateDraft, setUpdateDraft] = useState({ title: '', body: '' });

  const loadCampaigns = useCallback(async () => {
    const result = await api.get<PageResponse<Campaign>>(`/admin/money/donation-campaigns?page=${page}&limit=20`);
    setCampaigns(result.items);
    setTotal(result.total);
  }, [page]);
  useEffect(() => {
    loadCampaigns().catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل الحملات.', language)));
    api.get<PageResponse<DonationRecord>>(`/admin/money/donations?page=${page}&limit=20`)
      .then((result) => setDonations(result.items))
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل التبرعات.', language)));
    api.get<PageResponse<RecurringDonationRecord>>(`/admin/money/recurring-donations?page=${recurringPage}&limit=20`)
      .then((result) => { setRecurringDonations(result.items); setRecurringTotal(result.total); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل التبرعات الشهرية.', language)));
  }, [page, recurringPage, language, loadCampaigns]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/money/donation-campaigns', {
        goalAmount: Number(goalAmount),
        currency: 'EUR',
        status: 'active',
        campaignType,
        targetUnits: targetUnits ? Number(targetUnits) : null,
        unitName: { ar: unitName, en: unitName, fr: unitName },
        costPerUnit: costPerUnit ? Number(costPerUnit) : null,
        extraCosts: Number(extraCosts) || 0,
        ...(coverImage.trim() ? { coverImage: coverImage.trim() } : {}),
        translations
      });
      setGoalAmount('');
      setCoverImage('');
      setTranslations(blankLocalized());
      await loadCampaigns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ الحملة.', language));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(campaign: Campaign, status: string) {
    try {
      await api.patch(`/admin/money/donation-campaigns/${campaign.id}`, { status });
      await loadCampaigns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث حالة الحملة.', language));
    }
  }

  async function refundDonation(donation: DonationRecord) {
    if (!window.confirm('هل تريد ردّ هذا التبرع بالكامل؟')) return;
    setError(null);
    try {
      await api.post(`/admin/money/donations/${donation.id}/refund`, {});
      setDonations((current) => current.map((item) => item.id === donation.id ? { ...item, status: 'refunded' } : item));
      await loadCampaigns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رد التبرع.');
    }
  }

  async function recordManual(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<DonationRecord>('/admin/money/donations/manual', {
        amount: Number(manual.amount),
        currency: 'EUR',
        source: manual.source,
        campaignId: manual.campaignId ? Number(manual.campaignId) : null,
        displayName: manual.displayName.trim() || null,
        isAnonymous: manual.isAnonymous
      });
      setDonations((current) => [created, ...current]);
      setManual({ ...manual, amount: '10', displayName: '' });
      await loadCampaigns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل التبرع اليدوي.');
    } finally {
      setBusy(false);
    }
  }

  async function openCampaign(campaign: Campaign) {
    setError(null);
    try {
      const full = await api.get<CampaignFull>(`/admin/money/donation-campaigns/${campaign.id}/full`);
      setEditingCampaign(full);
      setCampaignForm({
        goalAmount: String(full.goalAmount ?? ''),
        targetUnits: full.targetUnits ? String(full.targetUnits) : '',
        costPerUnit: full.costPerUnit ? String(full.costPerUnit) : '',
        extraCosts: String(full.extraCosts ?? 0),
        coverImage: full.coverImage || '',
        status: full.status
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل الحملة.');
    }
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    if (!editingCampaign) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/money/donation-campaigns/${editingCampaign.id}`, {
        goalAmount: Number(campaignForm.goalAmount),
        targetUnits: campaignForm.targetUnits ? Number(campaignForm.targetUnits) : null,
        costPerUnit: campaignForm.costPerUnit ? Number(campaignForm.costPerUnit) : null,
        extraCosts: Number(campaignForm.extraCosts) || 0,
        ...(campaignForm.coverImage.trim() ? { coverImage: campaignForm.coverImage.trim() } : {}),
        status: campaignForm.status
      });
      await openCampaign(editingCampaign);
      await loadCampaigns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الحملة.');
    } finally {
      setBusy(false);
    }
  }

  async function addTier(event: FormEvent) {
    event.preventDefault();
    if (!editingCampaign) return;
    setBusy(true);
    try {
      await api.post(`/admin/money/donation-campaigns/${editingCampaign.id}/tiers`, {
        amount: Number(tierDraft.amount), units: Number(tierDraft.units) || null,
        label: { ar: tierDraft.label, en: tierDraft.label, fr: tierDraft.label }, sortOrder: (editingCampaign.tiers?.length || 0) + 1
      });
      await openCampaign(editingCampaign);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إضافة المستوى.');
    } finally { setBusy(false); }
  }

  async function addPlace(event: FormEvent) {
    event.preventDefault();
    if (!editingCampaign) return;
    setBusy(true);
    try {
      await api.post(`/admin/money/donation-campaigns/${editingCampaign.id}/places`, {
        name: placeDraft.name, type: placeDraft.type, city: placeDraft.city, country: placeDraft.country,
        plannedQuantity: Number(placeDraft.plannedQuantity), status: 'planned', isPublic: true
      });
      setPlaceDraft({ ...placeDraft, name: '' });
      await openCampaign(editingCampaign);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إضافة موقع التوزيع.');
    } finally { setBusy(false); }
  }

  async function addUpdate(event: FormEvent) {
    event.preventDefault();
    if (!editingCampaign) return;
    setBusy(true);
    try {
      await api.post(`/admin/money/donation-campaigns/${editingCampaign.id}/updates`, {
        translations: { ar: { title: updateDraft.title, body: updateDraft.body }, en: { title: updateDraft.title, body: updateDraft.body }, fr: { title: updateDraft.title, body: updateDraft.body } },
        publishedAt: new Date().toISOString()
      });
      setUpdateDraft({ title: '', body: '' });
      await openCampaign(editingCampaign);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر نشر التحديث.');
    } finally { setBusy(false); }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <AdminPage title="التبرعات والحملات"><AccessDenied /></AdminPage>;
  return <AdminPage title="التبرعات والحملات">
    <form onSubmit={create} className={`${cardClass} grid gap-4 md:grid-cols-2`}>
      <label className="text-sm font-semibold">{t('الهدف (EUR)', language)}<input required type="number" min="0.01" step="0.01" value={goalAmount} onChange={(event) => setGoalAmount(event.target.value)} className={fieldClass} /></label>
      <label className="text-sm font-semibold">نوع الهدف<select value={campaignType} onChange={(event) => setCampaignType(event.target.value as typeof campaignType)} className={fieldClass}><option value="both">مبلغ ووحدات</option><option value="amount_goal">مبلغ فقط</option><option value="items_goal">وحدات فقط</option></select></label>
      <label className="text-sm font-semibold">عدد الوحدات المستهدفة<input type="number" min="1" value={targetUnits} onChange={(event) => setTargetUnits(event.target.value)} className={fieldClass} /></label>
      <label className="text-sm font-semibold">اسم الوحدة (كتاب)<input value={unitName} onChange={(event) => setUnitName(event.target.value)} className={fieldClass} /></label>
      <label className="text-sm font-semibold">تكلفة الوحدة (EUR)<input type="number" min="0" step="0.01" value={costPerUnit} onChange={(event) => setCostPerUnit(event.target.value)} className={fieldClass} /></label>
      <label className="text-sm font-semibold">تكاليف إضافية (شحن/توزيع)<input type="number" min="0" step="0.01" value={extraCosts} onChange={(event) => setExtraCosts(event.target.value)} className={fieldClass} /></label>
      <label className="text-sm font-semibold md:col-span-2">رابط صورة الغلاف<input dir="ltr" value={coverImage} onChange={(event) => setCoverImage(event.target.value)} placeholder="https://…" className={fieldClass} /></label>
      <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 md:col-span-2">التكلفة الإجمالية المحسوبة: <strong>{((Number(targetUnits) || 0) * (Number(costPerUnit) || 0) + (Number(extraCosts) || 0)).toFixed(2)} EUR</strong></p>
      <div className="md:col-span-2 flex gap-2 border-b">{languages.map((code) => <button key={code} type="button" onClick={() => setActiveLanguage(code)} className={`border-b-2 px-3 py-2 font-bold ${activeLanguage === code ? 'border-emerald-800' : 'border-transparent'}`}>{code.toUpperCase()}</button>)}</div>
      <label className="text-sm font-semibold">{t('العنوان', language)}<input required={activeLanguage === 'ar'} value={translations[activeLanguage].title} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], title: event.target.value } }))} className={fieldClass} /></label>
      <label className="text-sm font-semibold md:col-span-2">{t('الوصف', language)}<textarea required={activeLanguage === 'ar'} rows={3} value={translations[activeLanguage].description} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], description: event.target.value } }))} className={fieldClass} /></label>
      <button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-2">{busy ? t('جارٍ الحفظ…', language) : 'إنشاء حملة نشطة'}</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <section className="grid gap-3 md:grid-cols-2">{campaigns.map((campaign) => {
      const raised = Number(campaign.raisedAmount);
      const goal = Number(campaign.goalAmount);
      return <article key={campaign.id} className={cardClass}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{campaign.translations?.[language]?.title || campaign.translations?.ar?.title}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{campaign.status}</span></div><p className="mt-1 text-sm text-slate-500">{campaign.slug}</p><p className="mt-3 font-semibold">{raised.toFixed(2)} / {goal.toFixed(2)} {campaign.currency}</p><progress value={Math.min(raised, goal)} max={goal} className="mt-2 w-full" />{campaign.targetUnits ? <p className="mt-2 text-sm font-semibold text-emerald-800">{campaign.sponsoredUnits || 0} / {campaign.targetUnits} {campaign.unitName || 'كتاب'} · التكلفة {Number(campaign.totalCost || 0).toFixed(2)} {campaign.currency}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void openCampaign(campaign)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold text-white">إدارة</button>{campaign.status === 'draft' && <button onClick={() => void setStatus(campaign, 'active')} className="rounded-lg bg-emerald-900 px-3 py-1.5 text-sm font-bold text-white">تفعيل</button>}{campaign.status === 'active' && <button onClick={() => void setStatus(campaign, 'completed')} className="rounded-lg border px-3 py-1.5 text-sm font-bold">إكمال</button>}{campaign.status !== 'archived' && <button onClick={() => void setStatus(campaign, 'archived')} className="rounded-lg border px-3 py-1.5 text-sm font-bold">أرشفة</button>}<a href={`/${language}/donation-campaigns/${campaign.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1.5 text-sm font-bold">معاينة</a></div></article>;
    })}</section>
    {editingCampaign && <section className={`${cardClass} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-extrabold">إدارة: {editingCampaign.translations?.ar?.title || editingCampaign.slug}</h2><button type="button" onClick={() => setEditingCampaign(null)} className="rounded-lg border px-3 py-1.5 text-sm font-bold">إغلاق</button></div>
      <form onSubmit={saveCampaign} className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-semibold">الهدف (EUR)<input required type="number" min="0.01" step="0.01" value={campaignForm.goalAmount} onChange={(event) => setCampaignForm({ ...campaignForm, goalAmount: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm font-semibold">الوحدات<input type="number" min="1" value={campaignForm.targetUnits} onChange={(event) => setCampaignForm({ ...campaignForm, targetUnits: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm font-semibold">تكلفة الوحدة<input type="number" min="0" step="0.01" value={campaignForm.costPerUnit} onChange={(event) => setCampaignForm({ ...campaignForm, costPerUnit: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm font-semibold">تكاليف إضافية<input type="number" min="0" step="0.01" value={campaignForm.extraCosts} onChange={(event) => setCampaignForm({ ...campaignForm, extraCosts: event.target.value })} className={fieldClass} /></label>
        <label className="text-sm font-semibold">الحالة<select value={campaignForm.status} onChange={(event) => setCampaignForm({ ...campaignForm, status: event.target.value })} className={fieldClass}><option value="draft">مسودة</option><option value="active">نشطة</option><option value="completed">مكتملة</option><option value="archived">مؤرشفة</option></select></label>
        <label className="text-sm font-semibold">صورة الغلاف<input dir="ltr" value={campaignForm.coverImage} onChange={(event) => setCampaignForm({ ...campaignForm, coverImage: event.target.value })} className={fieldClass} /></label>
        <button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-3">حفظ إعدادات الحملة</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4"><h3 className="font-bold">مستويات التبرع</h3><ul className="mt-2 space-y-1 text-sm">{(editingCampaign.tiers || []).map((tier) => <li key={tier.id} className="flex justify-between"><span>{tier.label?.ar || 'مستوى'}</span><span>{Number(tier.amount).toFixed(2)} EUR · {tier.units ?? 0} وحدة</span></li>)}</ul><form onSubmit={addTier} className="mt-3 grid gap-2 sm:grid-cols-3"><input required type="number" min="0.01" step="0.01" value={tierDraft.amount} onChange={(event) => setTierDraft({ ...tierDraft, amount: event.target.value })} placeholder="المبلغ" className={fieldClass} /><input type="number" min="0" value={tierDraft.units} onChange={(event) => setTierDraft({ ...tierDraft, units: event.target.value })} placeholder="الوحدات" className={fieldClass} /><button disabled={busy} className="rounded-xl bg-emerald-900 px-3 py-2 text-sm font-bold text-white">إضافة</button></form></div>
        <div className="rounded-2xl bg-slate-50 p-4"><h3 className="font-bold">مواقع التوزيع</h3><ul className="mt-2 space-y-1 text-sm">{(editingCampaign.places || []).map((place) => <li key={place.id} className="flex justify-between"><span>{place.name} · {place.status}</span><span>{place.plannedQuantity}</span></li>)}</ul><form onSubmit={addPlace} className="mt-3 grid gap-2 sm:grid-cols-2"><input required value={placeDraft.name} onChange={(event) => setPlaceDraft({ ...placeDraft, name: event.target.value })} placeholder="اسم الموقع" className={fieldClass} /><input required type="number" min="1" value={placeDraft.plannedQuantity} onChange={(event) => setPlaceDraft({ ...placeDraft, plannedQuantity: event.target.value })} placeholder="الكمية" className={fieldClass} /><input value={placeDraft.city} onChange={(event) => setPlaceDraft({ ...placeDraft, city: event.target.value })} placeholder="المدينة" className={fieldClass} /><select value={placeDraft.type} onChange={(event) => setPlaceDraft({ ...placeDraft, type: event.target.value })} className={fieldClass}><option value="school">مدرسة</option><option value="mosque">مسجد</option><option value="association">جمعية</option><option value="orphanage">دار أيتام</option><option value="library">مكتبة</option><option value="family">أسرة</option></select><button disabled={busy} className="rounded-xl bg-emerald-900 px-3 py-2 text-sm font-bold text-white">إضافة موقع</button></form></div>
      </div>
      <div className="rounded-2xl bg-slate-50 p-4"><h3 className="font-bold">تحديثات الحملة</h3><ul className="mt-2 space-y-2 text-sm">{(editingCampaign.updates || []).map((update) => <li key={update.id} className="border-b pb-2"><strong>{update.translations?.ar?.title}</strong><p className="text-slate-600">{update.translations?.ar?.body}</p></li>)}</ul><form onSubmit={addUpdate} className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><input required value={updateDraft.title} onChange={(event) => setUpdateDraft({ ...updateDraft, title: event.target.value })} placeholder="عنوان التحديث" className={fieldClass} /><input required value={updateDraft.body} onChange={(event) => setUpdateDraft({ ...updateDraft, body: event.target.value })} placeholder="نص التحديث" className={fieldClass} /><button disabled={busy} className="rounded-xl bg-emerald-900 px-3 py-2 text-sm font-bold text-white">نشر</button></form></div>
    </section>}
    <form onSubmit={recordManual} className={`${cardClass} grid gap-3 md:grid-cols-3`}><h2 className="text-xl font-extrabold md:col-span-3">تسجيل تبرع يدوي (نقدًا أو تحويلًا بنكيًا)</h2><label className="text-sm font-semibold">المبلغ<input required type="number" min="1" step="0.01" value={manual.amount} onChange={(event) => setManual({ ...manual, amount: event.target.value })} className={fieldClass} /></label><label className="text-sm font-semibold">الحملة<select value={manual.campaignId} onChange={(event) => setManual({ ...manual, campaignId: event.target.value })} className={fieldClass}><option value="">دعم المنصة</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.translations?.ar?.title || campaign.slug}</option>)}</select></label><label className="text-sm font-semibold">المصدر<select value={manual.source} onChange={(event) => setManual({ ...manual, source: event.target.value })} className={fieldClass}><option value="manual_cash">نقدًا</option><option value="manual_bank">تحويل بنكي</option></select></label><label className="text-sm font-semibold">اسم المتبرع<input value={manual.displayName} onChange={(event) => setManual({ ...manual, displayName: event.target.value })} className={fieldClass} /></label><label className="flex items-center gap-2 self-end text-sm font-semibold"><input type="checkbox" checked={manual.isAnonymous} onChange={(event) => setManual({ ...manual, isAnonymous: event.target.checked })} />تبرع مجهول</label><button disabled={busy} className="self-end rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50">تسجيل التبرع</button></form>
    <section className={`${cardClass} space-y-3`}><h2 className="text-xl font-extrabold">{t('سجل التبرعات', language)}</h2>{donations.map((donation) => <div key={donation.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><span>{donation.user ? `${donation.user.firstName} ${donation.user.lastName}` : t('متبرع', language)} · {donation.campaign?.slug || 'دعم المنصة'}</span><span className="flex items-center gap-2">{Number(donation.amount).toFixed(2)} {donation.currency} · {donation.status}{donation.status === 'paid' && <button type="button" onClick={() => void refundDonation(donation)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-700">ردّ</button>}</span></div>)}</section>
    <Pager page={page} total={total} onPage={setPage} language={language} />
    <section className={`${cardClass} space-y-3`}><h2 className="text-xl font-extrabold">{t('التبرعات الشهرية', language)}</h2>{recurringDonations.map((donation) => <div key={donation.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{donation.user ? `${donation.user.firstName} ${donation.user.lastName}` : t('متبرع', language)} · {donation.campaign?.slug} · {donation.status}{donation.cancelAtPeriodEnd ? ` · ${t('إلغاء بنهاية الفترة', language)}` : ''}</span><span>{Number(donation.amount).toFixed(2)} {donation.currency}</span></div>)}</section>
    <Pager page={recurringPage} total={recurringTotal} onPage={setRecurringPage} language={language} />
  </AdminPage>;
}

type SecurityEventRecord = {
  id: number;
  type: string;
  severity: string;
  reason: string;
  route: string | null;
  method: string | null;
  ip: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  user?: { id: number; name: string; email: string } | null;
};

export function AdminSecurityLogPage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [items, setItems] = useState<SecurityEventRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [summary, setSummary] = useState<{ critical: number; high: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), limit: '25' });
    if (severity) query.set('severity', severity);
    if (type.trim()) query.set('type', type.trim());
    Promise.all([
      api.get<PageResponse<SecurityEventRecord>>(`/admin/security-events?${query.toString()}`),
      api.get<{ last24Hours: { critical: number; high: number; total: number } }>('/admin/security-events/summary')
    ]).then(([result, stats]) => {
      if (!active) return;
      setItems(result.items);
      setTotal(result.total);
      setSummary(stats.last24Hours);
      setError(null);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل سجل الأمان.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, severity, type]);

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <AdminPage title="سجل الأمان"><AccessDenied /></AdminPage>;
  return <AdminPage title="سجل الأمان">
    {summary && <div className="grid gap-3 sm:grid-cols-3"><div className={`${cardClass} border-red-200`}><p className="text-sm font-bold text-red-700">حرجة (٢٤ ساعة)</p><p className="mt-1 text-2xl font-black">{summary.critical}</p></div><div className={`${cardClass} border-amber-200`}><p className="text-sm font-bold text-amber-800">عالية (٢٤ ساعة)</p><p className="mt-1 text-2xl font-black">{summary.high}</p></div><div className={cardClass}><p className="text-sm font-bold text-slate-600">كل الأحداث (٢٤ ساعة)</p><p className="mt-1 text-2xl font-black">{summary.total}</p></div></div>}
    <div className={`${cardClass} flex flex-wrap items-end gap-3`}>
      <label className="text-sm font-semibold">الخطورة<select value={severity} onChange={(event) => { setPage(1); setSeverity(event.target.value); }} className={fieldClass}><option value="">الكل</option><option value="critical">حرجة</option><option value="high">عالية</option><option value="warning">تحذير</option><option value="info">معلومات</option></select></label>
      <label className="min-w-56 flex-1 text-sm font-semibold">نوع الحدث<input dir="ltr" value={type} onChange={(event) => { setPage(1); setType(event.target.value); }} placeholder="payment_amount_mismatch" className={fieldClass} /></label>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">جارٍ التحميل…</p> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[52rem] text-sm"><thead className="bg-slate-50 text-start"><tr><th className="p-3 text-start">التاريخ</th><th className="p-3 text-start">النوع</th><th className="p-3 text-start">الخطورة</th><th className="p-3 text-start">المستخدم</th><th className="p-3 text-start">المسار</th><th className="p-3 text-start">السبب</th></tr></thead><tbody>{items.map((event) => <tr key={event.id} className="border-t border-slate-100 align-top"><td className="whitespace-nowrap p-3 text-slate-500">{new Date(event.createdAt).toLocaleString(language)}</td><td className="p-3 font-mono text-xs" dir="ltr">{event.type}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${event.severity === 'critical' ? 'bg-red-100 text-red-800' : event.severity === 'high' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{event.severity}</span></td><td className="p-3">{event.user ? `${event.user.name} (${event.user.email})` : '—'}</td><td className="p-3 font-mono text-xs" dir="ltr">{event.method} {event.route}</td><td className="p-3 text-slate-600">{event.reason}{event.ip ? ` · ${event.ip}` : ''}</td></tr>)}</tbody></table></div>}
    {!loading && !items.length && <p className="rounded-xl bg-slate-50 p-5 text-slate-600">لا توجد أحداث مطابقة.</p>}
    <Pager page={page} total={total} onPage={setPage} language={language} />
  </AdminPage>;
}

type PromoCodeRecord = {
  id: number;
  code: string;
  kind: 'percentage' | 'fixed' | 'gift';
  appliesTo: 'all' | 'books' | 'plans';
  value: number | string;
  currency: string;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number;
  startsAt: string | null;
  endsAt: string | null;
  applicableBookIds: number[];
  applicablePlanIds: number[];
  isActive: boolean;
  giftPlanId: number | null;
  giftDurationDays: number | null;
};
type PromoDraft = {
  code: string;
  kind: PromoCodeRecord['kind'];
  appliesTo: PromoCodeRecord['appliesTo'];
  value: string;
  currency: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
  perUserLimit: string;
  applicableBookIds: string;
  applicablePlanIds: string;
  giftPlanId: string;
  giftDurationDays: string;
};
const emptyPromoDraft = (): PromoDraft => ({
  code: '',
  kind: 'percentage',
  appliesTo: 'all',
  value: '',
  currency: 'EUR',
  startsAt: '',
  endsAt: '',
  maxUses: '',
  perUserLimit: '1',
  applicableBookIds: '',
  applicablePlanIds: '',
  giftPlanId: '',
  giftDurationDays: ''
});
type PromoRedemption = {
  id: number;
  status: string;
  amountDiscounted: number | string;
  createdAt: string;
  user?: { firstName: string; lastName: string; email: string };
};
function localDateTimeValue(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function AdminPromoCodesPage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [items, setItems] = useState<PromoCodeRecord[]>([]);
  const [plans, setPlans] = useState<Array<{ id: number; name: string }>>([]);
  const [draft, setDraft] = useState<PromoDraft>(emptyPromoDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [redemptions, setRedemptions] = useState<Record<number, PromoRedemption[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (query.trim()) params.set('q', query.trim());
    if (kindFilter) params.set('kind', kindFilter);
    const result = await api.get<PageResponse<PromoCodeRecord>>(`/admin/money/promo-codes?${params}`);
    setItems(result.items);
    setTotal(result.total);
  }, [kindFilter, page, query]);
  useEffect(() => {
    setError(null);
    load().catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل رموز الخصم.', language)));
  }, [language, load]);
  useEffect(() => {
    api.get<Array<{ id: number; name: string }>>('/admin/plans')
      .then(setPlans)
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل الباقات.', language)));
  }, [language]);

  function startEdit(item: PromoCodeRecord) {
    setEditingId(item.id);
    setDraft({
      ...emptyPromoDraft(),
      code: item.code,
      kind: item.kind,
      appliesTo: item.appliesTo || 'all',
      value: String(item.value),
      currency: item.currency,
      startsAt: localDateTimeValue(item.startsAt),
      endsAt: localDateTimeValue(item.endsAt),
      maxUses: item.maxUses === null ? '' : String(item.maxUses),
      perUserLimit: String(item.perUserLimit),
      applicableBookIds: (item.applicableBookIds || []).join(','),
      applicablePlanIds: (item.applicablePlanIds || []).join(','),
      giftPlanId: item.giftPlanId ? String(item.giftPlanId) : '',
      giftDurationDays: item.giftDurationDays ? String(item.giftDurationDays) : ''
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const idList = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean).map(Number);
      const payload = {
        ...draft,
        code: draft.code.trim().toUpperCase(),
        appliesTo: draft.kind === 'gift' ? 'plans' : draft.appliesTo,
        value: draft.kind === 'gift' ? 0 : Number(draft.value),
        currency: draft.currency.trim().toUpperCase(),
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
        endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
        maxUses: draft.maxUses ? Number(draft.maxUses) : null,
        perUserLimit: Number(draft.perUserLimit),
        applicableBookIds: idList(draft.applicableBookIds),
        applicablePlanIds: idList(draft.applicablePlanIds),
        giftPlanId: draft.kind === 'gift' && draft.giftPlanId ? Number(draft.giftPlanId) : null,
        giftDurationDays: draft.kind === 'gift' && draft.giftDurationDays ? Number(draft.giftDurationDays) : null
      };
      if (editingId) await api.patch(`/admin/money/promo-codes/${editingId}`, payload);
      else await api.post('/admin/money/promo-codes', payload);
      setDraft(emptyPromoDraft());
      setEditingId(null);
      setNotice(t(editingId ? 'تم تحديث الرمز.' : 'تم إنشاء الرمز.', language));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ رمز الخصم.', language));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: PromoCodeRecord) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/money/promo-codes/${item.id}`, { isActive: !item.isActive });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث حالة الرمز.', language));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: PromoCodeRecord) {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/admin/money/promo-codes/${item.id}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حذف الرمز.', language));
    } finally {
      setBusy(false);
    }
  }

  async function showRedemptions(item: PromoCodeRecord) {
    setError(null);
    try {
      const result = await api.get<PageResponse<PromoRedemption>>(`/admin/money/promo-codes/${item.id}/redemptions?page=1&limit=100`);
      setRedemptions((current) => ({ ...current, [item.id]: result.items }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحميل تقرير الاستخدام.', language));
    }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <AdminPage title="رموز الخصم والهدايا"><AccessDenied /></AdminPage>;
  return <AdminPage title="رموز الخصم والهدايا">
    <form onSubmit={save} className={`${cardClass} grid gap-4 md:grid-cols-2`}>
      <label className="text-sm font-semibold">{t('رمز الخصم', language)}<input required minLength={2} maxLength={64} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} dir="ltr" className={fieldClass} /></label>
      <label className="text-sm font-semibold">{t('نوع الرمز', language)}<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as PromoDraft['kind'] })} className={fieldClass}><option value="percentage">{t('نسبة مئوية', language)}</option><option value="fixed">{t('مبلغ ثابت', language)}</option><option value="gift">{t('هدية اشتراك', language)}</option></select></label>
      {draft.kind !== 'gift' && <>
        <label className="text-sm font-semibold">{t('ينطبق على', language)}<select value={draft.appliesTo} onChange={(event) => setDraft({ ...draft, appliesTo: event.target.value as PromoDraft['appliesTo'] })} className={fieldClass}><option value="all">{t('الكتب والباقات', language)}</option><option value="books">{t('الكتب فقط', language)}</option><option value="plans">{t('الباقات فقط', language)}</option></select></label>
        <label className="text-sm font-semibold">{t(draft.kind === 'percentage' ? 'نسبة الخصم' : 'قيمة الخصم', language)}<input required type="number" min="0.01" step="0.01" max={draft.kind === 'percentage' ? '100' : undefined} value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} className={fieldClass} /></label>
        {draft.kind === 'fixed' && <label className="text-sm font-semibold">{t('العملة', language)}<input required minLength={3} maxLength={3} value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} dir="ltr" className={fieldClass} /></label>}
        {draft.appliesTo !== 'plans' && <label className="text-sm font-semibold">{t('معرّفات الكتب (مفصولة بفواصل، فارغ = كل الكتب)', language)}<input value={draft.applicableBookIds} onChange={(event) => setDraft({ ...draft, applicableBookIds: event.target.value })} dir="ltr" className={fieldClass} /></label>}
        {draft.appliesTo !== 'books' && <label className="text-sm font-semibold">{t('معرّفات الباقات (مفصولة بفواصل، فارغ = كل الباقات)', language)}<input value={draft.applicablePlanIds} onChange={(event) => setDraft({ ...draft, applicablePlanIds: event.target.value })} dir="ltr" className={fieldClass} /></label>}
      </>}
      {draft.kind === 'gift' && <>
        <label className="text-sm font-semibold">{t('الباقة', language)}<select required value={draft.giftPlanId} onChange={(event) => setDraft({ ...draft, giftPlanId: event.target.value })} className={fieldClass}><option value="">{t('اختر باقة', language)}</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · #{plan.id}</option>)}</select></label>
        <label className="text-sm font-semibold">{t('مدة الاشتراك بالأيام', language)}<input required type="number" min="1" max="3650" value={draft.giftDurationDays} onChange={(event) => setDraft({ ...draft, giftDurationDays: event.target.value })} className={fieldClass} /></label>
      </>}
      <label className="text-sm font-semibold">{t('يبدأ في (اختياري)', language)}<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} className={fieldClass} /></label>
      <label className="text-sm font-semibold">{t('ينتهي في (اختياري)', language)}<input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} className={fieldClass} /></label>
      <label className="text-sm font-semibold">{t('الحد الإجمالي للاستخدام (اختياري)', language)}<input type="number" min="1" value={draft.maxUses} onChange={(event) => setDraft({ ...draft, maxUses: event.target.value })} className={fieldClass} /></label>
      <label className="text-sm font-semibold">{t('الحد لكل مستخدم', language)}<input required type="number" min="1" max="100" value={draft.perUserLimit} onChange={(event) => setDraft({ ...draft, perUserLimit: event.target.value })} className={fieldClass} /></label>
      <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50">{busy ? t('جارٍ الحفظ…', language) : t(editingId ? 'تحديث الرمز' : 'إنشاء الرمز', language)}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyPromoDraft()); }} className="rounded-full border px-5 py-2.5 font-bold">{t('إلغاء التعديل', language)}</button>}</div>
    </form>
    <div className="flex flex-wrap gap-3">
      <input aria-label={t('البحث عن رمز', language)} placeholder={t('البحث عن رمز', language)} value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} className="rounded-xl border px-3 py-2.5" />
      <select aria-label={t('تصفية النوع', language)} value={kindFilter} onChange={(event) => { setPage(1); setKindFilter(event.target.value); }} className="rounded-xl border px-3 py-2.5"><option value="">{t('كل الأنواع', language)}</option><option value="percentage">{t('نسبة مئوية', language)}</option><option value="fixed">{t('مبلغ ثابت', language)}</option><option value="gift">{t('هدية اشتراك', language)}</option></select>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    <div className="space-y-3">{items.map((item) => <article key={item.id} className={`${cardClass} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold" dir="ltr">{item.code}</h2><p className="mt-1 text-sm text-slate-500">{item.kind} · {item.kind === 'percentage' ? `${item.value}%` : item.kind === 'fixed' ? `${item.value} ${item.currency}` : t('هدية اشتراك', language)} · {item.usedCount} {t('استخدام', language)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{t(item.isActive ? 'نشط' : 'متوقف', language)}</span></div>
      <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => startEdit(item)} className="rounded-lg border px-3 py-2 text-sm font-bold">{t('تعديل', language)}</button><button disabled={busy} onClick={() => void toggleActive(item)} className="rounded-lg border px-3 py-2 text-sm font-bold">{t(item.isActive ? 'إيقاف' : 'تفعيل', language)}</button><button disabled={busy} onClick={() => void showRedemptions(item)} className="rounded-lg border px-3 py-2 text-sm font-bold">{t('تقرير الاستخدام', language)}</button>{item.usedCount === 0 && <button disabled={busy} onClick={() => void remove(item)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">{t('حذف', language)}</button>}</div>
      {redemptions[item.id] && <div className="border-t pt-3 text-sm">{redemptions[item.id].length ? redemptions[item.id].map((redemption) => <p key={redemption.id} className="py-1">{redemption.user?.email || t('مستخدم', language)} · {redemption.status} · {redemption.amountDiscounted} · {new Date(redemption.createdAt).toLocaleDateString(language)}</p>) : <p>{t('لا توجد استخدامات بعد.', language)}</p>}</div>}
    </article>)}</div>
    <Pager page={page} total={total} onPage={setPage} language={language} />
  </AdminPage>;
}

type EmailTemplate = { id: number; code: string; isActive: boolean; translations: Partial<Record<Language, { subject?: string; body?: string }>> };
export function AdminEmailTemplatesPage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [code, setCode] = useState('');
  const [translations, setTranslations] = useState(blankMailText());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get<PageResponse<EmailTemplate>>(`/admin/system/email-templates?page=${page}&limit=20`);
    setTemplates(result.items);
    setTotal(result.total);
  }, [page]);
  useEffect(() => { load().catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل النماذج.', language))); }, [load, language]);

  function editTemplate(template: EmailTemplate) {
    setEditingId(template.id);
    setCode(template.code);
    setTranslations({
      ar: { subject: template.translations.ar?.subject || '', body: template.translations.ar?.body || '' },
      en: { subject: template.translations.en?.subject || '', body: template.translations.en?.body || '' },
      fr: { subject: template.translations.fr?.subject || '', body: template.translations.fr?.body || '' }
    });
    setActiveLanguage('ar');
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/admin/system/email-templates/${editingId}`, { translations });
      } else {
        await api.post('/admin/system/email-templates', { code, translations, isActive: true });
      }
      setCode('');
      setTranslations(blankMailText());
      setEditingId(null);
      setNotice(t(editingId ? 'تم تحديث النموذج.' : 'تم إنشاء النموذج.', language));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ النموذج.', language));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTemplate(template: EmailTemplate) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/system/email-templates/${template.id}`, { isActive: !template.isActive });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث حالة النموذج.', language));
    } finally {
      setBusy(false);
    }
  }

  async function testSend(template: EmailTemplate) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<{ email: string }>(`/admin/system/email-templates/${template.id}/test`, { language });
      setNotice(`${t('تم إرسال رسالة الاختبار إلى', language)} ${result.email}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر إرسال رسالة الاختبار.', language));
    } finally {
      setBusy(false);
    }
  }

  async function processReminders() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ processed: number; sent: number }>('/admin/system/reminders/process', {});
      setNotice(`${t('تم فحص التذكيرات', language)}: ${result.processed} · ${t('تم الإرسال', language)}: ${result.sent}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر معالجة التذكيرات.', language));
    } finally {
      setBusy(false);
    }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <AdminPage title="التذكيرات والقوالب"><AccessDenied /></AdminPage>;
  return <AdminPage title="التذكيرات والقوالب">
    <form onSubmit={save} className={`${cardClass} grid gap-4 md:grid-cols-2`}>
      <label className="text-sm font-semibold">{t('رمز النموذج', language)}<input required pattern="[a-z0-9_-]+" value={code} disabled={Boolean(editingId)} onChange={(event) => setCode(event.target.value)} dir="ltr" className={fieldClass} /></label>
      <div className="flex gap-2 border-b">{languages.map((value) => <button key={value} type="button" onClick={() => setActiveLanguage(value)} className={`border-b-2 px-3 py-2 font-bold ${activeLanguage === value ? 'border-emerald-800' : 'border-transparent'}`}>{value.toUpperCase()}</button>)}</div>
      <label className="text-sm font-semibold">{t('الموضوع', language)}<input required={activeLanguage === 'ar'} value={translations[activeLanguage].subject} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], subject: event.target.value } }))} className={fieldClass} /></label>
      <label className="text-sm font-semibold md:col-span-2">{t('نص الرسالة', language)}<textarea required={activeLanguage === 'ar'} rows={5} value={translations[activeLanguage].body} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], body: event.target.value } }))} className={fieldClass} /><span className="text-xs text-slate-500">{t('المتغيرات المدعومة', language)}: {'{{firstName}}, {{lastName}}, {{email}}, {{storyTitle}}, {{quizTitle}}, {{score}}, {{result}}, {{orderId}}, {{total}}, {{currency}}, {{actionUrl}}'}</span></label>
      <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50">{busy ? t('جارٍ الحفظ…', language) : t(editingId ? 'تحديث النموذج' : 'حفظ النموذج', language)}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setCode(''); setTranslations(blankMailText()); }} className="rounded-full border px-5 py-2.5 font-bold">{t('إلغاء التعديل', language)}</button>}</div>
    </form>
    <button type="button" disabled={busy} onClick={() => void processReminders()} className="rounded-full border border-emerald-900 px-5 py-2.5 font-bold text-emerald-900 disabled:opacity-50">{t('معالجة التذكيرات المستحقة الآن', language)}</button>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    <div className="space-y-3">{templates.map((template) => <article key={template.id} className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}><div><h2 className="font-bold">{template.code}</h2><p className="text-sm text-slate-500">{template.translations?.[language]?.subject || template.translations?.ar?.subject}</p><p className="text-xs text-slate-500">{t(template.isActive ? 'نشط' : 'متوقف', language)}</p></div><div className="flex gap-2"><button disabled={busy} onClick={() => editTemplate(template)} className="rounded-lg border px-4 py-2 text-sm font-bold">{t('تعديل', language)}</button><button disabled={busy} onClick={() => void toggleTemplate(template)} className="rounded-lg border px-4 py-2 text-sm font-bold">{t(template.isActive ? 'إيقاف' : 'تفعيل', language)}</button><button disabled={busy} onClick={() => void testSend(template)} className="rounded-lg border px-4 py-2 text-sm font-bold">{t('إرسال رسالة اختبار', language)}</button></div></article>)}</div>
    <Pager page={page} total={total} onPage={setPage} language={language} />
  </AdminPage>;
}

type PolicyText = Record<Language, { title: string; body: string }>;
function blankPolicy(): PolicyText {
  return { ar: { title: '', body: '' }, en: { title: '', body: '' }, fr: { title: '', body: '' } };
}
export function AdminPolicyPage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [code, setCode] = useState<'sources' | 'representation'>('sources');
  const [translations, setTranslations] = useState(blankPolicy());
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    api.get<Array<{ code: string; translations: PolicyText }>>('/admin/system/policy')
      .then((pages) => {
        const page = pages.find((item) => item.code === code);
        setTranslations(page?.translations || blankPolicy());
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل سياسة النشر.', language)));
  }, [code, language]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.put(`/admin/system/policy/${code}`, { translations });
      setNotice(t('تم حفظ السياسة.', language));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ السياسة.', language));
    } finally {
      setBusy(false);
    }
  }
  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <AdminPage title="سياسة التصوير والمراجعة"><AccessDenied /></AdminPage>;
  return <AdminPage title="سياسة التصوير والمراجعة">
    <form onSubmit={save} className={`${cardClass} space-y-4`}>
      <label className="block text-sm font-semibold">{t('القسم', language)}<select value={code} onChange={(event) => setCode(event.target.value as typeof code)} className={fieldClass}><option value="sources">{t('المصادر والمراجعة', language)}</option><option value="representation">{t('التصوير والتمثيل', language)}</option></select></label>
      <div className="flex gap-2 border-b">{languages.map((value) => <button key={value} type="button" onClick={() => setActiveLanguage(value)} className={`border-b-2 px-3 py-2 font-bold ${activeLanguage === value ? 'border-emerald-800' : 'border-transparent'}`}>{value.toUpperCase()}</button>)}</div>
      <label className="block text-sm font-semibold">{t('العنوان', language)}<input required={activeLanguage === 'ar'} value={translations[activeLanguage].title} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], title: event.target.value } }))} className={fieldClass} /></label>
      <label className="block text-sm font-semibold">{t('النص', language)}<textarea required={activeLanguage === 'ar'} rows={10} value={translations[activeLanguage].body} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], body: event.target.value } }))} className={fieldClass} /></label>
      <button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50">{busy ? t('جارٍ الحفظ…', language) : t('حفظ السياسة', language)}</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
  </AdminPage>;
}

function Pager({ page, total, onPage, language }: { page: number; total: number; onPage: (page: number) => void; language: Language }) {
  return <div className="flex items-center justify-between text-sm"><span>{total} · {t('الإجمالي', language)}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">{t('السابق', language)}</button><button disabled={page * 20 >= total} onClick={() => onPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">{t('التالي', language)}</button></div></div>;
}
