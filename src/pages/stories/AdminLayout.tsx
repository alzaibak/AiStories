import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarDays,
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Heart,
  Home,
  Image,
  Library,
  Mail,
  MessageSquare,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Users,
  Video
} from 'lucide-react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { translateText, type SiteLanguage } from '@/lib/localization';

type AdminLanguage = SiteLanguage;

const navigation: Array<{
  title: string;
  links: Array<{
    label: string;
    to: string;
    icon: typeof Home;
    disabled?: boolean;
  }>;
}> = [
  {
    title: 'لوحة الإدارة',
    links: [{ label: 'نظرة عامة', to: '', icon: Home }]
  },
  {
    title: 'المحتوى',
    links: [
      { label: 'المجموعات', to: 'content/collections', icon: Library },
      { label: 'القصص', to: 'content/stories', icon: BookOpen },
      { label: 'الاختبارات', to: 'content/quizzes', icon: CircleHelp },
      { label: 'الفيديوهات', to: 'content/videos', icon: Video },
      { label: 'مكتبة الوسائط', to: 'content/media', icon: Image },
      { label: 'طلبات القصص', to: 'content/requests', icon: MessageSquare },
      { label: 'قائمة المراجعة', to: 'content/review-queue', icon: ShieldCheck }
    ]
  },
  {
    title: 'التجارة',
    links: [
      { label: 'الكتب والكتب الإلكترونية', to: 'shop/books', icon: ShoppingBag },
      { label: 'الطلبات', to: 'orders', icon: ClipboardList }
    ]
  },
  {
    title: 'المجتمع',
    links: [
      { label: 'المسابقات والفعاليات', to: 'community/events', icon: CalendarDays },
      { label: 'الفرق', to: 'community/teams', icon: Users },
      { label: 'الشارات والشهادات', to: 'community/badges', icon: Award },
      { label: 'مراجعة التقييمات', to: 'community/reviews', icon: MessageSquare }
    ]
  },
  {
    title: 'المال',
    links: [
      { label: 'الباقات والمشتركون', to: 'subscriptions', icon: CircleDollarSign },
      { label: 'مدفوعات Stripe', to: 'money/payments', icon: CreditCard },
      { label: 'التبرعات والحملات', to: 'money/donations', icon: Heart },
      { label: 'الرموز الترويجية والهدايا', to: 'money/promo-codes', icon: Tag }
    ]
  },
  {
    title: 'النظام',
    links: [
      { label: 'المستخدمون والأدوار', to: 'system/users', icon: Users },
      { label: 'التذكيرات والقوالب', to: 'system/emails', icon: Mail },
      { label: 'إعدادات النظام', to: 'system', icon: Settings },
      { label: 'سياسة التصوير والمراجعة', to: 'system/policy', icon: ScrollText }
    ]
  }
];

const knownRoutes: Array<{ path: string; label: string }> = [
  { path: '/admin', label: 'نظرة عامة' },
  { path: '/admin/content', label: 'المحتوى' },
  { path: '/admin/content/collections', label: 'المجموعات' },
  { path: '/admin/content/stories', label: 'القصص' },
  { path: '/admin/content/quizzes', label: 'الاختبارات' },
  { path: '/admin/content/videos', label: 'الفيديوهات' },
  { path: '/admin/content/media', label: 'مكتبة الوسائط' },
  { path: '/admin/content/review-queue', label: 'قائمة المراجعة' },
  { path: '/admin/content/requests', label: 'طلبات القصص' },
  { path: '/admin/community/badges', label: 'الشارات والشهادات' },
  { path: '/admin/community/reviews', label: 'مراجعة التقييمات' },
  { path: '/admin/community/events', label: 'المسابقات والفعاليات' },
  { path: '/admin/community/teams', label: 'الفرق' },
  { path: '/admin/shop/books', label: 'الكتب والكتب الإلكترونية' },
  { path: '/admin/orders', label: 'الطلبات' },
  { path: '/admin/money/payments', label: 'مدفوعات Stripe' },
  { path: '/admin/money/donations', label: 'التبرعات والحملات' },
  { path: '/admin/money/promo-codes', label: 'رموز الخصم والهدايا' },
  { path: '/admin/subscriptions', label: 'المشتركون والاشتراكات' },
  { path: '/admin/system/users', label: 'المستخدمون والأدوار' },
  { path: '/admin/system/change-password', label: 'تغيير كلمة المرور' },
  { path: '/admin/system/emails', label: 'التذكيرات والقوالب' },
  { path: '/admin/system/policy', label: 'سياسة التصوير والمراجعة' },
  { path: '/admin/system', label: 'إعدادات النظام' }
];

