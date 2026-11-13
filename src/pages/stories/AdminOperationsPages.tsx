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
  const [slug, setSlug] = useState('');
  const [quizId, setQuizId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [translations, setTranslations] = useState(blankEventText());
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
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
        slug,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        quizId: quizId ? Number(quizId) : null,
        status: 'draft',
        translations
      });
      setSlug('');
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
      <label className="text-sm font-semibold">{t('الرابط المختصر', language)}<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} dir="ltr" className={fieldClass} /></label>
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
        <div className="flex gap-2 border-b md:col-span-2">{languages.map((code) => <button key={code} type="button" onClick={() => setActiveLanguage(code)} className={`border-b-2 px-3 py-2 font-bold ${activeLanguage === code ? 'border-emerald-800' : 'border-transparent'}`}>{code.toUpperCase()}</button>)}</div>
        <label className="text-sm font-semibold md:col-span-2">{t('نص إعلان الفائز', language)}<textarea required={activeLanguage === 'ar'} rows={3} value={winnerAnnouncement[activeLanguage]} onChange={(event) => setWinnerAnnouncement((current) => ({ ...current, [activeLanguage]: event.target.value }))} className={fieldClass} /></label>
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
  const [slug, setSlug] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [translations, setTranslations] = useState(blankLocalized());
  const [activeLanguage, setActiveLanguage] = useState<Language>('ar');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await api.post('/admin/money/donation-campaigns', { slug, goalAmount: Number(goalAmount), currency: 'EUR', status: 'draft', translations });
      setSlug('');
      setGoalAmount('');
      setTranslations(blankLocalized());
      await loadCampaigns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ الحملة.', language));
    } finally {
      setBusy(false);
    }
  }

  async function activate(campaign: Campaign) {
    try {
      await api.patch(`/admin/money/donation-campaigns/${campaign.id}`, { status: 'active' });
      await loadCampaigns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تفعيل الحملة.', language));
    }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <AdminPage title="التبرعات والحملات"><AccessDenied /></AdminPage>;
  return <AdminPage title="التبرعات والحملات">
    <form onSubmit={create} className={`${cardClass} grid gap-4 md:grid-cols-2`}>
      <label className="text-sm font-semibold">{t('الرابط المختصر', language)}<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} dir="ltr" className={fieldClass} /></label>
      <label className="text-sm font-semibold">{t('الهدف (EUR)', language)}<input required type="number" min="0.01" step="0.01" value={goalAmount} onChange={(event) => setGoalAmount(event.target.value)} className={fieldClass} /></label>
      <div className="md:col-span-2 flex gap-2 border-b">{languages.map((code) => <button key={code} type="button" onClick={() => setActiveLanguage(code)} className={`border-b-2 px-3 py-2 font-bold ${activeLanguage === code ? 'border-emerald-800' : 'border-transparent'}`}>{code.toUpperCase()}</button>)}</div>
      <label className="text-sm font-semibold">{t('العنوان', language)}<input required={activeLanguage === 'ar'} value={translations[activeLanguage].title} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], title: event.target.value } }))} className={fieldClass} /></label>
      <label className="text-sm font-semibold md:col-span-2">{t('الوصف', language)}<textarea required={activeLanguage === 'ar'} rows={3} value={translations[activeLanguage].description} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], description: event.target.value } }))} className={fieldClass} /></label>
      <button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-2">{busy ? t('جارٍ الحفظ…', language) : t('إنشاء حملة نشطة', language)}</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <section className="grid gap-3 md:grid-cols-2">{campaigns.map((campaign) => {
      const raised = Number(campaign.raisedAmount);
      const goal = Number(campaign.goalAmount);
      return <article key={campaign.id} className={cardClass}><div className="flex items-center justify-between gap-3"><h2 className="font-bold">{campaign.translations?.[language]?.title || campaign.translations?.ar?.title}</h2>{campaign.status === 'draft' && <button onClick={() => void activate(campaign)} className="rounded-lg bg-emerald-900 px-3 py-1.5 text-sm font-bold text-white">{t('تفعيل', language)}</button>}</div><p className="mt-1 text-sm text-slate-500">{campaign.status} · {campaign.slug}</p><p className="mt-3 font-semibold">{raised.toFixed(2)} / {goal.toFixed(2)} {campaign.currency}</p><progress value={Math.min(raised, goal)} max={goal} className="mt-2 w-full" /></article>;
    })}</section>
    <section className={`${cardClass} space-y-3`}><h2 className="text-xl font-extrabold">{t('سجل التبرعات', language)}</h2>{donations.map((donation) => <div key={donation.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{donation.user ? `${donation.user.firstName} ${donation.user.lastName}` : t('متبرع', language)} · {donation.campaign?.slug}</span><span>{Number(donation.amount).toFixed(2)} {donation.currency} · {donation.status}</span></div>)}</section>
    <Pager page={page} total={total} onPage={setPage} language={language} />
    <section className={`${cardClass} space-y-3`}><h2 className="text-xl font-extrabold">{t('التبرعات الشهرية', language)}</h2>{recurringDonations.map((donation) => <div key={donation.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{donation.user ? `${donation.user.firstName} ${donation.user.lastName}` : t('متبرع', language)} · {donation.campaign?.slug} · {donation.status}{donation.cancelAtPeriodEnd ? ` · ${t('إلغاء بنهاية الفترة', language)}` : ''}</span><span>{Number(donation.amount).toFixed(2)} {donation.currency}</span></div>)}</section>
    <Pager page={recurringPage} total={recurringTotal} onPage={setRecurringPage} language={language} />
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

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/system/email-templates', { code, translations, isActive: true });
      setCode('');
      setTranslations(blankMailText());
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ النموذج.', language));
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
    <form onSubmit={create} className={`${cardClass} grid gap-4 md:grid-cols-2`}>
      <label className="text-sm font-semibold">{t('رمز النموذج', language)}<input required pattern="[a-z0-9_-]+" value={code} onChange={(event) => setCode(event.target.value)} dir="ltr" className={fieldClass} /></label>
      <div className="flex gap-2 border-b">{languages.map((value) => <button key={value} type="button" onClick={() => setActiveLanguage(value)} className={`border-b-2 px-3 py-2 font-bold ${activeLanguage === value ? 'border-emerald-800' : 'border-transparent'}`}>{value.toUpperCase()}</button>)}</div>
      <label className="text-sm font-semibold">{t('الموضوع', language)}<input required={activeLanguage === 'ar'} value={translations[activeLanguage].subject} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], subject: event.target.value } }))} className={fieldClass} /></label>
      <label className="text-sm font-semibold md:col-span-2">{t('نص الرسالة', language)}<textarea required={activeLanguage === 'ar'} rows={5} value={translations[activeLanguage].body} onChange={(event) => setTranslations((current) => ({ ...current, [activeLanguage]: { ...current[activeLanguage], body: event.target.value } }))} className={fieldClass} /><span className="text-xs text-slate-500">{t('المتغيرات المدعومة', language)}: {'{{firstName}}, {{lastName}}, {{email}}'}</span></label>
      <button disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-2">{busy ? t('جارٍ الحفظ…', language) : t('حفظ النموذج', language)}</button>
    </form>
    <button type="button" disabled={busy} onClick={() => void processReminders()} className="rounded-full border border-emerald-900 px-5 py-2.5 font-bold text-emerald-900 disabled:opacity-50">{t('معالجة التذكيرات المستحقة الآن', language)}</button>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    <div className="space-y-3">{templates.map((template) => <article key={template.id} className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}><div><h2 className="font-bold">{template.code}</h2><p className="text-sm text-slate-500">{template.translations?.[language]?.subject || template.translations?.ar?.subject}</p></div><button disabled={busy} onClick={() => void testSend(template)} className="rounded-lg border px-4 py-2 text-sm font-bold">{t('إرسال رسالة اختبار', language)}</button></article>)}</div>
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
