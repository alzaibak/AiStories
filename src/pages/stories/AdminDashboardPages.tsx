import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { BookOpen, CircleDollarSign, ClipboardList, Library, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

type AdminStory = {
  id: number;
  title: string;
  slug: string;
  status: 'draft' | 'in_review' | 'published' | 'rejected' | 'archived' | string;
  rejectionReason?: string | null;
  publishedAt?: string | null;
  summary?: string;
  updatedAt?: string;
  parts?: Array<{ id: number; partNumber: number; title?: string; content?: string; endingHook?: string }>;
  collection?: { title: string };
};

type AdminCollection = {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  isFree?: boolean;
  isActive?: boolean;
  translations?: Partial<Record<SiteLanguage, Record<string, string>>>;
};
type AdminBook = {
  id: number;
  title: string;
  slug: string;
  format: string;
  price: string | number;
  currency: string;
  isPublished: boolean;
  status?: 'draft' | 'published' | 'archived';
  publishedAt?: string | null;
  fileStorageKey: string | null;
};
type AdminOrderSummary = { id: number; total: string | number; currency: string; createdAt: string };
type DashboardData = {
  stories: AdminStory[];
  subscriptions: unknown[] | null;
  orders: AdminOrderSummary[] | null;
};
type AdminActionState = {
  language: SiteLanguage;
  setBusyId: Dispatch<SetStateAction<number | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setReloadKey: Dispatch<SetStateAction<number>>;
};

function useAdminLanguage() {
  const { locale = 'ar' } = useParams();
  return (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as SiteLanguage;
}
async function deleteCollection(collection: AdminCollection, state: AdminActionState) {
  const { language, setBusyId, setError, setNotice, setReloadKey } = state;
  if (!window.confirm(t('هل تريد حذف هذه المجموعة الفارغة؟', language))) return;
  setBusyId(collection.id);
  setError(null);
  setNotice(null);
  try {
    await api.delete(`/admin/content/collections/${collection.id}`);
    setNotice(t('تم حذف المجموعة.', language));
    setReloadKey((value) => value + 1);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : t('تعذر حذف المجموعة.', language));
  } finally {
    setBusyId(null);
  }
}

function t(text: string, language: SiteLanguage) {
  return translateText(text, language);
}

async function deleteStory(story: AdminStory, state: AdminActionState) {
  const { language, setBusyId, setError, setNotice, setReloadKey } = state;
  if (!window.confirm(t('هل تريد حذف هذه المسودة نهائيًا؟', language))) return;
  setBusyId(story.id);
  setError(null);
  setNotice(null);
  try {
    await api.delete(`/admin/content/stories/${story.id}`);
    setNotice(t('تم حذف القصة.', language));
    setReloadKey((value) => value + 1);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : t('تعذر حذف القصة.', language));
  } finally {
    setBusyId(null);
  }
}

function ErrorMessage({ message, language }: { message: string; language: SiteLanguage }) {
  return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message || t('تعذر تحميل البيانات.', language)}</p>;
}

async function deleteBook(book: AdminBook, state: AdminActionState) {
  const { language, setBusyId, setError, setNotice, setReloadKey } = state;
  if (!window.confirm(t('هل تريد حذف هذا الكتاب غير المنشور نهائيًا؟', language))) return;
  setBusyId(book.id);
  setError(null);
  setNotice(null);
  try {
    await api.delete(`/admin/content/books/${book.id}`);
    setNotice(t('تم حذف الكتاب.', language));
    setReloadKey((value) => value + 1);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : t('تعذر حذف الكتاب.', language));
  } finally {
    setBusyId(null);
  }
}

