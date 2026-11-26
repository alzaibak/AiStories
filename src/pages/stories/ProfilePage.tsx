import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  BookOpen, CalendarDays, Check, CheckCircle2, ChevronLeft, Download, ExternalLink, Flame, Gem, Gift, LayoutDashboard, Library as LibraryIcon,
  Loader2, LogOut, Mail, Moon, Package, Palette, RotateCcw, ScrollText, Settings, Sparkles, Sun, Trophy, Truck, X
} from 'lucide-react';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { useSiteTheme } from '@/contexts/SiteThemeContext';
import { ApiError, api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';
import {
  BadgeCircle, BadgeCelebration, BadgeDetailModal, categoryLabel, tierLabel,
  type BadgeView
} from '@/components/badges/BadgeCircle';
import { SiteLayout } from './StoryPlatform';
import { useReturnPolicy } from './ReturnsPolicyPage';

type BadgeItem = BadgeView & {
  code: string;
  points: number;
  isActive: boolean;
  category: string;
  progress: { currentValue: number; targetValue: number; ratio: number };
  isFeatured: boolean;
  awardedAt: string | null;
  sortOrder: number;
};

type Summary = {
  user: { id: number; firstName: string; lastName: string; email: string; language: string; createdAt: string; avatarUrl: string | null; points: number };
  plan: { name: string; status: string; expiresAt: string | null; cancelAtPeriodEnd: boolean };
  level: { level: number; name: string; points: number; nextLevel: { level: number; points: number; name?: string } | null; pointsToNext: number; progressPercent: number };
  stats: { storiesCompleted: number; quizPoints: number; currentStreak: number; badgesEarned: number; badgesTotal: number; partsRead: number; quizzesCompleted: number; certificates: number };
  streak: { current: number; best: number; week: Array<{ date: string; status: string }> };
  continueReading: {
    storyId: number; slug: string; title: string; coverImageUrl: string | null;
    completedParts: number; totalParts: number; progressPercent: number;
    nextPartNumber: number; nextPartTitle: string | null; lastReadAt: string;
  } | null;
  featuredBadges: BadgeItem[];
  nextBadges: BadgeItem[];
  recentAchievements: Array<{ type: string; at: string; title: string; iconKey?: string; tier?: string; badgeId: number; imageUrl?: string | null }>;
  certificates: { earned: number; inProgress: number };
  badges: BadgeItem[];
};

type CertificateRecord = { id: number; title: string; verificationCode: string; issuedAt: string; downloadUrl?: string };

type LibraryItem = {
  entitlementId: number;
  bookId: number;
  slug: string;
  title: string;
  cover: string | null;
  format: string | null;
  purchasedAt: string;
  expiresAt: string | null;
  isRental: boolean;
  canDownload: boolean;
  downloadPath: string;
  downloadLimit: number | null;
  downloadCount: number;
  downloadsRemaining: number | null;
};

type LibraryBox = {
  id: number;
  title: string;
  status: string;
  shippingStatus: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  amountTotal: string;
  currency: string;
  purchasedAt: string;
};

type LibraryPayload = { ebooks: LibraryItem[]; rentals: LibraryItem[]; mysteryBoxes: LibraryBox[] };

type OrderItemRecord = {
  id: number;
  title: string;
  slug: string | null;
  cover: string | null;
  format: string | null;
  quantity: number;
  unitPrice: string;
  pricePaidAfterDiscount: string | null;
};

type OrderRecord = {
  id: number;
  status: string;
  normalizedStatus?: string;
  fulfillmentStatus: string;
  returnStatus: string;
  currency: string;
  total: string;
  createdAt: string;
  deliveredAt: string | null;
  trackingNumber: string | null;
  items: OrderItemRecord[];
  return: {
    enabled: boolean;
    eligible: boolean;
    windowEndsAt: string | null;
    isPhysical: boolean;
    existingRequest: { id: number; rmaNumber: string; status: string; refundAmount: string | null; requestedAt: string } | null;
  };
};

type ReturnReason = { code: string; label: string; requiresDetails: boolean; requiresPhotos: boolean };

type PlanRecord = {
  id: number;
  name: string;
  currency: string;
  price: number | string;
  interval: string;
  isFamily?: boolean;
  features: string[];
};

type RecurringDonationRecord = {
  id: number;
  amount: number | string;
  currency: string;
  status: string;
  campaign: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
};

type ReturnQuoteLine = {
  orderItemId: number;
  title: string;
  quantity: number;
  availableQuantity: number;
  eligible: boolean;
  reasons: string[];
  pricePaid?: string;
  refund: { amount: string; amountMinor: number; deduction?: string; deductionMinor?: number; legalPeriodApplied?: boolean } | null;
};

type ReturnEligibility = {
  currency: string;
  items: ReturnQuoteLine[];
  totals: { refundAmount: string; refundMinor: number; deduction?: string; amountPaid?: string };
};

type MyReturnRecord = {
  id: number;
  rmaNumber: string;
  orderId: number | null;
  mysteryBoxPurchaseId: number | null;
  status: string;
  reason: string;
  requestedAt: string;
  refundAmount: string | null;
  currency: string;
  shipBackDeadline: string | null;
  trackingNumber: string | null;
  items: Array<{ id: number; titleSnapshot: string; quantity: number; refundAmount: string }>;
};

const TABS = ['overview', 'badges', 'certificates', 'library', 'orders', 'returns', 'subscription', 'settings'] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: 'نظرة عامة',
  badges: 'الشارات',
  certificates: 'الشهادات',
  library: 'المكتبة',
  orders: 'الطلبات',
  returns: 'إرجاعاتي',
  subscription: 'الاشتراك',
  settings: 'الإعدادات'
};

const TAB_ICONS: Record<Tab, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  badges: Sparkles,
  certificates: ScrollText,
  library: LibraryIcon,
  orders: Package,
  returns: RotateCcw,
  subscription: Gem,
  settings: Settings
};

const CATEGORY_ORDER = ['reading', 'quiz', 'streak', 'collection', 'competition', 'community', 'supporter', 'event'];

/**
 * Reader-facing order label. `paid` is not ready yet (processing), `fulfilled`
 * means the order is complete — the two must never be confused.
 */
function orderStatusLabel(order: {
  status: string;
  normalizedStatus?: string;
  fulfillmentStatus?: string;
  items?: Array<{ format?: string | null }>;
}, t: (text: string) => string) {
  const status = order.normalizedStatus || order.status;
  const isPhysical = (order.items || []).some((item) => item.format === 'print');
  if (status === 'refunded') return t('مسترجع');
  if (status === 'partially_refunded') return t('مسترجع جزئياً');
  if (status === 'amount_mismatch') return t('قيد المراجعة');
  if (status === 'pending' || status === 'pending_payment' || status === 'unpaid' || status === 'incomplete') return t('بانتظار الدفع');
  if (['canceled', 'cancelled', 'expired', 'failed'].includes(status)) return t('ملغى');
  if (status === 'fulfilled') {
    // A digital order is complete as soon as it is delivered; only a printed
    // order has a delivery step worth showing.
    if (isPhysical && order.fulfillmentStatus === 'delivered') return t('تم التوصيل');
    return t('مكتمل');
  }
  if (isPhysical && order.fulfillmentStatus === 'shipped') return t('تم الشحن');
  return t('قيد التجهيز');
}

const MYSTERY_BOX_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد التأكيد',
  paid: 'مدفوع',
  fulfilled: 'تم التسليم',
  partially_fulfilled: 'تم التسليم جزئياً',
  refunded: 'مسترجع',
  cancelled: 'ملغى'
};

const RETURN_STATUS_LABELS: Record<string, string> = {
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
  expired: 'انتهت المهلة'
};

function lineTotal(entry: MyReturnRecord) {
  return entry.items.reduce((sum, line) => sum + Number(line.refundAmount || 0), 0);
}

function initials(first?: string, last?: string) {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || '؟';
}

