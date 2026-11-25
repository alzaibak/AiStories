import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Truck,
  XCircle
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

type Language = SiteLanguage;

type ReturnItemRecord = {
  id: number;
  titleSnapshot: string;
  quantity: number;
  itemPricePaid: string | number;
  deliveryFeeDeduction: string | number;
  refundAmount: string | number;
  calculationBreakdown?: Record<string, unknown> | null;
};

type ReturnEventRecord = {
  id: number;
  actorType: 'customer' | 'admin' | 'system';
  eventType: string;
  note?: string | null;
  createdAt: string;
};

type ReturnUser = { id: number; firstName?: string; lastName?: string; email: string; returnsBlocked?: boolean };

type ReturnRecord = {
  id: number;
  rmaNumber: string;
  orderId: number | null;
  mysteryBoxPurchaseId: number | null;
  reason: string;
  reasonDetails?: string | null;
  isSellerFault: boolean;
  status: string;
  requestedAt: string;
  windowStartAt?: string | null;
  windowEndAt?: string | null;
  shipBackDeadline?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  photos?: string[];
  refundAmount?: string | number | null;
  currency: string;
  refundedAt?: string | null;
  internalNotes?: string | null;
  inspectionResult?: string | null;
  items: ReturnItemRecord[];
  user?: ReturnUser | null;
  events?: ReturnEventRecord[];
  refunds?: Array<{ id: number; amount: string | number; status: string; stripeRefundId?: string | null; issuedAt?: string | null }>;
  order?: {
    id: number;
    total: string | number;
    currency: string;
    createdAt: string;
    shippedAt?: string | null;
    deliveredAt?: string | null;
    trackingNumber?: string | null;
  } | null;
  policy?: ReturnSettings;
};

type ReturnListPayload = { total: number; limit: number; offset: number; returns: ReturnRecord[] };

type ReturnDashboard = {
  openReturns: number;
  refundsThisMonth: number;
  returnsThisMonth: number;
  ordersThisMonth?: number;
  returnRate?: number;
  averageRefundDays: number;
  topReasons: Array<{ code: string; count: number }>;
};

type ReturnReasonSetting = {
  code: string;
  isSellerFault: boolean;
  requiresDetails: boolean;
  requiresPhotos: boolean;
  translations: Record<Language, string>;
};

type ReturnSettings = {
  returnsEnabled: boolean;
  defaultReturnWindowDays: 30 | 60;
  legalWithdrawalDays: number;
  applyLegalWithdrawalRules: boolean;
  deliveryDeductionMode: 'defined_fee' | 'fee_paid';
  returnShippingPayer: 'customer' | 'prepaid_label';
  returnAddress: { name?: string; company?: string; line1?: string; line2?: string; postalCode?: string; city?: string; country?: string };
  shipBackDeadlineDays: number;
  refundDeadlineDays: number;
  autoApproveRequests: boolean;
  autoRefundAfterAcceptance: boolean;
  requirePhotosForDefects: boolean;
  maxReturnsPerUserPerYear: number | null;
  defaultDeliveryEstimateDays: number;
  reasons: ReturnReasonSetting[];
  policyText: Record<Language, string>;
  conditionText: Record<Language, string>;
  emailTemplates?: Record<string, { subject: string; body: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  requested: 'طلب جديد',
  approved: 'تمت الموافقة',
  awaiting_shipment: 'بانتظار الإرسال',
  shipped_back: 'أُرسل إلينا',
  received: 'تم الاستلام',
  inspected: 'تم الفحص',
  refund_pending: 'الاسترداد قيد التنفيذ',
  refunded: 'تم الاسترداد',
  closed: 'مغلق',
  cancelled: 'ملغى',
  rejected: 'مرفوض',
  expired: 'منتهي'
};

const STATUS_STYLES: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-900',
  approved: 'bg-sky-100 text-sky-900',
  awaiting_shipment: 'bg-sky-100 text-sky-900',
  shipped_back: 'bg-indigo-100 text-indigo-900',
  received: 'bg-indigo-100 text-indigo-900',
  inspected: 'bg-violet-100 text-violet-900',
  refund_pending: 'bg-violet-100 text-violet-900',
  refunded: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-200 text-slate-700',
  cancelled: 'bg-slate-100 text-slate-600',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-slate-200 text-slate-600'
};

const EVENT_LABELS: Record<string, string> = {
  created: 'إنشاء الطلب',
  requested: 'إرسال الطلب',
  approved: 'موافقة',
  rejected: 'رفض',
  tracking_added: 'إضافة رقم التتبع',
  received: 'استلام الطلب',
  inspected: 'فحص الطلب',
  refund_issued: 'إصدار الاسترداد',
  refunded: 'تم الاسترداد',
  closed: 'إغلاق',
  cancelled: 'إلغاء',
  expired: 'انتهاء المهلة',
  override: 'تعديل يدوي',
  auto_approved: 'موافقة تلقائية'
};

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-700';

