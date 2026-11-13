import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

type BadgeRecord = {
  id: number;
  code: string;
  name: string;
  icon?: string;
  description?: string | null;
  isActive?: boolean;
};

type ReviewRecord = {
  id: number;
  rating: number;
  title?: string | null;
  body: string;
  status: string;
  moderationNote?: string | null;
  createdAt: string;
  user: { id: number; name: string; email?: string } | null;
  story?: { id: number; title: string; slug: string } | null;
  book?: { id: number; title: string; slug: string } | null;
};

type StoryRequestRecord = {
  id: number;
  title: string;
  description: string;
  source?: string | null;
  status: string;
  adminNotes?: string | null;
  contactEmail?: string | null;
  createdAt: string;
  user?: { id: number; name: string; email?: string } | null;
};

function useAdminLanguage() {
  const { locale = 'ar' } = useParams();
  return (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as SiteLanguage;
}

function t(text: string, language: SiteLanguage) {
  return translateText(text, language);
}

export function AdminBadgesPage() {
  const language = useAdminLanguage();
  const [badges, setBadges] = useState<BadgeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('story-complete');
  const [name, setName] = useState('Story complete');
  const [description, setDescription] = useState('Awarded for finishing a story.');
  const [busy, setBusy] = useState(false);
  const { user } = useStoryAuth();

  useEffect(() => {
    let active = true;
    api.get<BadgeRecord[]>('/admin/community/badges')
      .then((response) => { if (active) setBadges(response); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل الشارات.', language)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<BadgeRecord>('/admin/community/badges', { code, name, description, icon: 'award', isActive: true });
      setBadges((current) => [created, ...current]);
      setCode('');
      setName('');
      setDescription('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ الشارة.', language));
    } finally {
      setBusy(false);
    }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">{t('إذن غير متاح.', language)}</div>;
  }

  return <div className="mx-auto max-w-6xl space-y-8 p-6">
    <header className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-emerald-700">{t('الشارات والشهادات', language)}</p>
        <h1 className="text-3xl font-black text-slate-950">{t('إدارة الشارات', language)}</h1>
      </div>
    </header>
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2">
      <label className="space-y-2 text-sm font-semibold text-slate-700">{t('الكود', language)}<input value={code} onChange={(event) => setCode(event.target.value)} className="w-full rounded-xl border p-3" /></label>
      <label className="space-y-2 text-sm font-semibold text-slate-700">{t('الاسم', language)}<input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border p-3" /></label>
      <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">{t('الوصف', language)}<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border p-3" rows={3} /></label>
      <div className="md:col-span-2"><button type="submit" disabled={busy} className="rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-60">{busy ? t('جارٍ الحفظ…', language) : t('إضافة شارة', language)}</button></div>
    </form>
    {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>}
    <section className="grid gap-4 md:grid-cols-2">
      {loading && <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">{t('جارٍ التحميل…', language)}</p>}
      {!loading && badges.map((badge) => <article key={badge.id} className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-emerald-700">{badge.code}</p>
            <h2 className="text-xl font-black text-slate-950">{badge.name}</h2>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{badge.isActive ? t('نشط', language) : t('معطل', language)}</span>
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-600">{badge.description || t('لا يوجد وصف.', language)}</p>
      </article>)}
    </section>
  </div>;
}

export function AdminReviewsPage() {
  const language = useAdminLanguage();
  const [items, setItems] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { user } = useStoryAuth();

  useEffect(() => {
    let active = true;
    api.get<ReviewRecord[]>('/admin/community/reviews')
      .then((response) => { if (active) setItems(response); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function moderate(id: number, status: 'approved' | 'rejected' | 'hidden' | 'reported') {
    setBusyId(id);
    try {
      await api.post(`/admin/community/reviews/${id}/moderate`, { status });
      setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    } finally {
      setBusyId(null);
    }
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">{t('إذن غير متاح.', language)}</div>;
  }

  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <header>
      <p className="text-sm font-bold text-emerald-700">{t('مراجعة التقييمات', language)}</p>
      <h1 className="text-3xl font-black text-slate-950">{t('التقييمات والإشعارات', language)}</h1>
    </header>
    {loading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-500">{t('جارٍ التحميل…', language)}</p>}
    <div className="space-y-4">
      {items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.user?.name || 'مستخدم'}</p>
            <h2 className="text-xl font-black text-slate-950">{item.title || 'تقييم'}</h2>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">{item.status}</span>
        </div>
        <p className="mt-3 leading-7 text-slate-600">{item.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={() => void moderate(item.id, 'approved')} disabled={busyId === item.id} className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t('موافقة', language)}</button>
          <button onClick={() => void moderate(item.id, 'rejected')} disabled={busyId === item.id} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-50">{t('رفض', language)}</button>
          <button onClick={() => void moderate(item.id, 'hidden')} disabled={busyId === item.id} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">{t('إخفاء', language)}</button>
        </div>
      </article>)}
    </div>
  </div>;
}

export function AdminStoryRequestsPage() {
  const language = useAdminLanguage();
  const [items, setItems] = useState<StoryRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useStoryAuth();

  useEffect(() => {
    let active = true;
    api.get<StoryRequestRecord[]>('/admin/content/requests')
      .then((response) => { if (active) setItems(response); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function convert(id: number) {
    await api.post(`/admin/content/requests/${id}/convert`, {});
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: 'converted' } : item));
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role)) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">{t('إذن غير متاح.', language)}</div>;
  }

  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <header>
      <p className="text-sm font-bold text-emerald-700">{t('طلبات القصص', language)}</p>
      <h1 className="text-3xl font-black text-slate-950">{t('سجل الطلبات', language)}</h1>
    </header>
    {loading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-500">{t('جارٍ التحميل…', language)}</p>}
    <div className="space-y-4">
      {items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">{item.title}</h2>
            <p className="text-sm text-slate-500">{item.user?.name || t('مستخدم مجهول', language)}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{item.status}</span>
        </div>
        <p className="mt-3 leading-7 text-slate-600">{item.description}</p>
        {item.source && <p className="mt-2 text-sm text-slate-500">{t('المصدر', language)}: {item.source}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {item.status !== 'converted' && <button onClick={() => void convert(item.id)} className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white">{t('تحويل إلى مسودة', language)}</button>}
        </div>
      </article>)}
    </div>
  </div>;
}