function StatusBadge({ status, language }: { status: string; language: SiteLanguage }) {
  const styles: Record<string, string> = {
    published: 'bg-emerald-100 text-emerald-800',
    in_review: 'bg-amber-100 text-amber-900',
    draft: 'bg-slate-100 text-slate-700',
    rejected: 'bg-red-100 text-red-800',
    archived: 'bg-slate-200 text-slate-700'
  };
  const labels: Record<SiteLanguage, Record<string, string>> = {
    ar: { published: 'منشورة', in_review: 'قيد المراجعة', draft: 'مسودة', rejected: 'مرفوضة', archived: 'مؤرشفة' },
    en: { published: 'Published', in_review: 'In review', draft: 'Draft', rejected: 'Rejected', archived: 'Archived' },
    fr: { published: 'Publiée', in_review: 'En révision', draft: 'Brouillon', rejected: 'Rejetée', archived: 'Archivée' }
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles[status] || styles.draft}`}>{labels[language][status] || labels[language].draft}</span>;
}

export function AdminDashboardPage() {
  const language = useAdminLanguage();
  const { locale = 'ar' } = useParams();
  const { user } = useStoryAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isOwnerAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isReviewer = user?.role === 'REVIEWER';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const requests = [
      api.get<AdminStory[]>(isReviewer ? '/admin/content/review-queue' : '/admin/content/stories'),
      isOwnerAdmin ? api.get<unknown[]>('/admin/subscriptions') : Promise.resolve(null),
      isOwnerAdmin ? api.get<AdminOrderSummary[]>('/admin/store-orders') : Promise.resolve(null)
    ];
    Promise.all(requests).then(([stories, subscriptions, orders]) => {
      if (active) setData({ stories, subscriptions, orders });
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل البيانات.', language));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [isOwnerAdmin, isReviewer, language, reloadKey]);

  const metrics = [
    { label: 'القصص المنشورة', value: isReviewer ? null : data?.stories.filter((story) => story.status === 'published').length, icon: BookOpen, note: isReviewer ? 'بيانات القصص المنشورة غير متاحة لدور المراجع' : 'من مكتبة القصص' },
    { label: 'المشتركون', value: data?.subscriptions?.length, icon: Users, note: 'حسابات الاشتراك' },
    { label: 'طلبات الكتب', value: data?.orders?.length, icon: ClipboardList, note: 'إجمالي الطلبات' },
    { label: 'بانتظار المراجعة', value: data?.stories.filter((story) => story.status === 'in_review').length, icon: ShieldCheck, note: 'قصص قيد المراجعة' },
    { label: 'الإيرادات هذا الشهر', value: null, icon: CircleDollarSign, note: 'لا تتوفر بيانات الإيرادات في لوحة الإدارة بعد' },
    { label: 'التبرعات', value: null, icon: Library, note: 'لا تتوفر بيانات التبرعات في لوحة الإدارة بعد' },
    { label: 'المسابقة النشطة', value: null, icon: ShieldCheck, note: 'لا تتوفر بيانات المسابقات في لوحة الإدارة بعد' }
  ];
  const recentOrders = (data?.orders || []).slice(0, 5);

  return <div className="mx-auto max-w-7xl space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-emerald-700">{t('لوحة الإدارة', language)}</p>
        <h1 className="mt-1 text-3xl font-black text-slate-950">{t('نظرة عامة', language)}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('ملخص مباشر للمحتوى والعمليات المتاحة.', language)}</p>
      </div>
      <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {t('تحديث', language)}
      </button>
    </header>
    {error && <ErrorMessage message={error} language={language} />}
    <section aria-label={t('ملخص المؤشرات', language)} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map(({ label, value, icon: Icon, note }) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">{t(label, language)}</p>
            <p className="mt-2 text-3xl font-black text-slate-950" aria-live="polite">{loading ? '…' : value == null ? '—' : value}</p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Icon size={20} /></span>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{t(note, language)}</p>
      </article>)}
    </section>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">{t('القصص الأخيرة', language)}</h2>
          <Link to={`/${locale}/admin/content/stories`} className="text-sm font-bold text-emerald-800 underline">{t('عرض الكل', language)}</Link>
        </div>
        {loading && <p role="status" className="mt-4 text-sm text-slate-500">{t('جارٍ التحميل…', language)}</p>}
        {!loading && !error && !data?.stories.length && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t('لا توجد قصص بعد.', language)}</p>}
        <ul className="mt-4 divide-y divide-slate-100">
          {(data?.stories || []).slice(0, 5).map((story) => <li key={story.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="truncate font-semibold">{story.title}</p><p className="mt-1 text-xs text-slate-500">{story.parts?.length || 0} · {t('الأجزاء', language)}</p></div>
            <StatusBadge status={story.status} language={language} />
          </li>)}
        </ul>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-extrabold">{t('أحدث الطلبات', language)}</h2>
        {loading && <p role="status" className="mt-4 text-sm text-slate-500">{t('جارٍ التحميل…', language)}</p>}
        {!loading && !error && !recentOrders.length && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t('لا توجد طلبات بعد.', language)}</p>}
        {recentOrders.length > 0 && <>
          <ul className="mt-3 divide-y divide-slate-100">{recentOrders.map((order) => <li key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="font-semibold">#{order.id} · {new Date(order.createdAt).toLocaleDateString(language)}</span>
            <span className="font-bold">{new Intl.NumberFormat(language, { style: 'currency', currency: order.currency }).format(Number(order.total))}</span>
          </li>)}</ul>
          <Link to={`/${locale}/admin/orders`} className="mt-2 inline-block text-sm font-bold text-emerald-800 underline">{t('إدارة الطلبات', language)}</Link>
        </>}
      </section>
    </div>
  </div>;
}

export function AdminStoriesPage() {
  const language = useAdminLanguage();
  const { locale = 'ar' } = useParams();
  const { user } = useStoryAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const search = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const pageSize = 10;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get<AdminStory[]>('/admin/content/stories').then((items) => {
      if (active) setStories(items);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل القصص.', language));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [language, reloadKey]);

  const filteredStories = useMemo(() => stories.filter((story) => {
    const matchesSearch = `${story.title} ${story.slug} ${story.collection?.title || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    return matchesSearch && (statusFilter === 'all' || story.status === statusFilter);
  }), [search, statusFilter, stories]);
  const pageCount = Math.max(1, Math.ceil(filteredStories.length / pageSize));
  const visibleStories = filteredStories.slice((page - 1) * pageSize, page * pageSize);
  async function storyAction(story: AdminStory, action: 'submit' | 'approve' | 'reject' | 'return' | 'unpublish') {
    setBusyId(story.id);
    setError(null);
    setNotice(null);
    try {
      if (action === 'submit') {
        await api.post(`/admin/content/stories/${story.id}/submit-review`, {});
        setNotice(t('أُرسلت القصة للمراجعة.', language));
      } else if (action === 'reject') {
        const comments = window.prompt(t('أدخل سبب الرفض الإلزامي.', language))?.trim();
        if (!comments) return;
        await api.post(`/admin/content/stories/${story.id}/review`, { decision: 'rejected', comments });
        setNotice(t('تم رفض القصة وحفظ السبب.', language));
      } else if (action === 'approve') {
        await api.post(`/admin/content/stories/${story.id}/review`, { decision: 'approved', comments: '' });
        setNotice(t('تم اعتماد القصة ونشرها.', language));
      } else if (action === 'return') {
        await api.post(`/admin/content/stories/${story.id}/review`, { decision: 'return_to_draft', comments: '' });
        setNotice(t('أُعيدت القصة إلى المسودة.', language));
      } else {
        if (!window.confirm(t('إزالة القصة من الموقع العام؟', language))) return;
        await api.post(`/admin/content/stories/${story.id}/unpublish`, {});
        setNotice(t('أُزيل نشر القصة.', language));
      }
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث القصة.', language));
    } finally {
      setBusyId(null);
    }
  }

  function updateSearch(nextSearch: string) {
    const next = new URLSearchParams(searchParams);
    if (nextSearch) next.set('q', nextSearch);
    else next.delete('q');
    setSearchParams(next, { replace: true });
    setPage(1);
  }

  function updateStatus(nextStatus: string) {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === 'all') next.delete('status');
    else next.set('status', nextStatus);
    setSearchParams(next, { replace: true });
    setPage(1);
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold text-emerald-700">{t('المحتوى', language)}</p><h1 className="mt-1 text-3xl font-black">{t('القصص', language)}</h1><p className="mt-2 text-sm text-slate-600">{t('ابحث عن القصص وراجع حالتها وأجزائها.', language)}</p></div>
      <Link to={`/${locale}/admin/content/stories/new`} className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white">{t('إنشاء قصة', language)}</Link>
    </header>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap gap-3">
        <label className="min-w-52 flex-1 text-sm font-semibold">{t('البحث', language)}<input aria-label={t('البحث عن القصص', language)} value={search} onChange={(event) => updateSearch(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder={t('العنوان أو المجموعة', language)} /></label>
        <label className="text-sm font-semibold">{t('الحالة', language)}<select value={statusFilter} onChange={(event) => updateStatus(event.target.value)} className="mt-1.5 block rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <option value="all">{t('كل الحالات', language)}</option><option value="draft">{t('مسودة', language)}</option><option value="in_review">{t('قيد المراجعة', language)}</option><option value="published">{t('منشورة', language)}</option><option value="rejected">{t('مرفوضة', language)}</option><option value="archived">{t('مؤرشفة', language)}</option>
        </select></label>
      </div>
      {error && <ErrorMessage message={error} language={language} />}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {loading && <p role="status" className="py-8 text-center text-sm text-slate-500">{t('جارٍ تحميل القصص…', language)}</p>}
      {!loading && !error && filteredStories.length === 0 && <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-600">{t('لا توجد قصص تطابق بحثك.', language)}</p>}
      {!loading && filteredStories.length > 0 && <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-start text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>
            <th className="px-3 py-3 font-bold">{t('القصة', language)}</th><th className="px-3 py-3 font-bold">{t('المجموعة', language)}</th><th className="px-3 py-3 font-bold">{t('الأجزاء', language)}</th><th className="px-3 py-3 font-bold">{t('الحالة', language)}</th><th className="px-3 py-3 font-bold">{t('الإجراءات', language)}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visibleStories.map((story) => <tr key={story.id}>
              <td className="px-3 py-4"><p className="font-bold text-slate-900">{story.title}</p><p className="mt-1 text-xs text-slate-500" dir="ltr">{story.slug}</p>{story.status === 'rejected' && story.rejectionReason && <p className="mt-2 text-xs text-red-700">{t('سبب الرفض', language)}: {story.rejectionReason}</p>}</td>
              <td className="px-3 py-4">{story.collection?.title || '—'}</td>
              <td className="px-3 py-4">{story.parts?.length || 0}</td>
              <td className="px-3 py-4"><StatusBadge status={story.status} language={language} /></td>
              <td className="px-3 py-4"><div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Link to={`/${locale}/admin/content/stories/${story.id}/edit`} className="font-bold text-emerald-800 underline">{t('تعديل', language)}</Link>
                <Link to={`/${locale}/admin/content/stories/${story.id}/parts/new`} className="font-bold text-emerald-800 underline">{t('الأجزاء', language)}</Link>
                {['draft', 'rejected'].includes(story.status) && <button type="button" onClick={() => void storyAction(story, 'submit')} disabled={busyId === story.id} className="font-bold text-slate-700 underline disabled:opacity-50">{t(story.status === 'rejected' ? 'إعادة الإرسال للمراجعة' : 'إرسال للمراجعة', language)}</button>}
                {story.status === 'in_review' && ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && <>
                  <button type="button" onClick={() => void storyAction(story, 'approve')} disabled={busyId === story.id} className="font-bold text-emerald-800 underline disabled:opacity-50">{t('اعتماد ونشر', language)}</button>
                  <button type="button" onClick={() => void storyAction(story, 'reject')} disabled={busyId === story.id} className="font-bold text-red-700 underline disabled:opacity-50">{t('رفض', language)}</button>
                  <button type="button" onClick={() => void storyAction(story, 'return')} disabled={busyId === story.id} className="font-bold text-slate-700 underline disabled:opacity-50">{t('إعادة إلى المسودة', language)}</button>
                </>}
                {story.status === 'published' && ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && <button type="button" onClick={() => void storyAction(story, 'unpublish')} disabled={busyId === story.id} className="font-bold text-amber-800 underline disabled:opacity-50">{t('إلغاء النشر', language)}</button>}
                {['draft', 'rejected', 'archived'].includes(story.status) && !story.publishedAt && <button type="button" onClick={() => void deleteStory(story, { language, setBusyId, setError, setNotice, setReloadKey })} disabled={busyId === story.id} className="font-bold text-red-700 underline disabled:opacity-50">{t('حذف', language)}</button>}
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      {!loading && filteredStories.length > 0 && <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
        <p className="text-slate-500">{t('الصفحة', language)} {page} {t('من', language)} {pageCount}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">{t('السابق', language)}</button>
          <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">{t('التالي', language)}</button>
        </div>
      </div>}
    </section>
  </div>;
}

export function AdminCollectionsPage() {
  const language = useAdminLanguage();
  const { locale = 'ar' } = useParams();
  const [collections, setCollections] = useState<AdminCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<AdminCollection[]>('/admin/content/collections').then((items) => {
      if (active) setCollections(items);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل المجموعات.', language));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [language, reloadKey]);

  const filtered = collections.filter((collection) =>
    `${collection.title} ${collection.slug}`.toLowerCase().includes(query.toLowerCase()) &&
    (statusFilter === 'all' || (statusFilter === 'active' ? collection.isActive !== false : collection.isActive === false))
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleCollections = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function toggleActive(collection: AdminCollection) {
    setBusyId(collection.id);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/admin/content/collections/${collection.id}`, { isActive: collection.isActive === false });
      setNotice(t(collection.isActive === false ? 'تم تفعيل المجموعة.' : 'تم إيقاف المجموعة.', language));
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث المجموعة.', language));
    } finally {
      setBusyId(null);
    }
  }
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold text-emerald-700">{t('المحتوى', language)}</p><h1 className="mt-1 text-3xl font-black">{t('المجموعات', language)}</h1></div>
      <Link to={`/${locale}/admin/content/collections/new`} className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white">{t('إنشاء مجموعة', language)}</Link>
    </header>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="min-w-52 flex-1 text-sm font-semibold">{t('البحث', language)}<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-semibold">{t('الحالة', language)}<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="mt-1.5 block rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <option value="all">{t('كل الحالات', language)}</option><option value="active">{t('نشطة', language)}</option><option value="inactive">{t('غير نشطة', language)}</option>
        </select></label>
      </div>
      {error && <ErrorMessage message={error} language={language} />}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {loading && <p role="status" className="py-8 text-center text-sm text-slate-500">{t('جارٍ تحميل المحتوى…', language)}</p>}
      {!loading && !error && !filtered.length && <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-600">{t('لا توجد مجموعات بعد.', language)}</p>}
      {!loading && filtered.length > 0 && <>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-start text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">{t('المجموعة', language)}</th><th className="px-3 py-3">{t('الرابط', language)}</th><th className="px-3 py-3">{t('الوصول', language)}</th><th className="px-3 py-3">{t('الحالة', language)}</th><th className="px-3 py-3">{t('الإجراءات', language)}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{visibleCollections.map((collection) => <tr key={collection.id}>
            <td className="px-3 py-4 font-bold">{collection.title}</td>
            <td dir="ltr" className="px-3 py-4 text-start text-slate-500">{collection.slug}</td>
            <td className="px-3 py-4">{t(collection.isFree ? 'مجانية' : 'مميزة', language)}</td>
            <td className="px-3 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${collection.isActive === false ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>{t(collection.isActive === false ? 'غير نشطة' : 'نشطة', language)}</span></td>
            <td className="px-3 py-4"><div className="flex flex-wrap gap-3">
              <Link to={`/${locale}/admin/content/collections/${collection.id}/edit`} className="font-bold text-emerald-800 underline">{t('تعديل', language)}</Link>
              <button type="button" onClick={() => void toggleActive(collection)} disabled={busyId === collection.id} className="font-bold text-slate-700 underline disabled:opacity-50">{t(collection.isActive === false ? 'تفعيل' : 'إيقاف', language)}</button>
              <button type="button" onClick={() => void deleteCollection(collection, { language, setBusyId, setError, setNotice, setReloadKey })} disabled={busyId === collection.id} className="font-bold text-red-700 underline disabled:opacity-50">{t('حذف', language)}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
          <p className="text-slate-500">{t('الصفحة', language)} {page} {t('من', language)} {pageCount}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">{t('السابق', language)}</button>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">{t('التالي', language)}</button>
          </div>
        </div>
      </>}
    </section>
  </div>;
}

export function AdminBooksPage() {
  const language = useAdminLanguage();
  const { locale = 'ar' } = useParams();
  const { user } = useStoryAuth();
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get<AdminBook[]>('/admin/content/books').then((items) => {
      if (active) setBooks(items);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل الكتب.', language));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [language, reloadKey]);

  const filtered = books.filter((book) =>
    `${book.title} ${book.slug}`.toLowerCase().includes(query.toLowerCase()) &&
    (statusFilter === 'all' || (book.status || (book.isPublished ? 'published' : 'draft')) === statusFilter)
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleBooks = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function togglePublished(book: AdminBook) {
    setBusyId(book.id);
    setError(null);
    setNotice(null);
    try {
      const currentStatus = book.status || (book.isPublished ? 'published' : 'draft');
      await api.post(`/admin/content/books/${book.id}/${currentStatus === 'published' ? 'unpublish' : 'publish'}`, {});
      setNotice(t(currentStatus === 'published' ? 'تم إلغاء نشر الكتاب.' : 'تم نشر الكتاب.', language));
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث الكتاب.', language));
    } finally {
      setBusyId(null);
    }
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold text-emerald-700">{t('التجارة', language)}</p><h1 className="mt-1 text-3xl font-black">{t('الكتب والكتب الإلكترونية', language)}</h1></div>
      <Link to={`/${locale}/admin/shop/books/new`} className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white">{t('إضافة كتاب', language)}</Link>
    </header>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap gap-3">
        <label className="min-w-52 flex-1 text-sm font-semibold">{t('البحث', language)}<input aria-label={t('البحث عن الكتب', language)} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-semibold">{t('الحالة', language)}<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="mt-1.5 block rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <option value="all">{t('كل الحالات', language)}</option><option value="published">{t('منشورة', language)}</option><option value="draft">{t('مسودة', language)}</option><option value="archived">{t('مؤرشفة', language)}</option>
        </select></label>
      </div>
      {error && <ErrorMessage message={error} language={language} />}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {loading && <p role="status" className="py-8 text-center text-sm text-slate-500">{t('جارٍ تحميل المحتوى…', language)}</p>}
      {!loading && !error && !filtered.length && <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-600">{t('لا توجد كتب بعد.', language)}</p>}
      {!loading && filtered.length > 0 && <>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-start text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">{t('العنوان', language)}</th><th className="px-3 py-3">{t('النوع', language)}</th><th className="px-3 py-3">{t('السعر', language)}</th><th className="px-3 py-3">{t('الحالة', language)}</th><th className="px-3 py-3">{t('الإجراءات', language)}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{visibleBooks.map((book) => <tr key={book.id}>
            <td className="px-3 py-4"><p className="font-bold">{book.title}</p><p dir="ltr" className="mt-1 text-xs text-slate-500">{book.slug}</p></td>
            <td className="px-3 py-4">{t(book.format === 'ebook' ? 'إلكتروني' : 'ورقي', language)}{book.format === 'ebook' && !book.fileStorageKey && <p className="mt-1 text-xs text-amber-800">{t('ملف PDF غير مرفق', language)}</p>}</td>
            <td className="px-3 py-4">{new Intl.NumberFormat(language, { style: 'currency', currency: book.currency }).format(Number(book.price))}</td>
            <td className="px-3 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${(book.status || (book.isPublished ? 'published' : 'draft')) === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{(book.status || (book.isPublished ? 'published' : 'draft')) === 'archived' ? t('مؤرشفة', language) : (book.status || (book.isPublished ? 'published' : 'draft')) === 'published' ? t('منشورة', language) : t('مسودة', language)}</span></td>
            <td className="px-3 py-4"><div className="flex flex-wrap gap-3">
              <Link to={`/${locale}/admin/shop/books/${book.id}/edit`} className="font-bold text-emerald-800 underline">{t('تعديل', language)}</Link>
              {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (book.status || (book.isPublished ? 'published' : 'draft')) !== 'archived' && <button type="button" onClick={() => void togglePublished(book)} disabled={busyId === book.id || book.format === 'ebook' && !book.fileStorageKey} className="font-bold text-slate-700 underline disabled:opacity-40">{t((book.status || (book.isPublished ? 'published' : 'draft')) === 'published' ? 'إلغاء النشر' : 'نشر', language)}</button>}
              {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && book.status !== 'archived' && <button type="button" onClick={async () => {
                if (!window.confirm(t('أرشفة هذا الكتاب نهائيًا؟', language))) return;
                setBusyId(book.id);
                try {
                  await api.post(`/admin/content/books/${book.id}/archive`, {});
                  setReloadKey((value) => value + 1);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : t('Impossible d’archiver le livre.', language));
                } finally {
                  setBusyId(null);
                }
              }} disabled={busyId === book.id} className="font-bold text-red-700 underline disabled:opacity-40">{t('Archiver', language)}</button>}
              {!book.publishedAt && (book.status || (book.isPublished ? 'published' : 'draft')) !== 'published' && <button type="button" onClick={() => void deleteBook(book, { language, setBusyId, setError, setNotice, setReloadKey })} disabled={busyId === book.id} className="font-bold text-red-700 underline disabled:opacity-40">{t('حذف', language)}</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
          <p className="text-slate-500">{t('الصفحة', language)} {page} {t('من', language)} {pageCount}</p>
          <div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">{t('السابق', language)}</button><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">{t('التالي', language)}</button></div>
        </div>
      </>}
    </section>
  </div>;
}

export function AdminReviewQueuePage() {
  const language = useAdminLanguage();
  const { user } = useStoryAuth();
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [comments, setComments] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get<AdminStory[]>('/admin/content/review-queue').then((items) => {
      if (active) setStories(items);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل قائمة المراجعة.', language));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [language, reloadKey]);

  async function review(story: AdminStory, decision: 'approved' | 'rejected') {
    const comment = comments[story.id]?.trim();
    if (decision === 'rejected' && !comment) {
      setError(t('أضف سببًا إلزاميًا قبل رفض القصة.', language));
      return;
    }
    setBusyId(story.id);
    setError(null);
    try {
      await api.post(`/admin/content/stories/${story.id}/review`, { decision, comments: comment });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر نشر القصة.', language));
    } finally {
      setBusyId(null);
    }
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <header><p className="text-sm font-bold text-emerald-700">{t('المحتوى', language)}</p><h1 className="mt-1 text-3xl font-black">{t('قائمة المراجعة', language)}</h1><p className="mt-2 text-sm text-slate-600">{t('راجع القصص المقدمة قبل نشرها.', language)}</p></header>
    {error && <ErrorMessage message={error} language={language} />}
    {loading && <p role="status" className="rounded-2xl bg-white p-8 text-center text-slate-500">{t('جارٍ تحميل المحتوى…', language)}</p>}
    {!loading && !error && !stories.length && <p className="rounded-2xl bg-white p-8 text-center text-slate-600">{t('لا توجد قصص بانتظار المراجعة.', language)}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{stories.map((story) => <article key={story.id} className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3"><h2 className="font-extrabold">{story.title}</h2><StatusBadge status={story.status} language={language} /></div>
      <p className="mt-2 text-sm text-slate-600">{story.collection?.title || '—'} · {story.parts?.length || 0} {t('الأجزاء', language)}</p>
      <details className="mt-4 rounded-xl bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-bold">{t('معاينة المحتوى', language)}</summary>
        {story.summary && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{story.summary}</p>}
        <ol className="mt-3 space-y-3">{story.parts?.map((part) => <li key={part.id} className="border-t border-slate-200 pt-3">
          <h3 className="font-bold">{part.partNumber}. {part.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{part.content}</p>
          {part.endingHook && <p className="mt-2 text-sm font-semibold text-emerald-900">{part.endingHook}</p>}
        </li>)}</ol>
      </details>
      <label className="mt-4 block text-sm font-semibold">{t('ملاحظة المراجعة', language)}<textarea value={comments[story.id] || ''} onChange={(event) => setComments((current) => ({ ...current, [story.id]: event.target.value }))} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal" /></label>
      {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => void review(story, 'approved')} disabled={busyId === story.id} className="rounded-lg bg-emerald-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{t('Approuver et publier', language)}</button>
        <button type="button" onClick={() => void review(story, 'rejected')} disabled={busyId === story.id || !comments[story.id]?.trim()} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-800 disabled:opacity-50">{t('Rejeter', language)}</button>
      </div>}
    </article>)}</div>
  </div>;
}

export function AdminModulePage({ title }: { title: string }) {
  const language = useAdminLanguage();
  return <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8">
    <p className="text-sm font-bold text-emerald-700">{t('لوحة الإدارة', language)}</p>
    <h1 className="mt-2 text-3xl font-black">{t(title, language)}</h1>
    <p className="mt-4 leading-7 text-slate-600">{t('هذه الصفحة غير مفعلة بعد. ستُضاف عند تنفيذ المرحلة الخاصة بها.', language)}</p>
  </div>;
}