function useAdminLanguage(): Language {
  const { locale = 'ar' } = useParams();
  return (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as Language;
}

function t(text: string, language: Language) {
  return translateText(text, language);
}

function money(value: string | number | null | undefined, currency = 'EUR', language: Language = 'ar') {
  const amount = Number(value || 0);
  return new Intl.NumberFormat(language, { style: 'currency', currency }).format(amount);
}

function formatDate(value?: string | null, language: Language = 'ar') {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(language, { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status, language }: { status: string; language: Language }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[status] || STATUS_STYLES.requested}`}>
      {t(STATUS_LABELS[status] || status, language)}
    </span>
  );
}

function ErrorMessage({ message, language }: { message: string; language: Language }) {
  return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message || t('تعذر تحميل البيانات.', language)}</p>;
}

function Notice({ message, language }: { message: string; language: Language }) {
  return <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{t(message, language)}</p>;
}

function daysLeft(value?: string | null) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/* ------------------------------------------------------------------ */
/* Returns list                                                        */
/* ------------------------------------------------------------------ */

export function AdminReturnsPage() {
  const language = useAdminLanguage();
  const { locale = 'ar' } = useParams();
  const [data, setData] = useState<ReturnListPayload | null>(null);
  const [dashboard, setDashboard] = useState<ReturnDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({ status: '', reason: '', sellerFault: '', from: '', to: '', q: '' });
  const [settings, setSettings] = useState<ReturnSettings | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.reason) params.set('reason', filters.reason);
    if (filters.sellerFault) params.set('sellerFault', filters.sellerFault);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.q.trim()) params.set('q', filters.q.trim());
    params.set('limit', '100');
    return params.toString();
  }, [filters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<ReturnListPayload>(`/admin/returns?${query}`),
      api.get<ReturnDashboard>('/admin/returns/dashboard'),
      settings ? Promise.resolve(settings) : api.get<ReturnSettings>('/admin/returns/settings')
    ]).then(([list, stats, policy]) => {
      if (!active) return;
      setData(list);
      setDashboard(stats);
      setSettings(policy);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل المرتجعات.', language));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [language, query, reloadKey, settings]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await api.getBlob(`/admin/returns/export.csv?${query}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `returns-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice('تم تصدير الملف.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تصدير الملف.', language));
    } finally {
      setExporting(false);
    }
  }

  function reasonLabel(code: string) {
    return settings?.reasons.find((reason) => reason.code === code)?.translations?.[language]
      || settings?.reasons.find((reason) => reason.code === code)?.translations?.ar
      || code;
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-emerald-700">{t('التجارة', language)}</p>
        <h1 className="mt-1 text-3xl font-black">{t('المرتجعات والاستردادات', language)}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('تابع طلبات الإرجاع والاسترداد من الاستلام إلى الإغلاق.', language)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {t('تحديث', language)}
        </button>
        <button type="button" onClick={() => void exportCsv()} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t('تصدير CSV', language)}
        </button>
        <Link to={`/${locale}/admin/shop/returns/settings`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold">
          <Settings2 size={16} /> {t('سياسة الإرجاع', language)}
        </Link>
      </div>
    </header>

    {error && <ErrorMessage message={error} language={language} />}
    {notice && <Notice message={notice} language={language} />}

    <section aria-label={t('مؤشرات المرتجعات', language)} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {[
        { label: 'طلبات مفتوحة', value: dashboard?.openReturns, icon: RotateCcw },
        { label: 'استردادات هذا الشهر', value: dashboard?.refundsThisMonth, icon: CheckCircle2 },
        { label: 'نسبة الإرجاع', value: dashboard?.returnRate === undefined ? null : `${dashboard.returnRate.toFixed(1)}%`, icon: Package },
        { label: 'متوسط مدة الاسترداد', value: dashboard?.averageRefundDays === undefined ? null : `${dashboard.averageRefundDays} ${t('يوم', language)}`, icon: Clock3 },
        { label: 'مرتجعات هذا الشهر', value: dashboard?.returnsThisMonth, icon: Truck }
      ].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">{t(label, language)}</p>
            <p className="mt-2 text-2xl font-black text-slate-950" aria-live="polite">{loading && !dashboard ? '…' : value ?? '—'}</p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Icon size={19} /></span>
        </div>
      </article>)}
    </section>

    {!!dashboard?.topReasons.length && <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-extrabold">{t('أكثر أسباب الإرجاع', language)}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {dashboard.topReasons.map((reason) => <li key={reason.code} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
          {reasonLabel(reason.code)} · {reason.count}
        </li>)}
      </ul>
    </section>}

    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6" onSubmit={(event) => event.preventDefault()}>
        <label className="text-sm font-semibold">{t('البحث', language)}<input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder={t('RMA أو رقم الطلب', language)} className={inputClass} /></label>
        <label className="text-sm font-semibold">{t('الحالة', language)}<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass}>
          <option value="">{t('كل الحالات', language)}</option>
          {Object.keys(STATUS_LABELS).map((status) => <option key={status} value={status}>{t(STATUS_LABELS[status], language)}</option>)}
        </select></label>
        <label className="text-sm font-semibold">{t('السبب', language)}<select value={filters.reason} onChange={(event) => setFilters({ ...filters, reason: event.target.value })} className={inputClass}>
          <option value="">{t('كل الأسباب', language)}</option>
          {(settings?.reasons || []).map((reason) => <option key={reason.code} value={reason.code}>{reason.translations?.[language] || reason.translations?.ar || reason.code}</option>)}
        </select></label>
        <label className="text-sm font-semibold">{t('خطأ البائع', language)}<select value={filters.sellerFault} onChange={(event) => setFilters({ ...filters, sellerFault: event.target.value })} className={inputClass}>
          <option value="">{t('الكل', language)}</option>
          <option value="true">{t('نعم', language)}</option>
          <option value="false">{t('لا', language)}</option>
        </select></label>
        <label className="text-sm font-semibold">{t('من تاريخ', language)}<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} /></label>
        <label className="text-sm font-semibold">{t('إلى تاريخ', language)}<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} /></label>
      </form>

      {loading && <p role="status" className="py-8 text-center text-sm text-slate-500">{t('جارٍ تحميل المرتجعات…', language)}</p>}
      {!loading && !error && !data?.returns.length && <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-600">{t('لا توجد طلبات إرجاع تطابق الفلاتر.', language)}</p>}
      {!loading && !!data?.returns.length && <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-start text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>
            <th className="px-3 py-3 font-bold">{t('RMA', language)}</th>
            <th className="px-3 py-3 font-bold">{t('الطلب والعميل', language)}</th>
            <th className="px-3 py-3 font-bold">{t('الكتب', language)}</th>
            <th className="px-3 py-3 font-bold">{t('السبب', language)}</th>
            <th className="px-3 py-3 font-bold">{t('الحالة', language)}</th>
            <th className="px-3 py-3 font-bold">{t('تاريخ الطلب', language)}</th>
            <th className="px-3 py-3 font-bold">{t('مهلة الإرسال', language)}</th>
            <th className="px-3 py-3 font-bold">{t('المبلغ', language)}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.returns.map((item) => <tr key={item.id}>
              <td className="px-3 py-4 font-bold text-emerald-800"><Link to={`/${locale}/admin/shop/returns/${item.id}`} className="underline">{item.rmaNumber}</Link></td>
              <td className="px-3 py-4">
                <p className="font-semibold">{item.orderId ? `#${item.orderId}` : item.mysteryBoxPurchaseId ? `BOX-${item.mysteryBoxPurchaseId}` : '—'}</p>
                <p className="text-xs text-slate-500">{item.user ? `${item.user.firstName || ''} ${item.user.lastName || ''}`.trim() || item.user.email : '—'}</p>
              </td>
              <td className="px-3 py-4 text-xs text-slate-600">{item.items.map((line) => `${line.titleSnapshot} ×${line.quantity}`).join(' · ')}</td>
              <td className="px-3 py-4 text-xs">{reasonLabel(item.reason)}</td>
              <td className="px-3 py-4"><StatusBadge status={item.status} language={language} /></td>
              <td className="px-3 py-4 text-xs text-slate-600">{formatDate(item.requestedAt, language)}</td>
              <td className="px-3 py-4 text-xs text-slate-600">{formatDate(item.shipBackDeadline, language)}</td>
              <td className="px-3 py-4 font-semibold tabular-nums">{money(item.refundAmount, item.currency, language)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      {!!data && <p className="text-xs text-slate-500">{t('الإجمالي', language)}: {data.total} · {t('معروض', language)}: {data.returns.length}</p>}
    </section>
  </div>;
}

/* ------------------------------------------------------------------ */
/* Return detail                                                       */
/* ------------------------------------------------------------------ */

export function AdminReturnDetailPage() {
  const language = useAdminLanguage();
  const { locale = 'ar', returnId = '' } = useParams();
  const [record, setRecord] = useState<ReturnRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [override, setOverride] = useState({ status: '', refundAmount: '', note: '' });
  const [inspect, setInspect] = useState({ result: 'accepted', notes: '', refundAmount: '' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get<ReturnRecord>(`/admin/returns/${returnId}`).then((payload) => {
      if (!active) return;
      setRecord(payload);
      setNotes(payload.internalNotes || '');
      setOverride((current) => ({ ...current, status: payload.status }));
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل الطلب.', language));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [language, reloadKey, returnId]);

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/admin/returns/${returnId}/${action}`, body);
      setNotice('تم تحديث الطلب.');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث الطلب.', language));
    } finally {
      setBusy(null);
    }
  }

  async function saveNotes() {
    setBusy('notes');
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/admin/returns/${returnId}/notes`, { internalNotes: notes.trim() || null });
      setNotice('تم حفظ الملاحظات الداخلية.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ الملاحظات.', language));
    } finally {
      setBusy(null);
    }
  }

  async function submitOverride(event: FormEvent) {
    event.preventDefault();
    if (!override.note.trim()) {
      setError(t('سبب التعديل اليدوي إلزامي.', language));
      return;
    }
    setBusy('override');
    setError(null);
    try {
      await api.post(`/admin/returns/${returnId}/override`, {
        status: override.status || null,
        refundAmount: override.refundAmount ? Number(override.refundAmount) : null,
        note: override.note.trim()
      });
      setNotice('تم تنفيذ التعديل اليدوي.');
      setOverride({ status: record?.status || '', refundAmount: '', note: '' });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تنفيذ التعديل.', language));
    } finally {
      setBusy(null);
    }
  }

  if (loading && !record) return <p role="status" className="rounded-2xl bg-white p-8 text-center text-slate-500">{t('جارٍ تحميل الطلب…', language)}</p>;

  if (!record) return <div className="mx-auto max-w-4xl space-y-4">
    <ErrorMessage message={error || t('الطلب غير موجود.', language)} language={language} />
    <Link to={`/${locale}/admin/shop/returns`} className="font-bold text-emerald-800 underline">{t('العودة إلى القائمة', language)}</Link>
  </div>;

  const remaining = daysLeft(record.shipBackDeadline);
  const windowRemaining = daysLeft(record.windowEndAt);

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link to={`/${locale}/admin/shop/returns`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-800"><ArrowLeft size={15} /> {t('المرتجعات', language)}</Link>
        <h1 className="mt-2 text-3xl font-black">{record.rmaNumber}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('الطلب', language)} {record.orderId ? `#${record.orderId}` : `BOX-${record.mysteryBoxPurchaseId}`} · {formatDate(record.requestedAt, language)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={record.status} language={language} />
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><RefreshCw size={15} /></button>
      </div>
    </header>

    {error && <ErrorMessage message={error} language={language} />}
    {notice && <Notice message={notice} language={language} />}

    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">{t('الكتب المرتجعة', language)}</h2>
          <ul className="mt-3 space-y-3">
            {record.items.map((item) => {
              const breakdown = (item.calculationBreakdown || {}) as Record<string, unknown>;
              return <li key={item.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{item.titleSnapshot} × {item.quantity}</p>
                    <p className="mt-1 text-xs text-slate-500">{t('السعر المدفوع', language)}: {money(item.itemPricePaid, record.currency, language)}</p>
                  </div>
                  <p className="text-lg font-black tabular-nums text-emerald-900">{money(item.refundAmount, record.currency, language)}</p>
                </div>
                <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <div><dt className="font-semibold">{t('خصم رسوم التوصيل', language)}</dt><dd>{money(item.deliveryFeeDeduction, record.currency, language)}</dd></div>
                  <div><dt className="font-semibold">{t('فترة العدول القانونية', language)}</dt><dd>{breakdown.legalPeriodApplied === true ? t('مطبقة', language) : t('غير مطبقة', language)}</dd></div>
                  <div><dt className="font-semibold">{t('حصة رسوم التوصيل', language)}</dt><dd>{money(Number(breakdown.deliveryFeeShareMinor || 0) / 100, record.currency, language)}</dd></div>
                  <div><dt className="font-semibold">{t('أيام منذ التسليم', language)}</dt><dd>{String(breakdown.daysSinceDelivery ?? '—')}</dd></div>
                </dl>
              </li>;
            })}
          </ul>
        </section>

        {!!record.photos?.length && <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">{t('صور العميل', language)}</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {record.photos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-xl border border-slate-200">
              <img src={photo} alt="" className="h-full w-full object-cover" />
            </a>)}
          </div>
        </section>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">{t('سجل الأحداث', language)}</h2>
          <ol className="mt-4 space-y-3 border-s-2 border-slate-100 ps-4">
            {(record.events || []).map((event) => <li key={event.id} className="relative">
              <span className="absolute -start-[1.42rem] top-1 h-2.5 w-2.5 rounded-full bg-emerald-700" aria-hidden="true" />
              <p className="text-sm font-bold">{t(EVENT_LABELS[event.eventType] || event.eventType, language)}</p>
              <p className="text-xs text-slate-500">{formatDate(event.createdAt, language)} · {event.actorType === 'admin' ? t('الإدارة', language) : event.actorType === 'system' ? t('النظام', language) : t('العميل', language)}</p>
              {event.note && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{event.note}</p>}
            </li>)}
            {!record.events?.length && <li className="text-sm text-slate-500">{t('لا توجد أحداث بعد.', language)}</li>}
          </ol>
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">{t('العميل والطلب', language)}</h2>
          <p className="mt-3 text-sm font-bold">{record.user ? `${record.user.firstName || ''} ${record.user.lastName || ''}`.trim() || record.user.email : '—'}</p>
          <p className="text-xs text-slate-500" dir="ltr">{record.user?.email}</p>
          <dl className="mt-4 space-y-2 text-xs text-slate-600">
            <div className="flex justify-between gap-2"><dt>{t('الطلب', language)}</dt><dd className="font-semibold">{record.orderId ? `#${record.orderId}` : `BOX-${record.mysteryBoxPurchaseId}`}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('تاريخ التسليم', language)}</dt><dd>{formatDate(record.order?.deliveredAt, language)}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('بداية المهلة', language)}</dt><dd>{formatDate(record.windowStartAt, language)}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('نهاية المهلة', language)}</dt><dd>{formatDate(record.windowEndAt, language)}{windowRemaining !== null ? ` · ${windowRemaining} ${t('يوم', language)}` : ''}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('مهلة الإرسال', language)}</dt><dd>{formatDate(record.shipBackDeadline, language)}{remaining !== null ? ` · ${remaining} ${t('يوم', language)}` : ''}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('السبب', language)}</dt><dd>{record.reason}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('خطأ البائع', language)}</dt><dd>{record.isSellerFault ? t('نعم', language) : t('لا', language)}</dd></div>
            {record.trackingNumber && <div className="flex justify-between gap-2"><dt>{t('التتبع', language)}</dt><dd dir="ltr">{record.carrier ? `${record.carrier} · ` : ''}{record.trackingNumber}</dd></div>}
          </dl>
          {record.reasonDetails && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">{record.reasonDetails}</p>}
        </section>

        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">{t('الإجراءات', language)}</h2>
          <div className="flex flex-wrap gap-2">
            {record.status === 'requested' && <>
              <button type="button" onClick={() => void act('approve')} disabled={busy !== null} className="rounded-lg bg-emerald-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{t('موافقة', language)}</button>
              <button type="button" onClick={() => {
                const reason = window.prompt(t('سبب الرفض الإلزامي:', language))?.trim();
                if (reason) void act('reject', { reason });
              }} disabled={busy !== null} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-800 disabled:opacity-50">{t('رفض', language)}</button>
            </>}
            {['approved', 'awaiting_shipment', 'shipped_back'].includes(record.status) && <button type="button" onClick={() => void act('received', { note: '' })} disabled={busy !== null} className="rounded-lg bg-indigo-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{t('تأكيد الاستلام', language)}</button>}
            {record.status === 'received' && <form className="w-full space-y-2" onSubmit={(event) => {
              event.preventDefault();
              void act('inspect', {
                result: inspect.result,
                notes: inspect.notes.trim() || undefined,
                ...(inspect.refundAmount ? { refundAmount: Number(inspect.refundAmount) } : {})
              });
            }}>
              <label className="block text-xs font-bold">{t('نتيجة الفحص', language)}<select value={inspect.result} onChange={(event) => setInspect({ ...inspect, result: event.target.value })} className={inputClass}>
                <option value="accepted">{t('مقبول', language)}</option>
                <option value="partial">{t('جزئي', language)}</option>
                <option value="rejected">{t('مرفوض', language)}</option>
              </select></label>
              <label className="block text-xs font-bold">{t('ملاحظات الفحص', language)}<textarea rows={2} value={inspect.notes} onChange={(event) => setInspect({ ...inspect, notes: event.target.value })} className={inputClass} /></label>
              {inspect.result === 'partial' && <label className="block text-xs font-bold">{t('مبلغ الاسترداد اليدوي', language)}<input type="number" min="0" step="0.01" value={inspect.refundAmount} onChange={(event) => setInspect({ ...inspect, refundAmount: event.target.value })} className={inputClass} /></label>}
              <button disabled={busy !== null} className="w-full rounded-lg bg-violet-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{t('حفظ الفحص', language)}</button>
            </form>}
            {['inspected', 'refund_pending'].includes(record.status) && <button type="button" onClick={() => void act('refund')} disabled={busy !== null} className="rounded-lg bg-emerald-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{t('إصدار الاسترداد', language)}</button>}
            {record.status === 'refunded' && <button type="button" onClick={() => void act('close', { note: '' })} disabled={busy !== null} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{t('إغلاق الطلب', language)}</button>}
          </div>
          {record.refunds?.length ? <ul className="mt-3 space-y-1 text-xs text-slate-600">
            {record.refunds.map((refund) => <li key={refund.id}>{money(refund.amount, record.currency, language)} · {refund.status} {refund.stripeRefundId ? `· ${refund.stripeRefundId}` : ''}</li>)}
          </ul> : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">{t('ملاحظات داخلية', language)}</h2>
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
          <button type="button" onClick={() => void saveNotes()} disabled={busy !== null} className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{t('حفظ الملاحظات', language)}</button>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <h2 className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-amber-900"><AlertTriangle size={16} /> {t('تعديل يدوي', language)}</h2>
          <form className="mt-3 space-y-2" onSubmit={submitOverride}>
            <label className="block text-xs font-bold">{t('الحالة', language)}<select value={override.status} onChange={(event) => setOverride({ ...override, status: event.target.value })} className={inputClass}>
              {Object.keys(STATUS_LABELS).map((status) => <option key={status} value={status}>{t(STATUS_LABELS[status], language)}</option>)}
            </select></label>
            <label className="block text-xs font-bold">{t('مبلغ الاسترداد', language)}<input type="number" min="0" step="0.01" value={override.refundAmount} onChange={(event) => setOverride({ ...override, refundAmount: event.target.value })} className={inputClass} /></label>
            <label className="block text-xs font-bold">{t('السبب (إلزامي)', language)}<textarea required rows={2} value={override.note} onChange={(event) => setOverride({ ...override, note: event.target.value })} className={inputClass} /></label>
            <button disabled={busy !== null || !override.note.trim()} className="w-full rounded-lg bg-amber-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{t('تنفيذ التعديل', language)}</button>
          </form>
        </section>
      </div>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ */
/* Return settings                                                     */
/* ------------------------------------------------------------------ */

function previewRefund(input: { price: number; fee: number; days: number; legalDays: number; applyLegal: boolean; sellerFault: boolean; mode: 'defined_fee' | 'fee_paid' }) {
  const price = Math.max(0, Math.round(input.price * 100));
  const fee = Math.max(0, Math.round(input.fee * 100));
  const legal = input.applyLegal && input.days <= input.legalDays;
  const deduction = legal || input.sellerFault ? 0 : Math.min(fee, price);
  return { refundMinor: Math.max(0, price - deduction), deductionMinor: deduction, legal };
}

export function AdminReturnSettingsPage() {
  const language = useAdminLanguage();
  const { locale = 'ar' } = useParams();
  const [settings, setSettings] = useState<ReturnSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [textTab, setTextTab] = useState<Language>('ar');
  const [reasonsText, setReasonsText] = useState('');
  const [templatesText, setTemplatesText] = useState('{}');
  const [calculator, setCalculator] = useState({ price: '15.00', fee: '4.90', days: '5', sellerFault: false });

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<ReturnSettings>('/admin/returns/settings').then((payload) => {
      if (!active) return;
      setSettings(payload);
      setReasonsText(JSON.stringify(payload.reasons || [], null, 2));
      setTemplatesText(JSON.stringify(payload.emailTemplates || {}, null, 2));
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل سياسة الإرجاع.', language));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [language]);

  function update(patch: Partial<ReturnSettings>) {
    setSettings((current) => current ? { ...current, ...patch } : current);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    let reasons = settings.reasons;
    let emailTemplates = settings.emailTemplates || {};
    try {
      reasons = JSON.parse(reasonsText);
    } catch {
      setError(t('صيغة الأسباب غير صالحة (JSON).', language));
      setSaving(false);
      return;
    }
    try {
      emailTemplates = JSON.parse(templatesText || '{}');
    } catch {
      setError(t('صيغة قوالب البريد غير صالحة (JSON).', language));
      setSaving(false);
      return;
    }
    try {
      const response = await api.put<ReturnSettings>('/admin/returns/settings', {
        returnsEnabled: settings.returnsEnabled,
        defaultReturnWindowDays: settings.defaultReturnWindowDays,
        legalWithdrawalDays: settings.legalWithdrawalDays,
        applyLegalWithdrawalRules: settings.applyLegalWithdrawalRules,
        deliveryDeductionMode: settings.deliveryDeductionMode,
        returnShippingPayer: settings.returnShippingPayer,
        returnAddress: settings.returnAddress,
        shipBackDeadlineDays: settings.shipBackDeadlineDays,
        refundDeadlineDays: settings.refundDeadlineDays,
        autoApproveRequests: settings.autoApproveRequests,
        autoRefundAfterAcceptance: settings.autoRefundAfterAcceptance,
        requirePhotosForDefects: settings.requirePhotosForDefects,
        maxReturnsPerUserPerYear: settings.maxReturnsPerUserPerYear,
        defaultDeliveryEstimateDays: settings.defaultDeliveryEstimateDays,
        reasons,
        policyText: settings.policyText,
        conditionText: settings.conditionText,
        emailTemplates
      });
      setSettings(response);
      setReasonsText(JSON.stringify(response.reasons || [], null, 2));
      setNotice('تم حفظ سياسة الإرجاع.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ السياسة.', language));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !settings) return <p role="status" className="rounded-2xl bg-white p-8 text-center text-slate-500">{t('جارٍ تحميل السياسة…', language)}</p>;
  if (!settings) return <ErrorMessage message={error || t('تعذر تحميل السياسة.', language)} language={language} />;

  const result = previewRefund({
    price: Number(calculator.price) || 0,
    fee: Number(calculator.fee) || 0,
    days: Number(calculator.days) || 0,
    legalDays: settings.legalWithdrawalDays,
    applyLegal: settings.applyLegalWithdrawalRules,
    sellerFault: calculator.sellerFault,
    mode: settings.deliveryDeductionMode
  });

  return <div className="mx-auto max-w-4xl space-y-6">
    <header>
      <p className="text-sm font-bold text-emerald-700">{t('المرتجعات والاستردادات', language)}</p>
      <h1 className="mt-1 text-3xl font-black">{t('سياسة الإرجاع', language)}</h1>
      <p className="mt-2 text-sm text-slate-600">{t('كل تعديل ينطبق على الطلبات الجديدة فقط؛ الطلبات القديمة تحتفظ بلقطة السياسة وقت الشراء.', language)}</p>
    </header>
    {error && <ErrorMessage message={error} language={language} />}
    {notice && <Notice message={notice} language={language} />}

    <form onSubmit={save} className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-extrabold">{t('القواعد الأساسية', language)}</h2>
        <label className="flex items-start justify-between gap-3 text-sm font-semibold">
          <span>{t('تفعيل المرتجعات', language)}<span className="mt-1 block text-xs font-normal text-slate-500">{t('عند الإيقاف لا يستطيع أي عميل فتح طلب إرجاع.', language)}</span></span>
          <input type="checkbox" checked={settings.returnsEnabled} onChange={(event) => update({ returnsEnabled: event.target.checked })} className="mt-1 h-4 w-4" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">{t('مدة الإرجاع الافتراضية', language)}
            <select value={settings.defaultReturnWindowDays} onChange={(event) => update({ defaultReturnWindowDays: Number(event.target.value) === 60 ? 60 : 30 })} className={inputClass}>
              <option value={30}>30 {t('يوم', language)}</option>
              <option value={60}>60 {t('يوم', language)}</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">{t('تحسب من تاريخ التسليم، ما لم يكن للكتاب مدة مخصصة.', language)}</span>
          </label>
          <label className="text-sm font-semibold">{t('مدة العدول القانونية', language)}
            <input type="number" min={0} max={60} value={settings.legalWithdrawalDays} onChange={(event) => update({ legalWithdrawalDays: Number(event.target.value) })} className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-slate-500">{t('خلال هذه المدة تُرد رسوم التوصيل أيضًا.', language)}</span>
          </label>
          <label className="text-sm font-semibold">{t('طريقة خصم رسوم التوصيل', language)}
            <select value={settings.deliveryDeductionMode} onChange={(event) => update({ deliveryDeductionMode: event.target.value as ReturnSettings['deliveryDeductionMode'] })} className={inputClass}>
              <option value="defined_fee">{t('الرسم المحدد للكتاب', language)}</option>
              <option value="fee_paid">{t('الرسم المدفوع فعليًا', language)}</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">{t('«المدفوع فعليًا» يحترم الشحن المجاني.', language)}</span>
          </label>
          <label className="text-sm font-semibold">{t('من يدفع شحن الإرجاع', language)}
            <select value={settings.returnShippingPayer} onChange={(event) => update({ returnShippingPayer: event.target.value as ReturnSettings['returnShippingPayer'] })} className={inputClass}>
              <option value="customer">{t('العميل', language)}</option>
              <option value="prepaid_label">{t('بطاقة شحن مدفوعة منا', language)}</option>
            </select>
          </label>
          <label className="text-sm font-semibold">{t('مهلة إرسال الطرد (أيام)', language)}<input type="number" min={1} max={90} value={settings.shipBackDeadlineDays} onChange={(event) => update({ shipBackDeadlineDays: Number(event.target.value) })} className={inputClass} /></label>
          <label className="text-sm font-semibold">{t('مهلة الاسترداد (أيام)', language)}<input type="number" min={1} max={60} value={settings.refundDeadlineDays} onChange={(event) => update({ refundDeadlineDays: Number(event.target.value) })} className={inputClass} /></label>
          <label className="text-sm font-semibold">{t('تقدير التوصيل عند غياب تاريخ التسليم (أيام)', language)}<input type="number" min={1} max={60} value={settings.defaultDeliveryEstimateDays} onChange={(event) => update({ defaultDeliveryEstimateDays: Number(event.target.value) })} className={inputClass} /></label>
          <label className="text-sm font-semibold">{t('حد المرتجعات لكل مستخدم سنويًا', language)}<input type="number" min={0} max={1000} value={settings.maxReturnsPerUserPerYear ?? ''} onChange={(event) => update({ maxReturnsPerUserPerYear: event.target.value === '' ? null : Number(event.target.value) })} className={inputClass} placeholder={t('بلا حد', language)} /></label>
        </div>
        <label className="flex items-start justify-between gap-3 text-sm font-semibold">
          <span>{t('تطبيق قواعد فترة العدول القانونية', language)}<span className="mt-1 block text-xs font-normal text-slate-500">{t('عند الإيقاف تُخصم رسوم التوصيل دائمًا، بخلاف ما يقتضيه قانون حماية المستهلك.', language)}</span></span>
          <input type="checkbox" checked={settings.applyLegalWithdrawalRules} onChange={(event) => update({ applyLegalWithdrawalRules: event.target.checked })} className="mt-1 h-4 w-4" />
        </label>
        {!settings.applyLegalWithdrawalRules && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
          <AlertTriangle size={16} className="mb-1 inline" /> {t('تحذير قانوني: إيقاف هذه القواعد يمنع رد رسوم التوصيل خلال فترة العدول، وقد يخالف حقوق المستهلك في الاتحاد الأوروبي.', language)}
        </p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings.autoApproveRequests} onChange={(event) => update({ autoApproveRequests: event.target.checked })} /> {t('موافقة تلقائية', language)}</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings.autoRefundAfterAcceptance} onChange={(event) => update({ autoRefundAfterAcceptance: event.target.checked })} /> {t('استرداد تلقائي بعد القبول', language)}</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings.requirePhotosForDefects} onChange={(event) => update({ requirePhotosForDefects: event.target.checked })} /> {t('صور إلزامية للعيوب', language)}</label>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-extrabold">{t('عنوان الإرجاع', language)}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['name', 'company', 'line1', 'line2', 'postalCode', 'city', 'country'] as const).map((field) => <label key={field} className="text-sm font-semibold">{t({
            name: 'الاسم', company: 'الشركة', line1: 'العنوان 1', line2: 'العنوان 2', postalCode: 'الرمز البريدي', city: 'المدينة', country: 'الدولة'
          }[field], language)}<input value={settings.returnAddress[field] || ''} onChange={(event) => update({ returnAddress: { ...settings.returnAddress, [field]: event.target.value } })} className={inputClass} /></label>)}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Calculator size={18} /> {t('حاسبة الاسترداد المباشرة', language)}</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm font-semibold">{t('سعر الكتاب', language)}<input type="number" min="0" step="0.01" value={calculator.price} onChange={(event) => setCalculator({ ...calculator, price: event.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold">{t('رسوم التوصيل', language)}<input type="number" min="0" step="0.01" value={calculator.fee} onChange={(event) => setCalculator({ ...calculator, fee: event.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold">{t('أيام منذ التسليم', language)}<input type="number" min="0" value={calculator.days} onChange={(event) => setCalculator({ ...calculator, days: event.target.value })} className={inputClass} /></label>
          <label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input type="checkbox" checked={calculator.sellerFault} onChange={(event) => setCalculator({ ...calculator, sellerFault: event.target.checked })} /> {t('عيب من البائع', language)}</label>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="flex justify-between gap-2"><span>{t('يُخصم من رسوم التوصيل', language)}</span><span className="tabular-nums">{money(result.deductionMinor / 100, 'EUR', language)}</span></p>
          <p className="mt-1 flex justify-between gap-2 font-black"><span>{t('المبلغ المسترد', language)}</span><span className="tabular-nums">{money(result.refundMinor / 100, 'EUR', language)}</span></p>
          <p className="mt-2 text-xs">{result.legal ? t('داخل فترة العدول القانونية: تُرد رسوم التوصيل.', language) : t('خارج فترة العدول: تُخصم رسوم التوصيل.', language)}</p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-extrabold">{t('نص السياسة والشروط', language)}</h2>
        <div className="flex gap-2">
          {(['ar', 'en', 'fr'] as const).map((code) => <button key={code} type="button" onClick={() => setTextTab(code)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${textTab === code ? 'bg-emerald-900 text-white' : 'border border-slate-200'}`}>{code.toUpperCase()}</button>)}
        </div>
        <label className="block text-sm font-semibold">{t('نص السياسة', language)}<textarea rows={5} dir={textTab === 'ar' ? 'rtl' : 'ltr'} value={settings.policyText[textTab] || ''} onChange={(event) => update({ policyText: { ...settings.policyText, [textTab]: event.target.value } })} className={inputClass} /></label>
        <label className="block text-sm font-semibold">{t('شروط القبول', language)}<textarea rows={3} dir={textTab === 'ar' ? 'rtl' : 'ltr'} value={settings.conditionText[textTab] || ''} onChange={(event) => update({ conditionText: { ...settings.conditionText, [textTab]: event.target.value } })} className={inputClass} /></label>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-extrabold">{t('أسباب الإرجاع', language)}</h2>
        <p className="text-xs leading-6 text-slate-500">{t('عدّل الكود والترجمات وخصائص كل سبب (خطأ البائع، تفاصيل أو صور إلزامية).', language)}</p>
        <textarea rows={10} dir="ltr" spellCheck={false} value={reasonsText} onChange={(event) => setReasonsText(event.target.value)} className={`${inputClass} font-mono text-xs`} />
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-extrabold">{t('قوالب البريد (اختياري)', language)}</h2>
        <p className="text-xs leading-6 text-slate-500">{t('تجاوز موضوع ونص رسائل الإرجاع لكل لغة: { "fr": { "subject": "…", "body": "…" } }.', language)}</p>
        <textarea rows={6} dir="ltr" spellCheck={false} value={templatesText} onChange={(event) => setTemplatesText(event.target.value)} className={`${inputClass} font-mono text-xs`} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/${locale}/admin/shop/returns`} className="text-sm font-bold text-emerald-800 underline">{t('العودة إلى المرتجعات', language)}</Link>
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
          {saving && <Loader2 size={16} className="animate-spin" />} {saving ? t('جارٍ الحفظ…', language) : t('حفظ السياسة', language)}
        </button>
      </div>
    </form>
  </div>;
}
