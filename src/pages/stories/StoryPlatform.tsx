import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Link as RouterLink,
  Navigate as RouterNavigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  type LinkProps,
  type NavigateProps,
  type To,
  type NavigateOptions
} from 'react-router-dom';
import {
  ArrowLeft, ArrowUpLeft, BookOpen, Bookmark, Check, ChevronLeft,
  ChevronRight, ChevronDown, CircleHelp, Clock3, CreditCard, Globe, Heart, LogOut,
  LockKeyhole, LogIn, MapPin, Menu, Moon, RefreshCw, Search, ShieldCheck, Sun, Share2,
  Gift, ShoppingBag, Sparkles, Star, UserRound, X, Award, Flame
} from 'lucide-react';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { ApiError, api, type ReaderSubscription } from '@/lib/api';
import { translateText, translateTree } from '@/lib/localization';
import { localizeAuthError } from '@/lib/authErrors';
import { useSiteTheme } from '@/contexts/SiteThemeContext';
import { BrandMark } from '@/components/ui/BrandMark';
import { buttonClasses } from '@/components/ui/Button';
import { StoryCard } from '@/components/ui/StoryCard';
import { CoverArt } from '@/components/ui/CoverArt';
import { pluralMinutes, pluralParts } from '@/lib/plural';
import { MysteryBoxBar, MysteryBoxCard, formatMoney as formatBoxPrice } from '@/components/mystery-box/MysteryBoxCard';
import { ReturnsPolicyPage } from './ReturnsPolicyPage';
import { useMysteryBox } from '@/hooks/useMysteryBox';

type SiteLanguage = 'ar' | 'en' | 'fr';
const siteLanguages: SiteLanguage[] = ['ar', 'en', 'fr'];
const planLanguages: Array<{ code: SiteLanguage; label: string }> = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' }
];

function useSiteLanguage(): SiteLanguage {
  const { locale } = useParams();
  return siteLanguages.includes(locale as SiteLanguage) ? locale as SiteLanguage : 'ar';
}

function t(text: string, language: SiteLanguage) {
  return translateText(text, language);
}

function formatReadingTime(minutes: number, language: SiteLanguage) {
  if (language === 'fr') return `${minutes} min de lecture`;
  if (language === 'en') return `${minutes} min read`;
  return `نحو ${minutes} دقائق للقراءة`;
}

type StoryPartStatus = 'completed' | 'current' | 'available' | 'locked_sequence' | 'locked_subscription' | 'login_required' | 'coming_soon';

function formatLongDate(value: string | null | undefined, language: SiteLanguage) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : language, { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  } catch {
    return '';
  }
}

/** Wording of the reading journey, shared by the story page, the reader and the account. */
function readingOrderCopy(language: SiteLanguage) {
  const fill = (key: string, value: number) => t(key, language).replace('{n}', String(value));
  return {
    nextPart: t('الجزء التالي', language),
    continueTo: (n: number) => fill('تابع إلى الجزء {n}', n),
    finishStory: t('أنهيتُ الحكاية', language),
    finishFirst: (n: number) => fill('أكمل الجزء {n} أولًا', n),
    startFirst: t('ابدأ من الجزء الأول', language),
    createAccount: t('أنشئ حسابًا مجانيًا لمتابعة القراءة', language),
    autoSaved: t('تُحفظ قراءتك تلقائيًا', language),
    comingSoon: t('الحلقة القادمة قريبًا', language),
    releasesOn: (value: string | null | undefined) => {
      const date = formatLongDate(value, language);
      return date ? `${t('يصدر في', language)} ${date}` : t('الحلقة القادمة قريبًا', language);
    },
    notify: t('أخبرني عند صدوره', language),
    notifyOn: t('سنراسلك بالبريد عند صدوره', language),
    bravo: t('أحسنت! أنهيت هذه الحكاية', language),
    discover: t('اكتشف حكايات أخرى', language),
    allStories: t('كل الحكايات', language),
    newPart: t('جزء جديد متاح', language),
    quiz: t('اختبر فهمك', language),
    tryAgain: t('تعذر الحفظ. أعد المحاولة.', language),
    previousPart: t('الجزء السابق', language)
  };
}

function retentionCopy(language: SiteLanguage) {
  return {
    points: t('نقطة', language),
    streakLabel: t('تتابع الأيام', language),
    level: t('المستوى', language),
    days: (count: number) => language === 'fr' ? `${count} jour${count > 1 ? 's' : ''}` : language === 'en' ? `${count} day${count === 1 ? '' : 's'}` : `${count} أيام`,
    finished: t('أكملت هذه الحكاية', language),
    proof: (done: number, total: number) => language === 'fr'
      ? `${done} partie${done > 1 ? 's' : ''} sur ${total} terminée${done > 1 ? 's' : ''}.`
      : language === 'en'
        ? `${done} of ${total} parts completed.`
        : `أكملت ${done} من ${total} أجزاء.`,
    back: t('العودة إلى الحكاية', language)
  };
}

function localizedPlanName(plan: NonNullable<ReaderSubscription['plan']>, language: SiteLanguage) {
  return plan.translations?.[language]?.name || (language === 'ar' ? plan.name : t('اشتراك', language));
}

function prefixLanguage(to: To, language: SiteLanguage): To {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//')) return to;
  if (/^\/(fr|en|ar)(\/|$)/.test(to)) return to;
  return `/${language}${to === '/' ? '' : to}`;
}

function Link(props: LinkProps) {
  const language = useSiteLanguage();
  return <RouterLink {...props} to={prefixLanguage(props.to, language)} />;
}

function Navigate(props: NavigateProps) {
  const language = useSiteLanguage();
  return <RouterNavigate {...props} to={prefixLanguage(props.to, language)} />;
}

function useLocalizedNavigate() {
  const navigate = useNavigate();
  const language = useSiteLanguage();
  return (to: To, options?: NavigateOptions) => navigate(prefixLanguage(to, language), options);
}

type StoryPart = {
  id: number;
  partNumber: number;
  title: string;
  estimatedReadingMinutes: number;
  endingHook?: string;
  isFree?: boolean;
  accessible?: boolean;
  status?: StoryPartStatus;
  expectedAt?: string | null;
  teaser?: string | null;
  illustrationImage?: string | null;
  illustrationAlt?: string | null;
};

type ReadingProgressEntry = {
  storyId: number;
  completedParts: number[];
  nextPart?: { id: number; partNumber: number } | null;
  finished?: boolean;
  newPartAvailable?: boolean;
  publishedParts?: number;
  upcomingPart?: { partNumber: number; expectedAt: string | null; teaser: string | null } | null;
  story?: { id: number; title: string; slug: string; cover?: string | null };
};

type ProfileLevel = { level: number; name?: string | null; points?: number };

/** Payload of `GET /me/profile-summary` (only the fields the reader pages read). */
type ProfileSummary = {
  user: { points: number };
  level: ProfileLevel;
  streak: { current: number; best?: number };
};

/** Payload of `PUT /reading-progress/:storyId` when the story is finished. */
type CompletionPayload = {
  completedParts: number;
  totalParts: number;
  pointsGained: number;
  totalPoints: number;
  level: ProfileLevel;
  streak: { current: number; best?: number };
  newBadges?: Array<{ id: number; name?: string | null; points?: number; iconKey?: string | null }>;
  nextBadges?: Array<{ id: number; name?: string | null; iconKey?: string | null; points?: number; currentValue: number; targetValue: number; ratio: number }>;
};

type StorySummary = {
  id: number;
  collectionId: number;
  title: string;
  slug: string;
  summary: string;
  cover: string | null;
  type: string;
  sourceBadge: string;
  sourceReferences?: Array<{ reference: string }>;
  isFree: boolean;
  isStoryOfTheWeek?: boolean;
  ageGroup?: string;
  hook?: string;
  heroImage?: string | null;
  imageCredit?: string | null;
  socialImage?: string | null;
  coverVariants?: Array<{ width: number; url: string }> | null;
  collection?: { id: number; title: string; slug: string; isFree?: boolean };
  parts?: StoryPart[];
  progress?: {
    completedParts: number[];
    completedCount: number;
    totalParts: number;
    currentPartNumber: number | null;
    finished: boolean;
    newPartAvailable?: boolean;
  };
  upcomingPart?: { id: number; partNumber: number; title: string; expectedAt: string | null; teaser: string | null } | null;
  videos?: Array<{
    id: number;
    title?: string;
    description?: string;
    videoUrl?: string;
    mediaAssetId?: number;
    episodeNumber: number;
    durationSeconds?: number;
    subtitles?: string | null;
  }>;
  reviewerName?: string | null;
};

type CollectionSummary = {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  cover?: string | null;
  isFree: boolean;
  stories?: StorySummary[];
};

type BookSummary = {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  cover?: string | null;
  format: 'print' | 'ebook';
  price: number | string;
  currency: string;
  stockQuantity?: number | null;
  /** PDF versions the admin uploaded; only these can be bought. */
  languages?: string[];
};

/** Native names of the ebook versions, readable in every site language. */
const BOOK_LANGUAGE_LABELS: Record<string, string> = { ar: 'العربية', en: 'English', fr: 'Français' };

function bookLanguageLabel(code: string | null | undefined) {
  if (!code) return '';
  return BOOK_LANGUAGE_LABELS[code] || code.toUpperCase();
}

type MysteryBoxHeader = {
  slug: string;
  label: string;
  seasonLabel: string;
  icon: string;
  colorFrom: string;
  colorTo: string;
  accentColor: string;
  animationStyle: 'shimmer' | 'pulse' | 'sparkle' | 'none';
  showCountdownInHeader: boolean;
  startsAt: string;
  endsAt: string;
  serverTime: string;
  remaining: number | null;
  almostSoldOut: boolean;
  price: { amount: string; currency: string; tier: 'standard' | 'early_bird' };
  itemCount: number;
};

type PlanTranslation = { name: string; features: string[] };
type PlanTranslations = Partial<Record<SiteLanguage, PlanTranslation>>;
type PlanDraft = {
  slug: string;
  price: string;
  interval: 'month' | 'year';
  translations: Record<SiteLanguage, { name: string; features: string }>;
};

function emptyPlanDraft(): PlanDraft {
  return {
    slug: '',
    price: '',
    interval: 'month',
    translations: {
      ar: { name: '', features: '' },
      en: { name: '', features: '' },
      fr: { name: '', features: '' }
    }
  };
}

type QuizOption = { id: number; text: string };
type QuizQuestion = { id: number; type: 'single_choice' | 'multiple_choice' | 'true_false'; points: number; text: string; options: QuizOption[] };
type Quiz = { id: number; title: string; description?: string; passingScore: number; maxAttempts?: number | null };
type QuizAttempt = { attemptId: number; startedAt: string; timeLimitSeconds?: number | null; questions: QuizQuestion[] };
type QuizResult = {
  score: number;
  passed: boolean;
  canRetry: boolean;
  feedback: Array<{
    questionId: number;
    correct: boolean;
    selectedAnswer?: string[];
    correctAnswer?: string[];
    explanation?: string;
    source?: string;
  }>;
};

function useRemote<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoading(Boolean(path));
    setError(null);
    if (!path) return () => { active = false; };
    api.get<T>(path).then((response) => {
      if (active) setData(response);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل المحتوى.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [path]);

  return { data, error, loading };
}