function LevelRing({ summary, language }: { summary: Summary; language: SiteLanguage }) {
  const size = 132;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.max(0, Math.min(100, summary.level.progressPercent));
  return (
    <div className="relative flex h-[132px] w-[132px] shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 132 132" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="66" cy="66" r={radius} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="9" />
        <circle
          cx="66" cy="66" r={radius} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-ink">{translateText('المستوى', language)}</p>
        <p className="text-3xl font-semibold text-ink">{summary.level.level}</p>
        <p className="px-2 text-[10px] font-semibold leading-3 text-ink-muted line-clamp-2">{summary.level.name}</p>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { locale = 'ar' } = useParams();
  const language = (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as SiteLanguage;
  const t = useCallback((text: string) => translateText(text, language), [language]);
  const { user, isLoading, logout, refreshUser } = useStoryAuth();
  const { theme, setTheme } = useSiteTheme();

  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BadgeItem | null>(null);
  const [celebration, setCelebration] = useState<BadgeItem | null>(null);
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'earned' | 'progress' | 'locked'>('all');
  const [badgeCategory, setBadgeCategory] = useState('all');
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [certificatesLoading, setCertificatesLoading] = useState(false);
  const [library, setLibrary] = useState<LibraryPayload | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<{ bookId: number; message: string } | null>(null);
  const [returnOrder, setReturnOrder] = useState<OrderRecord | null>(null);
  const [returnData, setReturnData] = useState<ReturnEligibility | null>(null);
  const [returnReasons, setReturnReasons] = useState<ReturnReason[]>([]);
  const [returnSelection, setReturnSelection] = useState<Record<number, boolean>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnDetails, setReturnDetails] = useState('');
  const [returnPhotos, setReturnPhotos] = useState('');
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnStep, setReturnStep] = useState<'select' | 'summary'>('select');
  const [returnSummary, setReturnSummary] = useState<ReturnEligibility | null>(null);
  const [myReturns, setMyReturns] = useState<MyReturnRecord[] | null>(null);
  const [myReturnsLoading, setMyReturnsLoading] = useState(false);
  const [myReturnsError, setMyReturnsError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planCheckoutId, setPlanCheckoutId] = useState<number | null>(null);
  const [planCheckoutError, setPlanCheckoutError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [giftCodeBusy, setGiftCodeBusy] = useState(false);
  const [giftCodeError, setGiftCodeError] = useState<string | null>(null);
  const [giftCodeNotice, setGiftCodeNotice] = useState<string | null>(null);
  const [recurringDonations, setRecurringDonations] = useState<RecurringDonationRecord[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [cancelingDonationId, setCancelingDonationId] = useState<number | null>(null);
  const [preferences, setPreferences] = useState({ marketing: true, reminders: true });
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [subscriptionBusy, setSubscriptionBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<Summary>('/me/profile-summary');
      setSummary(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحميل الملف.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { if (user) void load(); }, [load, user]);

  useEffect(() => {
    if (user?.emailPreferences) setPreferences(user.emailPreferences);
  }, [user?.emailPreferences]);

  useEffect(() => {
    if (!summary || typeof window === 'undefined') return;
    const pending = summary.recentAchievements.find((item) => {
      if (!item.at) return false;
      const fresh = Date.now() - new Date(item.at).getTime() < 1000 * 60 * 60 * 24;
      return fresh && !window.localStorage.getItem(`badge-celebrated-${item.badgeId}`);
    });
    if (!pending) return;
    const badge = summary.badges.find((item) => item.id === pending.badgeId);
    if (badge) {
      window.localStorage.setItem(`badge-celebrated-${pending.badgeId}`, '1');
      setCelebration(badge);
    }
  }, [summary]);

  useEffect(() => {
    if (tab !== 'certificates' || certificates.length) return;
    setCertificatesLoading(true);
    api.get<CertificateRecord[]>('/certificates')
      .then((response) => setCertificates(Array.isArray(response) ? response : []))
      .catch(() => setCertificates([]))
      .finally(() => setCertificatesLoading(false));
  }, [certificates.length, tab]);

  useEffect(() => {
    if (tab !== 'library' || library) return;
    setLibraryLoading(true);
    api.get<LibraryPayload>('/me/library')
      .then(setLibrary)
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل المكتبة.')))
      .finally(() => setLibraryLoading(false));
  }, [library, t, tab]);

  useEffect(() => {
    if (tab !== 'subscription') return;
    if (!plans.length) {
      setPlansLoading(true);
      api.get<PlanRecord[]>('/plans')
        .then((response) => setPlans(Array.isArray(response) ? response : []))
        .catch((caught) => setPlanCheckoutError(caught instanceof Error ? caught.message : t('تعذر تحميل الباقات.')))
        .finally(() => setPlansLoading(false));
    }
    setRecurringLoading(true);
    api.get<RecurringDonationRecord[]>('/donations/recurring')
      .then((response) => setRecurringDonations(Array.isArray(response) ? response : []))
      .catch((caught) => setRecurringError(caught instanceof Error ? caught.message : t('تعذر تحميل التبرعات.')))
      .finally(() => setRecurringLoading(false));
  }, [plans.length, t, tab]);

  useEffect(() => {
    if (tab !== 'orders' || orders) return;
    setOrdersLoading(true);
    api.get<{ orders: OrderRecord[] }>('/me/orders')
      .then((response) => setOrders(response.orders || []))
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('تعذر تحميل الطلبات.')))
      .finally(() => setOrdersLoading(false));
  }, [orders, t, tab]);

  useEffect(() => {
    if (tab !== 'returns' || myReturns) return;
    setMyReturnsLoading(true);
    setMyReturnsError(null);
    api.get<MyReturnRecord[]>('/me/returns')
      .then((response) => setMyReturns(Array.isArray(response) ? response : []))
      .catch((caught) => setMyReturnsError(caught instanceof Error ? caught.message : t('تعذر تحميل الإرجاعات.')))
      .finally(() => setMyReturnsLoading(false));
  }, [myReturns, t, tab]);

  const badges = useMemo(() => summary?.badges || [], [summary]);
  const grouped = useMemo(() => {
    const filtered = badges.filter((badge) => {
      const matchState = badgeFilter === 'all'
        || (badgeFilter === 'earned' && badge.unlocked)
        || (badgeFilter === 'progress' && badge.state === 'in_progress')
        || (badgeFilter === 'locked' && (badge.state === 'locked' || badge.state === 'secret'));
      const matchCategory = badgeCategory === 'all' || badge.category === badgeCategory;
      return matchState && matchCategory;
    });
    const map = new Map<string, BadgeItem[]>();
    [...filtered]
      .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || (a.sortOrder || 0) - (b.sortOrder || 0))
      .forEach((badge) => {
        const list = map.get(badge.category) || [];
        list.push(badge);
        map.set(badge.category, list);
      });
    return [...map.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]));
  }, [badgeCategory, badgeFilter, badges]);

  async function toggleFeature(badge: BadgeView) {
    try {
      await api.patch(`/me/badges/${badge.id}/feature`, {});
      setSelected((current) => current && current.id === badge.id ? { ...current, isFeatured: !current.isFeatured } : current);
      setNotice(t('تم تحديث الشارات المثبتة.'));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تثبيت الشارة.'));
    }
  }

  async function savePreferences() {
    setSavingPreferences(true);
    try {
      await api.patch('/account/email-preferences', preferences);
      setNotice(t('تم حفظ التفضيلات.'));
      await refreshUser();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ التفضيلات.'));
    } finally {
      setSavingPreferences(false);
    }
  }

  function applyDownloadResult(item: LibraryItem, remaining: number | null) {
    setLibrary((current) => {
      if (!current) return current;
      const patchItems = (items: LibraryItem[]) => items.map((entry) => {
        if (entry.entitlementId !== item.entitlementId) return entry;
        return {
          ...entry,
          downloadCount: entry.downloadCount + 1,
          downloadsRemaining: remaining,
          canDownload: remaining === null || remaining > 0
        };
      });
      return { ...current, ebooks: patchItems(current.ebooks), rentals: patchItems(current.rentals) };
    });
  }

  function markQuotaExhausted(item: LibraryItem) {
    setLibrary((current) => {
      if (!current) return current;
      const patchItems = (items: LibraryItem[]) => items.map((entry) => entry.entitlementId === item.entitlementId
        ? { ...entry, downloadsRemaining: 0, canDownload: false }
        : entry);
      return { ...current, ebooks: patchItems(current.ebooks), rentals: patchItems(current.rentals) };
    });
  }

  async function downloadBook(item: LibraryItem) {
    setDownloadBusy(item.bookId);
    setDownloadError(null);
    try {
      const response = await api.get<{ url: string }>(item.downloadPath);
      // The server consumes the quota before returning the URL, so the local
      // counter must move now — even if the browser download itself fails.
      applyDownloadResult(item, item.downloadsRemaining === null ? null : Math.max(0, item.downloadsRemaining - 1));
      if (!response?.url) throw new Error(t('رابط التنزيل غير متاح.'));
      if (/^https?:/i.test(response.url)) {
        window.location.assign(response.url);
        return;
      }
      const blob = await api.getBlob(response.url);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${item.slug}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'DOWNLOAD_LIMIT_REACHED') {
        markQuotaExhausted(item);
        setDownloadError({
          bookId: item.bookId,
          message: item.downloadCount > 0
            ? t('لقد نزّلت هذا الكتاب بالفعل. لا يُسمح بتنزيله مرة أخرى، ويمكنك الوصول إليه من ملفك الشخصي.')
            : t('يمكنك تنزيل هذا الكتاب من ملفك الشخصي.')
        });
        return;
      }
      setError(caught instanceof Error ? caught.message : t('تعذر تنزيل الكتاب.'));
    } finally {
      setDownloadBusy(null);
    }
  }

  async function openReturnModal(order: OrderRecord) {
    setReturnOrder(order);
    setReturnData(null);
    setReturnError(null);
    setReturnDetails('');
    setReturnPhotos('');
    setReturnSelection({});
    setReturnStep('select');
    setReturnSummary(null);
    try {
      const reasons = returnReasons.length
        ? { reasons: returnReasons }
        : await api.get<{ reasons: ReturnReason[] }>('/me/returns/reasons');
      setReturnReasons(reasons.reasons || []);
      setReturnReason(reasons.reasons?.[0]?.code || '');
      const eligibility = await api.get<ReturnEligibility>(`/me/orders/${order.id}/returns/eligibility`);
      setReturnData(eligibility);
      const selection: Record<number, boolean> = {};
      eligibility.items.forEach((item) => {
        if (item.eligible && item.availableQuantity > 0) selection[item.orderItemId] = true;
      });
      setReturnSelection(selection);
    } catch (caught) {
      setReturnError(caught instanceof Error ? caught.message : t('تعذر تحميل شروط الإرجاع.'));
    }
  }

  const returnSelectionTotalMinor = (returnData?.items || [])
    .filter((item) => returnSelection[item.orderItemId] && item.eligible)
    .reduce((sum, item) => sum + (item.refund?.amountMinor || 0), 0);

  function selectedReturnItems() {
    return (returnData?.items || [])
      .filter((item) => returnSelection[item.orderItemId] && item.eligible && item.availableQuantity > 0)
      .map((item) => ({ orderItemId: item.orderItemId, quantity: item.availableQuantity }));
  }

  function photoList() {
    return returnPhotos.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
  }

  async function reviewReturn() {
    if (!returnOrder || !returnData || !returnReason) return;
    const items = selectedReturnItems();
    if (!items.length) {
      setReturnError(t('اختر كتابًا واحدًا على الأقل.'));
      return;
    }
    const reasonDef = returnReasons.find((reason) => reason.code === returnReason);
    if (reasonDef?.requiresPhotos && !photoList().length) {
      setReturnError(t('أضف صورة واحدة على الأقل لهذا السبب.'));
      return;
    }
    setReturnBusy(true);
    setReturnError(null);
    try {
      const quote = await api.post<ReturnEligibility>('/me/returns/quote', {
        orderId: returnOrder.id,
        items,
        language
      });
      setReturnSummary(quote);
      setReturnStep('summary');
    } catch (caught) {
      setReturnError(caught instanceof Error ? caught.message : t('تعذر حساب مبلغ الاسترداد.'));
    } finally {
      setReturnBusy(false);
    }
  }

  async function submitReturn() {
    if (!returnOrder || !returnData || !returnReason) return;
    const items = selectedReturnItems();
    if (!items.length) {
      setReturnError(t('اختر كتابًا واحدًا على الأقل.'));
      return;
    }
    setReturnBusy(true);
    setReturnError(null);
    try {
      await api.post('/me/returns', {
        orderId: returnOrder.id,
        items,
        reason: returnReason,
        reasonDetails: returnDetails.trim(),
        photos: photoList(),
        language
      });
      setNotice(t('تم إرسال طلب الإرجاع.'));
      setReturnOrder(null);
      setOrders(null);
      setMyReturns(null);
    } catch (caught) {
      setReturnError(caught instanceof Error ? caught.message : t('تعذر إرسال طلب الإرجاع.'));
    } finally {
      setReturnBusy(false);
    }
  }

  async function startPlanCheckout(planId: number) {
    setPlanCheckoutId(planId);
    setPlanCheckoutError(null);
    try {
      const response = await api.post<{ checkoutUrl: string }>('/payments/subscriptions/checkout', {
        planId,
        language,
        ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {})
      });
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      setPlanCheckoutError(caught instanceof ApiError && caught.status === 409
        ? t('لديك اشتراك نشط بالفعل. يمكنك إدارته من حسابك.')
        : caught instanceof Error ? caught.message : t('تعذر بدء الاشتراك.'));
      setPlanCheckoutId(null);
    }
  }

  async function redeemGiftCode(event: FormEvent) {
    event.preventDefault();
    setGiftCodeBusy(true);
    setGiftCodeError(null);
    setGiftCodeNotice(null);
    try {
      const result = await api.post<{ plan: string; expiresAt: string }>('/gift-codes/redeem', { code: giftCode.trim() });
      setGiftCode('');
      setGiftCodeNotice(`${t('تم تفعيل الهدية')}: ${result.plan} · ${new Date(result.expiresAt).toLocaleDateString(language)}`);
      await refreshUser();
      await load();
    } catch (caught) {
      setGiftCodeError(caught instanceof Error ? caught.message : t('تعذر استخدام رمز الهدية.'));
    } finally {
      setGiftCodeBusy(false);
    }
  }

  async function cancelRecurringDonation(id: number) {
    setCancelingDonationId(id);
    setRecurringError(null);
    try {
      await api.post(`/donations/recurring/${id}/cancel`, {});
      setRecurringDonations((current) => current.map((item) => (
        item.id === id ? { ...item, cancelAtPeriodEnd: true } : item
      )));
    } catch (caught) {
      setRecurringError(caught instanceof Error ? caught.message : t('تعذر إلغاء التبرع المتكرر.'));
    } finally {
      setCancelingDonationId(null);
    }
  }

  async function updateSubscription(id: number, action: 'cancel' | 'resume') {
    setSubscriptionBusy(id);
    try {
      await api.post(`/subscriptions/${id}/${action}`, {});
      await refreshUser();
      setNotice(t('تم تحديث الاشتراك.'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث الاشتراك.'));
    } finally {
      setSubscriptionBusy(null);
    }
  }

  if (isLoading) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
          <div className="h-40 animate-pulse rounded-3xl bg-brand-soft" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-brand-soft" />)}
          </div>
        </div>
      </SiteLayout>
    );
  }
  if (!user) return <Navigate to={`/${language}/login`} replace />;

  const subscriptions = user.subscriptions || [];
  // Only a subscription that actually grants access is manageable; an unpaid
  // attempt is never shown nor offered as the current plan.
  const activeSubscription = subscriptions.find((subscription) => subscription.accessActive) || null;
  // One flag drives every "free or subscribed?" label on the page.
  const isFreePlan = !summary || summary.plan.status === 'free' || summary.plan.name === 'Free';
  const planRenewalDate = summary?.plan.expiresAt
    ? new Date(summary.plan.expiresAt).toLocaleDateString(language)
    : null;

  return (
    <SiteLayout>
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-8">
        {error && (
          <div role="alert" className="rounded-xl border border-danger bg-danger-soft p-4 text-sm text-danger">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-brand-soft p-3 text-sm font-semibold text-brand-ink">
            <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs underline">{t('إغلاق')}</button>
          </div>
        )}

        {loading && !summary
          ? <div className="h-48 animate-pulse rounded-3xl bg-brand-soft" />
          : summary && (
            <>
              <header className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lift">
                <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-semibold text-brand-on ring-4 ring-surface/70">
                      {summary.user.avatarUrl
                        ? <img src={summary.user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                        : initials(summary.user.firstName, summary.user.lastName)}
                    </span>
                    <div className="min-w-0">
                      <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
                        {summary.user.firstName} {summary.user.lastName}
                      </h1>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-muted">
                        <CalendarDays size={14} />
                        {t('عضو منذ')} {new Date(summary.user.createdAt).toLocaleDateString(language, { month: 'long', year: 'numeric' })}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button"
                          onClick={() => setTab('subscription')}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${isFreePlan ? 'border-line-strong bg-surface-soft text-ink hover:border-brand' : 'border-gold bg-gold-soft text-gold-ink'}`}
                        >
                          {isFreePlan ? <Sparkles size={13} /> : <Check size={13} />}
                          <span>{isFreePlan ? t('الخطة المجانية') : t('اشتراك نشط')}</span>
                          <span aria-hidden="true" className="opacity-40">·</span>
                          <span className="underline decoration-dotted underline-offset-2">{isFreePlan ? t('اكتشف الخطط') : t('إدارة الاشتراك')}</span>
                          <ChevronLeft size={13} className="ltr:rotate-180" />
                        </button>
                        {!isFreePlan && planRenewalDate && (
                          <span className="text-xs text-ink-muted">{t('يتجدد في')} {planRenewalDate}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <LevelRing summary={summary} language={language} />
                    <div className="text-sm">
                      <p className="font-semibold text-ink">{summary.level.points} {t('نقطة')}</p>
                      <p className="text-xs text-ink-muted">
                        {summary.level.nextLevel
                          ? `${summary.level.pointsToNext} ${t('نقطة للمستوى التالي')}`
                          : t('أعلى مستوى')}
                      </p>
                      <div className="mt-2 h-2 w-32 overflow-hidden rounded-full bg-surface/70">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${summary.level.progressPercent}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
                  {[
                    { label: 'حكايات مكتملة', value: summary.stats.storiesCompleted, icon: BookOpen },
                    { label: 'نقاط الاختبارات', value: summary.stats.quizPoints, icon: Trophy },
                    { label: 'سلسلة القراءة', value: summary.stats.currentStreak, icon: Flame },
                    { label: 'شارات', value: `${summary.stats.badgesEarned}/${summary.stats.badgesTotal}`, icon: Sparkles }
                  ].map((item) => (
                    <div key={item.label} className="bg-surface px-4 py-4">
                      <item.icon size={16} className="text-brand-ink" />
                      <p className="mt-2 text-xl font-semibold text-ink">{item.value}</p>
                      <p className="text-[11px] font-semibold text-ink-muted">{t(item.label)}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-4 sm:px-7">
                  <button type="button" onClick={() => setTab('settings')} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-soft">
                    {t('تعديل الملف')}
                  </button>
                  <Link
                    to={summary.continueReading ? `/${language}/stories/${summary.continueReading.slug}/read/${summary.continueReading.nextPartNumber}` : `/${language}/stories`}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on hover:bg-brand"
                  >
                    {t('تابع القراءة')}
                  </Link>
                </div>
              </header>

              <nav
                aria-label={t('أقسام الملف')}
                className="sticky top-2 z-20 overflow-x-auto rounded-2xl border border-line bg-surface/95 p-1 shadow-soft backdrop-blur dark:bg-surface/95"
              >
                <div className="flex w-max min-w-full items-center gap-1">
                  {TABS.map((item) => {
                    const Icon = TAB_ICONS[item];
                    const active = tab === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setTab(item)}
                        aria-current={active ? 'page' : undefined}
                        className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${active ? 'bg-brand text-brand-on shadow-soft' : 'text-ink-muted hover:bg-brand-soft hover:text-brand-ink'}`}
                      >
                        <Icon size={15} className="shrink-0" />
                        {t(TAB_LABELS[item])}
                      </button>
                    );
                  })}
                </div>
              </nav>

              {tab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <section className="rounded-2xl border border-line bg-surface p-5">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('تابع القراءة')}</h2>
                      {summary.continueReading
                        ? (
                          <>
                            <p className="mt-3 text-lg font-semibold text-ink">{summary.continueReading.title}</p>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-soft">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${summary.continueReading.progressPercent}%` }} />
                            </div>
                            <p className="mt-2 text-xs text-ink-muted">
                              {summary.continueReading.completedParts}/{summary.continueReading.totalParts} {t('أجزاء')}
                            </p>
                            <Link
                              to={`/${language}/stories/${summary.continueReading.slug}/read/${summary.continueReading.nextPartNumber}`}
                              className="mt-4 inline-flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on"
                            >
                              {t('الجزء التالي')} <ChevronLeft size={15} className="rtl:rotate-0 ltr:rotate-180" />
                            </Link>
                          </>
                        )
                        : <p className="mt-3 text-sm text-ink-muted">{t('ابدأ حكايتك الأولى لتظهر هنا.')}</p>}
                    </section>

                    <section className="rounded-2xl border border-line bg-surface p-5">
                      <div className="flex items-center justify-between">
                        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink">
                          <Flame size={16} /> {t('سلسلة القراءة')}
                        </h2>
                        <p className="text-xs font-semibold text-ink-muted">{t('الأفضل')}: {summary.streak.best}</p>
                      </div>
                      <p className="mt-2 text-3xl font-semibold text-ink">{summary.streak.current} <span className="text-sm font-semibold text-ink-muted">{t('يوم')}</span></p>
                      <div className="mt-4 flex justify-between gap-1">
                        {summary.streak.week.map((day) => (
                          <div key={day.date} className="flex flex-col items-center gap-1">
                            <span
                              title={new Date(day.date).toLocaleDateString(language)}
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold ${
                                day.status === 'done' ? 'bg-brand text-brand-on'
                                  : day.status === 'today' ? 'bg-gold-soft text-gold-ink ring-2 ring-amber-200'
                                    : day.status === 'today_pending' ? 'border-2 border-gold text-gold-ink'
                                      : 'border border-line bg-surface-soft text-ink-muted'
                              }`}
                            >
                              {new Date(day.date).toLocaleDateString(language, { weekday: 'narrow' })}
                            </span>
                            {day.status === 'done' && <span className="sr-only">{t('تم')}</span>}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section className={`rounded-2xl border bg-surface p-5 ${isFreePlan ? 'border-line' : 'border-gold'}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isFreePlan ? 'bg-surface-soft text-ink-muted' : 'bg-gold-soft text-gold-ink'}`}>
                          {isFreePlan ? <Sparkles size={20} /> : <Gem size={20} />}
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t('خطتك')}</p>
                          <p className="mt-0.5 text-lg font-semibold text-ink">{isFreePlan ? t('الخطة المجانية') : summary.plan.name}</p>
                          <p className="mt-1 text-sm text-ink-muted">
                            {isFreePlan
                              ? t('اقرأ الحكايات المجانية، وافتح كل المكتبة والشارات مع الاشتراك.')
                              : planRenewalDate ? `${t('يتجدد في')} ${planRenewalDate}` : t('لا يوجد تاريخ تجديد.')}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setTab('subscription')}
                          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on"
                        >
                          {isFreePlan ? t('اكتشف الخطط') : t('إدارة الاشتراك')}
                        </button>
                        {isFreePlan && (
                          <Link to={`/${language}/pricing`} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-soft">
                            {t('مقارنة الخطط')}
                          </Link>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-line bg-surface p-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('شارات مثبتة')}</h2>
                      <button type="button" onClick={() => setTab('badges')} className="text-xs font-semibold text-brand-ink underline">{t('تعديل')}</button>
                    </div>
                    {summary.featuredBadges.length === 0
                      ? (
                        <div className="mt-4 rounded-xl border border-line p-6 text-center">
                          <Sparkles className="mx-auto text-ink-muted" size={28} />
                          <p className="mt-2 text-sm text-ink-muted">{t('ثبّت حتى ثلاث شارات لتظهر في ملفك.')}</p>
                          <button type="button" onClick={() => setTab('badges')} className="mt-3 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-on">{t('اختر شاراتك')}</button>
                        </div>
                      )
                      : (
                        <div className="mt-4 flex flex-wrap items-start gap-6">
                          {summary.featuredBadges.map((badge) => (
                            <BadgeCircle key={badge.id} badge={badge} size="lg" language={language} showName reveal onOpen={(item) => setSelected(item as BadgeItem)} />
                          ))}
                        </div>
                      )}
                  </section>

                  <section className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('شارات قريبة')}</h2>
                    {summary.nextBadges.length === 0
                      ? <p className="mt-3 text-sm text-ink-muted">{t('لا توجد شارات قريبة حاليًا.')}</p>
                      : (
                        <div className="mt-4 grid gap-4 sm:grid-cols-3">
                          {summary.nextBadges.map((badge) => (
                            <div key={badge.id} className="flex flex-col items-center rounded-xl border border-line p-3 text-center">
                              <BadgeCircle badge={badge} size="md" language={language} showName showProgressLabel onOpen={(item) => setSelected(item as BadgeItem)} />
                            </div>
                          ))}
                        </div>
                      )}
                  </section>

                  <section className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('أحدث الإنجازات')}</h2>
                    {summary.recentAchievements.length === 0
                      ? <p className="mt-3 text-sm text-ink-muted">{t('أكمل حكايتك الأولى لتحصل على أول شارة.')}</p>
                      : (
                        <ol className="mt-2 divide-y divide-line">
                          {summary.recentAchievements.map((item) => (
                            <li key={`${item.badgeId}-${item.at}`} className="flex items-center gap-3 py-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
                                <Trophy size={16} />
                              </span>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-ink">{item.title}</p>
                                <p className="text-xs text-ink-muted">{tierLabel(item.tier, language)}</p>
                              </div>
                              <time className="text-xs text-ink-muted" dateTime={item.at}>
                                {new Date(item.at).toLocaleDateString(language)}
                              </time>
                            </li>
                          ))}
                        </ol>
                      )}
                  </section>
                </div>
              )}

              {tab === 'badges' && (
                <section className="space-y-5">
                  <div className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {summary.stats.badgesEarned} / {summary.stats.badgesTotal} {t('شارة')}
                      </p>
                      <p className="text-xs font-semibold text-ink-muted">{summary.level.points} {t('نقطة')}</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-soft">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.round((summary.stats.badgesEarned / Math.max(1, summary.stats.badgesTotal)) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {([['all', 'الكل'], ['earned', 'مكتسبة'], ['progress', 'قيد التقدم'], ['locked', 'مقفلة']] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setBadgeFilter(value)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${badgeFilter === value ? 'bg-brand text-brand-on' : 'border border-line text-ink-muted'}`}
                        >
                          {t(label)}
                        </button>
                      ))}
                      <select
                        aria-label={t('الفئة')}
                        value={badgeCategory}
                        onChange={(event) => setBadgeCategory(event.target.value)}
                        className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted"
                      >
                        <option value="all">{t('كل الفئات')}</option>
                        {CATEGORY_ORDER.map((category) => <option key={category} value={category}>{categoryLabel(category, language)}</option>)}
                      </select>
                    </div>
                  </div>

                  {grouped.length === 0
                    ? (
                      <div className="rounded-2xl border border-line bg-surface p-10 text-center">
                        <Sparkles className="mx-auto text-ink-muted" size={36} />
                        <p className="mt-3 font-semibold text-ink">{t('لا توجد شارات في هذا التصنيف.')}</p>
                        <Link to={`/${language}/stories`} className="mt-4 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on">{t('اقرأ حكاية الآن')}</Link>
                      </div>
                    )
                    : grouped.map(([category, items]) => (
                      <div key={category}>
                        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">{categoryLabel(category, language)}</h2>
                        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
                          {items.map((badge) => (
                            <div key={badge.id} className="flex flex-col items-center rounded-2xl border border-line bg-surface p-3">
                              <BadgeCircle badge={badge} size="md" language={language} showName reveal onOpen={(item) => setSelected(item as BadgeItem)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </section>
              )}

              {tab === 'certificates' && (
                <section className="space-y-4">
                  {certificatesLoading && <div className="h-32 animate-pulse rounded-2xl bg-brand-soft" />}
                  {!certificatesLoading && certificates.length === 0 && (
                    <div className="rounded-2xl border border-line bg-surface p-10 text-center">
                      <ScrollText className="mx-auto text-ink-muted" size={36} />
                      <p className="mt-3 font-semibold text-ink">{t('لا توجد شهادات بعد.')}</p>
                      <p className="mt-1 text-sm text-ink-muted">{t('أكمل حكاية أو مجموعة للحصول على شهادة.')}</p>
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {certificates.map((certificate) => (
                      <article key={certificate.id} className="rounded-2xl border border-gold bg-surface p-5">
                        <ScrollText className="text-gold-ink" size={22} />
                        <h2 className="mt-2 text-lg font-semibold text-ink">{certificate.title}</h2>
                        <p className="mt-1 text-xs text-ink-muted">
                          {new Date(certificate.issuedAt).toLocaleDateString(language)} · {certificate.verificationCode}
                        </p>
                        {certificate.downloadUrl && (
                          <a href={certificate.downloadUrl} className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on">
                            <Download size={15} /> {t('تنزيل PDF')}
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {tab === 'library' && (
                <section className="space-y-6">
                  {libraryLoading && !library && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[0, 1].map((index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-brand-soft" />)}
                    </div>
                  )}
                  {library && (
                    <>
                      <div>
                        <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink">
                          <LibraryIcon size={16} /> {t('كتبي الإلكترونية')}
                        </h2>
                        {library.ebooks.length === 0
                          ? (
                            <div className="rounded-2xl border border-line bg-surface p-8 text-center">
                              <BookOpen className="mx-auto text-ink-muted" size={32} />
                              <p className="mt-3 font-semibold text-ink">{t('لا توجد كتب بعد.')}</p>
                              <Link to={`/${language}/books`} className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on">{t('تصفح المتجر')}</Link>
                            </div>
                          )
                          : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              {library.ebooks.map((item) => (
                                <article key={item.entitlementId} className="flex flex-col rounded-2xl border border-line bg-surface p-4">
                                  <div className="flex gap-3">
                                    {item.cover
                                      ? <img src={item.cover} alt="" loading="lazy" className="h-16 w-12 rounded object-cover" />
                                      : <span className="flex h-16 w-12 items-center justify-center rounded bg-brand-soft text-brand-ink"><BookOpen size={20} /></span>}
                                    <div className="min-w-0">
                                      <h3 className="line-clamp-2 text-sm font-semibold text-ink">{item.title}</h3>
                                      <p className="mt-1 text-xs text-ink-muted">
                                        {t('تم الشراء في')} {new Date(item.purchasedAt).toLocaleDateString(language)}
                                      </p>
                                      <p className="mt-1 text-xs font-semibold text-brand-ink">
                                        {item.downloadsRemaining === null
                                          ? t('تنزيلات غير محدودة')
                                          : `${t('تنزيلات متبقية')}: ${item.downloadsRemaining}`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    {item.downloadsRemaining === null || item.downloadsRemaining > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => void downloadBook(item)}
                                        disabled={downloadBusy === item.bookId}
                                        className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-on disabled:opacity-60"
                                      >
                                        <Download size={14} /> {downloadBusy === item.bookId ? t('جارٍ التنزيل…') : t('تنزيل PDF')}
                                      </button>
                                    ) : (
                                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1.5 text-[11px] font-semibold text-gold-ink">
                                        <Check size={13} aria-hidden="true" /> {t('تم التنزيل بالفعل')}
                                      </span>
                                    )}
                                    <Link to={`/${language}/books/${item.slug}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                                      {t('التفاصيل')}
                                    </Link>
                                  </div>
                                  {downloadError?.bookId === item.bookId && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-2 text-xs font-semibold text-danger">{downloadError.message}</p>}
                                  {item.downloadsRemaining === 0 && downloadError?.bookId !== item.bookId && <p className="mt-2 text-xs font-semibold text-gold-ink">{item.downloadCount > 0 ? t('لقد نزّلت هذا الكتاب بالفعل. لا يُسمح بتنزيله مرة أخرى.') : t('يمكنك تنزيل هذا الكتاب من ملفك الشخصي.')}</p>}
                                </article>
                              ))}
                            </div>
                          )}
                      </div>

                      <div>
                        <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink">
                          <ScrollText size={16} /> {t('الإعارات النشطة')}
                        </h2>
                        {library.rentals.length === 0
                          ? <p className="rounded-2xl border border-line p-5 text-sm text-ink-muted">{t('لا توجد إعارات نشطة.')}</p>
                          : (
                            <ul className="space-y-2">
                              {library.rentals.map((item) => (
                                <li key={item.entitlementId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                                  <div>
                                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                                    <p className="text-xs text-ink-muted">
                                      {t('تنتهي في')} {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString(language) : '—'}
                                    </p>
                                  </div>
                                  <Link to={`/${language}/books/${item.slug}`} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-on">{t('فتح')}</Link>
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>

                      <div>
                        <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink">
                          <Package size={16} /> {t('صناديق الغموض')}
                        </h2>
                        {library.mysteryBoxes.length === 0
                          ? <p className="rounded-2xl border border-line p-5 text-sm text-ink-muted">{t('لا توجد صناديق بعد.')}</p>
                          : (
                            <ul className="space-y-2">
                              {library.mysteryBoxes.map((box) => (
                                <li key={box.id} className="rounded-xl border border-line bg-surface p-4">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-ink">{box.title || t('صندوق غموض')}</p>
                                      <p className="text-xs text-ink-muted">
                                        {new Date(box.purchasedAt).toLocaleDateString(language)} · {Number(box.amountTotal).toFixed(2)} {box.currency}
                                      </p>
                                    </div>
                                    <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-ink">{t(MYSTERY_BOX_STATUS_LABELS[box.status] || box.status)}</span>
                                  </div>
                                  {box.trackingNumber && (
                                    <p className="mt-2 inline-flex items-center gap-2 text-xs text-ink-muted">
                                      <Truck size={14} /> {box.carrier || t('شحن')} · <span dir="ltr">{box.trackingNumber}</span>
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>
                    </>
                  )}
                </section>
              )}

              {tab === 'orders' && (
                <section className="space-y-4">
                  {ordersLoading && !orders && <div className="h-40 animate-pulse rounded-2xl bg-brand-soft" />}
                  {orders && orders.length === 0 && (
                    <div className="rounded-2xl border border-line bg-surface p-10 text-center">
                      <Package className="mx-auto text-ink-muted" size={34} />
                      <p className="mt-3 font-semibold text-ink">{t('لا توجد طلبات بعد.')}</p>
                      <Link to={`/${language}/books`} className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on">{t('تصفح المتجر')}</Link>
                    </div>
                  )}
                  {(orders || []).map((order) => (
                    <article key={order.id} className="rounded-2xl border border-line bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">#{order.id} · {Number(order.total).toFixed(2)} {order.currency}</p>
                          <p className="text-xs text-ink-muted">{new Date(order.createdAt).toLocaleDateString(language)}</p>
                        </div>
                        <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-semibold text-ink">
                          {orderStatusLabel(order, t)}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-1 text-sm text-ink">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate">{item.title} × {item.quantity}</span>
                            <span className="shrink-0 tabular-nums text-xs text-ink-muted">{Number(item.unitPrice).toFixed(2)} {order.currency}</span>
                          </li>
                        ))}
                      </ul>
                      {order.trackingNumber && (
                        <p className="mt-2 inline-flex items-center gap-2 text-xs text-ink-muted">
                          <Truck size={14} /> <span dir="ltr">{order.trackingNumber}</span>
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                        {order.return.existingRequest
                          ? (
                            <p className="text-xs font-semibold text-gold-ink">
                              {t('طلب إرجاع')} {order.return.existingRequest.rmaNumber} · {t(RETURN_STATUS_LABELS[order.return.existingRequest.status] || order.return.existingRequest.status)}
                            </p>
                          )
                          : order.return.eligible
                            ? (
                              <button
                                type="button"
                                onClick={() => void openReturnModal(order)}
                                className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-soft"
                              >
                                <RotateCcw size={14} /> {t('إرجاع كتاب')}
                              </button>
                            )
                            : order.return.isPhysical
                              ? <p className="text-xs text-ink-muted">{t('الإرجاع غير متاح لهذا الطلب.')}</p>
                              : null}
                        {order.return.windowEndsAt && order.return.eligible && (() => {
                          const days = Math.max(0, Math.ceil((new Date(order.return.windowEndsAt).getTime() - Date.now()) / 86400000));
                          return <span className="text-xs font-semibold text-brand-ink">
                            {t('يمكنك الإرجاع لمدة')} {days} {t('يومًا إضافيًا')} · {t('حتى')} {new Date(order.return.windowEndsAt).toLocaleDateString(language)}
                          </span>;
                        })()}
                        {order.items.some((item) => item.format && item.format !== 'print') && (
                          <p className="w-full text-xs leading-6 text-ink-muted">
                            {t('الكتب الإلكترونية والاشتراكات وعناصر الصناديق الرقمية غير قابلة للإرجاع.')}{''}
                            <Link to={`/${language}/policy/returns`} className="font-semibold text-brand-ink underline">{t('اقرأ سياسة الإرجاع')}</Link>
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </section>
              )}

              {tab === 'returns' && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4">
                    <p className="text-sm font-semibold text-ink">{t('تابع إرجاعاتك واسترداداتك من هنا.')}</p>
                    <Link to={`/${language}/policy/returns`} className="text-xs font-semibold text-brand-ink underline">{t('سياسة الإرجاع')}</Link>
                  </div>
                  {myReturnsLoading && !myReturns && <div className="h-32 animate-pulse rounded-2xl bg-brand-soft" />}
                  {myReturnsError && <p role="alert" className="rounded-xl border border-danger bg-danger-soft p-3 text-sm text-danger">{myReturnsError}</p>}
                  {myReturns && myReturns.length === 0 && (
                    <div className="rounded-2xl border border-line bg-surface p-10 text-center">
                      <RotateCcw className="mx-auto text-ink-muted" size={34} />
                      <p className="mt-3 font-semibold text-ink">{t('لا توجد طلبات إرجاع بعد.')}</p>
                      <Link to={`/${language}/policy/returns`} className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on">{t('كيف يعمل الإرجاع؟')}</Link>
                    </div>
                  )}
                  {(myReturns || []).map((entry) => (
                    <article key={entry.id} className="rounded-2xl border border-line bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">{entry.rmaNumber}</p>
                          <p className="text-xs text-ink-muted">
                            {new Date(entry.requestedAt).toLocaleDateString(language)} · {entry.orderId ? `#${entry.orderId}` : `BOX-${entry.mysteryBoxPurchaseId}`}
                          </p>
                        </div>
                        <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-ink">{t(RETURN_STATUS_LABELS[entry.status] || entry.status)}</span>
                      </div>
                      <ul className="mt-3 space-y-1 text-sm text-ink">
                        {entry.items.map((line) => (
                          <li key={line.id} className="flex justify-between gap-2">
                            <span className="truncate">{line.titleSnapshot} × {line.quantity}</span>
                            <span className="shrink-0 text-xs tabular-nums">{Number(line.refundAmount).toFixed(2)} {entry.currency}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
                        <span className="text-ink-muted">
                          {t('مبلغ الاسترداد')}: <strong className="text-brand-ink">{Number(entry.refundAmount || lineTotal(entry)).toFixed(2)} {entry.currency}</strong>
                          {entry.shipBackDeadline ? ` · ${t('أرسل قبل')} ${new Date(entry.shipBackDeadline).toLocaleDateString(language)}` : ''}
                        </span>
                        <Link to={`/${language}/account/returns/${entry.id}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-brand-ink">{t('تتبع الإرجاع')}</Link>
                      </div>
                    </article>
                  ))}
                </section>
              )}

              {tab === 'subscription' && (
                <section className="space-y-4">
                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('الخطة الحالية')}</h2>
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isFreePlan ? 'bg-surface-soft text-ink' : 'bg-gold-soft text-gold-ink'}`}>
                        {isFreePlan ? <Sparkles size={12} /> : <Check size={12} />}
                        {isFreePlan ? t('الخطة المجانية') : t('اشتراك نشط')}
                      </span>
                      {!isFreePlan && <span className="text-2xl font-semibold text-ink">{summary.plan.name}</span>}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {summary.plan.expiresAt
                        ? `${t('يتجدد في')} ${new Date(summary.plan.expiresAt).toLocaleDateString(language)}`
                        : t('لا يوجد تاريخ تجديد.')}
                    </p>
                    {activeSubscription && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {activeSubscription.cancelAtPeriodEnd
                          ? (
                            <button type="button" onClick={() => void updateSubscription(activeSubscription.id, 'resume')} disabled={subscriptionBusy === activeSubscription.id} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-60">
                              {t('استئناف التجديد')}
                            </button>
                          )
                          : (
                            <button type="button" onClick={() => void updateSubscription(activeSubscription.id, 'cancel')} disabled={subscriptionBusy === activeSubscription.id} className="rounded-full border border-danger px-4 py-2 text-sm font-semibold text-danger disabled:opacity-60">
                              {t('إلغاء التجديد')}
                            </button>
                          )}
                      </div>
                    )}
                    <Link to={`/${language}/pricing`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink underline">
                      {t('مقارنة الخطط')} <ChevronLeft size={14} className="ltr:rotate-180" />
                    </Link>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink">
                      <Gift size={16} /> {t('رمز هدية الاشتراك')}
                    </h2>
                    <form onSubmit={redeemGiftCode} className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="min-w-[12rem] flex-1 text-sm font-semibold text-ink">
                        {t('استخدم رمز هدية الاشتراك')}
                        <input
                          required
                          maxLength={64}
                          dir="ltr"
                          value={giftCode}
                          onChange={(event) => setGiftCode(event.target.value.toUpperCase())}
                          className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
                        />
                      </label>
                      <button type="submit" disabled={giftCodeBusy} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-60">
                        {giftCodeBusy ? t('جارٍ التفعيل…') : t('تفعيل الهدية')}
                      </button>
                    </form>
                    {giftCodeError && <p role="alert" className="mt-3 rounded-xl border border-danger bg-danger-soft p-3 text-sm text-danger">{giftCodeError}</p>}
                    {giftCodeNotice && <p role="status" className="mt-3 rounded-xl bg-brand-soft p-3 text-sm text-brand-ink">{giftCodeNotice}</p>}
                  </div>

                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('باقات القراءة')}</h2>
                    <label className="mt-3 block text-sm font-semibold text-ink">
                      {t('رمز الخصم للاشتراك (اختياري)')}
                      <input
                        dir="ltr"
                        maxLength={64}
                        value={promoCode}
                        onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                        className="mt-1 w-full max-w-xs rounded-xl border border-line px-3 py-2 text-sm"
                      />
                    </label>
                    {plansLoading && <div className="mt-3 h-24 animate-pulse rounded-xl bg-brand-soft" />}
                    {!plansLoading && plans.length === 0 && (
                      <p className="mt-3 text-sm text-ink-muted">{t('لا توجد باقات متاحة حاليًا.')}</p>
                    )}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {plans.map((plan) => (
                        <article key={plan.id} className="flex flex-col rounded-2xl border border-line p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-base font-semibold text-ink">{plan.name}</h3>
                            <span className="shrink-0 rounded-lg bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-ink">
                              {Number(plan.price).toFixed(2)} {plan.currency} / {t(plan.interval === 'month' ? 'شهر' : 'سنة')}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-ink-muted">{t(plan.isFamily ? 'باقة عائلية' : 'باقة فردية')}</p>
                          <ul className="mt-3 flex-1 space-y-1 text-xs leading-6 text-ink-muted">
                            {(plan.features || []).map((feature) => (
                              <li key={feature} className="flex gap-2"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-brand-ink" />{feature}</li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={() => void startPlanCheckout(plan.id)}
                            disabled={planCheckoutId !== null || subscriptions.some((item) => item.accessActive)}
                            className="mt-4 w-full rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-50"
                          >
                            {planCheckoutId === plan.id ? t('جارٍ تحويلك للدفع…') : t('الاشتراك الآمن')}
                          </button>
                        </article>
                      ))}
                    </div>
                    {planCheckoutError && <p role="alert" className="mt-3 rounded-xl border border-danger bg-danger-soft p-3 text-sm text-danger">{planCheckoutError}</p>}
                  </div>

                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('تبرعاتي الشهرية')}</h2>
                    {recurringLoading && <div className="mt-3 h-16 animate-pulse rounded-xl bg-brand-soft" />}
                    {recurringError && <p role="alert" className="mt-3 text-sm text-danger">{recurringError}</p>}
                    {!recurringLoading && recurringDonations.length === 0 && (
                      <p className="mt-3 text-sm text-ink-muted">{t('لا توجد تبرعات شهرية.')}</p>
                    )}
                    <ul className="mt-3 space-y-2">
                      {recurringDonations.map((donation) => (
                        <li key={donation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                          <div>
                            <p className="font-semibold text-ink">{donation.campaign} · {Number(donation.amount).toFixed(2)} {donation.currency}</p>
                            <p className="text-xs text-ink-muted">
                              {donation.status}{donation.cancelAtPeriodEnd ? ` · ${t('سيُلغى بنهاية الفترة')}` : ''}
                            </p>
                          </div>
                          {['active', 'past_due'].includes(donation.status) && !donation.cancelAtPeriodEnd && (
                            <button
                              type="button"
                              onClick={() => void cancelRecurringDonation(donation.id)}
                              disabled={cancelingDonationId === donation.id}
                              className="rounded-full border border-danger px-3 py-1.5 text-xs font-semibold text-danger disabled:opacity-60"
                            >
                              {cancelingDonationId === donation.id ? t('جارٍ الإلغاء…') : t('إلغاء التبرع')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink">
                      <Gift size={16} /> {t('الدعم والتبرعات')}
                    </h2>
                    <p className="mt-2 text-sm text-ink-muted">{t('ساهم في إبقاء الحكايات متاحة للجميع.')}</p>
                    <Link to={`/${language}/donations`} className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on">{t('ادعمنا')}</Link>
                  </div>
                </section>
              )}

              {tab === 'settings' && (
                <section className="space-y-4">
                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('بيانات الحساب')}</h2>
                    <div className="mt-3 space-y-3">
                      <label className="block text-sm font-semibold text-ink">
                        {t('الاسم')}
                        <input readOnly value={`${summary.user.firstName} ${summary.user.lastName}`} className="mt-1 w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm" />
                      </label>
                      <label className="block text-sm font-semibold text-ink">
                        {t('البريد الإلكتروني')}
                        <span className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm">
                          <Mail size={14} /> {summary.user.email}
                        </span>
                      </label>
                      <div>
                        <p className="text-sm font-semibold text-ink">{t('اللغة')}</p>
                        <div className="mt-2 flex gap-2">
                          {(['ar', 'en', 'fr'] as const).map((code) => (
                            <Link
                              key={code}
                              to={`/${code}/account`}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${code === language ? 'bg-brand text-brand-on' : 'border border-line text-ink-muted'}`}
                            >
                              {code === 'ar' ? 'العربية' : code === 'en' ? 'English' : 'Français'}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <DeliveryAddressCard language={language} />

                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink">
                      <Palette size={16} /> {t('المظهر')}
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {([['light', 'فاتح', Sun], ['reading', 'وضع القراءة', BookOpen], ['dark', 'داكن', Moon]] as const).map(([value, label, Icon]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setTheme(value)}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${theme === value ? 'bg-brand text-brand-on' : 'border border-line text-ink-muted'}`}
                        >
                          <Icon size={14} /> {t(label)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('تذكيرات البريد')}</h2>
                    <label className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold text-ink">
                      {t('تذكير بالقراءة اليومية')}
                      <input type="checkbox" checked={preferences.reminders} onChange={(event) => setPreferences({ ...preferences, reminders: event.target.checked })} className="h-4 w-4 rounded border-line" />
                    </label>
                    <label className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-ink">
                      {t('أخبار المشروع والعروض')}
                      <input type="checkbox" checked={preferences.marketing} onChange={(event) => setPreferences({ ...preferences, marketing: event.target.checked })} className="h-4 w-4 rounded border-line" />
                    </label>
                    <button type="button" onClick={savePreferences} disabled={savingPreferences} className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-60">
                      {savingPreferences && <Loader2 size={14} className="animate-spin" />}
                      {savingPreferences ? t('جارٍ الحفظ…') : t('حفظ التفضيلات')}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('الجلسة')}</h2>
                    <button type="button" onClick={() => { void logout(); }} className="mt-3 inline-flex items-center gap-2 rounded-full border border-danger px-4 py-2 text-sm font-semibold text-danger">
                      <LogOut size={15} /> {t('خروج')}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}

        <BadgeDetailModal
          badge={selected}
          language={language}
          onClose={() => setSelected(null)}
          onToggleFeature={toggleFeature}
          canFeature
        />
        <BadgeCelebration badge={celebration} language={language} onClose={() => setCelebration(null)} />

        {returnOrder && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-surface-sunken/50 p-4 backdrop-blur-sm sm:items-center" role="presentation" onClick={() => setReturnOrder(null)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('إرجاع كتاب')}
              onClick={(event) => event.stopPropagation()}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-5 shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink">{t('طلب إرجاع')}</h2>
                  <p className="text-xs text-ink-muted">{t('الطلب')} #{returnOrder.id}</p>
                </div>
                <button type="button" onClick={() => setReturnOrder(null)} aria-label={t('إغلاق')} className="rounded-full p-2 text-ink-muted hover:bg-surface-soft">
                  <X size={18} />
                </button>
              </div>

              {returnError && <p role="alert" className="mt-3 rounded-xl border border-danger bg-danger-soft p-3 text-sm text-danger">{returnError}</p>}

              {returnStep === 'summary' && returnSummary
                ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl bg-brand-soft p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">{t('ملخص الاسترداد')}</p>
                      <ul className="mt-3 space-y-2 text-sm">
                        {returnSummary.items.filter((item) => item.quantity > 0).map((item) => (
                          <li key={item.orderItemId} className="rounded-lg bg-surface/70 p-3 dark:bg-surface/60">
                            <div className="flex justify-between gap-2 font-semibold text-ink">
                              <span>{item.title} × {item.quantity}</span>
                              <span className="tabular-nums">{item.refund?.amount || '0.00'} {returnSummary.currency}</span>
                            </div>
                            <p className="mt-1 text-xs text-ink-muted">
                              {item.pricePaid ? `${t('السعر المدفوع')}: ${item.pricePaid} ${returnSummary.currency}` : ''}
                              {item.refund?.deductionMinor ? ` · ${t('تُخصم رسوم التوصيل')}: ${item.refund.deduction} ${returnSummary.currency}` : ''}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {item.refund?.legalPeriodApplied ? t('داخل فترة العدول القانونية: تُرد رسوم التوصيل.') : t('خارج فترة العدول: تُخصم رسوم التوصيل.')}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-base font-semibold text-brand-ink">
                        <span>{t('المبلغ المسترد')}</span>
                        <span className="tabular-nums">{returnSummary.totals.refundAmount} {returnSummary.currency}</span>
                      </div>
                      {returnSummary.totals.deduction && Number(returnSummary.totals.deduction) > 0 && (
                        <p className="mt-2 text-xs leading-6 text-ink-muted">{t('يُخصم هذا المبلغ لأن الطلب خارج فترة العدول القانونية.')}</p>
                      )}
                    </div>
                    <p className="text-xs leading-6 text-ink-muted">{t('بالمتابعة، تُرسل الطلب للإدارة. يُدفع المبلغ بعد استلام الكتاب وفحصه.')}</p>
                    <div className="flex justify-between gap-2">
                      <button type="button" onClick={() => setReturnStep('select')} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink">{t('رجوع')}</button>
                      <button
                        type="button"
                        onClick={() => void submitReturn()}
                        disabled={returnBusy}
                        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-60"
                      >
                        {returnBusy ? t('جارٍ الإرسال…') : t('تأكيد الطلب')}
                      </button>
                    </div>
                  </div>
                )
                : !returnData
                ? <p className="mt-6 text-center text-sm text-ink-muted">{t('جارٍ التحميل…')}</p>
                : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">{t('اختر الكتب')}</p>
                      <ul className="mt-2 space-y-2">
                        {returnData.items.map((item) => (
                          <li key={item.orderItemId} className="rounded-xl border border-line p-3">
                            <label className="flex items-start gap-3 text-sm">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-line"
                                checked={Boolean(returnSelection[item.orderItemId])}
                                disabled={!item.eligible || item.availableQuantity < 1}
                                onChange={(event) => setReturnSelection({ ...returnSelection, [item.orderItemId]: event.target.checked })}
                              />
                              <span className="flex-1">
                                <span className="block font-semibold text-ink">{item.title}</span>
                                <span className="block text-xs text-ink-muted">
                                  {t('الكمية')}: {item.availableQuantity}
                                  {item.refund ? ` · ${t('مبلغ متوقع')}: ${item.refund.amount} ${returnData.currency}` : ''}
                                </span>
                                {!item.eligible && (
                                  <span className="mt-1 block text-xs font-semibold text-danger">
                                    {item.reasons.includes('window_closed') ? t('انتهت مدة الإرجاع.') : t('غير مؤهل للإرجاع.')}
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <label className="block text-sm font-semibold text-ink">
                      {t('سبب الإرجاع')}
                      <select
                        value={returnReason}
                        onChange={(event) => setReturnReason(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
                      >
                        {returnReasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
                      </select>
                    </label>

                    <label className="block text-sm font-semibold text-ink">
                      {t('تفاصيل إضافية')}
                      <textarea
                        rows={3}
                        value={returnDetails}
                        onChange={(event) => setReturnDetails(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
                      />
                    </label>

                    {returnReasons.find((reason) => reason.code === returnReason)?.requiresPhotos && (
                      <label className="block text-sm font-semibold text-ink">
                        {t('روابط الصور (رابط في كل سطر)')}
                        <textarea
                          rows={2}
                          dir="ltr"
                          value={returnPhotos}
                          onChange={(event) => setReturnPhotos(event.target.value)}
                          className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
                        />
                      </label>
                    )}

                    <div className="flex items-center justify-between rounded-xl bg-brand-soft p-3 text-sm font-semibold text-brand-ink">
                      <span>{t('المبلغ المتوقع')}</span>
                      <span className="tabular-nums">{(returnSelectionTotalMinor / 100).toFixed(2)} {returnData.currency}</span>
                    </div>
                    <p className="text-xs leading-6 text-ink-muted">{t('يُعاد المبلغ بعد استلام الكتاب وفحصه، وقد تُخصم رسوم التوصيل حسب السياسة.')}</p>

                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setReturnOrder(null)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink">{t('إلغاء')}</button>
                      <button
                        type="button"
                        onClick={() => void reviewReturn()}
                        disabled={returnBusy || !returnReason || returnSelectionTotalMinor < 1}
                        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-50"
                      >
                        {returnBusy ? t('جارٍ الحساب…') : t('مراجعة المبلغ')}
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
      </main>
    </SiteLayout>
  );
}

type MyReturnDetail = MyReturnRecord & {
  reasonDetails: string | null;
  isSellerFault: boolean;
  windowEndAt: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  inspectedAt: string | null;
  refundedAt: string | null;
  photos: string[];
  events: Array<{ id: number; eventType: string; note: string | null; createdAt: string; actorType: string }>;
  items: Array<{ id: number; titleSnapshot: string; quantity: number; itemPricePaid: string; deliveryFeeDeduction: string; refundAmount: string }>;
};

const TRACKING_STEPS = ['requested', 'approved', 'shipped_back', 'received', 'inspected', 'refunded', 'closed'] as const;

function trackingIndex(status: string) {
  if (status === 'awaiting_shipment') return 1;
  if (status === 'refund_pending') return 4;
  const index = TRACKING_STEPS.indexOf(status as typeof TRACKING_STEPS[number]);
  return index < 0 ? 0 : index;
}

export function ReturnTrackingPage() {
  const { locale = 'ar', returnId = '' } = useParams();
  const language = (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as SiteLanguage;
  const t = useCallback((text: string) => translateText(text, language), [language]);
  const { policy } = useReturnPolicy(language);
  const [record, setRecord] = useState<MyReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tracking, setTracking] = useState({ trackingNumber: '', carrier: '' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get<MyReturnDetail>(`/me/returns/${returnId}?lang=${language}`)
      .then((payload) => { if (active) setRecord(payload); })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : t('تعذر تحميل طلب الإرجاع.'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language, reloadKey, returnId, t]);

  async function submitTracking(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/me/returns/${returnId}/tracking`, {
        trackingNumber: tracking.trackingNumber.trim(),
        carrier: tracking.carrier.trim() || undefined
      });
      setNotice(t('تم حفظ رقم التتبع.'));
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر حفظ رقم التتبع.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelReturn() {
    if (!window.confirm(t('هل تريد إلغاء طلب الإرجاع؟'))) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/me/returns/${returnId}/cancel`, {});
      setNotice(t('تم إلغاء الطلب.'));
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر إلغاء الطلب.'));
    } finally {
      setBusy(false);
    }
  }

  const current = record ? trackingIndex(record.status) : 0;
  const canShip = record && ['approved', 'awaiting_shipment', 'shipped_back'].includes(record.status);
  const canCancel = record && ['requested', 'approved', 'awaiting_shipment'].includes(record.status);

  return <SiteLayout><main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
    <Link to={`/${language}/account`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
      <ChevronLeft size={15} className="ltr:rotate-180" /> {t('العودة إلى الملف الشخصي')}
    </Link>
    {loading && !record && <div className="mt-6 h-40 animate-pulse rounded-2xl bg-brand-soft" />}
    {error && <p role="alert" className="mt-4 rounded-xl border border-danger bg-danger-soft p-4 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-brand-soft p-4 text-sm text-brand-ink">{notice}</p>}

    {record && <>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-widest text-brand-ink">{t('تتبع الإرجاع')}</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{record.rmaNumber}</h1>
          <p className="mt-1 text-xs text-ink-muted">
            {t('الطلب')} {record.orderId ? `#${record.orderId}` : `BOX-${record.mysteryBoxPurchaseId}`} · {new Date(record.requestedAt).toLocaleDateString(language)}
          </p>
        </div>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-ink">{t(RETURN_STATUS_LABELS[record.status] || record.status)}</span>
      </header>

      <ol className="mt-7 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {TRACKING_STEPS.map((step, index) => (
          <li key={step} className={`rounded-xl border p-3 text-xs font-semibold ${index <= current ? 'border-line bg-brand-soft text-brand-ink' : 'border-line bg-surface text-ink-muted'}`}>
            <span className="block text-[10px] uppercase tracking-wide">{index + 1}</span>
            {t(RETURN_STATUS_LABELS[step] || step)}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('عنوان الإرجاع والتعليمات')}</h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-soft p-3 text-sm leading-6 text-ink">{policy?.returnAddressText || t('يُرسل العنوان بعد الموافقة.')}</pre>
          <p className="mt-3 text-xs leading-6 text-ink-muted">{policy?.instructions || t('أرسل الطرد مع رقم تتبع.')}</p>
          {record.shipBackDeadline && <p className="mt-3 rounded-xl bg-gold-soft p-3 text-xs font-semibold text-gold-ink">
            {t('آخر موعد لإرسال الطرد')}: {new Date(record.shipBackDeadline).toLocaleDateString(language)}
          </p>}
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('المبلغ والموعد المتوقع')}</h2>
          <p className="mt-3 text-2xl font-semibold text-brand-ink">
            {Number(record.refundAmount || record.items.reduce((sum, line) => sum + Number(line.refundAmount || 0), 0)).toFixed(2)} {record.currency}
          </p>
          {policy && <p className="mt-2 text-xs leading-6 text-ink-muted">{t('يصل الاسترداد عادة خلال')} {policy.refundDeadlineDays} {t('يومًا بعد قبول الفحص.')}</p>}
          <ul className="mt-3 space-y-1 text-xs text-ink-muted">
            {record.items.map((line) => <li key={line.id} className="flex justify-between gap-2"><span>{line.titleSnapshot} × {line.quantity}</span><span className="tabular-nums">{Number(line.refundAmount).toFixed(2)} {record.currency}</span></li>)}
          </ul>
        </section>
      </div>

      {canShip && <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('رقم تتبع الطرد')}</h2>
        <form onSubmit={submitTracking} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-semibold text-ink">{t('رقم التتبع')}
            <input required minLength={4} dir="ltr" value={tracking.trackingNumber} onChange={(event) => setTracking({ ...tracking, trackingNumber: event.target.value })} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-semibold text-ink">{t('شركة الشحن')}
            <input value={tracking.carrier} onChange={(event) => setTracking({ ...tracking, carrier: event.target.value })} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm" />
          </label>
          <button disabled={busy} className="self-end rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-60">{busy ? t('جارٍ الحفظ…') : t('حفظ')}</button>
        </form>
        {record.trackingNumber && <p className="mt-3 text-xs text-ink-muted">{t('المسجل حاليًا')}: <span dir="ltr">{record.trackingNumber}</span></p>}
      </section>}

      <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('سجل الطلب')}</h2>
        <ol className="mt-3 space-y-2 text-sm text-ink">
          {record.events.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0">
            <span>{t(RETURN_STATUS_LABELS[event.eventType] || event.eventType)}{event.note ? ` · ${event.note}` : ''}</span>
            <time className="text-xs text-ink-muted">{new Date(event.createdAt).toLocaleDateString(language)}</time>
          </li>)}
        </ol>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/${language}/account`} className="text-sm font-semibold text-brand-ink underline">{t('كل إرجاعاتي')}</Link>
        {canCancel && <button type="button" onClick={() => void cancelReturn()} disabled={busy} className="rounded-full border border-danger px-4 py-2 text-sm font-semibold text-danger disabled:opacity-60">{t('إلغاء الطلب')}</button>}
      </div>
    </>}
  </main></SiteLayout>;
}

export default ProfilePage;

type SavedShippingAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
};

const EMPTY_SHIPPING_ADDRESS: SavedShippingAddress = {
  name: '', line1: '', line2: '', city: '', postalCode: '', country: '', phone: ''
};

/**
 * The reader's delivery address, saved once here and read by the cart before
 * payment. Without a saved address the cart falls back to the last order.
 */
function DeliveryAddressCard({ language }: { language: SiteLanguage }) {
  const t = (text: string) => translateText(text, language);
  const [address, setAddress] = useState<SavedShippingAddress>(EMPTY_SHIPPING_ADDRESS);
  // Only a profile address can be deleted; an address borrowed from the last
  // order is shown as a starting point but is not stored on the account.
  const [savedSource, setSavedSource] = useState<'profile' | 'order' | null>(null);
  const hasSaved = savedSource === 'profile';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.get<{ address: Partial<SavedShippingAddress> | null; source?: 'profile' | 'order' | null }>('/me/shipping-address')
      .then(({ address: found, source }) => {
        if (!active || !found) return;
        setAddress({
          name: String(found.name || ''),
          line1: String(found.line1 || ''),
          line2: String(found.line2 || ''),
          city: String(found.city || ''),
          postalCode: String(found.postalCode || ''),
          country: String(found.country || '').toUpperCase(),
          phone: String(found.phone || '')
        });
        setSavedSource(source === 'profile' ? 'profile' : 'order');
      })
      .catch(() => { /* no address saved yet */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = { ...address, country: address.country.trim().toUpperCase() };
      await api.put('/me/shipping-address', payload);
      setAddress(payload);
      setSavedSource('profile');
      setMessage(t('تم حفظ العنوان.'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذّر حفظ العنوان.'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api.delete('/me/shipping-address');
      setAddress(EMPTY_SHIPPING_ADDRESS);
      setSavedSource(null);
      setMessage(t('تم حذف العنوان.'));
      window.dispatchEvent(new Event('shipping-address:changed'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذّر حذف العنوان.'));
    } finally {
      setSaving(false);
    }
  }

  const update = (key: keyof SavedShippingAddress) => (event: { target: { value: string } }) =>
    setAddress((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form onSubmit={save} className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink">
        <Truck size={16} /> {t('عنوان التوصيل')}
      </h2>
      {loading
        ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-brand-soft" />
        : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">
              {t('الاسم الكامل')}
              <input required value={address.name} onChange={update('name')} autoComplete="name" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold text-ink">
              {t('الهاتف')}
              <input required value={address.phone} onChange={update('phone')} autoComplete="tel" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold text-ink sm:col-span-2">
              {t('عنوان الشارع')}
              <input required value={address.line1} onChange={update('line1')} autoComplete="address-line1" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold text-ink sm:col-span-2">
              {t('تكملة العنوان (اختياري)')}
              <input value={address.line2} onChange={update('line2')} autoComplete="address-line2" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold text-ink">
              {t('المدينة')}
              <input required value={address.city} onChange={update('city')} autoComplete="address-level2" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold text-ink">
              {t('الرمز البريدي')}
              <input required value={address.postalCode} onChange={update('postalCode')} autoComplete="postal-code" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold text-ink">
              {t('رمز الدولة')}
              <input required value={address.country} onChange={update('country')} maxLength={2} minLength={2} autoComplete="country" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm uppercase" />
            </label>
          </div>
        )}
      {!loading && savedSource === 'order' && !message && <p className="mt-3 text-xs text-ink-muted">{t('استخدمنا العنوان المحفوظ من طلبك السابق — احفظه في ملفك إذا أردت.')}</p>}
      {!loading && !savedSource && !message && <p className="mt-3 text-xs text-ink-muted">{t('لا يوجد عنوان محفوظ بعد.')}</p>}
      {message && <p className="mt-3 text-xs font-semibold text-brand-ink">{message}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-2 text-xs font-semibold text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-60">
          {saving ? t('جارٍ الحفظ…') : t('حفظ العنوان')}
        </button>
        {hasSaved && <button type="button" onClick={() => void remove()} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-full border border-danger px-4 py-2 text-sm font-semibold text-danger disabled:opacity-60">{t('حذف العنوان')}</button>}
      </div>
    </form>
  );
}