function localizedText(text: string, language: AdminLanguage) {
  return translateText(text, language);
}

export default function AdminLayout() {
  const { locale = 'ar' } = useParams();
  const language = (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as AdminLanguage;
  const isRtl = language === 'ar';
  const { user, isLoading, logout } = useStoryAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const basePath = `/${language}/admin`;
  const clientUrl = import.meta.env.VITE_CLIENT_URL || '/';

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  if (isLoading) {
    return <main className="grid min-h-screen place-items-center text-slate-600">{localizedText('جارٍ التحميل…', language)}</main>;
  }
  if (!user) return <Navigate to={`/${language}/admin/login`} replace />;
  if (!['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role)) {
    return <Navigate to={`/${language}/admin/login`} replace />;
  }

  const pathWithoutLocale = location.pathname.replace(/^\/(ar|en|fr)/, '') || '/admin';
  const isReviewer = user.role === 'REVIEWER';
  const isEditor = user.role === 'EDITOR';
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  if (user.mustChangePassword && pathWithoutLocale !== '/admin/system/change-password') {
    return <Navigate to={`${basePath}/system/change-password`} replace />;
  }
  if (!isSuperAdmin && pathWithoutLocale === '/admin/system/change-password') {
    return <Navigate to={basePath} replace />;
  }
  if (isReviewer && !['/admin', '/admin/content/review-queue'].includes(pathWithoutLocale)) {
    return <Navigate to={`${basePath}/content/review-queue`} replace />;
  }
  if (user.role === 'SUPER_ADMIN' && pathWithoutLocale === '/admin/content/review-queue') {
    return <Navigate to={basePath} replace />;
  }
  if (isEditor && ['/admin/orders', '/admin/subscriptions', '/admin/system', '/admin/money', '/admin/community'].some((path) => pathWithoutLocale.startsWith(path))) {
    return <Navigate to={basePath} replace />;
  }
  const matchedRoute = [...knownRoutes]
    .sort((a, b) => b.path.length - a.path.length)
    .find(({ path }) => pathWithoutLocale === path || pathWithoutLocale.startsWith(`${path}/`)) || knownRoutes[0];
  const currentLabel = matchedRoute.label;
  const routeRemainder = pathWithoutLocale.slice(matchedRoute.path.length);
  const routeAction = routeRemainder.includes('/parts/')
    ? 'الأجزاء'
    : routeRemainder.endsWith('/edit')
      ? 'تعديل'
      : routeRemainder.endsWith('/new')
        ? 'إنشاء'
        : null;
  const visibleNavigation = navigation
    .map((group) => {
      if (isReviewer) {
        return group.title === 'لوحة الإدارة'
          ? group
          : group.title === 'المحتوى'
            ? { ...group, links: group.links.filter(({ to }) => to === 'content/review-queue') }
            : null;
      }
      if (isEditor && (group.title === 'المال' || group.title === 'المجتمع' || group.title === 'النظام')) return null;
      if (isEditor && group.title === 'التجارة') {
        return { ...group, links: group.links.filter(({ to }) => to === 'shop/books') };
      }
      if (isEditor && group.title === 'المحتوى') {
        return { ...group, links: group.links.filter(({ to }) => to !== 'content/review-queue') };
      }
      if (!isSuperAdmin && group.title === 'النظام') {
        return { ...group, links: group.links.filter(({ to }) => to !== 'system/users' && to !== 'system/change-password') };
      }
      if (user.role === 'SUPER_ADMIN' && group.title === 'المحتوى') {
        return { ...group, links: group.links.filter(({ to }) => to !== 'content/review-queue') };
      }
      return group;
    })
    .filter((group): group is (typeof navigation)[number] => group !== null);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    navigate(`${basePath}/content/stories${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    setMobileMenuOpen(false);
  }

  function changeLanguage(nextLanguage: AdminLanguage) {
    const suffix = location.pathname.replace(/^\/(ar|en|fr)/, '');
    navigate(`/${nextLanguage}${suffix}${location.search}${location.hash}`);
    setMobileMenuOpen(false);
  }

  const sidebar = <div className={`flex h-full flex-col bg-emerald-950 text-white ${sidebarCollapsed ? 'w-20' : 'w-72'} transition-[width] duration-200`}>
    <div className={`flex h-16 items-center gap-3 border-b border-white/10 px-5 ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
      <BookOpen size={24} className="shrink-0 text-emerald-300" />
      {!sidebarCollapsed && <span className="font-bold">{localizedText('حكايات إسلامية', language)}</span>}
    </div>
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label={localizedText('التنقل الإداري', language)}>
      {visibleNavigation.map((group) => <section key={group.title}>
        {!sidebarCollapsed && <h2 className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-emerald-200/70">{localizedText(group.title, language)}</h2>}
        <div className="space-y-1">
          {group.links.map(({ label, to, icon: Icon, disabled }) => {
            const destination = `${basePath}${to ? `/${to}` : ''}`;
            if (disabled) {
              return <span key={to} title={localizedText('غير متاح بعد', language)} className={`flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/40 ${sidebarCollapsed ? 'justify-center' : ''}`}>
                <Icon size={18} aria-hidden="true" />
                {!sidebarCollapsed && <span>{localizedText(label, language)} · {localizedText('قريبًا', language)}</span>}
              </span>;
            }
            return <NavLink
              key={to}
              end={!to}
              to={destination}
              onClick={() => setMobileMenuOpen(false)}
              title={sidebarCollapsed ? localizedText(label, language) : undefined}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'} ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              <Icon size={18} aria-hidden="true" />
              {!sidebarCollapsed && <span>{localizedText(label, language)}</span>}
            </NavLink>;
          })}
        </div>
      </section>)}
    </nav>
    <div className="border-t border-white/10 p-3">
      <a href={clientUrl} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 ${sidebarCollapsed ? 'justify-center' : ''}`}>
        <ArrowUpRight size={18} aria-hidden="true" />
        {!sidebarCollapsed && <span>{localizedText('عرض الموقع', language)}</span>}
      </a>
    </div>
  </div>;

  return <div dir={isRtl ? 'rtl' : 'ltr'} lang={language} className="min-h-screen bg-slate-50 text-slate-900">
    {mobileMenuOpen && <button type="button" aria-label={localizedText('إغلاق القائمة', language)} onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" />}
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 z-50 ${isRtl ? 'right-0' : 'left-0'} transform transition-transform duration-200 ${mobileMenuOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'} lg:static lg:z-auto lg:translate-x-0`}>
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 lg:hidden" aria-label={localizedText('فتح القائمة', language)}>
              <Menu size={19} />
            </button>
            <button type="button" onClick={() => setSidebarCollapsed((value) => !value)} className="hidden h-10 w-10 place-items-center rounded-lg border border-slate-200 lg:grid" aria-label={localizedText(sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة', language)}>
              {sidebarCollapsed ? isRtl ? <PanelLeftOpen size={18} /> : <ChevronRight size={18} /> : isRtl ? <ChevronLeft size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <nav aria-label={localizedText('مسار التنقل', language)} className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-500">
              <Link to={basePath} className="shrink-0 hover:text-emerald-800">{localizedText('لوحة الإدارة', language)}</Link>
              {currentLabel !== 'نظرة عامة' && <>
                <span aria-hidden="true">/</span>
                {routeAction
                  ? <Link to={`/${language}${matchedRoute.path}`} className="truncate hover:text-emerald-800">{localizedText(currentLabel, language)}</Link>
                  : <span className="truncate font-semibold text-slate-900">{localizedText(currentLabel, language)}</span>}
              </>}
              {routeAction && <><span aria-hidden="true">/</span><span className="truncate font-semibold text-slate-900">{localizedText(routeAction, language)}</span></>}
            </nav>
            {!isReviewer && <form onSubmit={submitSearch} role="search" className="order-last flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:order-none sm:w-56">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={localizedText('البحث في القصص', language)} placeholder={localizedText('البحث في القصص', language)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </form>}
            <a href={clientUrl} className="hidden items-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 xl:inline-flex">
              <ArrowUpRight size={16} aria-hidden="true" /> {localizedText('عرض الموقع', language)}
            </a>
            <label className="sr-only" htmlFor="admin-language">{localizedText('اللغة', language)}</label>
            <select id="admin-language" value={language} onChange={(event) => changeLanguage(event.target.value as AdminLanguage)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
              <option value="ar">AR</option>
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-100">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-900">{user.firstName?.slice(0, 1) || 'A'}</span>
                <span className="hidden max-w-32 truncate text-sm font-semibold sm:block">{user.firstName} {user.lastName}</span>
                <ChevronDown size={15} />
              </summary>
              <div className={`absolute top-full z-50 mt-2 min-w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ${isRtl ? 'left-0' : 'right-0'}`}>
                <button type="button" onClick={() => { logout(); navigate(`/${language}/admin/login`); }} className="w-full rounded-lg px-3 py-2 text-start text-sm font-semibold text-red-700 hover:bg-red-50">{localizedText('خروج', language)}</button>
              </div>
            </details>
          </div>
        </header>
        <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  </div>;
}