function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Header() {
  const { user, logout } = useStoryAuth();
  const { theme, setTheme } = useSiteTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [openMenu, setOpenMenu] = useState<'theme' | 'language' | 'profile' | null>(null);
  const language = useSiteLanguage();
  const location = useLocation();
  const navigate = useLocalizedNavigate();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    setMenuOpen(false);
    setOpenMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) {
      const loadGuest = () => setCartCount(readGuestCart().reduce((sum, line) => sum + line.quantity, 0));
      loadGuest();
      window.addEventListener('cart:changed', loadGuest);
      return () => window.removeEventListener('cart:changed', loadGuest);
    }
    if (user.role !== 'READER') { setCartCount(0); return; }
    let active = true;
    const load = () => api.get<{ itemCount: number }>('/cart')
      .then((value) => { if (active) setCartCount(value.itemCount || 0); })
      .catch(() => { if (active) setCartCount(0); });
    void load();
    window.addEventListener('cart:changed', load);
    return () => { active = false; window.removeEventListener('cart:changed', load); };
  }, [user, location.pathname]);

  useEffect(() => {
    const locked = menuOpen || searchOpen;
    document.body.style.overflow = locked ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setSearchOpen(false);
      setOpenMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus mode (reading page): the bar steps aside when reading down and is
  // back as soon as the reader scrolls up.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const header = headerRef.current;
      if (!header) return;
      if (document.body.dataset.readerFocus !== 'true') {
        header.removeAttribute('data-hidden');
        lastY = window.scrollY;
        return;
      }
      const y = window.scrollY;
      const delta = y - lastY;
      if (Math.abs(delta) < 2) return;
      lastY = y;
      if (y < 80) header.removeAttribute('data-hidden');
      else if (delta > 0) header.setAttribute('data-hidden', 'true');
      else header.removeAttribute('data-hidden');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const languagePath = (nextLanguage: SiteLanguage) =>
    `/${nextLanguage}${location.pathname.replace(/^\/(fr|en|ar)(?=\/|$)/, '')}`;
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    setSearchOpen(false);
    setMenuOpen(false);
    setSearchQuery('');
    navigate(`/stories${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  };

  const { box: navMysteryBox } = useMysteryBox(language);
  const path = location.pathname.replace(/^\/(fr|en|ar)(?=\/|$)/, '') || '/';
  const navItems: Array<{ href: string; label: string; live?: boolean }> = [
    { href: '/stories', label: 'القصص' },
    { href: '/books', label: 'الكتب' },
    { href: '/pricing', label: 'الاشتراكات' },
    { href: '/events', label: 'الفعاليات' },
    { href: '/donations', label: 'ادعمنا' },
    { href: '/policy', label: 'منهجنا' },
    ...(navMysteryBox ? [{ href: '/mystery-box', label: 'الصندوق الغامض', live: true }] : [])
  ];
  const isActive = (href: string) =>
    href === '/stories'
      ? path.startsWith('/stories') || path.startsWith('/collections')
      : path === href || path.startsWith(`${href}/`);

  const appearances: Array<{ value: 'light' | 'reading' | 'dark'; label: string; short: string; Icon: typeof Sun }> = [
    { value: 'light', label: 'فاتح', short: 'فاتح', Icon: Sun },
    { value: 'reading', label: 'وضع القراءة', short: 'قراءة', Icon: BookOpen },
    { value: 'dark', label: 'داكن', short: 'داكن', Icon: Moon }
  ];

  const iconButton = 'header-icon grid h-10 min-w-10 place-items-center rounded-full';

  return (
    <header ref={headerRef} className="site-header sticky top-0 z-40">
      <Container className="flex h-[var(--header-height)] items-center gap-2">
        <Link to="/" className="me-2 flex shrink-0 items-center gap-2.5" aria-label={`${t('حكايات إسلامية', language)} — ${t('الصفحة الرئيسية', language)}`}>
          <BrandMark size={40} />
          <span className="brand-name font-display text-[1.0625rem] font-semibold tracking-tight">{t('حكايات إسلامية', language)}</span>
        </Link>

        <nav className="ms-2 hidden items-center gap-0.5 xl:flex" aria-label={t('القائمة', language)}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className="site-nav-link"
            >
              {t(item.label, language)}
              {item.live && <span className="ms-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: 'rgb(var(--ds-gold-rgb))' }} aria-hidden="true" />}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <Link to="/cart" className={`${iconButton} relative`} aria-label={t('سلة المشتريات', language)}>
            <ShoppingBag size={19} strokeWidth={1.9} />
            {cartCount > 0 && <span className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-on">{cartCount > 99 ? '99+' : cartCount}</span>}
          </Link>
          <button type="button" className={iconButton} onClick={() => setSearchOpen(true)} aria-label={t('بحث', language)}>
            <Search size={19} strokeWidth={1.9} />
          </button>

          <div className="hidden lg:block">
            <div
              role="radiogroup"
              aria-label={t('المظهر', language)}
              className="theme-switch"
            >
              {appearances.map(({ value, label, short, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  title={t(label, language)}
                  onClick={() => setTheme(value)}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{t(short, language)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative hidden md:block">
            <button
              type="button"
              className={`${iconButton} flex w-auto items-center gap-1.5 px-2.5`}
              aria-label={t('اللغة', language)}
              aria-expanded={openMenu === 'language'}
              aria-haspopup="menu"
              onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
            >
              <Globe size={18} strokeWidth={1.9} aria-hidden="true" />
              <span className="text-xs font-semibold uppercase">{language}</span>
            </button>
            {openMenu === 'language' && (
              <>
                <button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenMenu(null)} />
                <div role="menu" aria-label={t('اللغة', language)} className="ds-pop absolute end-0 top-full z-40 mt-2 w-44 rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                  {planLanguages.map((item) => (
                    <RouterLink
                      key={item.code}
                      to={`${languagePath(item.code)}${location.search}${location.hash}`}
                      lang={item.code}
                      role="menuitemradio"
                      aria-checked={language === item.code}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        language === item.code ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft hover:text-ink'
                      }`}
                    >
                      {item.label}
                      {language === item.code && <Check size={14} className="ms-auto" aria-hidden="true" />}
                    </RouterLink>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  className="header-account flex h-10 items-center gap-2 rounded-full border ps-1 pe-3 text-sm font-semibold transition"
                  aria-expanded={openMenu === 'profile'}
                  aria-haspopup="menu"
                  onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-xs font-semibold uppercase text-brand-ink">
                    {user.email?.charAt(0) || <UserRound size={15} />}
                  </span>
                  <span className="max-w-24 truncate">{t('حسابي', language)}</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
                {openMenu === 'profile' && (
                  <>
                    <button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenMenu(null)} />
                    <div role="menu" className="ds-pop absolute end-0 top-full z-40 mt-2 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                      <p className="truncate px-3 pb-1.5 pt-2 text-xs text-ink-faint">{user.email}</p>
                      <Link role="menuitem" to="/account" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-soft">
                        <UserRound size={16} aria-hidden="true" /> {t('حسابي والاشتراك', language)}
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { logout(); setOpenMenu(null); }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-soft hover:text-ink"
                      >
                        <LogOut size={16} aria-hidden="true" /> {t('خروج', language)}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="rounded-full px-3 py-2 text-sm font-semibold text-ink-muted transition hover:text-ink">
                  {t('دخول', language)}
                </Link>
                <Link to="/stories" className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'px-4' })}>
                  {t('ابدأ القراءة', language)}
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className={`${iconButton} xl:hidden`}
            aria-label={t(menuOpen ? 'إغلاق القائمة' : 'فتح القائمة', language)}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </Container>

      {menuOpen && (
        <div className="fixed inset-x-0 bottom-0 top-[var(--header-height)] z-30 overflow-y-auto border-t border-line bg-paper xl:hidden">
          <div className="ds-container flex flex-col gap-6 py-6">
            <nav className="grid gap-1" aria-label={t('القائمة', language)}>
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-base font-semibold ${
                    isActive(item.href) ? 'bg-brand-soft text-brand-ink' : 'text-ink hover:bg-surface-soft'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {t(item.label, language)}
                    {item.live && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'rgb(var(--ds-gold-rgb))' }} aria-hidden="true" />}
                  </span>
                  <ArrowLeft size={16} className="text-ink-faint ltr:rotate-180" aria-hidden="true" />
                </Link>
              ))}
            </nav>

            <div className="rounded-3xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold text-ink-faint">{t('المظهر', language)}</p>
              <div className="theme-switch theme-switch--stacked mt-2.5 flex w-full" role="radiogroup" aria-label={t('المظهر', language)}>
                {appearances.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={theme === value}
                    onClick={() => setTheme(value)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{t(label, language)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold text-ink-faint">{t('اللغة', language)}</p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {planLanguages.map((item) => (
                  <RouterLink
                    key={item.code}
                    to={`${languagePath(item.code)}${location.search}${location.hash}`}
                    lang={item.code}
                    aria-current={language === item.code ? 'page' : undefined}
                    className={`grid min-h-12 place-items-center rounded-2xl border text-sm font-semibold ${
                      language === item.code ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line text-ink-muted'
                    }`}
                  >
                    {item.label}
                  </RouterLink>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              {user ? (
                <>
                  <Link to="/account" onClick={() => setMenuOpen(false)} className={buttonClasses({ size: 'md', block: true })}>
                    {t('حسابي والاشتراك', language)}
                  </Link>
                  <button type="button" onClick={() => { logout(); setMenuOpen(false); }} className={buttonClasses({ variant: 'secondary', size: 'md', block: true })}>
                    {t('خروج', language)}
                  </button>
                </>
              ) : (
                <>
                  <Link to="/stories" onClick={() => setMenuOpen(false)} className={buttonClasses({ size: 'md', block: true })}>
                    {t('ابدأ القراءة', language)}
                  </Link>
                  <Link to="/login" onClick={() => setMenuOpen(false)} className={buttonClasses({ variant: 'secondary', size: 'md', block: true })}>
                    {t('تسجيل الدخول', language)}
                  </Link>
                  <Link to="/register" onClick={() => setMenuOpen(false)} className="pt-1 text-center text-sm font-semibold text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
                    {t('إنشاء حساب مجاني', language)}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/45 px-4 pt-24 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('بحث في الحكايات', language)}>
          <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 cursor-default" onClick={() => setSearchOpen(false)} />
          <form onSubmit={submitSearch} className="ds-pop relative z-10 w-full max-w-xl rounded-3xl border border-line bg-surface p-3 shadow-lift">
            <div className="flex items-center gap-2">
              <Search size={20} className="ms-2 shrink-0 text-ink-faint" aria-hidden="true" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('ابحث في الحكايات…', language)}
                aria-label={t('بحث في الحكايات', language)}
                className="h-12 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
              />
              <button type="button" onClick={() => setSearchOpen(false)} className={iconButton} aria-label={t('إغلاق', language)}>
                <X size={19} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-2 pt-2.5">
              <p className="text-xs text-ink-faint">{t('ابحث عن قصة أو موضوع', language)}</p>
              <button type="submit" className={buttonClasses({ size: 'sm' })}>{t('بحث', language)}</button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const language = useSiteLanguage();
  const { theme, setTheme } = useSiteTheme();
  const year = new Date().getFullYear();
  const { box: footerMysteryBox } = useMysteryBox(language);
  const linkClass = 'text-sm text-ink-muted transition hover:text-brand-ink';
  const columnTitle = 'text-xs font-semibold tracking-wide text-ink-faint';

  return (
    <footer className="mt-[var(--space-section)] border-t border-line bg-surface-soft/50">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Link to="/" className="flex w-fit items-center gap-2.5" aria-label={t('الصفحة الرئيسية', language)}>
            <BrandMark size={38} />
            <span className="text-base font-semibold text-ink">{t('حكايات إسلامية', language)}</span>
          </Link>
          <p className="mt-4 text-sm leading-7 text-ink-muted">{t('قصص موثوقة، تُروى بمحبة للأجيال القادمة.', language)}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[0.6875rem] font-semibold text-ink-muted">
              <ShieldCheck size={13} className="text-brand-ink" aria-hidden="true" /> {t('مراجعة وتوثيق', language)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[0.6875rem] font-semibold text-ink-muted">
              <Heart size={13} className="text-brand-ink" aria-hidden="true" /> {t('محتوى عائلي', language)}
            </span>
          </div>
        </div>

        <nav className="space-y-3" aria-label={t('روابط سريعة', language)}>
          <p className={columnTitle}>{t('روابط سريعة', language)}</p>
          <div className="grid gap-2.5">
            <Link to="/stories" className={linkClass}>{t('القصص', language)}</Link>
            <Link to="/books" className={linkClass}>{t('المتجر', language)}</Link>
            <Link to="/events" className={linkClass}>{t('الفعاليات', language)}</Link>
            <Link to="/story-request" className={linkClass}>{t('اقتراح قصة', language)}</Link>
            {footerMysteryBox && <Link to="/mystery-box" className={linkClass}>{t('الصندوق الغامض', language)}</Link>}
          </div>
        </nav>

        <nav className="space-y-3" aria-label={t('الثقة والمصادر', language)}>
          <p className={columnTitle}>{t('الثقة والمصادر', language)}</p>
          <div className="grid gap-2.5">
            <Link to="/policy" className={linkClass}>{t('منهجنا', language)}</Link>
            <Link to="/policy/sources" className={linkClass}>{t('المصادر والتوثيق', language)}</Link>
            <Link to="/policy/depiction" className={linkClass}>{t('سياسة التصوير', language)}</Link>
            <Link to="/donations" className={linkClass}>{t('التبرعات', language)}</Link>
          </div>
        </nav>

        <nav className="space-y-3" aria-label={t('الحساب', language)}>
          <p className={columnTitle}>{t('الحساب', language)}</p>
          <div className="grid gap-2.5">
            <Link to="/pricing" className={linkClass}>{t('الأسعار والباقات', language)}</Link>
            <Link to="/account" className={linkClass}>{t('حسابي', language)}</Link>
            <Link to="/login" className={linkClass}>{t('تسجيل الدخول', language)}</Link>
            <Link to="/register" className={linkClass}>{t('إنشاء حساب مجاني', language)}</Link>
          </div>
        </nav>
      </Container>

      <div className="border-t border-line">
        <Container className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-faint">© {year} {t('حكايات إسلامية', language)} · {t('جميع الحقوق محفوظة', language)}</p>
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label={t('اللغة', language)} className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
              {planLanguages.map((item) => (
                <RouterLink
                  key={item.code}
                  to={`/${item.code}`}
                  lang={item.code}
                  className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase transition ${
                    language === item.code ? 'bg-brand-soft text-brand-ink' : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  {item.code}
                </RouterLink>
              ))}
            </nav>
            <div className="theme-switch" role="radiogroup" aria-label={t('المظهر', language)}>
              {([['light', Sun, 'فاتح', 'فاتح'], ['reading', BookOpen, 'وضع القراءة', 'قراءة'], ['dark', Moon, 'داكن', 'داكن']] as const).map(([value, Icon, label, short]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  onClick={() => setTheme(value)}
                  aria-checked={theme === value}
                  aria-label={t(label, language)}
                  title={t(label, language)}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span>{t(short, language)}</span>
                </button>
              ))}
            </div>
            <Link to="/design" className="text-xs font-semibold text-ink-faint hover:text-brand-ink">{t('دليل التصميم', language)}</Link>
          </div>
        </Container>
      </div>
    </footer>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const language = useSiteLanguage();
  const location = useLocation();
  const { box: layoutMysteryBox } = useMysteryBox(language);
  const path = location.pathname.replace(/^\/(fr|en|ar)(?=\/|$)/, '') || '/';
  // Reader, checkout and admin surfaces stay quiet.
  const quietSurface = /\/(read\/|checkout|admin|login|register)/.test(path) || path.startsWith('/mystery-box');
  return (
    <div className="site-root">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-brand-on"
      >
        {t('تخطي إلى المحتوى', language)}
      </a>
      {layoutMysteryBox && !quietSurface && <MysteryBoxBar box={layoutMysteryBox} language={language} />}
      <Header />
      {layoutMysteryBox && path === '/cart' && <CartMysteryBoxSuggestion box={layoutMysteryBox} language={language} />}
      <div id="main-content">{translateTree(children, language)}</div>
      <Footer />
    </div>
  );
}

function CartMysteryBoxSuggestion({ box, language }: { box: NonNullable<ReturnType<typeof useMysteryBox>['box']>; language: SiteLanguage }) {
  return (
    <div className="border-b border-line bg-surface-soft">
      <div className="ds-container flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5 text-xs">
        <Gift size={14} className="shrink-0 text-brand-ink" aria-hidden="true" />
        <span className="font-semibold text-ink">{t('الصندوق الغامض متاح الآن', language)}</span>
        <span className="text-ink-muted">{box.label} · {formatBoxPrice(box.price.amount, box.price.currency, language)}</span>
        <Link to={`/mystery-box/${box.slug}`} className="ms-auto font-semibold text-brand-ink underline underline-offset-4">
          {t('اكتشفه', language)}
        </Link>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold tracking-widest text-brand-ink">{eyebrow}</p>}
        <h2 className="text-2xl font-semibold text-brand-ink sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function StoryArtwork({ story, className = '' }: { story: Pick<StorySummary, 'title' | 'cover'>; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-brand via-brand to-gold ${className}`}>
      {story.cover && <img src={story.cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      {!story.cover && (
        <>
          <div className="absolute -left-8 -top-10 h-48 w-48 rounded-full border border-white/15" />
          <div className="absolute -left-2 -top-4 h-36 w-36 rounded-full border border-white/15" />
          <Sparkles className="absolute bottom-5 left-5 text-gold-ink/80" size={20} />
        </>
      )}
      {!story.cover && <span dir="auto" className="absolute inset-x-5 bottom-5 line-clamp-2 text-lg font-semibold leading-8 text-brand-on">{story.title}</span>}
    </div>
  );
}

function BookCard({ book }: { book: BookSummary }) {
  const language = useSiteLanguage();
  return (
    <Link to={`/books/${book.slug}`} className="group overflow-hidden rounded-3xl border border-line bg-surface transition hover:-translate-y-1 hover:shadow-lift">
      <div className="relative aspect-[1.2] overflow-hidden bg-surface-soft">
        {book.cover ? <img src={book.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" /> : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-gold-soft via-surface-soft to-brand">
            <BookOpen size={46} strokeWidth={1.2} className="text-brand-ink/70" />
          </div>
        )}
        <span className="absolute right-4 top-4 rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold text-brand-ink">{t(book.format === 'ebook' ? 'كتاب إلكتروني' : 'نسخة مطبوعة', language)}</span>
      </div>
      <div className="p-5">
        <h3 className="font-semibold text-brand-ink">{book.title}</h3>
        {book.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{book.description}</p>}
        <p className="mt-4 font-semibold text-brand-ink">{formatPrice(book.price, book.currency, language)}</p>
      </div>
    </Link>
  );
}

function formatPrice(price: number | string, currency: string, language: SiteLanguage = 'ar') {
  return new Intl.NumberFormat(language, { style: 'currency', currency }).format(Number(price));
}

function HeroPanelSkeleton() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute -inset-5 rounded-[3rem] border border-gold" />
      <div className="relative min-h-[30rem] w-full overflow-hidden rounded-[2.5rem] border border-line bg-gradient-to-br from-brand-ink via-brand to-gold shadow-lift">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 18% 12%, rgb(var(--ds-gold-rgb) / .45) 0, transparent 34%), radial-gradient(circle at 88% 82%, rgb(var(--ds-ink-rgb) / .3) 0, transparent 42%)' }} />
        <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full border border-gold" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full border border-gold" />
        <div className="pointer-events-none absolute inset-7 rounded-[2rem] border border-gold" />
        <div className="relative flex h-full min-h-[30rem] animate-pulse flex-col justify-between p-7 sm:p-9">
          <div className="flex items-center justify-between gap-3">
            <div className="h-[58px] w-[58px] rounded-2xl border border-white/10 bg-surface/10" />
            <div className="h-3 w-32 rounded-full bg-surface/10" />
          </div>
          <div>
            <div className="mb-5 h-px w-16 bg-gold-soft" />
            <div className="h-9 w-4/5 rounded-xl bg-surface/10" />
            <div className="mt-4 h-4 w-full rounded bg-surface/10" />
            <div className="mt-2 h-4 w-2/3 rounded bg-surface/10" />
            <div className="mt-6 flex gap-2">
              <div className="h-7 w-20 rounded-full bg-surface/10" />
              <div className="h-7 w-20 rounded-full bg-surface/10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroBrandPanel({ language }: { language: SiteLanguage }) {
  return (
    <div className="relative">
      <div className="absolute -inset-5 rounded-[3rem] border border-gold" aria-hidden="true" />
      <div className="relative aspect-[4/4.5] overflow-hidden rounded-[2.5rem] border border-line bg-gradient-to-br from-brand-ink via-brand to-gold shadow-lift">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 18% 12%, rgb(var(--ds-gold-rgb) / .45) 0, transparent 34%), radial-gradient(circle at 88% 82%, rgb(var(--ds-ink-rgb) / .3) 0, transparent 42%)' }} />
        <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full border border-gold" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full border border-gold" />
        <div className="pointer-events-none absolute inset-7 rounded-[2rem] border border-gold" />
        <div className="relative flex h-full flex-col justify-between p-7 sm:p-9">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-2xl border border-brand-on/20 bg-brand-on/10 p-2 backdrop-blur"><BrandMark size={42} /></span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-ink/70">{t('مكتبة الحكايات', language)}</span>
          </div>
          <div>
            <div className="mb-5 h-px w-16 bg-gold-soft" />
            <h2 className="max-w-xs text-3xl font-semibold leading-[1.45] text-brand-on">{t('حكاية في كل مساء', language)}</h2>
            <p className="mt-4 max-w-sm leading-8 text-brand-on/75">{t('قصص موثّقة، بلغة هادئة، لكل أفراد الأسرة.', language)}</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-gold-ink/85">
              <span className="rounded-full border border-brand-on/15 bg-brand-on/10 px-3 py-1.5">{t('مراجعة علمية', language)}</span>
              <span className="rounded-full border border-brand-on/15 bg-brand-on/10 px-3 py-1.5">{t('قراءة قصيرة', language)}</span>
              <span className="rounded-full border border-brand-on/15 bg-brand-on/10 px-3 py-1.5">{t('محتوى عائلي', language)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  const language = useSiteLanguage();
  return <div className="grid min-h-48 place-items-center text-sm text-ink-muted" role="status">{t('جارٍ تحميل المحتوى…', language)}</div>;
}

function ErrorState({ message }: { message: string }) {
  const language = useSiteLanguage();
  return <div className="rounded-2xl border border-danger bg-danger-soft p-5 text-sm leading-7 text-danger" role="alert">{t(message, language)}</div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-line bg-surface/70 px-6 py-12 text-center text-ink-muted">{children}</div>;
}

export function LandingPage() {
  const language = useSiteLanguage();
  const { data: stories, loading, error } = useRemote<StorySummary[]>('/stories?limit=4');
  const { data: books } = useRemote<BookSummary[]>('/books?limit=3');
  const navigate = useLocalizedNavigate();
  const { box: mysteryBox, loading: mysteryBoxLoading } = useMysteryBox(language);

  return (
    <SiteLayout>
      <main>
        <section className="home-hero relative overflow-hidden text-brand-on">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 85% 20%, rgb(var(--ds-gold-rgb) / .55) 0, transparent 26%), radial-gradient(circle at 12% 90%, rgb(var(--ds-brand-rgb) / .55) 0, transparent 32%)' }} />
          <Container className="relative grid min-h-[570px] gap-12 py-16 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-surface/5 px-4 py-2 text-sm text-gold-ink">
                <Sparkles size={16} /> حكايات من نور الهداية
              </span>
              <h1 className="mt-7 max-w-2xl text-4xl font-semibold leading-[1.45] tracking-tight sm:text-5xl lg:text-6xl">
                قصصٌ تُروى… <span className="text-gold-ink">وقيمٌ تبقى.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-brand-on/80 sm:text-lg">
                عِش مع قصص الأنبياء والصحابة ومحطات التاريخ الإسلامي، في تجربة قراءة ممتعة وموثوقة لكل أفراد الأسرة.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/stories" className={buttonClasses({ variant: 'gold', size: 'lg' })}>
                  {t('ابدأ القراءة', language)}
                  <ChevronLeft size={18} />
                </Link>
                <a href="#start-journey" className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'border-brand-on/30 bg-brand-on/10 text-brand-on hover:border-brand-on/50 hover:bg-brand-on/15' })}>
                  {t('كيف تعمل الحكايات؟', language)}
                </a>
              </div>
              <p className="mt-4 text-sm text-brand-on/70">
                {t('مجاني للبدء', language)} · {t('أجزاء قصيرة', language)} · {t('تقدّمك محفوظ', language)}
              </p>
              <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-brand-on/80">
                <span className="inline-flex items-center gap-2"><ShieldCheck size={17} /> {t('مراجعة وتوثيق', language)}</span>
                <span className="inline-flex items-center gap-2"><BookOpen size={17} /> {t('أجزاء قصيرة', language)}</span>
                <span className="inline-flex items-center gap-2"><Bookmark size={17} /> {t('تقدّمك محفوظ', language)}</span>
                <span className="inline-flex items-center gap-2"><Heart size={17} /> {t('محتوى عائلي', language)}</span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md">
              {mysteryBoxLoading
                ? <HeroPanelSkeleton />
                : mysteryBox
                  ? <MysteryBoxCard box={mysteryBox} language={language} onBuy={(value) => navigate(`/mystery-box/${value.slug}`)} />
                  : <HeroBrandPanel language={language} />}
            </div>
          </Container>
        </section>

        <section id="start-journey" className="scroll-mt-24 border-b border-line bg-surface-soft py-14 sm:py-20">
          <Container>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold tracking-[0.18em] text-brand-ink">{t('ابدأ من هنا', language)}</p>
              <h2 className="mt-3 text-2xl font-semibold text-ink sm:text-3xl">{t('ثلاث خطوات، وحكاية تبدأ', language)}</h2>
              <p className="mt-3 leading-8 text-ink-muted">{t('لا تحتاج إلى معرفة مسبقة. اختر حكاية، اقرأ جزءًا قصيرًا، وعد متى شئت.', language)}</p>
            </div>
            <ol className="mt-9 grid gap-4 md:grid-cols-3">
              {[
                { icon: Search, title: 'اختر حكاية', body: 'تصفح المكتبة حسب المجموعة، أو ابحث عن موضوع يناسب وقتك واهتمامك.' },
                { icon: Clock3, title: 'اقرأ جزءًا قصيرًا', body: 'كل جزء مصمم لقراءة هادئة في نحو 5 إلى 8 دقائق، دون التزام طويل.' },
                { icon: Bookmark, title: 'احفظ تقدّمك', body: 'أنشئ حسابًا مجانيًا لتحفظ مكانك وتتابع من حيث توقفت في أي وقت.' }
              ].map((step, index) => (
                <li key={step.title} className="ds-card relative flex flex-col gap-3 p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand-ink"><step.icon size={20} aria-hidden="true" /></span>
                    <span className="text-sm font-semibold text-ink-faint">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-ink">{t(step.title, language)}</h3>
                  <p className="text-sm leading-7 text-ink-muted">{t(step.body, language)}</p>
                </li>
              ))}
            </ol>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/stories" className={buttonClasses({ size: 'md' })}>
                {t('تصفح الحكايات', language)}
                <ChevronLeft size={17} />
              </Link>
              <Link to="/pricing" className={buttonClasses({ variant: 'secondary', size: 'md' })}>
                {t('ما الذي أحتاجه؟', language)}
              </Link>
            </div>
          </Container>
        </section>

        <Container className="py-16 sm:py-20">
          <SectionHeading eyebrow="اختر رحلتك" title="حكايات لكل قارئ" action={<Link to="/stories" className="text-sm font-semibold text-brand-ink hover:text-brand-ink">كل القصص <ChevronLeft className="inline" size={17} /></Link>} />
          {loading && <LoadingState />}
          {error && <ErrorState message={error} />}
          {!loading && !error && !stories?.length && <EmptyState>نعمل على تجهيز أولى الحكايات المنشورة. عُد إلينا قريبًا.</EmptyState>}
          {!!stories?.length && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{stories.map((story) => <StoryCard key={story.id} story={story} />)}</div>}
        </Container>

        <section className="bg-surface-soft py-16 sm:py-20">
          <Container>
            <SectionHeading eyebrow="مكتبة البيت" title="كتب تجمع العائلة" action={<Link to="/books" className="text-sm font-semibold text-brand-ink">زيارة المتجر <ChevronLeft className="inline" size={17} /></Link>} />
            {!books?.length ? <EmptyState>قريبًا، ستجد هنا كتبًا مختارة للصغار والكبار.</EmptyState> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{books.map((book) => <BookCard key={book.id} book={book} />)}</div>}
            <p className="mt-5 text-center text-xs text-ink-muted">استعرض الكتب ثم تابع إلى صفحة الكتاب لإتمام الدفع الآمن عند تفعيل إعدادات Stripe.</p>
          </Container>
        </section>

        <Container className="py-16 sm:py-20">
          <div className="grid gap-6 rounded-[2rem] bg-brand p-8 text-brand-on sm:grid-cols-[1fr_auto] sm:items-center sm:p-12">
            <div>
              <p className="text-sm font-semibold text-gold-ink">مساحة آمنة للعائلة</p>
              <h2 className="mt-3 text-2xl font-semibold">تعلّم، تأمّل، وشارك الحكاية</h2>
              <p className="mt-3 max-w-2xl leading-7 text-brand-on/75">أنشئ حسابك لمتابعة تقدّمك والاطّلاع على حالة اشتراكك، واستمتع بمحتوى يتدرج معك خطوة بخطوة.</p>
            </div>
            <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-soft px-6 py-3 font-semibold text-brand-ink hover:bg-gold-soft">إنشاء حساب مجاني <ChevronLeft size={17} /></Link>
          </div>
        </Container>
      </main>
    </SiteLayout>
  );
}

export function StoriesPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const { data: stories, loading, error } = useRemote<StorySummary[]>('/stories?limit=100');
  const { data: collections } = useRemote<CollectionSummary[]>('/collections');
  const filteredStories = useMemo(() => stories?.filter((story) =>
    `${story.title} ${story.summary} ${story.collection?.title || ''}`.toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar'))
  ) || [], [stories, search]);
  const language = useSiteLanguage();
  const recommended = stories?.find((story) => story.isStoryOfTheWeek) || stories?.[0];
  const recommendedMinutes = recommended?.parts?.reduce((total, part) => total + (part.estimatedReadingMinutes || 0), 0) || 0;

  return (
    <SiteLayout>
      <main><Container className="py-12 sm:py-16">
        <p className="text-sm font-semibold tracking-widest text-brand-ink">مكتبة الحكايات</p>
        <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><h1 className="text-3xl font-semibold text-brand-ink sm:text-4xl">اختر حكايتك القادمة</h1><p className="mt-3 text-ink-muted">قصص موثقة، مقسمة إلى أجزاء قصيرة تناسب وقتك.</p></div>
          <label className="flex h-12 w-full items-center gap-3 rounded-full border border-line bg-surface px-4 sm:max-w-sm">
            <Search size={18} className="text-ink-muted" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن قصة أو موضوع" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted" aria-label="ابحث عن قصة" />
          </label>
        </div>
        {!search && recommended && (
          <div className="mt-8 overflow-hidden rounded-3xl border border-brand/20 bg-brand-soft/60 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-ink">{t('ابدأ من هنا', language)}</p>
                <h2 dir="auto" className="mt-2 text-2xl font-semibold text-ink">{recommended.title}</h2>
                <p dir="auto" className="mt-2 line-clamp-2 leading-7 text-ink-muted">{recommended.summary}</p>
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-ink-muted">
                  <span className="inline-flex items-center gap-1.5"><BookOpen size={14} /> {recommended.parts?.length || 0} {t('أجزاء', language)}</span>
                  {recommendedMinutes > 0 && <span className="inline-flex items-center gap-1.5"><Clock3 size={14} /> {recommendedMinutes} {t('دقيقة', language)}</span>}
                  <span>{t('حكاية مقترحة لتبدأ بها', language)}</span>
                </p>
              </div>
              <Link to={`/stories/${recommended.slug}`} className={buttonClasses({ size: 'md', className: 'shrink-0' })}>
                {t('افتح الحكاية', language)} <ChevronLeft size={17} />
              </Link>
            </div>
          </div>
        )}
        {!!collections?.length && <div className="mt-9 flex flex-wrap gap-2">{collections.map((collection) => <a key={collection.id} href={`#collection-${collection.id}`} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-brand-ink hover:border-line">{collection.title}</a>)}</div>}
        {loading && <LoadingState />}
        {error && <div className="mt-8"><ErrorState message={error} /></div>}
        {!loading && !error && !filteredStories.length && <div className="mt-8"><EmptyState>{search ? 'لا توجد حكايات تطابق بحثك.' : 'لا توجد حكايات منشورة حتى الآن.'}</EmptyState></div>}
        {!!filteredStories.length && (
          <div className="mt-10 space-y-12">
            {collections?.length ? collections.map((collection) => {
              const collectionStories = filteredStories.filter((story) => story.collectionId === collection.id);
              if (!collectionStories.length) return null;
              return <section id={`collection-${collection.id}`} key={collection.id}><SectionHeading eyebrow="مجموعة قصصية" title={collection.title} /><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{collectionStories.map((story) => <StoryCard key={story.id} story={story} />)}</div></section>;
            }) : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredStories.map((story) => <StoryCard key={story.id} story={story} />)}</div>}
          </div>
        )}
      </Container></main>
    </SiteLayout>
  );
}

export function CollectionDetailPage() {
  const { slug = '' } = useParams();
  const { data: collection, loading, error } = useRemote<CollectionSummary>(`/collections/${encodeURIComponent(slug)}`);
  const language = useSiteLanguage();
  return <SiteLayout><main><Container className="py-9 sm:py-14">
    <Link to="/stories" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-ink"><ArrowUpLeft size={17} />{t('العودة إلى القصص', language)}</Link>
    {loading && <LoadingState />}
    {error && <div className="mt-8"><ErrorState message={error} /></div>}
    {collection && <>
      <header className="mt-7 max-w-3xl">
        <p className="text-sm font-semibold text-brand-ink">{t('مجموعة قصص', language)}</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-ink sm:text-4xl">{collection.title}</h1>
        {collection.description && <p className="mt-4 leading-8 text-ink-muted">{collection.description}</p>}
      </header>
      {collection.stories?.length
        ? <div className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{collection.stories.map((story) => <StoryCard key={story.id} story={{ ...story, collection }} />)}</div>
        : <p className="mt-8 rounded-2xl bg-surface-soft p-8 text-center text-ink-muted">{t('لا توجد قصص منشورة في هذه المجموعة بعد.', language)}</p>}
    </>}
  </Container></main></SiteLayout>;
}

export function StoryDetailPage() {
  const { slug = '' } = useParams();
  const language = useSiteLanguage();
  const { user } = useStoryAuth();
  const { data: story, loading, error } = useRemote<StorySummary>(`/stories/${encodeURIComponent(slug)}`);
  const { data: readingProgress } = useRemote<ReadingProgressEntry[]>(user ? '/reading-progress' : '');
  const parts = story?.parts || [];
  const publishedParts = parts.filter((part) => part.status !== 'coming_soon');
  const upcoming = story?.upcomingPart || null;
  const completedCount = story?.progress?.completedCount
    ?? publishedParts.filter((part) => part.status === 'completed').length;
  const totalParts = story?.progress?.totalParts ?? publishedParts.length;
  const finished = Boolean(story?.progress?.finished);
  const newPartAvailable = Boolean(story?.progress?.newPartAvailable);
  const started = completedCount > 0;
  const totalMinutes = publishedParts.reduce((total, part) => total + (part.estimatedReadingMinutes || 0), 0);
  const progressPercent = totalParts ? Math.max(0, Math.min(100, Math.round((completedCount / totalParts) * 100))) : 0;
  const lastPart = publishedParts[publishedParts.length - 1];
  const currentPart = parts.find((part) => part.status === 'current');
  const order = readingOrderCopy(language);
  const { data: profile } = useRemote<ProfileSummary>(user && started ? '/me/profile-summary' : '');
  const { data: libraryStories } = useRemote<StorySummary[]>('/stories?limit=100');
  const readIds = new Set((readingProgress || []).filter((entry) => entry.completedParts?.length).map((entry) => entry.storyId));

  const nextStory = (libraryStories || []).find((candidate) => candidate.id !== story?.id && !readIds.has(candidate.id))
    || (libraryStories || []).find((candidate) => candidate.id !== story?.id);

  const sameCollectionStories = (libraryStories || []).filter((candidate) => candidate.id !== story?.id &&
    !readIds.has(candidate.id) && candidate.collection?.id === story?.collection?.id);
  const sameTypeStories = (libraryStories || []).filter((candidate) => candidate.id !== story?.id &&
    !readIds.has(candidate.id) && candidate.type === story?.type);
  const unreadRecommendationPool = [...sameCollectionStories, ...sameTypeStories, ...(libraryStories || []).filter((candidate) =>
    candidate.id !== story?.id && !readIds.has(candidate.id))]
    .filter((candidate, index, all) => all.findIndex((entry) => entry.id === candidate.id) === index);
  const recommendationPool = unreadRecommendationPool.length
    ? unreadRecommendationPool
    : (libraryStories || []).filter((candidate) => candidate.id !== story?.id);
  const recommendations = recommendationPool.slice(0, 6);

  const retention = retentionCopy(language);
  const playableVideos = (story?.videos || []).filter((video) => Boolean(video.videoUrl || video.mediaAssetId));
  const [shareNotice, setShareNotice] = useState('');

  useEffect(() => {
    if (!story) return;
    const brand = t('حكايات إسلامية', language);
    document.title = `${story.title} · ${brand}`;
    const setMeta = (selector: string, attribute: string, key: string, value: string) => {
      if (!value) return;
      let node = document.head.querySelector<HTMLMetaElement>(selector);
      if (!node) {
        node = document.createElement('meta');
        node.setAttribute(attribute, key);
        document.head.appendChild(node);
      }
      node.setAttribute('content', value);
    };
    setMeta('meta[name="description"]', 'name', 'description', story.summary);
    setMeta('meta[property="og:title"]', 'property', 'og:title', story.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', story.summary);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'article');
    setMeta('meta[property="og:image"]', 'property', 'og:image', story.socialImage || story.cover || '');
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', story.socialImage || story.cover || '');
  }, [story, language]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNotice(t('تم نسخ الرابط', language));
    } catch {
      setShareNotice(t('تعذر المشاركة تلقائيًا. انسخ الرابط من شريط العنوان.', language));
    }
  }

  const sourceLabel = story?.sourceBadge === 'quran_verse'
    ? t('من القرآن الكريم', language)
    : story?.sourceBadge === 'authentic_hadith'
      ? t('من السنة النبوية', language)
      : t('قصة موثقة', language);
  // The main button always points to the first part the reader may open and has
  // not finished yet; a finished story offers the quiz or the next episode.
  const primaryHref = finished
    ? `/stories/${story?.slug}/read/${lastPart?.partNumber || 1}#quiz`
    : currentPart
      ? `/stories/${story?.slug}/read/${currentPart.partNumber}`
      : user && user.role === 'READER' && !currentPart
        ? '/membership'
        : `/stories/${story?.slug}/read/1`;
  const primaryLabel = finished
    ? t('أعد القراءة', language)
    : currentPart
      ? started
        ? `${t('تابع القراءة', language)} — ${t('الجزء', language)} ${currentPart.partNumber}`
        : t('ابدأ القراءة', language)
      : t('افتح الحكاية بالاشتراك', language);
  const waitingForNextEpisode = finished && Boolean(upcoming);

  return (
    <SiteLayout>
      <main>
        <Container className="py-7 sm:py-12">
          <nav aria-label={t('مسار التصفح', language)} className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-muted">
            <Link to="/stories" className="hover:text-brand-ink">{t('القصص', language)}</Link>
            {story?.collection?.title && (
              <>
                <span aria-hidden="true" className="text-ink-faint">/</span>
                <Link to={`/collections/${story.collection.slug}`} className="hover:text-brand-ink">{story.collection.title}</Link>
              </>
            )}
          </nav>

          {loading && <LoadingState />}
          {error && <div className="mt-8"><ErrorState message={error} /></div>}

          {story && (
            <>
              <section className="story-hero mt-6 grid items-start gap-10 sm:mt-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-14">
                <div className="w-full">
                  <div className="cover-frame">
                    <CoverArt
                      title={story.title}
                      cover={story.heroImage || story.cover}
                      variants={story.coverVariants}
                      seed={story.id}
                      priority
                      showTitle
                      sizes="(min-width: 1024px) 340px, 90vw"
                      className="h-full w-full"
                    />
                  </div>
                  {story.imageCredit && <p className="mt-3 text-center text-xs text-ink-faint lg:text-start">{t('حقوق الصورة', language)}: {story.imageCredit}</p>}
                </div>

                <div className="min-w-0">
                  <p className="ds-eyebrow">{sourceLabel}</p>
                  <h1 dir="auto" className="font-display mt-3 text-[2.6rem] leading-[1.28] text-ink sm:text-[3.5rem] sm:leading-[1.2]">{story.title}</h1>
                  <p dir="auto" className="mt-4 line-clamp-2 max-w-[38rem] font-reading text-[1.375rem] leading-[1.9] text-ink-muted">{story.summary || story.hook}</p>

                  <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-muted">
                    {parts.length > 0 && <span>{pluralParts(parts.length, language)}</span>}
                    {totalMinutes > 0 && <><span aria-hidden="true">·</span><span>{pluralMinutes(totalMinutes, language)}</span></>}
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5 text-ink">
                      <ShieldCheck size={14} className="text-brand-ink" aria-hidden="true" />
                      {story.reviewerName ? t('مراجعة علمية', language) : t('مراجعة موثوقة', language)}
                    </span>
                  </p>

                  {newPartAvailable && (
                    <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-ink">
                      <Sparkles size={13} aria-hidden="true" /> {order.newPart}
                    </p>
                  )}
                  <div className="mt-8 flex items-center gap-3">
                    {waitingForNextEpisode ? (
                      <span className={buttonClasses({ size: 'lg', variant: 'secondary', className: 'cursor-default' })}>
                        <Clock3 size={17} aria-hidden="true" /> {order.comingSoon}
                      </span>
                    ) : (
                      <Link to={primaryHref} className={buttonClasses({ size: 'lg' })}>
                        {primaryLabel}
                        {!finished && <ChevronLeft size={17} className="ltr:rotate-180" aria-hidden="true" />}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => void copyLink()}
                      aria-label={t('نسخ رابط الحكاية', language)}
                      title={t('نسخ رابط الحكاية', language)}
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition hover:border-line-strong hover:text-ink"
                    >
                      <Share2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                  {shareNotice && <p role="status" className="mt-2 text-xs text-ink-muted">{shareNotice}</p>}
                </div>
              </section>

              <div className="star-divider my-10 sm:my-14" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2.6 14.6 7.4 20 8.2 16.1 12 17 17.4 12 14.8 7 17.4 7.9 12 4 8.2 9.4 7.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
              </div>

              <section aria-labelledby="journey-heading" className="ds-card theme-card p-5 sm:p-7">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id="journey-heading" className="font-display text-[1.375rem] font-semibold text-ink">{t('رحلة القراءة', language)}</h2>
                  <p className="text-sm text-ink-muted">
                    {completedCount} {t('من', language)} {totalParts} {t('أجزاء', language)}
                    {upcoming && <span> · +1 {t('قريبًا', language)}</span>}
                    {finished && !upcoming && <span className="text-success"> · {t('مكتملة', language)}</span>}
                  </p>
                </div>
                {user && parts.length > 0 && (
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label={t('تقدّم القراءة', language)}>
                    <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
                  </div>
                )}

                <ol className="journey mt-5">
                  {parts.map((part) => {
                    const status: StoryPartStatus = part.status
                      ?? (part.accessible === false ? 'locked_subscription' : 'available');
                    const done = status === 'completed';
                    const current = status === 'current';
                    const coming = status === 'coming_soon';
                    const lockedByOrder = status === 'locked_sequence';
                    const lockedByPlan = status === 'locked_subscription';
                    const needsAccount = status === 'login_required';
                    const position = publishedParts.findIndex((candidate) => candidate.id === part.id);
                    const previousNumber = position > 0 ? publishedParts[position - 1].partNumber : Math.max(1, part.partNumber - 1);
                    const state = done ? 'done' : current ? 'current' : 'locked';
                    return (
                      <li
                        key={part.id}
                        className="journey-row"
                        data-state={state}
                        aria-current={current ? 'step' : undefined}
                      >
                        <span className="journey-dot" aria-hidden="true">
                          {done ? <Check size={17} /> : coming ? <Clock3 size={15} /> : current ? part.partNumber : <LockKeyhole size={15} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="journey-title flex flex-wrap items-baseline gap-x-2" dir="auto">
                            <span className={`font-semibold text-ink ${current ? 'text-[1.0625rem]' : ''}`}>
                              {t('الجزء', language)} {part.partNumber} — {part.title}
                            </span>
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-muted">
                            {coming ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock3 size={12} aria-hidden="true" />
                                {part.expectedAt ? order.releasesOn(part.expectedAt) : order.comingSoon}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Clock3 size={12} aria-hidden="true" /> ≈ {pluralMinutes(part.estimatedReadingMinutes, language)}
                              </span>
                            )}
                            {(done || current) && <span aria-hidden="true">·</span>}
                            {done && <span className="text-success">{t('اكتمل', language)}</span>}
                            {current && <span>{order.nextPart}</span>}
                            {coming && part.teaser && <span dir="auto" className="line-clamp-1">· {part.teaser}</span>}
                          </p>
                        </div>
                        <div className="journey-actions shrink-0 self-center">
                          {coming ? (
                            <span className="inline-flex min-h-11 items-center rounded-full border border-line px-3.5 text-xs font-semibold text-ink-muted">
                              {order.comingSoon}
                            </span>
                          ) : lockedByOrder ? (
                            <button type="button" disabled aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center rounded-full border border-line px-3.5 text-xs font-semibold text-ink-faint">
                              {order.finishFirst(previousNumber)}
                            </button>
                          ) : lockedByPlan ? (
                            <Link to="/membership" className="inline-flex min-h-11 items-center rounded-full border border-line px-3.5 text-xs font-semibold text-ink-muted hover:text-ink">
                              {t('افتح بالاشتراك', language)}
                            </Link>
                          ) : needsAccount ? (
                            <Link to="/login" className="inline-flex min-h-11 items-center rounded-full border border-line px-3.5 text-xs font-semibold text-brand-ink">
                              {t('سجّل الدخول', language)}
                            </Link>
                          ) : (
                            <Link
                              to={`/stories/${story.slug}/read/${part.partNumber}`}
                              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition ${
                                current ? 'bg-brand text-brand-on hover:bg-brand-strong' : 'border border-line text-brand-ink hover:bg-brand-soft'
                              }`}
                            >
                              {done ? t('أعد القراءة', language) : current ? t('متابعة', language) : t('ابدأ', language)}
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  <li className="journey-row" data-state={finished ? 'todo' : 'locked'}>
                    <span className="journey-dot" aria-hidden="true">
                      {finished ? <CircleHelp size={16} /> : <LockKeyhole size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="journey-title font-semibold text-ink">{order.quiz}</p>
                      <p className="mt-1 text-[0.8125rem] text-ink-muted">
                        {finished ? t('أجب عن أسئلة قصيرة مستندة إلى مصادر القصة.', language) : t('يُفتح الاختبار بعد إكمال الجزء الأخير', language)}
                      </p>
                    </div>
                    <div className="journey-actions shrink-0 self-center">
                      {finished ? (
                        <Link to={`/stories/${story.slug}/read/${lastPart?.partNumber || 1}#quiz`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-xs font-semibold text-brand-ink hover:bg-brand-soft">
                          {order.quiz}
                        </Link>
                      ) : (
                        <button type="button" disabled aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center rounded-full border border-line px-3.5 text-xs font-semibold text-ink-faint">
                          {t('يُفتح لاحقًا', language)}
                        </button>
                      )}
                    </div>
                  </li>
                </ol>

                {user && profile && (
                  <details className="mt-4 border-t border-line pt-3">
                    <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink">
                      {profile.user.points} {retention.points} · {retention.days(profile.streak.current)} · {profile.level.name || profile.level.level}
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div><p className="text-xs text-ink-faint">{retention.points}</p><p className="font-semibold text-ink">{profile.user.points}</p></div>
                      <div><p className="text-xs text-ink-faint">{retention.streakLabel}</p><p className="font-semibold text-ink">{retention.days(profile.streak.current)}</p></div>
                      <div><p className="text-xs text-ink-faint">{retention.level}</p><p className="font-semibold text-ink">{profile.level.name || profile.level.level}</p></div>
                    </div>
                  </details>
                )}
              </section>

              {(!!story.sourceReferences?.length || story.reviewerName) && (
                <details className="mt-8 border-t border-line">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 py-4 text-sm font-semibold text-ink">
                    <span>{t('المصادر والمراجعة', language)}{story.sourceReferences?.length ? ` (${story.sourceReferences.length})` : ''}</span>
                    <ChevronDown size={16} className="text-ink-faint" aria-hidden="true" />
                  </summary>
                  <div className="pb-5">
                    {story.reviewerName && (
                      <p className="text-sm text-ink-muted">
                        {t('راجَعها:', language)} {/administration plateforme/i.test(story.reviewerName) ? t('لجنة المراجعة العلمية', language) : story.reviewerName}
                      </p>
                    )}
                    {!!story.sourceReferences?.length && (
                      <ul className="mt-3 space-y-2 text-sm leading-7 text-ink-muted">
                        {story.sourceReferences.map((source, index) => <li key={`${source.reference}-${index}`}>— {source.reference}</li>)}
                      </ul>
                    )}
                  </div>
                </details>
              )}

              {waitingForNextEpisode && upcoming && (
                <section className="ds-card theme-card mt-8 p-5 sm:p-6">
                  <p className="ds-eyebrow">{order.comingSoon}</p>
                  <h2 dir="auto" className="mt-2 font-display text-lg font-semibold text-ink">
                    {t('الجزء', language)} {upcoming.partNumber} — {upcoming.title}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">{order.releasesOn(upcoming.expectedAt)}</p>
                  {upcoming.teaser && <p dir="auto" className="mt-2 text-sm leading-7 text-ink-muted">{upcoming.teaser}</p>}
                </section>
              )}

              <div className="mt-10 grid gap-4">
                <section className="ds-card theme-card p-5">
                  <p className="ds-eyebrow">{t('الحكاية التالية', language)}</p>
                  {nextStory ? (
                    <>
                      <h2 dir="auto" className="mt-2 line-clamp-2 text-base font-semibold text-ink">{nextStory.title}</h2>
                      <p dir="auto" className="mt-1 line-clamp-2 text-sm leading-7 text-ink-muted">{nextStory.hook || nextStory.summary}</p>
                      <Link to={`/stories/${nextStory.slug}`} className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-4' })}>
                        {t('اكتشف الحكاية', language)}
                      </Link>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-ink-muted">{t('اختر حكاية', language)}</p>
                  )}
                </section>
              </div>

              {!!recommendations.length && (
                <section className="mt-12" aria-labelledby="more-stories">
                  <h2 id="more-stories" className="text-xl font-semibold text-ink">{t('حكايات قد تناسبك', language)}</h2>
                  <div className="ds-scroll-x mt-4 flex gap-4 pb-2">
                    {recommendations.map((candidate) => (
                      <div key={candidate.id} className="w-[16rem] shrink-0 snap-start sm:w-[18rem]">
                        <StoryCard story={candidate} language={language} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-end">
                    <Link to="/stories" className="text-sm font-semibold text-brand-ink hover:underline">{t('كل الحكايات', language)}</Link>
                  </div>
                </section>
              )}

              {playableVideos.length > 0 && (
                <section id="story-video" className="mt-12" aria-labelledby="watch-story">
                  <h2 id="watch-story" className="text-xl font-semibold text-ink">{t('شاهد الحكاية', language)}</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {playableVideos.map((video) => <StoryVideoPlayer key={video.id} video={video} language={language} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </Container>
      </main>
    </SiteLayout>
  );
}
function embeddedVideoUrl(source: string) {
  try {
    const url = new URL(source);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1);
      return /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) {
      const id = url.searchParams.get('v') || url.pathname.match(/^\/embed\/([\w-]{11})$/)?.[1];
      return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (url.hostname === 'vimeo.com' || url.hostname.endsWith('.vimeo.com')) {
      const id = url.pathname.match(/\/(?:video\/)?(\d+)\/?$/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function StoryVideoPlayer({ video, language }: {
  video: NonNullable<StorySummary['videos']>[number];
  language: SiteLanguage;
}) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!video.mediaAssetId) return;
    let active = true;
    let objectUrl: string | null = null;
    api.getBlob(`/media-assets/${video.mediaAssetId}/file`)
      .then((file) => {
        objectUrl = URL.createObjectURL(file);
        if (active) setMediaUrl(objectUrl);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل الفيديو.');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [video.mediaAssetId]);

  if (error) return <ErrorState message={error} />;
  const source = video.videoUrl || mediaUrl;
  if (!source) {
    if (!video.mediaAssetId) return null;
    return <div className="ds-skeleton aspect-video w-full rounded-2xl" aria-hidden="true" />;
  }
  const embedUrl = video.videoUrl ? embeddedVideoUrl(video.videoUrl) : null;
  return <article className="space-y-2">
    {embedUrl
      ? <iframe src={embedUrl} title={video.title || `${t('الحلقة', language)} ${video.episodeNumber}`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" className="aspect-video w-full rounded-2xl bg-black" />
      : <video controls preload="none" className="w-full rounded-2xl bg-black" aria-label={video.title || `${t('الحلقة', language)} ${video.episodeNumber}`}>
          <source src={source} />
          {video.subtitles && <track kind="captions" src={video.subtitles} srcLang={language} label={language.toUpperCase()} default />}
        </video>}
    {video.title && <h3 className="font-semibold text-brand-ink">{video.title}</h3>}
    {video.description && <p className="text-sm leading-6 text-ink-muted">{video.description}</p>}
  </article>;
}

type ReaderPreferences = {
  size: 's' | 'm' | 'l' | 'xl';
  spacing: 'compact' | 'normal' | 'airy';
  width: 'narrow' | 'wide';
  images: boolean;
  focus: boolean;
};

const defaultReaderPreferences: ReaderPreferences = { size: 'm', spacing: 'normal', width: 'narrow', images: true, focus: false };

type ReaderBlock =
  | { id?: number; type: 'text'; text: string }
  | { id?: number; type: 'quote'; text: string; reference?: string }
  | {
    id?: number;
    type: 'image';
    image: { url: string; thumbUrl?: string; width?: number; height?: number };
    alt?: string;
    caption?: string;
    credit?: string;
    layout?: 'full' | 'wide';
    decorative?: boolean;
  };

function readReaderPreferences(): ReaderPreferences {
  try {
    const raw = window.localStorage.getItem('reader-preferences');
    if (!raw) return defaultReaderPreferences;
    const parsed = JSON.parse(raw) as Partial<ReaderPreferences>;
    return {
      size: ['s', 'm', 'l', 'xl'].includes(String(parsed.size)) ? parsed.size as ReaderPreferences['size'] : 'm',
      spacing: ['compact', 'normal', 'airy'].includes(String(parsed.spacing)) ? parsed.spacing as ReaderPreferences['spacing'] : 'normal',
      width: parsed.width === 'wide' ? 'wide' : 'narrow',
      images: parsed.images !== false,
      focus: parsed.focus === true
    };
  } catch {
    return defaultReaderPreferences;
  }
}

function readStoredReadingTheme(): 'light' | 'reading' | 'dark' | null {
  try {
    const stored = window.localStorage.getItem('reader-theme');
    if (stored === 'dark' || stored === 'reading' || stored === 'sepia') return stored === 'sepia' ? 'reading' : stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function ReaderPage() {
  const { slug = '', partNumber = '' } = useParams();
  const number = Number(partNumber);
  const language = useSiteLanguage();
  const { user } = useStoryAuth();
  const navigate = useLocalizedNavigate();
  const { theme: siteTheme, setTheme: setSiteTheme } = useSiteTheme();
  const [readingTheme, setReadingTheme] = useState<'light' | 'reading' | 'dark'>(() => readStoredReadingTheme() || siteTheme);
  const readerThemeTouched = useRef(false);
  const [preferences, setPreferences] = useState<ReaderPreferences>(readReaderPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [story, setStory] = useState<StorySummary | null>(null);
  const [part, setPart] = useState<(StoryPart & { content: string; endingHook: string; blocks?: ReaderBlock[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [quizLocked, setQuizLocked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [completedPartsCount, setCompletedPartsCount] = useState(0);
  const [completion, setCompletion] = useState<CompletionPayload | null>(null);

  const [completedPartIds, setCompletedPartIds] = useState<number[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string; caption?: string } | null>(null);
  const [accessIssue, setAccessIssue] = useState<{ code: string } | null>(null);
  const [savingFailed, setSavingFailed] = useState(false);
  const [showEndScreen, setShowEndScreen] = useState(false);
  const [recommendations, setRecommendations] = useState<StorySummary[]>([]);
  const [remindersOn, setRemindersOn] = useState(false);
  const endSentinel = useRef<HTMLDivElement | null>(null);
  const autoCompleted = useRef(false);

  // Persist an explicit choice without overriding the site theme on first mount.
  useEffect(() => {
    if (!readerThemeTouched.current) {
      readerThemeTouched.current = true;
      return;
    }
    try {
      window.localStorage.setItem('reader-theme', readingTheme);
    } catch {
      /* ignore */
    }
    setSiteTheme(readingTheme);
  }, [readingTheme, setSiteTheme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('reader-preferences', JSON.stringify(preferences));
    } catch {
      /* ignore */
    }
  }, [preferences]);

  // Focus mode: the site header steps aside while reading down.
  useEffect(() => {
    document.body.dataset.readerFocus = preferences.focus ? 'true' : 'false';
    if (!preferences.focus) {
      document.querySelector('.site-header')?.removeAttribute('data-hidden');
    }
    return () => {
      delete document.body.dataset.readerFocus;
      document.querySelector('.site-header')?.removeAttribute('data-hidden');
    };
  }, [preferences.focus]);

  // Which parts are already finished, so the end card only appears once.
  useEffect(() => {
    if (!user) {
      setCompletedPartIds([]);
      setCompletedPartsCount(0);
      return;
    }
    let active = true;
    api.get<ReadingProgressEntry[]>('/reading-progress').then((progress) => {
      if (!active) return;
      const entry = progress.find((item) => item.storyId === Number(story?.id));
      setCompletedPartIds((entry?.completedParts || []).map(Number));
      setCompletedPartsCount((entry?.completedParts || []).length);
    }).catch(() => { /* progress is optional */ });
    return () => { active = false; };
  }, [user, story?.id]);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  useEffect(() => {
    if (!attempt?.timeLimitSeconds) {
      setRemainingSeconds(null);
      return;
    }
    const deadline = new Date(attempt.startedAt).getTime() + attempt.timeLimitSeconds * 1000;
    const updateRemaining = () => setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  useEffect(() => {
    const onScroll = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(height > 0 ? Math.min(100, Math.max(0, (window.scrollY / height) * 100)) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setAccessIssue(null);
    setQuiz(null);
    setQuizLocked(false);
    setSavingFailed(false);
    setShowEndScreen(false);
    autoCompleted.current = false;
    api.get<StorySummary>(`/stories/${encodeURIComponent(slug)}`).then(async (storyResponse) => {
      if (!active) return;
      setStory(storyResponse);
      try {
        const partResponse = await api.get<StoryPart & { content: string; endingHook: string; blocks?: ReaderBlock[] }>(`/stories/${encodeURIComponent(slug)}/parts/${number}`);
        if (!active) return;
        setPart(partResponse);
        try {
          window.localStorage.setItem(`reader-last-part:${storyResponse.id}`, String(partResponse.partNumber));
        } catch {
          /* ignore */
        }
        api.get<Quiz>(`/stories/${encodeURIComponent(slug)}/parts/${number}/quiz`).then((quizResponse) => {
          if (active) setQuiz(quizResponse);
        }).catch((caught: unknown) => {
          if (active && caught instanceof ApiError && caught.code === 'CONTENT_LOCKED') setQuizLocked(true);
        });
      } catch (caught) {
        if (!active) return;
        // A locked part is not an error: the reader gets a calm explanation.
        if (caught instanceof ApiError && caught.code && ['SEQUENCE_LOCKED', 'LOGIN_REQUIRED', 'SUBSCRIPTION_REQUIRED', 'COMING_SOON', 'CONTENT_LOCKED'].includes(caught.code)) {
          setAccessIssue({ code: caught.code });
          setPart(null);
        } else {
          setError(caught instanceof Error ? caught.message : 'تعذر تحميل الجزء.');
        }
      }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل الحكاية.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, number, language]);

  // Restore the scroll position of this part, then keep it up to date.
  useEffect(() => {
    if (!story || !part) return;
    const key = `reader-scroll:${story.slug}:${part.partNumber}`;
    let restoreFrame = 0;
    try {
      const saved = Number(window.localStorage.getItem(key));
      if (Number.isSafeInteger(saved) && saved > 0) {
        restoreFrame = window.requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'auto' }));
      }
    } catch {
      /* ignore */
    }
    const onScroll = () => {
      try {
        window.localStorage.setItem(key, String(window.scrollY));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (restoreFrame) window.cancelAnimationFrame(restoreFrame);
    };
  }, [story, part]);

  /**
   * Completes the current part on the server. The call is idempotent and is
   * retried once, so a short network glitch never loses the reading position.
   */
  async function completeCurrentPart() {
    if (!user || !story || !part) return null;
    const send = () => api.post<{
      alreadyCompleted: boolean;
      progress: { completedParts: number[]; completedCount: number; totalParts: number };
      nextPart: { id: number; partNumber: number; title: string; estimatedReadingMinutes: number } | null;
      completion: CompletionPayload | null;
      storyFinished: boolean;
      upcomingPart: { partNumber: number; expectedAt: string | null; teaser: string | null } | null;
    }>(`/stories/${encodeURIComponent(slug)}/parts/${part.partNumber}/complete`, {});
    setBusy(true);
    setSavingFailed(false);
    try {
      let response;
      try {
        response = await send();
      } catch {
        response = await send();
      }
      setCompletedPartIds(response.progress.completedParts.map(Number));
      setCompletedPartsCount(response.progress.completedCount);
      if (response.completion) setCompletion(response.completion);
      setStory((current) => current ? {
        ...current,
        upcomingPart: response.upcomingPart
          ? { id: current.upcomingPart?.id || 0, partNumber: response.upcomingPart.partNumber, title: current.upcomingPart?.title || '', ...response.upcomingPart }
          : current.upcomingPart
      } : current);
      return response;
    } catch {
      setSavingFailed(true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function continueToNextPart() {
    const response = await completeCurrentPart();
    if (!response) return;
    if (response.nextPart) {
      navigate(`/stories/${story?.slug}/read/${response.nextPart.partNumber}`);
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    setShowEndScreen(true);
  }

  async function finishStory() {
    const response = await completeCurrentPart();
    if (response) setShowEndScreen(true);
  }

  async function enableReminders() {
    setBusy(true);
    try {
      await api.patch<{ emailPreferences: { marketing: boolean; reminders: boolean } }>('/account/email-preferences', {
        marketing: user?.emailPreferences?.marketing ?? false,
        reminders: true
      });
      setRemindersOn(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث التذكيرات.');
    } finally {
      setBusy(false);
    }
  }

  // Reaching the end of the text and staying there for about two seconds
  // completes the part, exactly like the end-of-part button.
  useEffect(() => {
    if (!user || !part || autoCompleted.current || completedPartIds.includes(part.id)) return;
    const node = endSentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    let timer = 0;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        if (timer) return;
        timer = window.setTimeout(() => {
          timer = 0;
          if (autoCompleted.current) return;
          autoCompleted.current = true;
          void completeCurrentPart();
        }, 2000);
      } else if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
    }, { threshold: 0.6 });
    observer.observe(node);
    return () => {
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [user, part, completedPartIds]);

  useEffect(() => {
    if (user?.emailPreferences?.reminders) setRemindersOn(true);
  }, [user?.emailPreferences?.reminders]);

  // Unread stories for the end-of-story screen.
  useEffect(() => {
    if (!showEndScreen || !story || !user) return;
    let active = true;
    Promise.all([
      api.get<StorySummary[]>('/stories?limit=100'),
      api.get<ReadingProgressEntry[]>('/reading-progress')
    ]).then(([all, progress]) => {
      if (!active) return;
      const readIds = new Set((progress || [])
        .filter((entry) => entry.completedParts?.length)
        .map((entry) => entry.storyId));
      setRecommendations((all || [])
        .filter((candidate) => candidate.id !== story.id && !readIds.has(candidate.id))
        .slice(0, 6));
    }).catch(() => { /* optional */ });
    return () => { active = false; };
  }, [showEndScreen, story?.id, user?.id]);

  async function startQuiz() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const quizInfo = quiz || await api.get<Quiz>(`/stories/${encodeURIComponent(slug)}/parts/${number}/quiz`);
      const started = await api.post<QuizAttempt>(`/quizzes/${quizInfo.id}/start`, {});
      setQuiz(quizInfo);
      setAttempt(started);
      setAnswers({});
      setResult(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر بدء الاختبار.');
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz(event: FormEvent) {
    event.preventDefault();
    if (!quiz || !attempt) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<QuizResult>(`/quizzes/${quiz.id}/attempts`, {
        attemptId: attempt.attemptId,
        answers
      });
      setResult(response);
      setAttempt(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إرسال إجاباتك.');
    } finally {
      setBusy(false);
    }
  }

  const order = readingOrderCopy(language);

  if (loading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;

  // A locked part is explained calmly, with the way forward, never as an error.
  if (accessIssue) {
    const currentNumber = story?.progress?.currentPartNumber ?? 1;
    const returnTo = `/stories/${slug}/read/${number || 1}`;
    const isLogin = accessIssue.code === 'LOGIN_REQUIRED';
    const isComing = accessIssue.code === 'COMING_SOON';
    const isPlan = accessIssue.code === 'SUBSCRIPTION_REQUIRED' || accessIssue.code === 'CONTENT_LOCKED';
    return (
      <SiteLayout>
        <main>
          <Container className="max-w-xl py-16 text-center sm:py-24">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-brand-ink" aria-hidden="true">
              {isComing ? <Clock3 size={24} /> : <LockKeyhole size={24} />}
            </span>
            <h1 className="font-display mt-6 text-2xl leading-relaxed text-ink">
              {isComing
                ? t('الحلقة القادمة قريبًا', language)
                : isPlan
                  ? t('هذا الجزء متاح للمشتركين.', language)
                  : isLogin
                    ? t('أنشئ حسابًا مجانيًا لمتابعة القراءة', language)
                    : t('أكمل الجزء {n} أولًا', language).replace('{n}', String(Math.max(1, currentNumber)))}
            </h1>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              {isComing
                ? (story?.upcomingPart?.expectedAt ? order.releasesOn(story.upcomingPart.expectedAt) : t('نعمل عليها الآن.', language))
                : isPlan
                  ? t('اشترك لتتابع هذه الحكاية.', language)
                  : isLogin
                    ? t('تُحفظ قراءتك تلقائيًا بمجرد إنشاء حساب.', language)
                    : t('القراءة بالترتيب تحافظ على تسلسل الحكاية.', language)}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {isLogin ? (
                <>
                  <Link to={`/login?next=${encodeURIComponent(returnTo)}`} className={buttonClasses({ size: 'md' })}>{t('سجّل الدخول', language)}</Link>
                  <Link to={`/register?next=${encodeURIComponent(returnTo)}`} className={buttonClasses({ variant: 'secondary', size: 'md' })}>{t('إنشاء حساب مجاني', language)}</Link>
                </>
              ) : isPlan ? (
                <Link to="/membership" className={buttonClasses({ size: 'md' })}>{t('عرض الاشتراكات', language)}</Link>
              ) : isComing ? null : (
                <>
                  <Link to={`/stories/${slug}/read/${currentNumber}`} className={buttonClasses({ size: 'md' })}>
                    {t('تابع إلى الجزء {n}', language).replace('{n}', String(currentNumber))}
                    <ChevronLeft size={17} className="ltr:rotate-180" aria-hidden="true" />
                  </Link>
                  <Link to={`/stories/${slug}/read/1`} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted underline underline-offset-4 hover:text-ink">
                    {t('ابدأ من الجزء الأول', language)}
                  </Link>
                </>
              )}
            </div>
            <div className="mt-8">
              <Link to={`/stories/${slug}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-ink">
                <ArrowLeft size={16} aria-hidden="true" /> {t('العودة إلى الحكاية', language)}
              </Link>
            </div>
          </Container>
        </main>
      </SiteLayout>
    );
  }

  if (error && !part) return <SiteLayout><Container className="py-12"><ErrorState message={error} /><Link to={`/stories/${slug}`} className="mt-5 inline-flex items-center gap-2 font-semibold text-brand-ink"><ArrowLeft size={16} /> {t('العودة إلى الحكاية', language)}</Link></Container></SiteLayout>;
  if (!story || !part) return <Navigate to="/stories" replace />;
  const upcomingPart = story.upcomingPart || null;

  const publishedParts = (story.parts || []).filter((candidate) => candidate.status !== 'coming_soon');
  const previous = publishedParts.find((candidate) => candidate.partNumber === number - 1);
  const nextPartEntry = publishedParts.find((candidate) => candidate.partNumber === number + 1);
  const totalParts = publishedParts.length || part.partNumber;
  const partPosition = language === 'fr'
    ? `Partie ${part.partNumber} sur ${totalParts}`
    : language === 'en'
      ? `Part ${part.partNumber} of ${totalParts}`
      : `الجزء ${part.partNumber} من ${totalParts}`;
  const isLastPart = !nextPartEntry;
  const retention = retentionCopy(language);
  const blocks: ReaderBlock[] = part.blocks?.length
    ? part.blocks
    : part.content?.trim()
      ? [{ type: 'text', text: part.content }]
      : [];
  const finishedPart = Boolean(part.id && completedPartIds.includes(part.id)) ||
    (totalParts > 0 && completedPartsCount >= totalParts);

  const sizeOptions: Array<{ value: ReaderPreferences['size']; label: string }> = [
    { value: 's', label: t('صغير', language) },
    { value: 'm', label: t('متوسط', language) },
    { value: 'l', label: t('كبير', language) },
    { value: 'xl', label: t('كبير جدًا', language) }
  ];
  const spacingOptions: Array<{ value: ReaderPreferences['spacing']; label: string }> = [
    { value: 'compact', label: t('مضغوط', language) },
    { value: 'normal', label: t('عادي', language) },
    { value: 'airy', label: t('متباعد', language) }
  ];
  const themeOptions: Array<{ value: 'light' | 'reading' | 'dark'; label: string; Icon: typeof Sun }> = [
    { value: 'light', label: t('فاتح', language), Icon: Sun },
    { value: 'reading', label: t('وضع القراءة', language), Icon: BookOpen },
    { value: 'dark', label: t('داكن', language), Icon: Moon }
  ];
  const widthOptions: Array<{ value: ReaderPreferences['width']; label: string }> = [
    { value: 'narrow', label: t('ضيق', language) },
    { value: 'wide', label: t('واسع', language) }
  ];

  return (
    <SiteLayout>
      <main
        data-reading-theme={readingTheme}
        className="reader-shell"
        data-reader-size={preferences.size}
        data-reader-spacing={preferences.spacing}
        data-reader-width={preferences.width}
        data-reader-images={preferences.images ? 'on' : 'off'}
      >
        <div className="reader-bar">
          <Container className="reader-bar__inner">
            <Link to={`/stories/${story.slug}`} className="inline-flex min-h-11 min-w-0 items-center gap-1.5 pe-1 text-sm font-semibold text-ink-muted hover:text-ink" aria-label={t('العودة إلى الحكاية', language)}>
              <ChevronRight size={17} className="ltr:hidden" aria-hidden="true" />
              <ArrowLeft size={16} className="rtl:hidden" aria-hidden="true" />
              <span className="reader-bar__title">{story.title}</span>
            </Link>
            <span className="reader-bar__spacer" />
            <button
              type="button"
              aria-expanded={settingsOpen}
              aria-label={t('إعدادات القراءة', language)}
              onClick={() => setSettingsOpen((open) => !open)}
              className={`inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2.5 text-sm font-semibold transition ${settingsOpen ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft hover:text-ink'}`}
            >
              <span aria-hidden="true" className="font-sans text-base leading-none">Aa</span>
            </button>
            <button
              type="button"
              aria-pressed={readingTheme !== 'light'}
              aria-label={t(readingTheme === 'light' ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح', language)}
              onClick={() => setReadingTheme(readingTheme === 'light' ? 'dark' : 'light')}
              className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-soft hover:text-ink"
            >
              {readingTheme === 'light' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
            </button>
          </Container>
          <div className="reader-progress" aria-hidden="true"><span style={{ width: `${scrollProgress}%` }} /></div>
        </div>

          {settingsOpen && (
            <Container className="border-t border-line bg-surface py-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold text-ink-faint">{t('حجم الخط', language)}</p>
                  <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t('حجم الخط', language)}>
                    {sizeOptions.map(({ value, label }) => (
                      <button key={value} type="button" aria-pressed={preferences.size === value} onClick={() => setPreferences((current) => ({ ...current, size: value }))} className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold ${preferences.size === value ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-faint">{t('تباعد الأسطر', language)}</p>
                  <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t('تباعد الأسطر', language)}>
                    {spacingOptions.map(({ value, label }) => (
                      <button key={value} type="button" aria-pressed={preferences.spacing === value} onClick={() => setPreferences((current) => ({ ...current, spacing: value }))} className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold ${preferences.spacing === value ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-faint">{t('عرض النص', language)}</p>
                  <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t('عرض النص', language)}>
                    {widthOptions.map(({ value, label }) => (
                      <button key={value} type="button" aria-pressed={preferences.width === value} onClick={() => setPreferences((current) => ({ ...current, width: value }))} className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold ${preferences.width === value ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-faint">{t('المظهر', language)}</p>
                  <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t('المظهر', language)}>
                    {themeOptions.map(({ value, label, Icon }) => (
                      <button key={value} type="button" aria-pressed={readingTheme === value} onClick={() => setReadingTheme(value)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${readingTheme === value ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft'}`}>
                        <Icon size={13} aria-hidden="true" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-faint">{t('إظهار الصور', language)}</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.images}
                    onClick={() => setPreferences((current) => ({ ...current, images: !current.images }))}
                    className={`mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold ${preferences.images ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft'}`}
                  >
                    <span aria-hidden="true" className={`relative inline-block h-4 w-7 rounded-full ${preferences.images ? 'bg-brand' : 'bg-line-strong'}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${preferences.images ? 'start-3.5' : 'start-0.5'}`} />
                    </span>
                    {preferences.images ? t('مفعّل', language) : t('معطّل', language)}
                  </button>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-faint">{t('وضع التركيز', language)}</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.focus}
                    onClick={() => setPreferences((current) => ({ ...current, focus: !current.focus }))}
                    className={`mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold ${preferences.focus ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft'}`}
                  >
                    <span aria-hidden="true" className={`relative inline-block h-4 w-7 rounded-full ${preferences.focus ? 'bg-brand' : 'bg-line-strong'}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${preferences.focus ? 'start-3.5' : 'start-0.5'}`} />
                    </span>
                    {preferences.focus ? t('مفعّل', language) : t('معطّل', language)}
                  </button>
                </div>
              </div>
            </Container>
          )}

        <Container className="max-w-5xl pb-28 pt-8 sm:pb-16 sm:pt-10">
          <header className="mx-auto max-w-[46rem] text-center">
            <p className="reader-topbar-title">{partPosition}</p>
            <h1 dir="auto" className="ds-title mt-2 text-2xl leading-relaxed text-ink sm:text-[2rem]">{part.title}</h1>
            <p className="mt-2 inline-flex items-center gap-2 text-xs text-ink-muted">
              <Clock3 size={13} aria-hidden="true" /> {formatReadingTime(part.estimatedReadingMinutes, language)}
            </p>
          </header>

          <div className="star-divider my-7" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2.6 14.6 7.4 20 8.2 16.1 12 17 17.4 12 14.8 7 17.4 7.9 12 4 8.2 9.4 7.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
          </div>

          {part.illustrationImage && preferences.images && (
            <figure className="reader-figure mb-9" data-layout="full">
              <div className="reader-figure__frame" data-loaded="true">
                <img
                  src={part.illustrationImage}
                  alt={part.illustrationAlt || ''}
                  width={1200}
                  height={675}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </figure>
          )}

          <div className="reader-flow">
            {blocks.map((block, index) => {
              if (block.type === 'text') {
                return (
                  <div key={block.id ?? `text-${index}`} dir="auto" className="reader-block-text">
                    {block.text.split(/\n{2,}/).filter(Boolean).map((paragraph, position) => <p key={position}>{paragraph}</p>)}
                  </div>
                );
              }
              if (block.type === 'quote') {
                return (
                  <blockquote key={block.id ?? `quote-${index}`} dir="auto" className="reader-quote">
                    <p>{block.text}</p>
                    {block.reference && <footer>{block.reference}</footer>}
                  </blockquote>
                );
              }
              if (!block.image?.url) return null;
              const caption = block.caption || '';
              return (
                <figure key={block.id ?? `image-${index}`} className="reader-figure" data-layout={block.layout === 'wide' ? 'wide' : 'full'}>
                  <button
                    type="button"
                    className="reader-figure__frame reader-figure__button"
                    data-loaded="false"
                    onClick={() => setLightbox({ url: block.image.url, alt: block.decorative ? '' : block.alt || '', caption })}
                  >
                    <img
                      src={block.image.thumbUrl || block.image.url}
                      srcSet={block.image.thumbUrl ? `${block.image.thumbUrl} 600w, ${block.image.url} 1200w` : undefined}
                      sizes="(min-width: 1024px) 46rem, 100vw"
                      alt={block.decorative ? '' : block.alt || ''}
                      width={block.image.width || 1200}
                      height={block.image.height || 800}
                      loading="lazy"
                      decoding="async"
                      onLoad={(event) => event.currentTarget.parentElement?.setAttribute('data-loaded', 'true')}
                      onError={(event) => event.currentTarget.parentElement?.setAttribute('data-loaded', 'true')}
                    />
                  </button>
                  {(caption || block.credit) && (
                    <figcaption>
                      {caption}
                      {block.credit && <span className="reader-figure__credit block">{t('الصورة', language)}: {block.credit}</span>}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>

          {part.endingHook && (
            <div className="reader-reflect mt-10">
              <p className="reader-reflect__label">{t('تأمّل', language)}</p>
              <p dir="auto">{part.endingHook}</p>
            </div>
          )}

          <div ref={endSentinel} className="mx-auto mt-10 max-w-[46rem] border-t border-line pt-6">
            {user ? (
              <div className="ds-card p-6 sm:p-7">
                {!isLastPart && nextPartEntry ? (
                  <>
                    <p className="ds-eyebrow">{order.nextPart}</p>
                    <p dir="auto" className="mt-2 text-lg font-semibold text-ink">
                      {t('الجزء', language)} {nextPartEntry.partNumber} — {nextPartEntry.title}
                      <span className="ms-2 text-sm font-normal text-ink-muted">· ≈ {formatReadingTime(nextPartEntry.estimatedReadingMinutes || 5, language)}</span>
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                      <button type="button" onClick={() => void continueToNextPart()} disabled={busy} className={buttonClasses({ size: 'md' })}>
                        {busy ? t('جارٍ الحفظ…', language) : order.continueTo(nextPartEntry.partNumber)}
                        <ChevronLeft size={17} className="ltr:rotate-180" aria-hidden="true" />
                      </button>
                      {previous && (
                        <Link to={`/stories/${slug}/read/${previous.partNumber}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
                          {order.previousPart}
                        </Link>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="ds-eyebrow">{t('نهاية الحكاية', language)}</p>
                    <p className="mt-2 text-lg font-semibold text-ink">{order.finishStory}</p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                      <button type="button" onClick={() => void finishStory()} disabled={busy} className={buttonClasses({ size: 'md' })}>
                        {busy ? t('جارٍ الحفظ…', language) : order.finishStory}
                      </button>
                      {previous && (
                        <Link to={`/stories/${slug}/read/${previous.partNumber}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
                          {order.previousPart}
                        </Link>
                      )}
                    </div>
                  </>
                )}
                {finishedPart && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-success"><Check size={13} aria-hidden="true" /> {t('اكتمل', language)}</p>
                )}
              </div>
            ) : (
              <div className="ds-card p-5 sm:p-6">
                <p className="text-sm font-semibold text-ink">{order.createAccount}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link to={`/login?next=${encodeURIComponent(`/stories/${slug}/read/${number + 1}`)}`} className={buttonClasses({ size: 'md' })}>{t('سجّل الدخول', language)}</Link>
                  <Link to={`/register?next=${encodeURIComponent(`/stories/${slug}/read/${number + 1}`)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink">{t('إنشاء حساب مجاني', language)}</Link>
                </div>
                <p className="mt-3 text-xs text-ink-muted">{order.autoSaved}</p>
              </div>
            )}
          </div>

          {savingFailed && (
            <div className="mx-auto mt-4 flex max-w-[46rem] flex-wrap items-center gap-3 rounded-xl bg-surface-soft p-4 text-sm" role="alert">
              <p className="text-ink-muted">{order.tryAgain}</p>
              <button type="button" onClick={() => void completeCurrentPart()} disabled={busy} className="min-h-11 rounded-full border border-line px-4 font-semibold text-brand-ink">
                {t('أعد المحاولة', language)}
              </button>
            </div>
          )}

          {notice && <p role="status" className="calm-toast mx-auto mt-4 flex max-w-[46rem] items-center gap-2 text-sm font-semibold text-success"><Check size={16} aria-hidden="true" /> {notice}</p>}
          {error && <div className="mx-auto mt-4 max-w-[46rem]"><ErrorState message={error} /></div>}

          {showEndScreen && (
            <section className="ds-card theme-card mx-auto mt-10 max-w-[46rem] p-6 sm:p-8">
              {upcomingPart ? (
                <>
                  <p className="ds-eyebrow">{t('نهاية الجزء', language)}</p>
                  <h2 className="ds-title mt-2 text-2xl text-ink">{order.comingSoon}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{order.releasesOn(upcomingPart.expectedAt)}</p>
                  {upcomingPart.teaser && <p dir="auto" className="mt-3 text-sm leading-7 text-ink">{upcomingPart.teaser}</p>}
                  <div className="mt-5">
                    {remindersOn ? (
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-success"><Check size={15} aria-hidden="true" /> {order.notifyOn}</p>
                    ) : (
                      <button type="button" onClick={() => void enableReminders()} disabled={busy} className={buttonClasses({ size: 'sm' })}>
                        {order.notify}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="ds-eyebrow">{t('نهاية الحكاية', language)}</p>
                  <h2 className="ds-title mt-2 text-2xl text-ink">{order.bravo}</h2>
                  {completion && (
                    <div className="mt-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><Award size={16} aria-hidden="true" /> {completion.pointsGained > 0 ? `+${completion.pointsGained}` : '0'} {retention.points}</p>
                      <p className="mt-1 text-xs text-ink-muted"><Flame size={12} className="inline" aria-hidden="true" /> {retention.days(completion.streak.current)} · {completion.level.name || completion.level.level}</p>
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {quiz && <a href="#quiz" className={buttonClasses({ size: 'sm' })}><CircleHelp size={15} aria-hidden="true" /> {order.quiz}</a>}
                    <Link to={`/stories/${story.slug}`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{retention.back}</Link>
                  </div>
                  {!!recommendations.length && (
                    <div className="mt-7 border-t border-line pt-5">
                      <h3 className="text-base font-semibold text-ink">{order.discover}</h3>
                      <div className="ds-scroll-x mt-3 flex gap-4 pb-2">
                        {recommendations.map((candidate) => (
                          <div key={candidate.id} className="w-[15rem] shrink-0 snap-start">
                            <StoryCard story={candidate} language={language} />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-end">
                        <Link to="/stories" className="text-sm font-semibold text-brand-ink hover:underline">{order.allStories}</Link>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {quiz && (
            <section id="quiz" className="mx-auto mt-12 max-w-[46rem] scroll-mt-24 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-ink">{t('اختبر فهمك', language)}</h2>
              <p className="mt-1 text-sm leading-7 text-ink-muted">{t('أجب عن أسئلة قصيرة مستندة إلى مصادر القصة.', language)}</p>
              {!user && <div className="mt-5 rounded-xl bg-surface-soft p-4 text-sm leading-7 text-ink-muted">{t('الاختبار متاح للأعضاء المسجلين.', language)} <Link className="font-semibold underline" to="/login">{t('سجّل الدخول', language)}</Link></div>}
              {user && !attempt && !result && <button onClick={startQuiz} disabled={busy} className={buttonClasses({ size: 'sm', className: 'mt-5' })}>{busy ? t('جارٍ التحضير…', language) : t('ابدأ الاختبار', language)}</button>}
              {attempt && quiz && <form onSubmit={submitQuiz} className="mt-6 space-y-7">
                <h3 className="font-semibold text-ink">{quiz.title}</h3>
                {attempt.timeLimitSeconds && <p className={`text-sm ${remainingSeconds === 0 ? 'font-semibold text-danger' : 'text-gold-ink'}`}>{t('الوقت المتبقي', language)}: {remainingSeconds == null ? '--:--' : `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`}{remainingSeconds === 0 && ` — ${t('انتهى الوقت', language)}`}</p>}
                {attempt.questions.map((question, index) => <fieldset key={question.id} className="space-y-3"><legend className="font-semibold leading-7 text-ink">{index + 1}. {question.text}</legend>{question.options.map((option) => {
                  const multiple = question.type === 'multiple_choice';
                  const current = answers[question.id];
                  const checked = multiple ? Array.isArray(current) && current.includes(String(option.id)) : current === String(option.id);
                  return <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 text-sm hover:bg-surface-soft"><input type={multiple ? 'checkbox' : 'radio'} name={`question-${question.id}`} checked={checked} onChange={() => setAnswers((currentAnswers) => {
                    if (!multiple) return { ...currentAnswers, [question.id]: String(option.id) };
                    const selected = Array.isArray(currentAnswers[question.id]) ? currentAnswers[question.id] as string[] : [];
                    return { ...currentAnswers, [question.id]: selected.includes(String(option.id)) ? selected.filter((id) => id !== String(option.id)) : [...selected, String(option.id)] };
                  })} />{option.text}</label>;
                })}</fieldset>)}
                <button type="submit" disabled={busy || remainingSeconds === 0 || attempt.questions.some((question) => !answers[question.id] || Array.isArray(answers[question.id]) && !(answers[question.id] as string[]).length)} className={buttonClasses({ size: 'sm' })}>{busy ? t('جارٍ الإرسال…', language) : t('إرسال الإجابات', language)}</button>
              </form>}
              {result && <div className="mt-6">
                <p className={`text-lg font-semibold ${result.passed ? 'text-success' : 'text-gold-ink'}`}>
                  {t('نتيجتك', language)}: {result.score}% {result.passed ? `— ${t('أحسنت!', language)}` : `— ${t('واصل التعلّم', language)}`}
                </p>
                <div className="mt-4 space-y-3">
                  {result.feedback.map((item, index) => <div key={item.questionId} className="rounded-xl bg-surface-soft p-4 text-sm leading-7">
                    <p className="font-semibold text-ink">{index + 1}. {item.correct ? t('إجابة صحيحة', language) : item.correctAnswer ? `${t('الإجابة الصحيحة', language)}: ${item.correctAnswer.join('، ')}` : t('إجابة غير صحيحة', language)}</p>
                    {item.explanation && <p className="mt-1 text-ink-muted">{item.explanation}</p>}
                    {item.source && <p className="mt-1 text-xs text-brand-ink">{t('المصدر', language)}: {item.source}</p>}
                  </div>)}
                </div>
                {result.canRetry && <button onClick={() => { setResult(null); setAttempt(null); void startQuiz(); }} disabled={busy} className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-4' })}>{t('إعادة المحاولة', language)}</button>}
              </div>}
            </section>
          )}

          {quizLocked && <div className="mx-auto mt-8 max-w-[46rem] rounded-2xl bg-surface-soft p-5 text-sm text-ink-muted">{t('هذا الاختبار متاح للمشتركين.', language)} <Link to="/membership" className="font-semibold text-brand-ink underline">{t('عرض الاشتراكات', language)}</Link></div>}
        </Container>

        {/* Sticky actions on small screens. */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 py-2 backdrop-blur-sm sm:hidden">
          <div className="flex items-center gap-2">
            {previous && <Link to={`/stories/${slug}/read/${previous.partNumber}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-ink-muted" aria-label={t('الجزء السابق', language)}><ChevronRight size={18} aria-hidden="true" /></Link>}
            {user ? (
              <button type="button" onClick={() => void (isLastPart ? finishStory() : continueToNextPart())} disabled={busy} className={buttonClasses({ size: 'md', block: true })}>
                {busy ? t('جارٍ الحفظ…', language) : isLastPart ? order.finishStory : order.continueTo(nextPartEntry?.partNumber || number + 1)}
              </button>
            ) : (
              <Link to={`/register?next=${encodeURIComponent(`/stories/${slug}/read/${number + 1}`)}`} className={buttonClasses({ size: 'md', block: true })}>{order.createAccount}</Link>
            )}
          </div>
        </div>

        {lightbox && (
          <div
            className="reader-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={lightbox.alt || t('الصورة', language)}
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              className="reader-lightbox__close"
              aria-label={t('إغلاق', language)}
              onClick={() => setLightbox(null)}
            >
              <X size={20} aria-hidden="true" />
            </button>
            <img src={lightbox.url} alt={lightbox.alt} onClick={(event) => event.stopPropagation()} />
            {lightbox.caption && <p className="mt-3 max-w-[46rem] text-center text-sm text-white/80">{lightbox.caption}</p>}
          </div>
        )}
      </main>
    </SiteLayout>
  );
}
export function BooksPage() {
  const { data: books, loading, error } = useRemote<BookSummary[]>('/books?limit=100');
  return (
    <SiteLayout><main><Container className="py-12 sm:py-16">
      <p className="text-sm font-semibold tracking-widest text-brand-ink">متجر الحكايات</p>
      <h1 className="mt-3 text-3xl font-semibold text-brand-ink sm:text-4xl">كتب تختارها العائلة معًا</h1>
      <p className="mt-3 max-w-2xl leading-8 text-ink-muted">إصدارات مطبوعة ورقمية مستوحاة من مكتبتنا القصصية، لتبقى الحكاية قريبة منكم.</p>
      <p className="mt-6 text-sm leading-6 text-brand-ink">اختر أي كتاب ثم تابع إلى صفحة التفاصيل لإتمام الدفع الآمن عند تفعيل إعدادات Stripe.</p>
      <div className="mt-10">{loading && <LoadingState />}{error && <ErrorState message={error} />}{!loading && !error && !books?.length && <EmptyState>لا توجد كتب منشورة حاليًا. ستُضاف الكتب الجديدة إلى المتجر قريبًا.</EmptyState>}{!!books?.length && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{books.map((book) => <BookCard key={book.id} book={book} />)}</div>}</div>
    </Container></main></SiteLayout>
  );
}

type DonationCampaignSummary = {
  id: number;
  slug: string;
  title: string;
  description: string;
  goalAmount: number | string;
  raisedAmount: number | string;
  currency: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

export function DonationsPage() {
  const language = useSiteLanguage();
  const navigate = useLocalizedNavigate();
  const { user } = useStoryAuth();
  const { data: campaigns, loading, error } = useRemote<DonationCampaignSummary[]>('/donation-campaigns?limit=50');
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [recurring, setRecurring] = useState<Record<number, boolean>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function donate(campaign: DonationCampaignSummary) {
    if (!user || user.role !== 'READER') {
      navigate('/login');
      return;
    }
    const amount = Number(amounts[campaign.id] || 5);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCheckoutError(t('أدخل مبلغًا صحيحًا للتبرع.', language));
      return;
    }
    setBusyId(campaign.id);
    setCheckoutError(null);
    try {
      const { checkoutUrl } = await api.post<{ checkoutUrl: string }>(`/donation-campaigns/${campaign.id}/checkout`, {
        amount,
        language,
        recurring: Boolean(recurring[campaign.id])
      });
      window.location.assign(checkoutUrl);
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : t('تعذر بدء التبرع.', language));
      setBusyId(null);
    }
  }

  return <SiteLayout><main><Container className="py-12 sm:py-16">
    <p className="text-sm font-semibold tracking-widest text-brand-ink">{t('مساهمة مجتمعية', language)}</p>
    <h1 className="mt-3 text-3xl font-semibold text-brand-ink sm:text-4xl">{t('دعم نشر الحكايات الموثوقة', language)}</h1>
    <p className="mt-3 max-w-2xl leading-8 text-ink-muted">{t('ساهم في تطوير محتوى موثوق وآمن للعائلة. تتم معالجة التبرعات عبر Stripe.', language)}</p>
    {checkoutError && <div className="mt-5"><ErrorState message={checkoutError} /></div>}
    {error && <div className="mt-5"><ErrorState message={error} /></div>}
    {loading && <LoadingState />}
    {!loading && !error && !campaigns?.length && <EmptyState>{t('لا توجد حملات تبرع نشطة حاليًا.', language)}</EmptyState>}
    <div className="mt-8 grid gap-5 md:grid-cols-2">{campaigns?.map((campaign) => {
      const goal = Number(campaign.goalAmount);
      const raised = Number(campaign.raisedAmount);
      return <article key={campaign.id} className="rounded-3xl border border-line bg-surface p-6">
        <h2 className="text-xl font-semibold text-brand-ink">{campaign.title}</h2>
        <p className="mt-3 leading-7 text-ink-muted">{campaign.description}</p>
        <p className="mt-5 text-sm font-semibold text-brand-ink">{formatPrice(raised, campaign.currency, language)} / {formatPrice(goal, campaign.currency, language)}</p>
        <progress value={Math.min(raised, goal)} max={goal} aria-label={t('تقدم الحملة', language)} className="mt-2 w-full" />
        <div className="mt-5 flex gap-3">
          <label className="min-w-0 flex-1 text-sm font-semibold">{t('مبلغ التبرع', language)}<input type="number" min="0.5" step="0.01" value={amounts[campaign.id] || '5'} onChange={(event) => setAmounts((current) => ({ ...current, [campaign.id]: event.target.value }))} dir="ltr" className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-left" /></label>
          <button onClick={() => void donate(campaign)} disabled={busyId === campaign.id} className="self-end rounded-full bg-brand px-5 py-3 font-semibold text-brand-on disabled:opacity-50">{busyId === campaign.id ? t('جارٍ التحويل…', language) : t('تبرع الآن', language)}</button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={Boolean(recurring[campaign.id])} onChange={(event) => setRecurring((current) => ({ ...current, [campaign.id]: event.target.checked }))} />{t('اجعل التبرع شهريًا متكررًا', language)}</label>
      </article>;
    })}</div>
  </Container></main></SiteLayout>;
}

/** Payload of `GET /donation-campaigns/:slug`. */
type DonationCampaignDetail = {
  id: number;
  slug: string;
  status: string;
  title: string;
  description: string;
  summary?: string;
  coverImage?: string | null;
  bannerImage?: string | null;
  currency: string;
  goalAmount: string | number;
  raisedAmount: string | number;
  targetUnits?: number | null;
  sponsoredUnits?: number | null;
  unitName?: string;
  costPerUnit?: string | number | null;
  totalCost?: string | number | null;
  donorCount?: number | null;
  amountPercent?: number | null;
  canDonate?: boolean;
  allowCustomAmount?: boolean;
  allowRecurring?: boolean;
  allowAnonymous?: boolean;
  minAmount?: string | number | null;
  maxAmount?: string | number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  linked?: {
    story?: { slug: string; title: string } | null;
    book?: { slug: string; title: string } | null;
    collection?: { slug: string; title: string } | null;
  } | null;
  tiers?: Array<{ id: number; amount: string | number; units?: number | null; label: string; isActive?: boolean }>;
  items?: Array<{ id: number; book?: { slug: string; title: string; cover?: string | null } | null; label: string; quantityTarget: number; unitCost?: string | number | null; quantitySponsored: number; quantityDistributed: number }>;
  places?: Array<{ id: number; name: string; type?: string; city?: string | null; country?: string | null; plannedQuantity: number; status: string; distributionDate?: string | null; notes?: string | null; reportText?: string | null; images?: string[]; consentConfirmed?: boolean }>;
  updates?: Array<{ id: number; title: string; body: string; images?: string[]; publishedAt: string }>;
  supporters?: Array<{ name: string; units?: number | null; date?: string | null }>;
};

type PublicEvent = { id: number; slug: string; title: string; rules: string; startsAt: string; endsAt: string; quizId: number | null; winnerDisplayName?: string | null; winnerAnnouncement?: string };
type LeaderboardEntry = { rank: number; displayName: string; score: number };
export function DonationCampaignPage() {
  const { slug = '' } = useParams();
  const language = useSiteLanguage();
  const navigate = useLocalizedNavigate();
  const { user } = useStoryAuth();
  const { data: campaign, loading, error } = useRemote<DonationCampaignDetail>(`/donation-campaigns/${encodeURIComponent(slug)}`);
  const [tierId, setTierId] = useState<number | null>(null);
  const [amount, setAmount] = useState('5');
  const [recurring, setRecurring] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function donate(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    if (!user || user.role !== 'READER') { navigate('/login'); return; }
    setBusy(true);
    setCheckoutError(null);
    try {
      const response = await api.post<{ checkoutUrl: string }>(`/donation-campaigns/${campaign.id}/checkout`, {
        ...(tierId ? { tierId } : { amount: Number(amount) }),
        language,
        recurring,
        isAnonymous: anonymous,
        ...(message.trim() ? { message: message.trim() } : {})
      });
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : 'تعذر بدء التبرع.');
      setBusy(false);
    }
  }

  if (loading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (error || !campaign) return <SiteLayout><Container className="py-16"><ErrorState message={error || 'الحملة غير موجودة.'} /></Container></SiteLayout>;
  const raised = Number(campaign.raisedAmount);
  const goal = Number(campaign.goalAmount);
  const percent = campaign.amountPercent ?? (goal > 0 ? Math.min(100, Math.round((raised / goal) * 1000) / 10) : 0);

  return <SiteLayout><main>
    <div className="relative min-h-[22rem] overflow-hidden bg-brand">
      {campaign.bannerImage || campaign.coverImage ? <img src={campaign.bannerImage || campaign.coverImage || ''} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" /> : null}
      <div className="absolute inset-0 bg-gradient-to-t from-brand via-brand/40 to-transparent" />
      <Container className="relative flex min-h-[22rem] flex-col justify-end py-10 text-brand-on">
        <p className="text-sm font-semibold tracking-widest text-gold-ink">حملة تبرع</p>
        <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight sm:text-5xl">{campaign.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-8 text-brand-on/80 sm:text-base">{campaign.summary || campaign.description}</p>
      </Container>
    </div>
    <Container className="grid gap-8 py-10 lg:grid-cols-[1.35fr_0.8fr]">
      <div className="space-y-8">
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-3xl font-semibold text-brand-ink">{formatPrice(raised, campaign.currency, language)}</p><p className="mt-1 text-sm text-ink-muted">من هدف {formatPrice(goal, campaign.currency, language)} · {percent}%</p></div>
            {campaign.targetUnits ? <p className="text-lg font-semibold text-brand-ink">{campaign.sponsoredUnits || 0} / {campaign.targetUnits} {campaign.unitName || 'كتاب'}</p> : null}
          </div>
          <progress value={Math.min(raised, goal)} max={goal} aria-label="تقدم الحملة" className="mt-4 h-3 w-full overflow-hidden rounded-full" />
          {campaign.targetUnits ? <progress value={Math.min(campaign.sponsoredUnits || 0, campaign.targetUnits)} max={campaign.targetUnits} aria-label="الوحدات الممولة" className="mt-2 h-2 w-full" /> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-brand-soft p-4"><p className="text-xs font-semibold text-brand-ink">متبرعون</p><p className="mt-1 text-xl font-semibold text-brand-ink">{campaign.donorCount || 0}</p></div>
            <div className="rounded-2xl bg-gold-soft p-4"><p className="text-xs font-semibold text-gold-ink">تكلفة الوحدة</p><p className="mt-1 text-xl font-semibold text-gold-ink">{campaign.costPerUnit ? formatPrice(campaign.costPerUnit, campaign.currency, language) : '—'}</p></div>
            <div className="rounded-2xl bg-surface-soft p-4"><p className="text-xs font-semibold text-ink-muted">التكلفة الإجمالية</p><p className="mt-1 text-xl font-semibold text-ink">{campaign.totalCost ? formatPrice(campaign.totalCost, campaign.currency, language) : '—'}</p></div>
          </div>
          <p className="mt-5 whitespace-pre-wrap leading-8 text-ink-muted">{campaign.description}</p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">{campaign.linked?.story && <Link to={`/stories/${campaign.linked.story.slug}`} className="rounded-full bg-brand-soft px-4 py-2 font-semibold text-brand-ink">القصة: {campaign.linked.story.title}</Link>}{campaign.linked?.book && <Link to={`/books/${campaign.linked.book.slug}`} className="rounded-full bg-gold-soft px-4 py-2 font-semibold text-gold-ink">الكتاب: {campaign.linked.book.title}</Link>}</div>
        </section>

        {!!campaign.items?.length && <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8"><h2 className="text-2xl font-semibold text-brand-ink">الموارد التي نوزعها</h2><div className="mt-4 space-y-3">{campaign.items.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-2xl bg-surface-soft p-4 text-sm"><span className="font-semibold">{item.label}</span><span>{item.quantitySponsored} / {item.quantityTarget} · وُزّع {item.quantityDistributed}</span></div>)}</div></section>}

        {!!campaign.places?.length && <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8"><h2 className="text-2xl font-semibold text-brand-ink">مواقع التوزيع</h2><div className="mt-4 space-y-3">{campaign.places.map((place) => <article key={place.id} className="rounded-2xl border border-line p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-brand-ink">{place.name}</h3><span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-ink">{place.status === 'distributed' ? 'وُزّع' : place.status === 'shipped' ? 'شُحن' : 'مخطط'}</span></div><p className="mt-1 text-sm text-ink-muted">{[place.city, place.country].filter(Boolean).join('، ')} · {place.plannedQuantity} نسخة</p>{place.reportText && <p className="mt-2 text-sm leading-7 text-ink-muted">{place.reportText}</p>}</article>)}</div></section>}

        {!!campaign.updates?.length && <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8"><h2 className="text-2xl font-semibold text-brand-ink">مستجدات الحملة</h2><div className="mt-4 space-y-5">{campaign.updates.map((update) => <article key={update.id} className="border-s-2 border-line ps-4"><p className="text-xs text-ink-muted">{new Date(update.publishedAt).toLocaleDateString(language)}</p><h3 className="mt-1 font-semibold text-brand-ink">{update.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-ink-muted">{update.body}</p></article>)}</div></section>}

        {!!campaign.supporters?.length && <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8"><h2 className="text-2xl font-semibold text-brand-ink">شكرًا لداعمينا</h2><div className="mt-4 flex flex-wrap gap-2">{campaign.supporters.map((supporter, index) => <span key={`${supporter.name}-${index}`} className="rounded-full bg-gold-soft px-4 py-2 text-sm font-semibold text-gold-ink">{supporter.name}{supporter.units ? ` · ${supporter.units}` : ''}</span>)}</div></section>}
      </div>

      <form onSubmit={donate} className="h-fit space-y-4 rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-24">
        <h2 className="text-xl font-semibold text-brand-ink">ساهم في الحملة</h2>
        {checkoutError && <ErrorState message={checkoutError} />}
        {campaign.canDonate === false && <p className="rounded-xl bg-gold-soft p-3 text-sm leading-6 text-gold-ink">هذه الحملة لا تقبل تبرعات جديدة حاليًا.</p>}
        {!!campaign.tiers?.length && <div className="space-y-2">{campaign.tiers.map((tier) => <label key={tier.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm ${tierId === tier.id ? 'border-line bg-brand-soft' : 'border-line'}`}><span><input type="radio" name="tier" checked={tierId === tier.id} onChange={() => { setTierId(tier.id); setAmount(String(tier.amount)); }} className="me-2" />{tier.label}</span><strong>{formatPrice(tier.amount, campaign.currency, language)}</strong></label>)}</div>}
        {campaign.allowCustomAmount !== false && <label className="block text-sm font-semibold text-ink">مبلغ مخصص ({campaign.currency})<input type="number" min={Number(campaign.minAmount || 1)} max={campaign.maxAmount ? Number(campaign.maxAmount) : undefined} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setTierId(null); }} className="mt-2 w-full rounded-xl border border-line px-3 py-2.5" /></label>}
        <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} className="mt-1" />تبرع شهري متكرر</label>
        <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} className="mt-1" />إخفاء اسمي من قائمة الداعمين</label>
        <label className="block text-sm font-semibold text-ink">رسالة اختيارية<textarea rows={3} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 w-full rounded-xl border border-line px-3 py-2.5" /></label>
        <button disabled={busy || campaign.canDonate === false} className="w-full rounded-full bg-brand px-5 py-3.5 font-semibold text-brand-on disabled:opacity-50">{busy ? 'جارٍ التحويل…' : 'تبرع عبر Stripe'}</button>
        <p className="text-center text-xs leading-6 text-ink-muted"><ShieldCheck size={13} className="inline" /> المبلغ يُحسب على الخادم؛ لا يمكن تعديل السعر من المتصفح.</p>
      </form>
    </Container>
  </main></SiteLayout>;
}

export function EventsPage() {
  const language = useSiteLanguage();
  const { user } = useStoryAuth();
  const { data: events, loading, error } = useRemote<PublicEvent[]>('/events?limit=50');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function join(event: PublicEvent) {
    if (!user || user.role !== 'READER') {
      window.location.assign(`/${language}/login`);
      return;
    }
    setBusyId(event.id);
    setMessage(null);
    try {
      const result = await api.post<{ score: number }>(`/events/${event.id}/entries`, {});
      setMessage(`${t('تم تسجيل مشاركتك بنجاح.', language)} ${result.score}`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t('تعذر تسجيل المشاركة.', language));
    } finally {
      setBusyId(null);
    }
  }

  async function showLeaderboard(event: PublicEvent) {
    setSelectedId(event.id);
    try {
      setLeaderboard(await api.get<LeaderboardEntry[]>(`/events/${event.id}/leaderboard`));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t('تعذر تحميل الترتيب.', language));
    }
  }

  return <SiteLayout><main><Container className="py-12 sm:py-16">
    <p className="text-sm font-semibold tracking-widest text-brand-ink">{t('المجتمع', language)}</p>
    <h1 className="mt-3 text-3xl font-semibold text-brand-ink sm:text-4xl">{t('المسابقات والفعاليات', language)}</h1>
    {message && <p role="status" className="mt-5 rounded-xl bg-brand-soft p-4 text-brand-ink">{message}</p>}
    {loading && <LoadingState />}
    {error && <ErrorState message={error} />}
    {!loading && !error && !events?.length && <EmptyState>{t('لا توجد فعاليات منشورة حاليًا.', language)}</EmptyState>}
    <div className="mt-8 grid gap-5 md:grid-cols-2">{events?.map((event) => <article key={event.id} className="rounded-3xl border border-line bg-surface p-6">
      <h2 className="text-xl font-semibold text-brand-ink">{event.title}</h2>
      <p className="mt-2 whitespace-pre-wrap leading-7 text-ink-muted">{event.rules}</p>
      {(event.winnerDisplayName || event.winnerAnnouncement) && <div className="mt-4 rounded-2xl bg-gold-soft p-4 text-gold-ink"><h3 className="font-semibold">{t('إعلان الفائز', language)}{event.winnerDisplayName ? ` · ${event.winnerDisplayName}` : ''}</h3>{event.winnerAnnouncement && <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{event.winnerAnnouncement}</p>}</div>}
      <p className="mt-4 text-xs text-ink-muted">{new Date(event.startsAt).toLocaleString(language)} – {new Date(event.endsAt).toLocaleString(language)}</p>
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void join(event)} disabled={busyId === event.id} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-50">{busyId === event.id ? t('جارٍ التسجيل…', language) : t('شارك', language)}</button><button onClick={() => void showLeaderboard(event)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-ink">{t('لوحة المتصدرين', language)}</button></div>
      {selectedId === event.id && <ol className="mt-4 space-y-2 border-t pt-4">{leaderboard.length ? leaderboard.map((item) => <li key={`${event.id}-${item.rank}`} className="flex justify-between text-sm"><span>{item.rank}. {item.displayName}</span><strong>{item.score}</strong></li>) : <li className="text-sm text-ink-muted">{t('لا توجد مشاركات حتى الآن.', language)}</li>}</ol>}
    </article>)}</div>
  </Container></main></SiteLayout>;
}

type CartItem = {
  id: number;
  bookId: number;
  slug: string;
  title: string;
  cover: string | null;
  format: 'ebook' | 'print';
  quantity: number;
  unitPrice: number;
  currency: string;
  stockQuantity: number | null;
  language: string | null;
  languages: string[];
  alreadyOwned: boolean;
  ownedLanguages: string[];
  available: boolean;
  lineTotalMinor: number;
};

type CartPayload = {
  items: CartItem[];
  itemCount: number;
  hasPhysical: boolean;
  currency: string;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  subtotal: string;
  shipping: string;
  total: string;
};

type GuestCartLine = { bookId: number; quantity: number; language?: string };
const GUEST_CART_KEY = 'islamic-stories-guest-cart';

function readGuestCart(): GuestCartLine[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((line) => Number.isSafeInteger(line?.bookId) && line.bookId > 0).map((line) => ({
      bookId: Number(line.bookId),
      quantity: Math.max(1, Math.min(20, Number(line.quantity) || 1)),
      ...(typeof line.language === 'string' ? { language: line.language } : {})
    })) : [];
  } catch {
    return [];
  }
}

function writeGuestCart(lines: GuestCartLine[]) {
  window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines.slice(0, 50)));
  window.dispatchEvent(new Event('cart:changed'));
}

const emptyCart: CartPayload = {
  items: [], itemCount: 0, hasPhysical: false, currency: 'EUR',
  subtotalMinor: 0, shippingMinor: 0, totalMinor: 0,
  subtotal: '0.00', shipping: '0.00', total: '0.00'
};

export function CartPage() {
  const language = useSiteLanguage();
  const navigate = useLocalizedNavigate();
  const { user, isLoading } = useStoryAuth();
  const [cart, setCart] = useState<CartPayload>(emptyCart);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyBook, setBusyBook] = useState<number | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [digitalConsent, setDigitalConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [shippingAddress, setShippingAddress] = useState({ name: '', line1: '', city: '', postalCode: '', country: '', phone: '' });
  const [savedAddressSource, setSavedAddressSource] = useState<'profile' | 'order' | null>(null);

  // The profile address fills the empty fields; without one, the address of the
  // latest physical order is used. Anything the reader types always wins.
  useEffect(() => {
    if (!user || user.role !== 'READER') return;
    let active = true;
    api.get<{ address: Record<string, unknown> | null; source?: 'profile' | 'order' | null }>('/me/shipping-address')
      .then(({ address, source }) => {
        if (!active || !address) return;
        const pick = (...keys: string[]) => {
          for (const key of keys) {
            const value = address[key];
            if (typeof value === 'string' && value.trim()) return value.trim();
          }
          return '';
        };
        const saved = {
          name: pick('name', 'fullName', 'recipient'),
          line1: pick('line1', 'address', 'line_1', 'addressLine1'),
          city: pick('city', 'town'),
          postalCode: pick('postalCode', 'postal_code', 'zip'),
          country: pick('country', 'countryCode', 'country_code').toUpperCase(),
          phone: pick('phone', 'phoneNumber', 'phone_number')
        };
        if (!Object.values(saved).some(Boolean)) return;
        setShippingAddress((current) => ({
          name: current.name || saved.name,
          line1: current.line1 || saved.line1,
          city: current.city || saved.city,
          postalCode: current.postalCode || saved.postalCode,
          country: current.country || saved.country,
          phone: current.phone || saved.phone
        }));
        setSavedAddressSource(source === 'order' ? 'order' : 'profile');
      })
      .catch(() => { /* no saved address: the reader types it below */ });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'READER') { setLoading(false); return; }
    let active = true;
    setLoading(true);
    api.get<CartPayload>('/cart')
      .then((value) => { if (active) setCart(value); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل السلة.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'READER') return;
    const guestLines = readGuestCart();
    if (!guestLines.length) return;
    let active = true;
    api.post<CartPayload>('/cart/merge', { items: guestLines })
      .then((value) => {
        if (!active) return;
        window.localStorage.removeItem(GUEST_CART_KEY);
        setCart(value);
        setLoading(false);
        window.dispatchEvent(new Event('cart:changed'));
      })
      .catch(() => { /* The server cart still loads; guest lines stay for a retry. */ });
    return () => { active = false; };
  }, [user]);

  async function updateQuantity(item: CartItem, quantity: number) {
    if (quantity < 1) return;
    setBusyBook(item.bookId);
    setError(null);
    try {
      setCart(await api.patch<CartPayload>(`/cart/items/${item.bookId}`, { quantity }));
      window.dispatchEvent(new Event('cart:changed'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الكمية.');
    } finally {
      setBusyBook(null);
    }
  }

  async function updateLanguage(item: CartItem, languageChoice: string) {
    setBusyBook(item.bookId);
    setError(null);
    try {
      setCart(await api.patch<CartPayload>(`/cart/items/${item.bookId}`, { language: languageChoice }));
      window.dispatchEvent(new Event('cart:changed'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث لغة الكتاب.', language));
    } finally {
      setBusyBook(null);
    }
  }

  async function removeItem(item: CartItem) {
    setBusyBook(item.bookId);
    setError(null);
    try {
      setCart(await api.delete<CartPayload>(`/cart/items/${item.bookId}`));
      window.dispatchEvent(new Event('cart:changed'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حذف الكتاب.');
    } finally {
      setBusyBook(null);
    }
  }

  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (!cart.items.length) return;
    const hasEbook = cart.items.some((item) => item.format === 'ebook');
    setConsentError(null);
    if (hasEbook && !digitalConsent) {
      setConsentError('يجب الموافقة على شروط التنزيل الرقمي قبل المتابعة.');
      return;
    }
    if (cart.hasPhysical && (!shippingAddress.name || !shippingAddress.line1 || !shippingAddress.city || !shippingAddress.postalCode || !shippingAddress.country || !shippingAddress.phone)) {
      setError('أكمل عنوان التوصيل للكتب المطبوعة.');
      return;
    }
    setCheckingOut(true);
    setError(null);
    try {
      const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const response = await api.post<{ checkoutUrl: string; orderId: number }>('/payments/books/checkout', {
        items: cart.items.map((item) => ({
          bookId: item.bookId,
          quantity: item.quantity,
          ...(item.format === 'ebook' && item.language ? { language: item.language } : {})
        })),
        language,
        digitalConsent: hasEbook ? digitalConsent : false,
        ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
        ...(cart.hasPhysical ? { shippingAddress } : {})
      }, { headers: { 'Idempotency-Key': key } });
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر بدء الدفع.');
      setCheckingOut(false);
    }
  }

  if (isLoading || loading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (!user) {
    const guestCount = readGuestCart().reduce((sum, line) => sum + line.quantity, 0);
    return <SiteLayout><Container className="max-w-2xl py-16"><div className="rounded-3xl border border-line bg-surface p-8 text-center"><ShoppingBag className="mx-auto text-brand-ink" size={36} /><h1 className="mt-4 text-2xl font-semibold text-brand-ink">سلة المشتريات</h1><p className="mt-2 text-ink-muted">{guestCount ? `لديك ${guestCount} كتاب في السلة المؤقتة. سجّل الدخول لدمجها وإتمام الشراء.` : 'سجّل الدخول لعرض سلتك وإتمام الشراء بأمان.'}</p><button onClick={() => navigate('/login')} className="mt-6 rounded-full bg-brand px-6 py-3 font-semibold text-brand-on">تسجيل الدخول</button></div></Container></SiteLayout>;
  }

  return <SiteLayout><main><Container className="max-w-6xl py-12 sm:py-16">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-brand-ink">متجر الحكايات</p><h1 className="mt-2 text-3xl font-semibold text-brand-ink">سلة المشتريات</h1></div><Link to="/books" className="font-semibold text-brand-ink underline">متابعة التسوق</Link></div>
    {error && <div className="mt-5"><ErrorState message={error} /></div>}
    {!cart.items.length ? <div className="mt-8 rounded-3xl border border-line bg-surface p-10 text-center"><ShoppingBag className="mx-auto text-brand-ink" size={38} /><h2 className="mt-4 text-xl font-semibold text-brand-ink">سلتك فارغة</h2><p className="mt-2 text-ink-muted">أضف كتابًا إلكترونيًا أو نسخة مطبوعة للبدء.</p><Link to="/books" className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-brand-on">تصفح الكتب</Link></div> :
    <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
      <section className="space-y-4">{cart.items.map((item) => <article key={item.bookId} className="flex gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-soft">{item.cover ? <img src={item.cover} alt="" className="h-full w-full object-cover" /> : <BookOpen className="m-5 text-brand-ink" size={28} />}</div>
        <div className="min-w-0 flex-1"><h2 className="font-semibold text-brand-ink">{item.title}</h2><p className="mt-1 text-sm text-ink-muted">{item.format === 'ebook' ? 'كتاب إلكتروني · تنزيل فوري' : 'نسخة مطبوعة'}</p><p className="mt-2 font-semibold text-brand-ink">{formatPrice(item.unitPrice, item.currency, language)}</p>
          {!item.available && <p className="mt-1 text-xs font-semibold text-danger">الكمية المطلوبة غير متوفرة حاليًا.</p>}
          {item.format === 'ebook' && item.languages.length > 1 && <label className="mt-2 block text-xs font-semibold text-ink">{t('لغة ملف الكتاب:', language)}
            <select value={item.language || item.languages[0]} onChange={(event) => void updateLanguage(item, event.target.value)} disabled={busyBook === item.bookId} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm font-normal disabled:opacity-50">{item.languages.map((code) => <option key={code} value={code}>{bookLanguageLabel(code)}</option>)}</select>
          </label>}
          {item.format === 'ebook' && item.languages.length === 1 && <p className="mt-1 text-xs font-semibold text-brand-ink">{t('نسخة PDF:', language)} {bookLanguageLabel(item.language)}</p>}
          {item.alreadyOwned && <p className="mt-1 text-xs font-semibold text-brand-ink">{t('لديك نسخة سابقة من هذا الكتاب — يمكنك شراؤه مرة أخرى والحصول على تنزيل جديد.', language)}{item.ownedLanguages.length ? ` (${item.ownedLanguages.map((code) => bookLanguageLabel(code)).join(' · ')})` : ''}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {item.format === 'print' ? <div className="inline-flex items-center rounded-full border border-line"><button type="button" onClick={() => void updateQuantity(item, item.quantity - 1)} disabled={busyBook === item.bookId || item.quantity <= 1} className="px-3 py-1.5 disabled:opacity-40">−</button><span className="min-w-8 text-center text-sm font-semibold">{item.quantity}</span><button type="button" onClick={() => void updateQuantity(item, item.quantity + 1)} disabled={busyBook === item.bookId || (item.stockQuantity !== null && item.quantity >= item.stockQuantity)} className="px-3 py-1.5 disabled:opacity-40">+</button></div> : <span className="rounded-full bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink-muted">الكمية: 1</span>}
            <button type="button" onClick={() => void removeItem(item)} disabled={busyBook === item.bookId} className="text-sm font-semibold text-danger underline disabled:opacity-40">حذف</button>
          </div>
        </div>
      </article>)}</section>
      <form onSubmit={checkout} className="h-fit space-y-4 rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-24">
        <h2 className="text-xl font-semibold text-brand-ink">ملخص الطلب</h2>
        <div className="space-y-2 border-b border-line pb-4 text-sm"><div className="flex justify-between"><span>المجموع الفرعي</span><span>{formatPrice(cart.subtotal, cart.currency, language)}</span></div>{cart.hasPhysical && <div className="flex justify-between"><span>الشحن</span><span>{formatPrice(cart.shipping, cart.currency, language)}</span></div>}{promoCode.trim() && <p className="text-xs text-brand-ink">يُطبّق رمز الخصم عند إنشاء الطلب ويُتحقق منه على الخادم.</p>}<div className="flex justify-between text-lg font-semibold text-brand-ink"><span>الإجمالي</span><span>{formatPrice(cart.total, cart.currency, language)}</span></div></div>
        <label className="block text-sm font-semibold text-ink">رمز الخصم (اختياري)<input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} maxLength={64} dir="ltr" className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 text-left" /></label>
        {cart.hasPhysical && <fieldset className="space-y-3"><legend className="text-sm font-semibold text-brand-ink">عنوان التوصيل</legend>
          {savedAddressSource && <p className="rounded-xl bg-brand-soft px-3 py-2 text-[11px] font-semibold leading-5 text-brand-ink">
            {t(savedAddressSource === 'profile'
              ? 'عنوانك المحفوظ مستخدم في السلة — يمكنك تعديله قبل الدفع.'
              : 'استخدمنا العنوان المحفوظ من طلبك السابق — يمكنك تعديله قبل الدفع.', language)}
          </p>}
          <input required placeholder="الاسم الكامل" value={shippingAddress.name} onChange={(event) => setShippingAddress({ ...shippingAddress, name: event.target.value })} className="w-full rounded-xl border border-line px-3 py-2.5" /><input required placeholder="العنوان" value={shippingAddress.line1} onChange={(event) => setShippingAddress({ ...shippingAddress, line1: event.target.value })} className="w-full rounded-xl border border-line px-3 py-2.5" /><div className="grid grid-cols-2 gap-3"><input required placeholder="المدينة" value={shippingAddress.city} onChange={(event) => setShippingAddress({ ...shippingAddress, city: event.target.value })} className="rounded-xl border border-line px-3 py-2.5" /><input required placeholder="الرمز البريدي" value={shippingAddress.postalCode} onChange={(event) => setShippingAddress({ ...shippingAddress, postalCode: event.target.value })} className="rounded-xl border border-line px-3 py-2.5" /><input required placeholder="رمز الدولة (FR)" minLength={2} maxLength={2} value={shippingAddress.country} onChange={(event) => setShippingAddress({ ...shippingAddress, country: event.target.value.toUpperCase() })} className="rounded-xl border border-line px-3 py-2.5 uppercase" /><input required placeholder="الهاتف" value={shippingAddress.phone} onChange={(event) => setShippingAddress({ ...shippingAddress, phone: event.target.value })} className="rounded-xl border border-line px-3 py-2.5" /></div></fieldset>}
        {cart.items.some((item) => item.format === 'ebook') && <div><label className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-6 text-brand-ink ${consentError ? 'border-danger bg-danger-soft' : 'border-transparent bg-brand-soft'}`}><input type="checkbox" checked={digitalConsent} onChange={(event) => { setDigitalConsent(event.target.checked); if (event.target.checked) setConsentError(null); }} className="mt-1" />أوافق على البدء الفوري في تنزيل الكتب الإلكترونية، وأعلم أن حق التراجع عن المحتوى الرقمي يسقط بعد بدء التنزيل.</label>{consentError && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{consentError}</p>}</div>}
        <button type="submit" disabled={checkingOut || !cart.items.length} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3.5 font-semibold text-brand-on disabled:opacity-50"><CreditCard size={17} /> {checkingOut ? 'جارٍ تحويلك للدفع…' : 'إتمام الدفع الآمن'}</button>
        <p className="text-center text-xs leading-6 text-ink-muted"><ShieldCheck size={13} className="inline" /> دفع آمن عبر Stripe. لا نحتفظ ببيانات البطاقة.</p>
      </form>
    </div>}
  </Container></main></SiteLayout>;
}

export function BookDetailPage() {
  const { slug = '' } = useParams();
  const language = useSiteLanguage();
  const navigate = useLocalizedNavigate();
  const { user } = useStoryAuth();
  const { data: book, loading, error } = useRemote<BookSummary>(`/books/${encodeURIComponent(slug)}`);
  const [quantity, setQuantity] = useState(1);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [canDownload, setCanDownload] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // PDF version the reader is buying: the site language when it exists, else the first available.
  const [languageChoice, setLanguageChoice] = useState<string>('');
  const [entitlementLanguage, setEntitlementLanguage] = useState<string | null>(null);
  const bookLanguages = book?.format === 'ebook' ? (book.languages || []) : [];
  const bookLanguagesKey = bookLanguages.join(',');

  useEffect(() => {
    if (!bookLanguagesKey) { setLanguageChoice(''); return; }
    const available = bookLanguagesKey.split(',');
    setLanguageChoice((current) => (current && available.includes(current)
      ? current
      : (available.includes(language) ? language : available[0])));
  }, [bookLanguagesKey, language]);

  useEffect(() => {
    if (!book || book.format !== 'ebook' || !user) {
      setCanDownload(false);
      setCheckingAccess(false);
      return;
    }
    let active = true;
    setCanDownload(false);
    setCheckingAccess(true);
    setDownloadError(null);
    api.get<{ canDownload: boolean; downloaded?: boolean; language?: string | null }>(`/books/${encodeURIComponent(book.slug)}/access`)
      .then(({ canDownload: access, downloaded: alreadyDownloaded, language: ownedLanguage }) => {
        if (!active) return;
        setCanDownload(access);
        setDownloaded(!access && Boolean(alreadyDownloaded));
        setEntitlementLanguage(ownedLanguage || null);
      })
      .catch((caught: unknown) => {
        if (active) setDownloadError(caught instanceof Error ? caught.message : 'تعذر التحقق من صلاحية التنزيل.');
      })
      .finally(() => { if (active) setCheckingAccess(false); });
    return () => { active = false; };
  }, [book, user]);

  async function downloadEbook() {
    if (!book) return;
    setDownloadBusy(true);
    setDownloadError(null);
    try {
      const result = await api.get<{ url: string; requiresAuth?: boolean }>(`/books/${encodeURIComponent(book.slug)}/download`);
      if (result.requiresAuth) {
        const file = await api.getBlob(result.url);
        const objectUrl = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `${book.slug}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        window.location.assign(result.url);
      }
      // The purchase is spent: the button disappears everywhere right away.
      setCanDownload(false);
      setDownloaded(true);
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'تعذر تنزيل الكتاب الإلكتروني.');
    } finally {
      setDownloadBusy(false);
    }
  }

  async function addToCart() {
    if (!book) return;
    if (!user) {
      const lines = readGuestCart();
      const existing = lines.find((line) => line.bookId === book.id);
      if (existing && book.format === 'ebook') {
        if (existing.language !== (languageChoice || undefined)) {
          existing.language = languageChoice;
          writeGuestCart(lines);
          setCheckoutError(null);
          setCartNotice(t('حُدّثت لغة الكتاب في سلتك.', language));
          return;
        }
        setCheckoutError('هذا الكتاب موجود بالفعل في سلتك.');
        return;
      }
      if (existing) existing.quantity = Math.min(20, existing.quantity + quantity);
      else lines.push({
        bookId: book.id,
        quantity: book.format === 'ebook' ? 1 : quantity,
        ...(book.format === 'ebook' && languageChoice ? { language: languageChoice } : {})
      });
      writeGuestCart(lines);
      setCheckoutError(null);
      setCartNotice('أُضيف الكتاب إلى سلتك. ستُدمج السلة بعد تسجيل الدخول.');
      return;
    }
    if (user.role !== 'READER') { navigate('/login'); return; }
    setCartBusy(true);
    setCheckoutError(null);
    setCartNotice(null);
    try {
      await api.post('/cart/items', {
        bookId: book.id,
        quantity: book.format === 'print' ? quantity : 1,
        ...(book.format === 'ebook' && languageChoice ? { language: languageChoice } : {})
      });
      setCartNotice(t('تمت إضافة الكتاب إلى السلة.', language));
      window.dispatchEvent(new Event('cart:changed'));
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'ALREADY_IN_CART') {
        setCheckoutError('هذا الكتاب موجود بالفعل في سلتك.');
      } else {
        setCheckoutError(caught instanceof Error ? caught.message : 'تعذر إضافة الكتاب إلى السلة.');
      }
    } finally {
      setCartBusy(false);
    }
  }

  return <SiteLayout><main><Container className="py-10 sm:py-16">
    {loading && <LoadingState />}{error && <ErrorState message={error} />}
    {book && <div className="grid gap-9 md:grid-cols-[0.8fr_1.2fr]">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface-soft">
        {book.cover ? <img src={book.cover} alt="" className="aspect-[0.9] h-full w-full object-cover" /> : <div className="grid aspect-[0.9] place-items-center bg-gradient-to-br from-gold-soft via-surface-soft to-brand"><BookOpen size={54} strokeWidth={1.2} className="text-brand-ink/70" /></div>}
      </div>
      <div className="self-center">
        <p className="text-sm font-semibold text-brand-ink">من متجر الحكايات</p>
        <h1 className="mt-3 text-3xl font-semibold leading-relaxed text-brand-ink">{book.title}</h1>
        <p className="mt-5 leading-8 text-ink-muted">{book.description || 'كتاب يجمع بين متعة الحكاية وقيمها.'}</p>
        <p className="mt-5 text-xl font-semibold text-brand-ink">{formatPrice(book.price, book.currency, language)}</p>
        {book.format === 'ebook' && <p className="mt-2 text-sm leading-6 text-ink-muted">{t('يُشترى هذا الكتاب الإلكتروني بشكل منفصل، ولا يشمله الاشتراك.', language)}</p>}
        {book.format === 'ebook' && bookLanguages.length === 1 && <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-brand-ink">{t('نسخة PDF:', language)} {bookLanguageLabel(bookLanguages[0])}</p>
        </div>}
        {book.format === 'ebook' && bookLanguages.length > 1 && <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <label className="block text-sm font-semibold text-brand-ink">{t('اختر لغة الكتاب الإلكتروني (PDF)', language)}
            <select value={languageChoice || bookLanguages[0]} onChange={(event) => setLanguageChoice(event.target.value)} className="mt-2 w-full rounded-xl border border-line px-3 py-2.5">{bookLanguages.map((code) => <option key={code} value={code}>{bookLanguageLabel(code)}</option>)}</select>
          </label>
          <p className="mt-2 text-xs leading-6 text-ink-muted">{t('يتوفر هذا الكتاب بالنسخ التالية فقط. تُنزّل النسخة التي تختارها.', language)}</p>
        </div>}
        {book.format === 'print' && book.stockQuantity !== null && book.stockQuantity !== undefined && <p className="mt-2 text-sm text-ink-muted">المتوفر: {book.stockQuantity}</p>}
        {!user && <p className="mt-5 text-sm text-ink-muted">أكمل الطلب بعد <Link to="/login" className="font-semibold text-brand-ink underline">تسجيل الدخول</Link>.</p>}
        {checkoutError && <div className="mt-5"><ErrorState message={checkoutError} /></div>}
        {cartNotice && <p role="status" className="mt-5 rounded-xl bg-brand-soft p-3 text-sm font-semibold text-brand-ink">{cartNotice} <Link to="/cart" className="underline">عرض السلة</Link></p>}
        {downloadError && <div className="mt-5"><ErrorState message={downloadError} /></div>}
        {book.format === 'ebook' && canDownload ? <div className="mt-6 space-y-2">
          <button type="button" onClick={downloadEbook} disabled={downloadBusy || checkingAccess} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-semibold text-brand-on disabled:opacity-50"><BookOpen size={17} /> {t(downloadBusy ? 'جارٍ تجهيز التنزيل…' : 'تنزيل الكتاب الإلكتروني', language)}</button>
          {entitlementLanguage && <p className="text-center text-xs font-semibold text-ink-muted">{t('نسخة PDF:', language)} {bookLanguageLabel(entitlementLanguage)}</p>}
        </div> :
        <>
        {book.format === 'ebook' && downloaded && <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <p className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-brand-ink"><Check size={16} aria-hidden="true" /> {t('لقد نزّلت هذا الكتاب بالفعل. لا يُسمح بتنزيله مرة أخرى.', language)}</p>
          <p className="mt-2 text-center text-xs leading-6 text-ink-muted">{t('يمكنك شراء الكتاب مرة أخرى لتحصل على تنزيل جديد، باللغة التي تختارها.', language)}</p>
        </div>}
        <div className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5">
          {book.format === 'print' && book.stockQuantity !== null && book.stockQuantity !== undefined && book.stockQuantity > 0 && <label className="block text-sm font-semibold text-ink">الكمية<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-line px-3 py-2.5">{Array.from({ length: Math.min(book.stockQuantity, 10) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}</select></label>}
          <button type="button" onClick={() => void addToCart()} disabled={cartBusy || (book.format === 'print' && book.stockQuantity === 0)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-semibold text-brand-on transition hover:bg-brand disabled:cursor-not-allowed disabled:border disabled:border-line disabled:bg-surface-soft disabled:text-ink-muted">
            <ShoppingBag size={17} /> {cartBusy ? 'جارٍ الإضافة…' : book.format === 'print' && book.stockQuantity === 0 ? 'غير متوفر حاليًا' : downloaded ? t('اشترِ مرة أخرى', language) : 'أضف إلى السلة'}
          </button>
          <p className="text-center text-xs leading-6 text-ink-muted">الشحن والعنوان (المحفوظ من حسابك) والدفع الآمن عبر Stripe تُكمَل في السلة.</p>
        </div>
        </>
        }
        <Link to="/books" className="mt-6 inline-flex items-center gap-2 font-semibold text-brand-ink"><ArrowLeft size={17} /> العودة إلى المتجر</Link>
      </div>
    </div>}
  </Container></main></SiteLayout>;
}

type ReaderAuthMode = 'login' | 'register';

export function ReaderAuthPage({ mode }: { mode: ReaderAuthMode }) {
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const language = useSiteLanguage();
  const [searchParams] = useSearchParams();
  const {
    user, isLoading, login, requestPasswordResetCode, verifyPasswordResetCode, resetPassword,
    requestReaderRegistrationCode, verifyReaderRegistrationCode, registerReader
  } = useStoryAuth();
  const [stage, setStage] = useState<'email' | 'code' | 'details'>(mode === 'register' ? 'email' : 'details');
  const [recoveryStage, setRecoveryStage] = useState<'email' | 'code' | 'password' | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Guests sent here by "Buy now" come back to the box afterwards.
  const nextPath = (() => {
    const value = searchParams.get('next');
    return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
  })();

  useEffect(() => {
    const stateMessage = (location.state as { message?: unknown } | null)?.message;
    if (typeof stateMessage === 'string') setMessage(stateMessage);
  }, [location.state]);

  useEffect(() => {
    if (mode === 'login' && searchParams.get('reset') === '1') {
      setEmail(searchParams.get('email') || '');
      setRecoveryStage('email');
    }
  }, [mode, searchParams]);

  if (isLoading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (user) return <Navigate to={nextPath || '/account'} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        if (recoveryStage === 'email') {
          setMessage(await requestPasswordResetCode(email, language, 'reader'));
          setRecoveryStage('code');
        } else if (recoveryStage === 'code') {
          setResetToken(await verifyPasswordResetCode(email, code, 'reader'));
          setRecoveryStage('password');
          setCode('');
        } else if (recoveryStage === 'password') {
          if (password !== confirmPassword) throw new Error('Les mots de passe ne correspondent pas.');
          setMessage(await resetPassword(email, password, resetToken, 'reader'));
          setRecoveryStage(null);
          setPassword('');
          setConfirmPassword('');
          setCode('');
        } else {
          await login(email, password);
          navigate(nextPath || '/account', { replace: true });
        }
      } else if (stage === 'email') {
        await requestReaderRegistrationCode(email, language);
        setStage('code');
        setMessage('أرسلنا رمز التحقق إلى بريدك الإلكتروني.');
      } else if (stage === 'code') {
        const token = await verifyReaderRegistrationCode(email, code);
        setVerificationToken(token);
        setStage('details');
        setMessage('تم التحقق من البريد. أكمل بيانات حسابك.');
      } else {
        if (password !== confirmPassword) throw new Error('Les mots de passe ne correspondent pas.');
        await registerReader({ firstName, lastName, email, password, language }, verificationToken);
        setMessage('تم إنشاء حسابك بنجاح. يمكنك تسجيل الدخول الآن.');
        navigate(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`, { replace: true, state: { message: 'تم إنشاء حسابك بنجاح. سجّل الدخول للمتابعة.' } });
      }
    } catch (caught) {
      setError(localizeAuthError(caught, language));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout><main className="grid min-h-[calc(100vh-180px)] place-items-center px-5 py-12">
      <div className="w-full max-w-lg rounded-[2rem] border border-line bg-surface p-7 shadow-lift sm:p-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-ink"><ArrowLeft size={16} /> الرئيسية</Link>
        <span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand-ink">{mode === 'login' ? <LogIn size={23} /> : <Bookmark size={23} />}</span>
        <h1 className="mt-5 text-2xl font-semibold text-brand-ink">{recoveryStage ? 'إعادة تعيين كلمة المرور' : mode === 'login' ? 'مرحبًا بعودتك' : 'انضم إلى مجتمع الحكايات'}</h1>
        <p className="mt-2 leading-7 text-ink-muted">{recoveryStage === 'email' ? 'أدخل بريدك الإلكتروني لنرسل إليك رمز إعادة التعيين.' : recoveryStage === 'code' ? 'أدخل الرمز الذي أرسلناه إلى بريدك الإلكتروني.' : recoveryStage === 'password' ? 'اختر كلمة مرور جديدة لحسابك.' : mode === 'login' ? 'سجّل الدخول لمتابعة قراءتك واشتراكك.' : 'أنشئ حساب قارئ مجانًا واحفظ تقدّمك في القراءة.'}</p>
        {message && <p className="mt-5 rounded-xl bg-brand-soft p-3 text-sm leading-6 text-brand-ink" role="status">{message}</p>}
        {error && <div className="mt-5"><ErrorState message={error} /></div>}
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === 'register' && stage === 'details' && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-ink">الاسم الأول<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>
              <label className="space-y-2 text-sm font-semibold text-ink">اسم العائلة<input required value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>
            </div>
          </>}
          {(mode === 'login' && (recoveryStage === 'email' || !recoveryStage) || mode === 'register' && stage === 'email') && <label className="block space-y-2 text-sm font-semibold text-ink">البريد الإلكتروني<input type="email" required value={email} readOnly={mode === 'login' && recoveryStage !== 'email' && Boolean(searchParams.get('email'))} onChange={(event) => setEmail(event.target.value)} autoComplete="email" dir="ltr" className="w-full rounded-xl border border-line px-4 py-3 text-left outline-none focus:border-line" /></label>}
          {recoveryStage === 'code' && <label className="block space-y-2 text-sm font-semibold text-ink">رمز إعادة التعيين<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} dir="ltr" className="w-full rounded-xl border border-line px-4 py-3 text-center tracking-[0.5em] outline-none focus:border-line" /></label>}
          {mode === 'register' && stage === 'code' && <><p className="text-sm text-ink-muted">رمز التحقق أُرسل إلى <span dir="ltr" className="font-semibold">{email}</span></p><label className="block space-y-2 text-sm font-semibold text-ink">رمز التحقق<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} dir="ltr" className="w-full rounded-xl border border-line px-4 py-3 text-center tracking-[0.5em] outline-none focus:border-line" /></label></>}
          {(mode === 'login' && (!recoveryStage || recoveryStage === 'password') || mode === 'register' && stage === 'details') && <>
            {mode === 'register' && <label className="block space-y-2 text-sm font-semibold text-ink">البريد الإلكتروني<input type="email" required value={email} readOnly dir="ltr" className="w-full rounded-xl border border-line bg-surface-soft px-4 py-3 text-left text-ink-muted" /></label>}
            <label className="block space-y-2 text-sm font-semibold text-ink">{recoveryStage === 'password' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}<input type="password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' && !recoveryStage ? 'current-password' : 'new-password'} className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>
            {(mode === 'register' && stage === 'details' || mode === 'login' && recoveryStage === 'password') && <label className="block space-y-2 text-sm font-semibold text-ink">{recoveryStage === 'password' ? 'تأكيد كلمة المرور الجديدة' : 'تأكيد كلمة المرور'}<input type="password" required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>}
          </>}
          <button type="submit" disabled={busy} className="w-full rounded-full bg-brand px-5 py-3.5 font-semibold text-brand-on transition hover:bg-brand disabled:cursor-wait disabled:opacity-60">
            {busy ? 'جارٍ الإرسال…' : recoveryStage === 'email' ? 'إرسال رمز إعادة التعيين' : recoveryStage === 'code' ? 'التحقق من الرمز' : recoveryStage === 'password' ? 'حفظ كلمة المرور الجديدة' : mode === 'login' ? 'تسجيل الدخول' : stage === 'email' ? 'إرسال رمز التحقق' : stage === 'code' ? 'تأكيد البريد' : 'إنشاء الحساب'}
          </button>
        </form>
        {mode === 'login' && !recoveryStage && <button type="button" onClick={() => { setError(null); setMessage(null); setRecoveryStage('email'); }} className="mt-5 block w-full text-center text-sm font-semibold text-brand-ink underline">نسيت كلمة المرور؟</button>}
        {mode === 'login' && recoveryStage && <button type="button" onClick={() => { setRecoveryStage(null); setError(null); setMessage(null); setResetToken(''); }} className="mt-5 block w-full text-center text-sm font-semibold text-brand-ink underline">العودة إلى تسجيل الدخول</button>}
        {!recoveryStage && <p className="mt-6 text-center text-sm text-ink-muted">
          {mode === 'login' ? <>ليس لديك حساب؟ <Link to="/register" className="font-semibold text-brand-ink hover:underline">أنشئ حسابًا</Link></> : <>لديك حساب بالفعل؟ <Link to="/login" className="font-semibold text-brand-ink hover:underline">سجّل الدخول</Link></>}
        </p>}
      </div>
    </main></SiteLayout>
  );
}

type ReaderTeam = {
  id: number;
  name: string;
  inviteCode?: string;
  members: Array<{ displayName: string; completedParts: number }>;
};

function TeamAccountPanel() {
  const language = useSiteLanguage();
  const [reloadKey, setReloadKey] = useState(0);
  const [teamName, setTeamName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: team, loading, error: loadError } = useRemote<ReaderTeam>(`/teams/me?refresh=${reloadKey}`);

  async function submit(action: 'create' | 'join') {
    setBusy(true);
    setError(null);
    try {
      if (action === 'create') {
        await api.post('/teams', { name: teamName, displayName });
      } else {
        await api.post('/teams/join', { inviteCode, displayName });
      }
      setReloadKey((value) => value + 1);
      setTeamName('');
      setInviteCode('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('تعذر تحديث الفريق.', language));
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-12">
    <SectionHeading title={t('فريقي وتقدّمنا', language)} />
    {loading && <LoadingState />}
    {loadError && <ErrorState message={loadError} />}
    {team ? <article className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-lg font-semibold text-brand-ink">{team.name}</h3>
      {team.inviteCode && <p className="mt-2 text-sm text-ink-muted">{t('رمز دعوة الفريق', language)}: <code dir="ltr" className="font-semibold">{team.inviteCode}</code></p>}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">{team.members.map((member, index) => <li key={`${member.displayName}-${index}`} className="flex justify-between rounded-xl bg-brand-soft p-3 text-sm"><span>{member.displayName}</span><span>{member.completedParts} · {t('أجزاء مكتملة', language)}</span></li>)}</ul>
    </article> : !loading && <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={(event) => { event.preventDefault(); void submit('create'); }} className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-semibold">{t('إنشاء فريق', language)}</h3>
        <label className="mt-3 block text-sm font-semibold">{t('اسم الفريق', language)}<input required maxLength={120} value={teamName} onChange={(event) => setTeamName(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="mt-3 block text-sm font-semibold">{t('اسم العرض أو الاسم المستعار', language)}<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <button disabled={busy} className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-50">{t('إنشاء الفريق', language)}</button>
      </form>
      <form onSubmit={(event) => { event.preventDefault(); void submit('join'); }} className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-semibold">{t('الانضمام إلى فريق', language)}</h3>
        <label className="mt-3 block text-sm font-semibold">{t('رمز الدعوة', language)}<input required value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} dir="ltr" className="mt-1 w-full rounded-xl border px-3 py-2 text-left" /></label>
        <label className="mt-3 block text-sm font-semibold">{t('اسم العرض أو الاسم المستعار', language)}<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <button disabled={busy} className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-50">{t('انضمام', language)}</button>
      </form>
    </div>}
    {error && <div className="mt-4"><ErrorState message={error} /></div>}
  </section>;
}

export function AccountPage() {
  const language = useSiteLanguage();
  const { user, isLoading, logout, refreshUser, error: authError } = useStoryAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<number | null>(null);
  const [subscriptionActionError, setSubscriptionActionError] = useState<string | null>(null);
  const [planCheckoutId, setPlanCheckoutId] = useState<number | null>(null);
  const [planCheckoutError, setPlanCheckoutError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [giftCodeBusy, setGiftCodeBusy] = useState(false);
  const [giftCodeError, setGiftCodeError] = useState<string | null>(null);
  const [giftCodeNotice, setGiftCodeNotice] = useState<string | null>(null);
  const [emailPreferences, setEmailPreferences] = useState({ marketing: true, reminders: true });
  const [savingEmailPreferences, setSavingEmailPreferences] = useState(false);
  const [emailPreferencesError, setEmailPreferencesError] = useState<string | null>(null);
  const [emailPreferencesNotice, setEmailPreferencesNotice] = useState<string | null>(null);
  const { data: progress, loading, error } = useRemote<Array<{
    id: number;
    storyId: number;
    completedParts: number[];
    nextPart?: { id: number; partNumber: number } | null;
    story?: { title: string; slug: string; cover?: string | null };
  }>>('/reading-progress');
  const { data: plans, loading: plansLoading, error: plansError } = useRemote<SubscriptionPlan[]>('/plans');
  const { data: quizAttempts, loading: quizAttemptsLoading, error: quizAttemptsError } = useRemote<Array<{
    id: number;
    score: number;
    passed: boolean;
    finishedAt: string;
    quiz: { title: string; story?: { title: string; slug: string } | null } | null;
  }>>('/quiz-attempts');
  const { data: badges, loading: badgesLoading, error: badgesError } = useRemote<Array<{
    id: number;
    code: string;
    name: string;
    icon: string;
    awardedAt: string;
  }>>('/badges');
  const { data: certificates, loading: certificatesLoading, error: certificatesError } = useRemote<Array<{
    id: number;
    title: string;
    verificationCode: string;
    issuedAt: string;
    downloadUrl: string;
  }>>('/certificates');
  const { data: recurringDonations, loading: recurringDonationsLoading, error: recurringDonationsError } = useRemote<Array<{
    id: number;
    amount: number | string;
    currency: string;
    status: string;
    campaign: string;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
  }>>(user ? '/donations/recurring' : '');
  const [recurringDonationItems, setRecurringDonationItems] = useState<Array<{
    id: number;
    amount: number | string;
    currency: string;
    status: string;
    campaign: string;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
  }>>([]);
  const [recurringDonationError, setRecurringDonationError] = useState<string | null>(null);
  const [cancelingDonationId, setCancelingDonationId] = useState<number | null>(null);
  const subscriptions: ReaderSubscription[] = user?.subscriptions || [];
  useEffect(() => {
    if (user?.emailPreferences) setEmailPreferences(user.emailPreferences);
  }, [user?.emailPreferences]);
  useEffect(() => {
    if (recurringDonations) setRecurringDonationItems(recurringDonations);
  }, [recurringDonations]);
  const isAdminAccount = Boolean(user && ['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role));
  useEffect(() => {
    if (!isAdminAccount) return;
    const adminUrl = import.meta.env.VITE_ADMIN_URL;
    if (!adminUrl) return;
    window.location.replace(new URL(`/${language}/admin`, adminUrl).toString());
  }, [isAdminAccount, language]);
  if (isLoading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdminAccount) return <main className="p-12 text-center">{t('Redirection vers le portail administrateur…', language)}</main>;

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
      setPlanCheckoutError(caught instanceof Error ? caught.message : 'تعذر بدء الاشتراك.');
      setPlanCheckoutId(null);
    }
  }

  async function updateSubscription(subscriptionId: number, action: 'cancel' | 'resume') {
    setUpdatingSubscriptionId(subscriptionId);
    setSubscriptionActionError(null);
    try {
      await api.post(`/subscriptions/${subscriptionId}/${action}`, {});
      await refreshUser();
    } catch (caught) {
      setSubscriptionActionError(caught instanceof Error ? caught.message : 'تعذر تحديث الاشتراك.');
    } finally {
      setUpdatingSubscriptionId(null);
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
        setGiftCodeNotice(`${t('تم تفعيل الهدية', language)}: ${result.plan} · ${new Date(result.expiresAt).toLocaleDateString(language)}`);
        await refreshUser();
      } catch (caught) {
        setGiftCodeError(caught instanceof Error ? caught.message : t('تعذر استخدام رمز الهدية.', language));
      } finally {
        setGiftCodeBusy(false);
      }
  }

  async function cancelRecurringDonation(id: number) {
    setCancelingDonationId(id);
    setRecurringDonationError(null);
    try {
      await api.post(`/donations/recurring/${id}/cancel`, {});
      setRecurringDonationItems((current) => current.map((item) =>
        item.id === id ? { ...item, cancelAtPeriodEnd: true } : item
      ));
    } catch (caught) {
      setRecurringDonationError(caught instanceof Error ? caught.message : t('تعذر إلغاء التبرع المتكرر.', language));
    } finally {
      setCancelingDonationId(null);
    }
  }

  async function saveEmailPreferences(event: FormEvent) {
    event.preventDefault();
    setSavingEmailPreferences(true);
    setEmailPreferencesError(null);
    setEmailPreferencesNotice(null);
    try {
      const result = await api.patch<{ emailPreferences: typeof emailPreferences }>('/account/email-preferences', emailPreferences);
      setEmailPreferences(result.emailPreferences);
      setEmailPreferencesNotice(t('تم حفظ تفضيلات البريد الإلكتروني.', language));
    } catch (caught) {
      setEmailPreferencesError(caught instanceof Error ? caught.message : t('تعذر حفظ تفضيلات البريد الإلكتروني.', language));
    } finally {
      setSavingEmailPreferences(false);
    }
  }

  return <SiteLayout><main><Container className="py-12 sm:py-16">
    <p className="text-sm font-semibold tracking-widest text-brand-ink">مساحتك</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold text-brand-ink">أهلًا، {user.firstName}</h1><p className="mt-2 text-ink-muted">{user.email}</p></div><div className="flex gap-2"><button onClick={async () => { setRefreshing(true); await refreshUser(); setRefreshing(false); }} disabled={refreshing} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-soft disabled:opacity-60">{refreshing ? 'جارٍ التحديث…' : 'تحديث الحالة'}</button><button onClick={logout} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-soft">تسجيل الخروج</button></div></div>
    {authError && <div className="mt-5"><ErrorState message={authError} /></div>}
    <form onSubmit={saveEmailPreferences} className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">{t('تفضيلات البريد الإلكتروني', language)}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={emailPreferences.marketing} onChange={(event) => setEmailPreferences((current) => ({ ...current, marketing: event.target.checked }))} /><span>{t('رسائل القصص الجديدة والعروض', language)}</span></label>
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={emailPreferences.reminders} onChange={(event) => setEmailPreferences((current) => ({ ...current, reminders: event.target.checked }))} /><span>{t('التذكيرات المجدولة', language)}</span></label>
      </div>
      <button disabled={savingEmailPreferences} className="mt-4 rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50">{t(savingEmailPreferences ? 'جارٍ الحفظ…' : 'حفظ تفضيلات البريد الإلكتروني', language)}</button>
      {emailPreferencesError && <div className="mt-3"><ErrorState message={emailPreferencesError} /></div>}
      {emailPreferencesNotice && <p role="status" className="mt-3 text-sm text-brand-ink">{emailPreferencesNotice}</p>}
    </form>
    <TeamAccountPanel />
    <div className="mt-10 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
      <section><SectionHeading title="تابع القراءة" />{loading && <LoadingState />}{error && <ErrorState message={error} />}{!loading && !error && !progress?.length && <EmptyState>لم تحفظ أي تقدّم بعد. <Link to="/stories" className="font-semibold text-brand-ink underline">اكتشف القصص</Link></EmptyState>}{!!progress?.length && <div className="space-y-3">{progress.map((item) => <Link key={item.id} to={item.nextPart ? `/stories/${item.story?.slug || ''}/read/${item.nextPart.partNumber}` : `/stories/${item.story?.slug || ''}`} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 hover:border-line"><div><h3 className="font-semibold text-brand-ink">{item.story?.title || 'حكاية'}</h3><p className="mt-1 text-sm text-ink-muted">{t('أتممت', language)} {item.completedParts.length}{item.publishedParts ? ` ${t('من', language)} ${item.publishedParts}` : ''} {t('أجزاء', language)} · {item.newPartAvailable ? t('جزء جديد متاح', language) : item.finished ? (item.upcomingPart ? t('الحلقة القادمة قريبًا', language) : t('أكملت هذه الحكاية', language)) : item.nextPart ? `${t('التالي', language)} ${item.nextPart.partNumber}` : t('افتح الحكاية', language)}</p></div><ChevronLeft size={20} className="text-brand-ink" /></Link>)}</div>}</section>
      <section><SectionHeading title="حالة الاشتراك" /><div className="rounded-3xl border border-line bg-surface p-6">
        {!subscriptions.length ? <><span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-soft text-gold-ink"><Star size={22} /></span><h3 className="mt-4 font-semibold text-brand-ink">لا يوجد اشتراك حالي</h3><p className="mt-2 text-sm leading-7 text-ink-muted">تابع قراءة الأجزاء المجانية أو اختر إحدى الباقات المتاحة أدناه.</p></> :
          <div className="space-y-4">{subscriptions.map((subscription) => <SubscriptionCard key={subscription.id} subscription={subscription} busy={updatingSubscriptionId === subscription.id} onCancel={() => updateSubscription(subscription.id, 'cancel')} onResume={() => updateSubscription(subscription.id, 'resume')} />)}</div>}
        {subscriptionActionError && <div className="mt-4"><ErrorState message={subscriptionActionError} /></div>}
      </div></section>
    </div>
    <section className="mt-12">
      <SectionHeading title={t('سجل الاختبارات', language)} />
      {quizAttemptsLoading && <LoadingState />}
      {quizAttemptsError && <ErrorState message={quizAttemptsError} />}
      {!quizAttemptsLoading && !quizAttemptsError && !quizAttempts?.length && <EmptyState>{t('لم تسجل أي محاولات اختبار بعد.', language)}</EmptyState>}
      {!!quizAttempts?.length && <div className="space-y-3">{quizAttempts.map((attempt) => <article key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5"><div><h3 className="font-semibold text-brand-ink">{attempt.quiz?.title || t('اختبار', language)}</h3><p className="mt-1 text-sm text-ink-muted">{attempt.quiz?.story?.title || ''} · {new Date(attempt.finishedAt).toLocaleDateString(language)}</p></div><div className="flex items-center gap-3"><span className="font-semibold">{attempt.score}%</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${attempt.passed ? 'bg-brand-soft text-brand-ink' : 'bg-gold-soft text-gold-ink'}`}>{t(attempt.passed ? 'ناجح' : 'لم يجتز', language)}</span></div></article>)}</div>}
    </section>
    <section className="mt-12">
      <SectionHeading title={t('شاراتي والشهادات', language)} />
      {badgesLoading && <LoadingState />}
      {badgesError && <ErrorState message={badgesError} />}
      {!badgesLoading && !badgesError && !badges?.length && <EmptyState>{t('لا توجد شهادات أو شارات بعد.', language)}</EmptyState>}
      {!!badges?.length && <div className="grid gap-3 md:grid-cols-2">{badges.map((badge) => <article key={badge.id} className="rounded-2xl border border-line bg-surface p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-brand-ink">{badge.name}</h3><p className="text-xs text-ink-muted">{badge.code}</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-lg">{badge.icon || '🏅'}</span></div><p className="mt-3 text-sm text-ink-muted">{new Date(badge.awardedAt).toLocaleDateString(language)}</p></article>)}</div>}
      {certificatesLoading && <LoadingState />}
      {certificatesError && <ErrorState message={certificatesError} />}
      {!certificatesLoading && !certificatesError && !!certificates?.length && <div className="mt-4 space-y-3">{certificates.map((certificate) => <article key={certificate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5"><div><h3 className="font-semibold text-brand-ink">{certificate.title}</h3><p className="mt-1 text-sm text-ink-muted">{certificate.verificationCode}</p></div><a href={certificate.downloadUrl} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-ink">{t('تحميل الشهادة', language)}</a></article>)}</div>}
    </section>
    <section className="mt-12">
      <SectionHeading eyebrow="اختر ما يناسب عائلتك" title="باقات القراءة" />
      <section className="mb-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-xl font-semibold">{t('تبرعاتي الشهرية', language)}</h2>
        {recurringDonationsLoading && <LoadingState />}
        {(recurringDonationsError || recurringDonationError) && <div className="mt-3"><ErrorState message={recurringDonationError || recurringDonationsError || ''} /></div>}
        {!recurringDonationsLoading && !recurringDonationsError && !recurringDonationItems.length && <p className="mt-3 text-sm text-ink-muted">{t('لا توجد تبرعات شهرية.', language)}</p>}
        <div className="mt-3 space-y-3">{recurringDonationItems.map((donation) => <article key={donation.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><div><p className="font-semibold">{donation.campaign} · {Number(donation.amount).toFixed(2)} {donation.currency}</p><p className="text-ink-muted">{donation.status}{donation.cancelAtPeriodEnd ? ` · ${t('سيُلغى بنهاية الفترة', language)}` : ''}</p></div>{['active', 'past_due'].includes(donation.status) && !donation.cancelAtPeriodEnd && <button onClick={() => void cancelRecurringDonation(donation.id)} disabled={cancelingDonationId === donation.id} className="rounded-lg border border-danger px-3 py-2 font-semibold text-danger disabled:opacity-50">{t(cancelingDonationId === donation.id ? 'جارٍ الإلغاء…' : 'إلغاء التبرع', language)}</button>}</article>)}</div>
      </section>
      <form onSubmit={redeemGiftCode} className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-5">
        <label className="min-w-[220px] flex-1 text-sm font-semibold">{t('استخدم رمز هدية الاشتراك', language)}<input required maxLength={64} value={giftCode} onChange={(event) => setGiftCode(event.target.value.toUpperCase())} dir="ltr" className="mt-2 w-full rounded-xl border border-line px-3 py-2.5" /></label>
        <button disabled={giftCodeBusy} className="rounded-full bg-brand px-5 py-2.5 font-semibold text-brand-on disabled:opacity-50">{t(giftCodeBusy ? 'جارٍ التفعيل…' : 'تفعيل الهدية', language)}</button>
      </form>
      {giftCodeError && <div className="mb-4"><ErrorState message={giftCodeError} /></div>}
      {giftCodeNotice && <p role="status" className="mb-4 rounded-xl bg-brand-soft p-4 text-brand-ink">{giftCodeNotice}</p>}
      <label className="mb-5 block max-w-xl text-sm font-semibold text-ink">{t('رمز الخصم للاشتراك (اختياري)', language)}<input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} maxLength={64} dir="ltr" className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5" /></label>
      {plansLoading && <LoadingState />}
      {plansError && <ErrorState message={plansError} />}
      {!plansLoading && !plansError && !plans?.length && <EmptyState>لا توجد باقات متاحة حاليًا. ستُعلن هنا عند إعدادها.</EmptyState>}
      {!!plans?.length && <div className="grid gap-5 md:grid-cols-2">{plans.map((plan) => <article key={plan.id} className="rounded-3xl border border-line bg-surface p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold text-brand-ink">{plan.name}</h3><p className="mt-1 text-sm text-ink-muted">{t(plan.isFamily ? 'باقة عائلية' : 'باقة فردية', language)}</p></div><span className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink">{formatPrice(plan.price, plan.currency, language)} / {t(plan.interval === 'month' ? 'شهر' : 'سنة', language)}</span></div><ul className="mt-5 space-y-2 text-sm leading-7 text-ink-muted">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-brand-ink" />{feature}</li>)}</ul><button onClick={() => startPlanCheckout(plan.id)} disabled={planCheckoutId !== null || subscriptions.some((item) => item.accessActive)} className="mt-6 w-full rounded-full bg-brand px-5 py-3 font-semibold text-brand-on disabled:opacity-50">{t(planCheckoutId === plan.id ? 'جارٍ تحويلك للدفع…' : 'الاشتراك الآمن', language)}</button></article>)}</div>}
      {planCheckoutError && <div className="mt-5"><ErrorState message={planCheckoutError} /></div>}
    </section>
  </Container></main></SiteLayout>;
}

type SubscriptionPlan = {
  id: number;
  name: string;
  slug: string;
  price: number | string;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  translations?: PlanTranslations;
  isFamily: boolean;
  isActive: boolean;
};

export function PricingPage() {
  const language = useSiteLanguage();
  const navigate = useLocalizedNavigate();
  const { user } = useStoryAuth();
  const { data: plans, loading, error } = useRemote<SubscriptionPlan[]>('/plans');
  const [checkoutId, setCheckoutId] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');

  async function startCheckout(planId: number) {
    if (!user || user.role !== 'READER') {
      navigate('/login');
      return;
    }
    setCheckoutId(planId);
    setCheckoutError(null);
    try {
      const response = await api.post<{ checkoutUrl: string }>('/payments/subscriptions/checkout', {
        planId,
        language,
        ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {})
      });
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      setCheckoutError(caught instanceof ApiError && caught.status === 409
        ? t('لديك اشتراك نشط بالفعل. يمكنك إدارته من حسابك.', language)
        : caught instanceof Error ? caught.message : 'تعذر بدء الاشتراك.');
      setCheckoutId(null);
    }
  }

  return <SiteLayout><main><Container className="py-12 sm:py-16">
    <p className="text-sm font-semibold tracking-widest text-brand-ink">الأسعار والباقات</p>
    <h1 className="mt-3 text-3xl font-semibold text-brand-ink sm:text-4xl">اختر باقة القراءة المناسبة</h1>
    <p className="mt-3 max-w-3xl leading-8 text-ink-muted">قارن الأسعار وما تتضمنه كل باقة قبل الاشتراك. تُدار الأسعار والمزايا من لوحة الإدارة.</p>
    {loading && <LoadingState />}
    {error && <div className="mt-6"><ErrorState message={error} /></div>}
    {!loading && !error && !plans?.length && <div className="mt-8"><EmptyState>لا توجد باقات منشورة حاليًا.</EmptyState></div>}
    {!!plans?.length && <label className="mt-6 block max-w-xl text-sm font-semibold text-ink">{t('رمز الخصم (اختياري)', language)}<input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} maxLength={64} dir="ltr" className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5" /></label>}
    {!!plans?.length && <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => <article key={plan.id} className="flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-lift">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold text-brand-ink">{plan.name}</h2><p className="mt-1 text-sm text-ink-muted">{t(plan.isFamily ? 'باقة عائلية' : 'باقة فردية', language)}</p></div>
          <span className="shrink-0 rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink">{formatPrice(plan.price, plan.currency, language)} / {t(plan.interval === 'month' ? 'شهر' : 'سنة', language)}</span>
        </div>
        <h3 className="mt-6 font-semibold text-brand-ink">{t('ما الذي تتضمنه', language)}</h3>
        <ul className="mt-3 flex-1 space-y-2 text-sm leading-7 text-ink-muted">
          {plan.features.map((feature, index) => <li key={`${index}-${feature}`} className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-brand-ink" />{feature}</li>)}
        </ul>
        {user?.role === 'READER'
          ? <button onClick={() => startCheckout(plan.id)} disabled={checkoutId !== null} className="mt-7 w-full rounded-full bg-brand px-5 py-3 font-semibold text-brand-on disabled:opacity-50">{t(checkoutId === plan.id ? 'جارٍ تحويلك للدفع…' : 'الاشتراك الآمن', language)}</button>
          : <Link to="/register" className="mt-7 block w-full rounded-full bg-brand px-5 py-3 text-center font-semibold text-brand-on">{t('إنشاء حساب للاشتراك', language)}</Link>}
      </article>)}
    </div>}
    {checkoutError && <div className="mt-6"><ErrorState message={checkoutError} /></div>}
    <p className="mt-10 text-center text-sm text-ink-muted">{t('يمكن شراء الكتب الإلكترونية بشكل منفصل دون اشتراك.', language)} <Link to="/books" className="font-semibold text-brand-ink underline">{t('تصفّح الكتب', language)}</Link></p>
  </Container></main></SiteLayout>;
}

export function StoryRequestPage() {
  const language = useSiteLanguage();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.post('/story-requests', { title, description, source, contactEmail });
      setTitle('');
      setDescription('');
      setSource('');
      setContactEmail('');
      setMessage('تم إرسال طلبك بنجاح. سنراجع الفكرة مع فريق المحتوى.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إرسال الطلب.');
    } finally {
      setBusy(false);
    }
  }

  return <SiteLayout><main className="bg-surface-soft"><Container className="py-12">
    <div className="mx-auto max-w-3xl rounded-[2rem] border border-line bg-surface p-8 shadow-lift">
      <p className="text-sm font-semibold tracking-[0.2em] text-brand-ink">{t('طلبات القصص', language)}</p>
      <h1 className="mt-3 text-3xl font-semibold text-brand-ink">{t('اقترح قصة أو موضوعًا جديدًا', language)}</h1>
      <p className="mt-3 leading-7 text-ink-muted">{t('أرسل عنوانًا موجزًا ووصفًا مختصرًا للمحتوى المطلوب. يمكننا تحويل الطلب لاحقًا إلى قصة جديدة أو جزء في السلسلة.', language)}</p>
      {message && <p className="mt-5 rounded-xl bg-brand-soft p-3 text-sm text-brand-ink">{message}</p>}
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block space-y-2 text-sm font-semibold text-ink">{t('عنوان الفكرة', language)}<input required value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>
        <label className="block space-y-2 text-sm font-semibold text-ink">{t('الوصف', language)}<textarea required rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>
        <label className="block space-y-2 text-sm font-semibold text-ink">{t('المصدر أو المرجع (اختياري)', language)}<input value={source} onChange={(event) => setSource(event.target.value)} className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>
        <label className="block space-y-2 text-sm font-semibold text-ink">{t('بريد التواصل (اختياري)', language)}<input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>
        <button type="submit" disabled={busy} className="rounded-full bg-brand px-5 py-3 font-semibold text-brand-on disabled:opacity-60">{busy ? t('جارٍ الإرسال…', language) : t('إرسال الطلب', language)}</button>
      </form>
    </div>
  </Container></main></SiteLayout>;
}

function SubscriptionCard({ subscription, busy, onCancel, onResume }: {
  subscription: ReaderSubscription;
  busy: boolean;
  onCancel: () => void;
  onResume: () => void;
}) {
  const language = useSiteLanguage();
  const labels: Record<ReaderSubscription['status'], string> = {
    active: 'نشط', trialing: 'فترة تجريبية', past_due: 'متأخر السداد', canceled: 'ملغي',
    incomplete: 'غير مكتمل', incomplete_expired: 'انتهت مهلة الدفع', unpaid: 'غير مدفوع',
    paused: 'متوقف', expired: 'منتهي'
  };
  const statusColor = subscription.accessActive ? 'bg-brand-soft text-brand-ink' : 'bg-gold-soft text-gold-ink';
  return <article className="border-b border-line pb-4 last:border-0 last:pb-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-brand-ink">{subscription.plan ? localizedPlanName(subscription.plan, language) : t('اشتراك', language)}</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>{t(labels[subscription.status], language)}</span></div>
    <p className="mt-2 text-sm text-ink-muted">{t(subscription.accessActive ? 'الوصول إلى المحتوى مفعّل' : 'الوصول إلى المحتوى غير مفعّل', language)}</p>
    {subscription.expiresAt && <p className="mt-1 text-xs text-ink-muted">{t('تاريخ الانتهاء:', language)} {new Intl.DateTimeFormat(language).format(new Date(subscription.expiresAt))}</p>}
    {subscription.cancelAtPeriodEnd && <p className="mt-1 text-xs text-gold-ink">{t('سيتوقف التجديد في نهاية الفترة الحالية.', language)}</p>}
    {subscription.canManageRenewal && subscription.status === 'active' && !subscription.cancelAtPeriodEnd && <button onClick={onCancel} disabled={busy} className="mt-3 text-xs font-semibold text-danger underline disabled:opacity-50">{t(busy ? 'جارٍ التحديث…' : 'إيقاف التجديد', language)}</button>}
    {subscription.canManageRenewal && subscription.cancelAtPeriodEnd && <button onClick={onResume} disabled={busy} className="mt-3 text-xs font-semibold text-brand-ink underline disabled:opacity-50">{t(busy ? 'جارٍ التحديث…' : 'استمرار التجديد', language)}</button>}
  </article>;
}

export function AdminLoginPage() {
  const navigate = useLocalizedNavigate();
  const language = useSiteLanguage();
  const { user, isLoading, adminLogin, verifyAdminCode } = useStoryAuth();
  const [stage, setStage] = useState<'credentials' | 'code'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <main className="p-12 text-center">{t('جارٍ التحقق من الجلسة…', language)}</main>;
  if (user) return <Navigate to={['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role) ? '/admin' : '/admin/login'} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (stage === 'credentials') {
        setMessage(await adminLogin(email, password));
        setStage('code');
      } else {
        await verifyAdminCode(email, code);
        navigate('/admin', { replace: true });
      }
    } catch (caught) {
      setError(localizeAuthError(caught, language));
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-surface-soft px-5 py-12">
    <div className="w-full max-w-lg rounded-[2rem] border border-line bg-surface p-8 shadow-lift">
      <a href={import.meta.env.VITE_CLIENT_URL || '/'} className="text-sm font-semibold text-brand-ink">{t('Voir le site public', language)}</a>
      <span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand-ink"><ShieldCheck size={23} /></span>
      <h1 className="mt-5 text-2xl font-semibold text-brand-ink">{t('Connexion administrateur', language)}</h1>
      <p className="mt-2 leading-7 text-ink-muted">{t('La connexion nécessite votre mot de passe puis le code envoyé à votre adresse administrateur.', language)}</p>
      {message && <p className="mt-5 rounded-xl bg-brand-soft p-3 text-sm text-brand-ink" role="status">{message}</p>}
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      <form onSubmit={submit} className="mt-7 space-y-4">
        <label className="block space-y-2 text-sm font-semibold text-ink">{t('Adresse e-mail', language)}<input type="email" required readOnly={stage === 'code'} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" dir="ltr" className="w-full rounded-xl border border-line px-4 py-3 text-left outline-none focus:border-line read-only:bg-surface-soft" /></label>
        {stage === 'credentials' && <label className="block space-y-2 text-sm font-semibold text-ink">{t('Mot de passe', language)}<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-line" /></label>}
        {stage === 'code' && <label className="block space-y-2 text-sm font-semibold text-ink">{t('Code de vérification', language)}<input required inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} dir="ltr" className="w-full rounded-xl border border-line px-4 py-3 text-center tracking-[0.5em] outline-none focus:border-line" /></label>}
        <button disabled={busy} className="w-full rounded-full bg-brand px-5 py-3 font-semibold text-brand-on disabled:opacity-50">{busy ? t('Vérification…', language) : stage === 'credentials' ? t('Envoyer le code de connexion', language) : t('Ouvrir le tableau de bord', language)}</button>
      </form>
    </div>
  </main>;
}

type AdminSubscription = ReaderSubscription & {
  stripeSubscriptionId: string | null;
  user: { id: number; firstName: string; lastName: string; email: string };
};

type AdminStoreOrder = {
  id: number;
  currency: string;
  total: number | string;
  createdAt: string;
  fulfillmentStatus: 'unfulfilled' | 'processing' | 'shipped' | 'delivered';
  trackingNumber: string | null;
  shippingAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    country: string;
    phone: string;
  } | null;
  user: { firstName: string; lastName: string; email: string };
  items: Array<{ quantity: number; titleSnapshot: string; book: { title: string; format: 'print' | 'ebook' } }>;
};

const fulfillmentLabels: Record<AdminStoreOrder['fulfillmentStatus'], string> = {
  unfulfilled: 'بانتظار التجهيز',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم'
};
const fulfillmentOrder: AdminStoreOrder['fulfillmentStatus'][] = ['unfulfilled', 'processing', 'shipped', 'delivered'];

export function AdminStoreOrdersPage() {
  const language = useSiteLanguage();
  const { user, isLoading } = useStoryAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { fulfillmentStatus: AdminStoreOrder['fulfillmentStatus']; trackingNumber: string }>>({});
  const { data: orders, loading, error: loadError } = useRemote<AdminStoreOrder[]>(`/admin/store-orders?refresh=${reloadKey}`);

  if (isLoading) return translateTree(<main className="p-8"><LoadingState /></main>, language);
  if (!user) return <Navigate to={`/${language}/admin/login`} replace />;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <Navigate to={`/${language}/account`} replace />;

  async function saveOrder(order: AdminStoreOrder) {
    const draft = drafts[order.id] || {
      fulfillmentStatus: order.fulfillmentStatus,
      trackingNumber: order.trackingNumber || ''
    };
    setBusyId(order.id);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/admin/store-orders/${order.id}/fulfillment`, {
        fulfillmentStatus: draft.fulfillmentStatus === 'unfulfilled' ? undefined : draft.fulfillmentStatus,
        trackingNumber: draft.trackingNumber.trim() || null
      });
      setNotice(`تم تحديث تجهيز الطلب رقم ${order.id}.`);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الطلب.');
    } finally {
      setBusyId(null);
    }
  }

  return translateTree(<main><Container className="max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-brand-ink">طلبات الكتب الورقية</h1><p className="mt-2 text-ink-muted">الطلبات المدفوعة وعناوين الشحن وحالة التجهيز.</p></div>
      <button onClick={() => setReloadKey((value) => value + 1)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-brand-ink">تحديث</button>
    </div>
    {error && <div className="mt-6"><ErrorState message={error} /></div>}{loadError && <div className="mt-6"><ErrorState message={loadError} /></div>}{notice && <p className="mt-5 rounded-xl bg-brand-soft p-4 text-sm text-brand-ink" role="status">{notice}</p>}
    <section className="mt-8 space-y-4">
      {loading && <LoadingState />}
      {!loading && !loadError && !orders?.length && <EmptyState>لا توجد طلبات ورقية مدفوعة تحتاج إلى تجهيز.</EmptyState>}
      {orders?.map((order) => {
        const draft = drafts[order.id] || {
          fulfillmentStatus: order.fulfillmentStatus,
          trackingNumber: order.trackingNumber || ''
        };
        return <article key={order.id} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-semibold text-brand-ink">طلب رقم {order.id} · {formatPrice(order.total, order.currency, language)}</h2><p className="mt-1 text-sm text-ink-muted">{order.user.firstName} {order.user.lastName} · {order.user.email}</p><p className="mt-1 text-xs text-ink-muted">{new Date(order.createdAt).toLocaleDateString(language)}</p></div>
            <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-ink">{fulfillmentLabels[order.fulfillmentStatus]}</span>
          </div>
          <ul className="mt-4 list-inside list-disc text-sm text-ink">{order.items.map((item, index) => <li key={`${order.id}-${index}`}>{item.titleSnapshot || item.book.title} × {item.quantity}</li>)}</ul>
          {order.shippingAddress && <div className="mt-4 rounded-xl bg-surface-soft p-4 text-sm leading-7 text-ink"><p className="font-semibold text-brand-ink">{order.shippingAddress.name} · {order.shippingAddress.phone}</p><p>{order.shippingAddress.line1}{order.shippingAddress.line2 ? `، ${order.shippingAddress.line2}` : ''}</p><p>{order.shippingAddress.postalCode} {order.shippingAddress.city}، {order.shippingAddress.country}</p></div>}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-ink">حالة التجهيز<select value={draft.fulfillmentStatus} onChange={(event) => setDrafts((value) => ({ ...value, [order.id]: { ...draft, fulfillmentStatus: event.target.value as AdminStoreOrder['fulfillmentStatus'] } }))} className="mt-1 block rounded-xl border border-line px-3 py-2">{fulfillmentOrder.map((status) => <option key={status} value={status} disabled={fulfillmentOrder.indexOf(status) < fulfillmentOrder.indexOf(order.fulfillmentStatus)}>{fulfillmentLabels[status]}</option>)}</select></label>
            <label className="min-w-52 flex-1 text-sm font-semibold text-ink">رقم التتبع<input dir="ltr" value={draft.trackingNumber} onChange={(event) => setDrafts((value) => ({ ...value, [order.id]: { ...draft, trackingNumber: event.target.value } }))} className="mt-1 block w-full rounded-xl border border-line px-3 py-2 text-left" /></label>
            <button onClick={() => saveOrder(order)} disabled={busyId === order.id || (draft.fulfillmentStatus === order.fulfillmentStatus && draft.trackingNumber === (order.trackingNumber || ''))} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-on disabled:opacity-50">{busyId === order.id ? 'جارٍ الحفظ…' : 'حفظ التحديث'}</button>
          </div>
        </article>;
      })}
    </section>
  </Container></main>, language);
}

export function AdminSubscriptionsPage() {
  const language = useSiteLanguage();
  const { user, isLoading } = useStoryAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [statusDrafts, setStatusDrafts] = useState<Record<number, ReaderSubscription['status']>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft>(emptyPlanDraft);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const { data: subscriptions, loading, error: loadError } = useRemote<AdminSubscription[]>(`/admin/subscriptions?refresh=${reloadKey}`);
  const { data: plans, loading: plansLoading, error: plansLoadError } = useRemote<SubscriptionPlan[]>(`/admin/plans?refresh=${reloadKey}`);

  if (isLoading) return translateTree(<main className="p-8"><LoadingState /></main>, language);
  if (!user) return <Navigate to={`/${language}/admin/login`} replace />;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <Navigate to={`/${language}/account`} replace />;

  async function updateManualStatus(id: number) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/admin/subscriptions/${id}`, { status: statusDrafts[id] });
      setNotice('تم تحديث حالة الاشتراك.');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الاشتراك.');
    } finally {
      setBusyId(null);
    }
  }

  async function updateStripeRenewal(id: number, action: 'cancel' | 'resume') {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/admin/subscriptions/${id}/${action}`, {});
      setNotice(action === 'cancel' ? 'تم إيقاف التجديد لنهاية الفترة المدفوعة.' : 'تم استئناف التجديد.');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الاشتراك.');
    } finally {
      setBusyId(null);
    }
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    setPlanBusy(true);
    setPlanError(null);
    try {
      const payload = {
        name: planDraft.translations.ar.name,
        slug: planDraft.slug,
        price: Number(planDraft.price),
        currency: 'EUR',
        interval: planDraft.interval,
        features: planDraft.translations.ar.features.split('\n').map((feature) => feature.trim()).filter(Boolean),
        translations: Object.fromEntries(planLanguages.map(({ code }) => [code, {
          name: planDraft.translations[code].name,
          features: planDraft.translations[code].features.split('\n').map((feature) => feature.trim()).filter(Boolean)
        }])),
        isFamily: true
      };
      if (editingPlanId) await api.patch(`/admin/plans/${editingPlanId}`, payload);
      else await api.post('/admin/plans', { ...payload, isActive: true });
      setEditingPlanId(null);
      setPlanDraft(emptyPlanDraft());
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setPlanError(caught instanceof Error ? caught.message : 'تعذر إنشاء الباقة.');
    } finally {
      setPlanBusy(false);
    }
  }

  async function togglePlan(plan: SubscriptionPlan) {
    try {
      await api.patch(`/admin/plans/${plan.id}`, { isActive: !plan.isActive });
      setNotice(plan.isActive ? 'تم إيقاف الباقة؛ لن تظهر للمشتركين الجدد.' : 'تم تفعيل الباقة وظهورها للمشتركين الجدد.');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تعديل الباقة.');
    }
  }

  function editPlan(plan: SubscriptionPlan) {
    const translationDraft = Object.fromEntries(planLanguages.map(({ code }) => [code, {
      name: plan.translations?.[code]?.name || (code === 'ar' ? plan.name : ''),
      features: plan.translations?.[code]?.features?.join('\n') ||
        (code === 'ar' ? plan.features.join('\n') : '')
    }])) as PlanDraft['translations'];
    setEditingPlanId(plan.id);
    setPlanDraft({
      slug: plan.slug,
      price: String(plan.price),
      interval: plan.interval,
      translations: translationDraft
    });
    setPlanError(null);
  }

  return translateTree(<main><Container className="max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold text-brand-ink">الاشتراكات والباقات</h1><p className="mt-2 text-ink-muted">حالة الوصول تُحدّث من أحداث Stripe، والتعديلات اليدوية متاحة للسجلات غير المرتبطة بمزوّد الدفع.</p></div><button onClick={() => setReloadKey((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-brand-ink"><RefreshCw size={15} /> تحديث</button></div>
    {error && <div className="mt-6"><ErrorState message={error} /></div>}{loadError && <div className="mt-6"><ErrorState message={loadError} /></div>}{notice && <p className="mt-5 rounded-xl bg-brand-soft p-4 text-sm text-brand-ink" role="status">{notice}</p>}
    <section className="mt-9">
      <SectionHeading title="حالة كل مشترك" />
      {loading && <LoadingState />}
      {!loading && !loadError && !subscriptions?.length && <EmptyState>لا توجد اشتراكات بعد.</EmptyState>}
      <div className="space-y-3">{subscriptions?.map((subscription) => {
        const status = statusDrafts[subscription.id] || subscription.status;
        return <article key={subscription.id} className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-semibold text-brand-ink">{subscription.user.firstName} {subscription.user.lastName}</h2><p className="mt-1 text-sm text-ink-muted">{subscription.user.email}</p><p className="mt-2 text-sm text-ink-muted">{subscription.plan ? localizedPlanName(subscription.plan, language) : t('باقة', language)} · {subscription.accessActive ? t('الوصول مفعّل', language) : t('الوصول غير مفعّل', language)}</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${subscription.accessActive ? 'bg-brand-soft text-brand-ink' : 'bg-gold-soft text-gold-ink'}`}>{status}</span>{subscription.stripeSubscriptionId ? <span className="text-xs text-ink-muted">Stripe</span> : <select value={status} onChange={(event) => setStatusDrafts((value) => ({ ...value, [subscription.id]: event.target.value as ReaderSubscription['status'] }))} className="rounded-xl border border-line px-3 py-2 text-sm"><option value="incomplete">غير مكتمل</option><option value="active">نشط</option><option value="past_due">متأخر السداد</option><option value="canceled">ملغي</option><option value="unpaid">غير مدفوع</option><option value="paused">متوقف</option><option value="expired">منتهي</option></select>}</div>
          </div>
          {subscription.stripeSubscriptionId ? <div className="mt-4">{subscription.cancelAtPeriodEnd ? <button onClick={() => updateStripeRenewal(subscription.id, 'resume')} disabled={busyId === subscription.id} className="text-sm font-semibold text-brand-ink underline disabled:opacity-50">استئناف التجديد</button> : <button onClick={() => updateStripeRenewal(subscription.id, 'cancel')} disabled={busyId === subscription.id} className="text-sm font-semibold text-danger underline disabled:opacity-50">إيقاف التجديد</button>}</div> : <button onClick={() => updateManualStatus(subscription.id)} disabled={busyId === subscription.id || status === subscription.status} className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-on disabled:opacity-50">{busyId === subscription.id ? 'جارٍ الحفظ…' : 'حفظ الحالة'}</button>}
        </article>;
      })}</div>
    </section>
    <section className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-3xl border border-line bg-surface p-6">
        <SectionHeading title={editingPlanId ? 'تعديل الباقة' : 'إنشاء باقة'} />
        {planError && <ErrorState message={planError} />}
        <form onSubmit={savePlan} className="space-y-4">
          <p className="text-sm leading-6 text-ink-muted">أدخل اسم الباقة ومزاياها يدويًا بكل لغة. لا تُنشأ ترجمات تلقائية.</p>
          {planLanguages.map(({ code, label }) => <fieldset key={code} className="space-y-3 rounded-2xl border border-line p-4">
            <legend className="px-2 text-sm font-semibold">{label}</legend>
            <label className="block text-sm font-semibold text-ink">اسم الباقة<input required value={planDraft.translations[code].name} onChange={(event) => setPlanDraft((current) => ({ ...current, translations: { ...current.translations, [code]: { ...current.translations[code], name: event.target.value } } }))} dir={code === 'ar' ? 'rtl' : 'ltr'} className="mt-2 w-full rounded-xl border border-line px-3 py-2.5" /></label>
            <label className="block text-sm font-semibold text-ink">المزايا (ميزة واحدة في كل سطر)<textarea required rows={3} value={planDraft.translations[code].features} onChange={(event) => setPlanDraft((current) => ({ ...current, translations: { ...current.translations, [code]: { ...current.translations[code], features: event.target.value } } }))} dir={code === 'ar' ? 'rtl' : 'ltr'} className="mt-2 w-full rounded-xl border border-line px-3 py-2.5" /></label>
          </fieldset>)}
          <label className="block text-sm font-semibold text-ink">الرابط المختصر (slug)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={planDraft.slug} onChange={(event) => setPlanDraft({ ...planDraft, slug: event.target.value })} dir="ltr" className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 text-left" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-ink">السعر باليورو<input required type="number" min="0.01" step="0.01" value={planDraft.price} onChange={(event) => setPlanDraft({ ...planDraft, price: event.target.value })} className="mt-2 w-full rounded-xl border border-line px-3 py-2.5" /></label><label className="text-sm font-semibold text-ink">الفترة<select value={planDraft.interval} onChange={(event) => setPlanDraft({ ...planDraft, interval: event.target.value as 'month' | 'year' })} className="mt-2 w-full rounded-xl border border-line px-3 py-2.5"><option value="month">شهرية</option><option value="year">سنوية</option></select></label></div>
          <div className="flex gap-3">
            <button disabled={planBusy} className="flex-1 rounded-full bg-brand px-5 py-3 font-semibold text-brand-on disabled:opacity-50">{planBusy ? 'جارٍ الحفظ…' : editingPlanId ? 'حفظ الباقة' : 'إنشاء الباقة'}</button>
            {editingPlanId && <button type="button" onClick={() => { setEditingPlanId(null); setPlanDraft(emptyPlanDraft()); }} className="rounded-full border border-line px-5 py-3 font-semibold">{t('إلغاء', language)}</button>}
          </div>
        </form>
      </div>
      <div><SectionHeading title="الباقات المنشورة" /><div className="space-y-3">{plansLoading && <LoadingState />}{plansLoadError && <ErrorState message={plansLoadError} />}{plans?.map((plan) => <article key={plan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5"><div><h3 className="font-semibold text-brand-ink">{localizedPlanName(plan, language)}</h3><p className="mt-1 text-sm text-ink-muted">{formatPrice(plan.price, plan.currency, language)} / {t(plan.interval === 'month' ? 'شهر' : 'سنة', language)}</p></div><div className="flex items-center gap-3"><button onClick={() => editPlan(plan)} className="text-sm font-semibold text-brand-ink underline">{t('تعديل', language)}</button><button onClick={() => togglePlan(plan)} className="text-sm font-semibold text-danger underline">{t(plan.isActive ? 'إيقاف الباقة' : 'تفعيل الباقة', language)}</button></div></article>)}</div></div>
    </section>
  </Container></main>, language);
}

type CheckoutResult = {
  kind: 'book' | 'subscription' | 'donation';
  status: string;
  recurring?: boolean;
  accessActive?: boolean;
  plan?: { name: string; translations?: PlanTranslations };
};

export function OrderThankYouPage() {
  return <CheckoutResultPage />;
}

export function CheckoutResultPage() {
  const [searchParams] = useSearchParams();
  const language = useSiteLanguage();
  const sessionId = searchParams.get('session_id');
  const { user, isLoading } = useStoryAuth();
  const { data: result, error, loading } = useRemote<CheckoutResult>(
    sessionId ? `/payments/session/${encodeURIComponent(sessionId)}` : ''
  );
  if (isLoading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (!user) return <Navigate to="/login" replace />;
  const paid = result?.status === 'paid' || result?.status === 'active' || result?.accessActive;

  return <SiteLayout><main><Container className="max-w-3xl py-14 sm:py-20">
    <span className={`grid h-14 w-14 place-items-center rounded-2xl ${paid ? 'bg-brand-soft text-brand-ink' : 'bg-gold-soft text-gold-ink'}`}>{paid ? <Check size={25} /> : <CreditCard size={24} />}</span>
    <h1 className="mt-6 text-3xl font-semibold leading-relaxed text-brand-ink">{paid ? 'تم تأكيد الدفع' : 'جارٍ تأكيد عملية الدفع'}</h1>
    {loading && <p className="mt-4 text-ink-muted">نتحقق من حالة الطلب الآمنة…</p>}
    {error && <div className="mt-5"><ErrorState message={error} /></div>}
    {result && <p className="mt-4 leading-8 text-ink-muted">{paid
      ? result.kind === 'book'
        ? 'استلمنا دفعتك، وسيصلك تأكيد الطلب على بريدك الإلكتروني.'
        : result.kind === 'donation'
          ? t(result.recurring ? 'شكرًا لدعمك؛ تم تسجيل تبرعك الشهري.' : 'شكرًا لدعمك؛ تم تسجيل تبرعك.', language)
        : <>{t('اشتراكك في', language)} {result.plan?.translations?.[language]?.name || (language === 'ar' ? result.plan?.name : t('اشتراك', language)) || t('باقة', language)} {t('فعّال الآن.', language)}</>
      : 'قد يستغرق تحديث الحالة لحظات بعد عودتك من بوابة الدفع.'}</p>}
    {!sessionId && <p className="mt-4 text-ink-muted">لم يتم العثور على رقم جلسة الدفع.</p>}
    <button onClick={() => window.location.reload()} className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-brand-on"><RefreshCw size={16} /> تحديث حالة الدفع</button>
    <Link to={result?.kind === 'book' ? '/books' : result?.kind === 'donation' ? '/donations' : '/account'} className="mr-3 mt-7 inline-flex font-semibold text-brand-ink">متابعة</Link>
  </Container></main></SiteLayout>;
}

export function MembershipPage() {
  const { user } = useStoryAuth();
  return <SiteLayout><main><Container className="max-w-3xl py-14 sm:py-20">
    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand-ink"><Star size={25} /></span>
    <h1 className="mt-6 text-3xl font-semibold leading-relaxed text-brand-ink">اقرأ الحكاية كاملة</h1>
    <p className="mt-4 leading-8 text-ink-muted">بعض الأجزاء متاحة للمشتركين. يمكنك الاطلاع على الباقات المتاحة وإدارة حالة اشتراكك من حسابك.</p>
    {user ? <Link to="/account" className="mt-7 inline-flex rounded-full bg-brand px-6 py-3 font-semibold text-brand-on">عرض حالة اشتراكي</Link> : <Link to="/register" className="mt-7 inline-flex rounded-full bg-brand px-6 py-3 font-semibold text-brand-on">إنشاء حساب</Link>}
    <p className="mt-5 text-sm text-ink-muted">الأجزاء المجانية تبقى متاحة دائمًا وفق سياسة النشر.</p>
  </Container></main></SiteLayout>;
}

export function ReturnsPolicyRoute() {
  return <SiteLayout><main><Container><ReturnsPolicyPage /></Container></main></SiteLayout>;
}

export function PolicyPage({ kind }: { kind: 'overview' | 'sources' | 'depiction' }) {
  const language = useSiteLanguage();
  const managedCode = kind === 'sources' ? 'sources' : kind === 'depiction' ? 'representation' : '';
  const { data: managedPolicy } = useRemote<{ title: string; body: string }>(
    managedCode ? `/policy/${managedCode}` : ''
  );
  const content = {
    overview: {
      title: 'منهجنا في صناعة الحكاية',
      intro: 'نريد لكل حكاية أن تجمع بين المتعة والأمانة واحترام القيم الإسلامية.',
      sections: [
        ['التوثيق قبل النشر', 'نراجع المصادر ونوضح للقارئ ما إذا كان المحتوى نصًا شرعيًا أو رواية تاريخية أو حكاية مستوحاة.'],
        ['مراجعة بشرية', 'تمر المواد بمراجعة تحريرية وشرعية مناسبة قبل نشرها، ولا تُعرض المسودات للقراء.'],
        ['احترام الأسرة', 'نراعي الفئة العمرية، ونوضح طبيعة المحتوى، ونتجنب المشاهد أو الصور غير الملائمة.']
      ]
    },
    sources: {
      title: 'المصادر والتوثيق',
      intro: 'الأمانة العلمية أساس مكتبتنا. نبيّن مصدر كل قصة ونفرّق بين الرواية الثابتة والسرد الإبداعي.',
      sections: [
        ['القرآن الكريم', 'تُذكر السورة والآيات عند الاستناد إلى نص قرآني، ويظل النص القرآني محفوظًا عن إعادة الصياغة.'],
        ['السنة النبوية', 'نذكر مرجع الحديث ودرجة صحته كلما توفرت، ولا ننسب حديثًا إلى النبي ﷺ بلا مرجع.'],
        ['التاريخ والحكايات المستوحاة', 'نميّز بين الوقائع التاريخية والحوار أو التفاصيل السردية المضافة للتقريب، ونوثّق المصادر المتاحة.']
      ]
    },
    depiction: {
      title: 'سياسة التصوير والتمثيل',
      intro: 'نلتزم بإنتاج بصري يحفظ حرمة الشخصيات المقدسة ويحترم اختلاف الآراء والمجتمعات الإسلامية.',
      sections: [
        ['عدم تجسيد الأنبياء', 'لا نُظهر الأنبياء في صورة أو رسم أو تمثيل مباشر، ولا نستخدم الصوت أو الصورة للإيحاء بتجسيدهم.'],
        ['الصحابة والشخصيات الدينية', 'نتجنب تجسيد الصحابة والشخصيات ذات المكانة الدينية بصريًا، ونستخدم بدائل مثل الخط والزخرفة والمناظر الرمزية.'],
        ['مراجعة المواد', 'يجب تأكيد الالتزام بهذه السياسة ومراجعة الصور والصوت والفيديو قبل النشر. يمكن للزائر الإبلاغ عن مادة غير ملائمة.']
      ]
    }
  }[kind];

  if (managedPolicy?.title && managedPolicy.body) {
    return <SiteLayout><main><Container className="max-w-4xl py-12 sm:py-16">
      <p className="text-sm font-semibold tracking-widest text-brand-ink">{t('قيمنا ومعاييرنا', language)}</p>
      <h1 className="mt-3 text-3xl font-semibold leading-relaxed text-brand-ink sm:text-4xl">{managedPolicy.title}</h1>
      <div className="mt-7 whitespace-pre-wrap rounded-2xl border border-line bg-surface p-6 leading-8 text-ink">{managedPolicy.body}</div>
    </Container></main></SiteLayout>;
  }
  return <SiteLayout><main><Container className="max-w-4xl py-12 sm:py-16">
    <p className="text-sm font-semibold tracking-widest text-brand-ink">قيمنا ومعاييرنا</p>
    <h1 className="mt-3 text-3xl font-semibold leading-relaxed text-brand-ink sm:text-4xl">{content.title}</h1>
    <p className="mt-5 text-lg leading-9 text-ink-muted">{content.intro}</p>
    <div className="mt-9 space-y-4">{content.sections.map(([title, description], index) => <article key={title} className="rounded-2xl border border-line bg-surface p-6 sm:p-7"><div className="flex items-start gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft font-semibold text-brand-ink">{String(index + 1).padStart(2, '0')}</span><div><h2 className="text-lg font-semibold text-brand-ink">{title}</h2><p className="mt-2 leading-8 text-ink-muted">{description}</p></div></div></article>)}</div>
    <div className="mt-8 flex items-center gap-2 rounded-2xl bg-brand-soft p-5 text-sm leading-7 text-brand-ink"><ShieldCheck size={20} className="shrink-0" /> نواصل تحسين هذه المعايير مع المراجعين والمتخصصين، ونراجع كل مادة قبل إتاحتها للقراء.</div>
  </Container></main></SiteLayout>;
}
