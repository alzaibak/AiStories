import { ReturnsPolicyPage, returnPolicyShortLine, useReturnPolicy } from '@/pages/stories/ReturnsPolicyPage';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
  LockKeyhole, LogIn, MapPin, Menu, Moon, RefreshCw, Search, ShieldCheck, Sun,
  Gift, ShoppingBag, Sparkles, Star, UserRound, X, Share2, Award, Flame, Trophy
} from 'lucide-react';
import { pluralItems, pluralMinutes, pluralParts } from '@/lib/plural';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { ApiError, api, type ReaderSubscription } from '@/lib/api';
import { translateText, translateTree } from '@/lib/localization';
import { localizeAuthError } from '@/lib/authErrors';
import { useSiteTheme } from '@/contexts/SiteThemeContext';
import { BrandMark } from '@/components/ui/BrandMark';
import { buttonClasses } from '@/components/ui/Button';
import { StoryCard } from '@/components/ui/StoryCard';

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
  illustrationImage?: string | null;
  illustrationAlt?: string | null;
  isFree?: boolean;
  accessible?: boolean;
};

type ReadingProgressEntry = {
  storyId: number;
  completedParts: number[];
  lastPartId?: number | null;
  lastReadAt?: string | null;
};

type CompletionBadge = {
  id: number;
  name: string;
  points: number;
  iconKey?: string;
  currentValue?: number;
  targetValue?: number;
  ratio?: number;
};

type CompletionPayload = {
  completedParts: number;
  totalParts: number;
  pointsGained: number;
  totalPoints: number;
  level: { level: number; name: string; points: number; pointsToNext: number; progressPercent: number };
  streak: { current: number; best: number };
  newBadges: CompletionBadge[];
  nextBadges: CompletionBadge[];
};

type ProfileSummary = {
  user: { points: number };
  level: { level: number; name: string; points: number; pointsToNext: number; progressPercent: number };
  stats: { storiesCompleted: number; currentStreak: number; badgesEarned: number; badgesTotal: number };
  streak: { current: number; best: number };
  nextBadges: Array<CompletionBadge & { progress: { currentValue: number; targetValue: number; ratio: number } }>;
};

function retentionText(language: SiteLanguage) {
  if (language === 'en') {
    return {
      finished: 'You finished this story',
      proof: (done: number, total: number) => `${done} of ${total} parts completed`,
      points: 'Points',
      streak: 'Reading streak',
      level: 'Level',
      nextBadge: 'Next badge progress',
      reward: 'Your reading reward',
      because: (title: string) => `Because you read ${title}`,
      discover: 'More stories for you',
      quiz: 'Test your understanding',
      nextStory: 'Next story',
      share: 'Share the story',
      choose: 'Choose a story',
      back: 'Back to the story',
      badgeProgress: (value: number, target: number) => `${value} / ${target}`,
      days: (count: number) => `${count} day${count === 1 ? '' : 's'}`
    };
  }
  if (language === 'fr') {
    return {
      finished: 'Vous avez terminé cette histoire',
      proof: (done: number, total: number) => `${done} parties sur ${total} terminées`,
      points: 'Points',
      streak: 'Série de lecture',
      level: 'Niveau',
      nextBadge: 'Progression du prochain badge',
      reward: 'Votre récompense de lecture',
      because: (title: string) => `Parce que vous avez lu ${title}`,
      discover: 'D’autres histoires pour vous',
      quiz: 'Testez votre compréhension',
      nextStory: 'Histoire suivante',
      share: 'Partager l’histoire',
      choose: 'Choisir une histoire',
      back: 'Retour à l’histoire',
      badgeProgress: (value: number, target: number) => `${value} / ${target}`,
      days: (count: number) => `${count} jour${count === 1 ? '' : 's'}`
    };
  }
  return {
    finished: 'أكملت هذه الحكاية',
    proof: (done: number, total: number) => `أتممت ${done} من ${total} أجزاء`,
    points: 'النقاط',
    streak: 'سلسلة القراءة',
    level: 'المستوى',
    nextBadge: 'تقدّم الشارة القادمة',
    reward: 'مكافأة القراءة',
    because: (title: string) => `لأنك قرأت ${title}`,
    discover: 'حكايات أخرى قد تناسبك',
    quiz: 'اختبر فهمك',
    nextStory: 'الحكاية التالية',
    share: 'شارك الحكاية',
    choose: 'اختر حكاية',
    back: 'العودة إلى الحكاية',
    badgeProgress: (value: number, target: number) => `${value} / ${target}`,
    days: (count: number) => `${count} ${count === 1 ? 'يوم' : 'أيام'}`
  };
}

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
  publishAt?: string;
  updatedAt?: string;
  collection?: { id: number; title: string; slug: string; isFree?: boolean };
  parts?: StoryPart[];
  hook?: string;
  heroImage?: string | null;
  socialImage?: string | null;
  coverAlt?: string;
  coverVariants?: Array<{ width: number; url: string }>;
  focalPoint?: { x: number; y: number } | null;
  imageCredit?: string;
  updatedAt?: string;
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
  coverImage?: string | null;
  bannerImage?: string | null;
  coverAltText?: string | null;
  bannerAltText?: string | null;
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
};

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
  bannerImage?: string | null;
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

  const path = location.pathname.replace(/^\/(fr|en|ar)(?=\/|$)/, '') || '/';
  const navItems: Array<{ href: string; label: string }> = [
    { href: '/stories', label: 'القصص' },
    { href: '/books', label: 'الكتب' },
    { href: '/pricing', label: 'الاشتراكات' },
    { href: '/events', label: 'الفعاليات' },
    { href: '/donations', label: 'ادعمنا' },
    { href: '/policy', label: 'منهجنا' }
  ];
  const isActive = (href: string) =>
    href === '/stories'
      ? path.startsWith('/stories') || path.startsWith('/collections')
      : path === href || path.startsWith(`${href}/`);

  const appearances: Array<{ value: 'light' | 'sepia' | 'dark'; label: string; Icon: typeof Sun }> = [
    { value: 'light', label: 'فاتح', Icon: Sun },
    { value: 'sepia', label: 'وضع ورقي', Icon: BookOpen },
    { value: 'dark', label: 'داكن', Icon: Moon }
  ];
  const currentAppearance = appearances.find((item) => item.value === theme) || appearances[0];
  const CurrentAppearanceIcon = currentAppearance.Icon;

  const iconButton = 'grid h-10 w-10 place-items-center rounded-full text-ink-muted transition hover:bg-surface-soft hover:text-ink';

  return (
    <header className="ds-glass sticky top-0 z-40 border-b border-line/80">
      <Container className="flex h-[var(--header-height)] items-center gap-2">
        <Link to="/" className="me-2 flex shrink-0 items-center gap-2.5" aria-label={`${t('حكايات إسلامية', language)} — ${t('الصفحة الرئيسية', language)}`}>
          <BrandMark size={40} />
          <span className="text-[1.0625rem] font-bold tracking-tight text-ink">{t('حكايات إسلامية', language)}</span>
        </Link>

        <nav className="ms-2 hidden items-center gap-0.5 xl:flex" aria-label={t('القائمة', language)}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-semibold transition ${
                isActive(item.href)
                  ? 'bg-brand-soft text-brand-ink'
                  : 'text-ink-muted hover:bg-surface-soft hover:text-ink'
              }`}
            >
              {t(item.label, language)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <Link to="/cart" className={`${iconButton} relative`} aria-label={t('سلة المشتريات', language)}>
            <ShoppingBag size={19} strokeWidth={1.9} />
            {cartCount > 0 && <span className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-on">{cartCount > 99 ? '99+' : cartCount}</span>}
          </Link>
          <button type="button" className={iconButton} onClick={() => setSearchOpen(true)} aria-label={t('بحث', language)}>
            <Search size={19} strokeWidth={1.9} />
          </button>

          <div className="relative hidden sm:block">
            <button
              type="button"
              className={`${iconButton} flex w-auto items-center gap-1 px-2.5`}
              aria-label={t('المظهر', language)}
              aria-expanded={openMenu === 'theme'}
              aria-haspopup="menu"
              onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
            >
              <CurrentAppearanceIcon size={19} strokeWidth={1.9} />
              <ChevronDown size={13} aria-hidden="true" />
            </button>
            {openMenu === 'theme' && (
              <>
                <button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenMenu(null)} />
                <div role="menu" aria-label={t('المظهر', language)} className="ds-pop absolute end-0 top-full z-40 mt-2 w-44 rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                  {appearances.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={theme === value}
                      onClick={() => { setTheme(value); setOpenMenu(null); }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        theme === value ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft hover:text-ink'
                      }`}
                    >
                      <Icon size={16} aria-hidden="true" />
                      {t(label, language)}
                      {theme === value && <Check size={14} className="ms-auto" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </>
            )}
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
              <span className="text-xs font-bold uppercase">{language}</span>
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
                  className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface ps-1 pe-3 text-sm font-semibold text-ink transition hover:border-line-strong"
                  aria-expanded={openMenu === 'profile'}
                  aria-haspopup="menu"
                  onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-bold uppercase text-brand-on">
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
                <Link to="/stories" className={buttonClasses({ size: 'sm', className: 'px-4' })}>
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
                  {t(item.label, language)}
                  <ArrowLeft size={16} className="text-ink-faint ltr:rotate-180" aria-hidden="true" />
                </Link>
              ))}
            </nav>

            <div className="rounded-3xl border border-line bg-surface p-4">
              <p className="text-xs font-bold text-ink-faint">{t('المظهر', language)}</p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {appearances.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={theme === value}
                    onClick={() => setTheme(value)}
                    className={`flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs font-semibold transition ${
                      theme === value ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line text-ink-muted'
                    }`}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {t(label, language)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-surface p-4">
              <p className="text-xs font-bold text-ink-faint">{t('اللغة', language)}</p>
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#0a1712]/45 px-4 pt-24 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('بحث في الحكايات', language)}>
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
  const linkClass = 'text-sm text-ink-muted transition hover:text-brand-ink';
  const columnTitle = 'text-xs font-bold tracking-wide text-ink-faint';

  return (
    <footer className="mt-[var(--space-section)] border-t border-line bg-surface-soft/50">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Link to="/" className="flex w-fit items-center gap-2.5" aria-label={t('الصفحة الرئيسية', language)}>
            <BrandMark size={38} />
            <span className="text-base font-bold text-ink">{t('حكايات إسلامية', language)}</span>
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
                  className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-bold uppercase transition ${
                    language === item.code ? 'bg-brand-soft text-brand-ink' : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  {item.code}
                </RouterLink>
              ))}
            </nav>
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1" role="group" aria-label={t('المظهر', language)}>
              {([['light', Sun, 'فاتح'], ['sepia', BookOpen, 'وضع ورقي'], ['dark', Moon, 'داكن']] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={theme === value}
                  aria-label={t(label, language)}
                  title={t(label, language)}
                  className={`grid h-7 w-7 place-items-center rounded-full transition ${
                    theme === value ? 'bg-brand-soft text-brand-ink' : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
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
  return (
    <div className="site-root">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-brand-on"
      >
        {t('تخطي إلى المحتوى', language)}
      </a>
      <Header />
      <div id="main-content">{translateTree(children, language)}</div>
      <Footer />
    </div>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-bold tracking-widest text-emerald-700">{eyebrow}</p>}
        <h2 className="text-2xl font-extrabold text-emerald-950 sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function StoryArtwork({ story, className = '', imageOverride, focalPoint }: {
  story: Pick<StorySummary, 'title' | 'cover' | 'coverAlt' | 'coverVariants'>;
  className?: string;
  imageOverride?: string | null;
  focalPoint?: { x: number; y: number } | null;
}) {
  const source = imageOverride || story.cover;
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-[#b4834f] ${className}`}>
      {source && <img
        src={source}
        srcSet={story.coverVariants?.length ? story.coverVariants.map((variant) => `${variant.url} ${variant.width}w`).join(', ') : undefined}
        sizes="(min-width: 1024px) 40vw, 100vw"
        alt={story.coverAlt || ''}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: focalPoint ? `${focalPoint.x}% ${focalPoint.y}%` : '50% 40%' }}
        loading="eager"
      />}
      {!source && (
        <>
          <div className="absolute -left-8 -top-10 h-48 w-48 rounded-full border border-white/15" />
          <div className="absolute -left-2 -top-4 h-36 w-36 rounded-full border border-white/15" />
          <Sparkles className="absolute bottom-5 left-5 text-amber-200/80" size={20} />
        </>
      )}
      {!source && <span dir="auto" className="absolute inset-x-5 bottom-5 line-clamp-3 text-xl font-bold leading-9 text-white">{story.title}</span>}
    </div>
  );
}

function BookCard({ book }: { book: BookSummary }) {
  const language = useSiteLanguage();
  return (
    <Link to={`/books/${book.slug}`} className="group overflow-hidden rounded-3xl border border-emerald-950/10 bg-white transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[1.2] overflow-hidden bg-[#efe8d8]">
        {book.cover ? <img src={book.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" /> : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-amber-100 via-[#e5d7b8] to-emerald-100">
            <BookOpen size={46} strokeWidth={1.2} className="text-emerald-800/70" />
          </div>
        )}
        <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-emerald-900">{t(book.format === 'ebook' ? 'كتاب إلكتروني' : 'نسخة مطبوعة', language)}</span>
      </div>
      <div className="p-5">
        <h3 className="font-bold text-emerald-950">{book.title}</h3>
        {book.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{book.description}</p>}
        <p className="mt-4 font-extrabold text-emerald-800">{formatPrice(book.price, book.currency, language)}</p>
      </div>
    </Link>
  );
}

function formatPrice(price: number | string, currency: string, language: SiteLanguage = 'ar') {
  return new Intl.NumberFormat(language, { style: 'currency', currency }).format(Number(price));
}

function remainingUntil(endsAt?: string | null) {
  if (!endsAt) return null;
  const distance = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(distance) || distance <= 0) return null;
  return {
    days: Math.floor(distance / 86_400_000),
    hours: Math.floor((distance % 86_400_000) / 3_600_000),
    minutes: Math.floor((distance % 3_600_000) / 60_000),
    seconds: Math.floor((distance % 60_000) / 1_000)
  };
}

function useRemainingTime(endsAt?: string | null) {
  const [remaining, setRemaining] = useState(() => remainingUntil(endsAt));
  useEffect(() => {
    setRemaining(remainingUntil(endsAt));
    if (!endsAt) return;
    const timer = window.setInterval(() => setRemaining(remainingUntil(endsAt)), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  return remaining;
}

function HeroPanelSkeleton() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute -inset-5 rounded-[3rem] border border-amber-100/20" />
      <div className="relative min-h-[30rem] w-full overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[#0d3026] via-[#155641] to-[#8b6b36] shadow-2xl">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 18% 12%, rgba(243,227,184,.45) 0, transparent 34%), radial-gradient(circle at 88% 82%, rgba(0,0,0,.35) 0, transparent 42%)' }} />
        <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full border border-amber-100/15" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full border border-amber-100/15" />
        <div className="pointer-events-none absolute inset-7 rounded-[2rem] border border-amber-100/10" />
        <div className="relative flex h-full min-h-[30rem] animate-pulse flex-col justify-between p-7 sm:p-9">
          <div className="flex items-center justify-between gap-3">
            <div className="h-[58px] w-[58px] rounded-2xl border border-white/10 bg-white/10" />
            <div className="h-3 w-32 rounded-full bg-white/10" />
          </div>
          <div>
            <div className="mb-5 h-px w-16 bg-amber-100/20" />
            <div className="h-9 w-4/5 rounded-xl bg-white/10" />
            <div className="mt-4 h-4 w-full rounded bg-white/10" />
            <div className="mt-2 h-4 w-2/3 rounded bg-white/10" />
            <div className="mt-6 flex gap-2">
              <div className="h-7 w-20 rounded-full bg-white/10" />
              <div className="h-7 w-20 rounded-full bg-white/10" />
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
      <div className="absolute -inset-5 rounded-[3rem] border border-amber-100/20" aria-hidden="true" />
      <div className="relative aspect-[4/4.5] overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[#0d3026] via-[#155641] to-[#8b6b36] shadow-2xl">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 18% 12%, rgba(243,227,184,.45) 0, transparent 34%), radial-gradient(circle at 88% 82%, rgba(0,0,0,.35) 0, transparent 42%)' }} />
        <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full border border-amber-100/15" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full border border-amber-100/15" />
        <div className="pointer-events-none absolute inset-7 rounded-[2rem] border border-amber-100/10" />
        <div className="relative flex h-full flex-col justify-between p-7 sm:p-9">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-2xl border border-white/15 bg-white/10 p-2 backdrop-blur"><BrandMark size={42} /></span>
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-100/70">{t('مكتبة الحكايات', language)}</span>
          </div>
          <div>
            <div className="mb-5 h-px w-16 bg-amber-100/40" />
            <h2 className="max-w-xs text-3xl font-black leading-[1.45] text-white">{t('حكاية في كل مساء', language)}</h2>
            <p className="mt-4 max-w-sm leading-8 text-emerald-50/75">{t('قصص موثّقة، بلغة هادئة، لكل أفراد الأسرة.', language)}</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-amber-50/85">
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">{t('مراجعة علمية', language)}</span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">{t('قراءة قصيرة', language)}</span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">{t('محتوى عائلي', language)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const countdownLabels: Record<SiteLanguage, Record<'days' | 'hours' | 'minutes' | 'seconds', [string, string, string]>> = {
  ar: {
    days: ['يوم', 'يومان', 'أيام'],
    hours: ['ساعة', 'ساعتان', 'ساعات'],
    minutes: ['دقيقة', 'دقيقتان', 'دقائق'],
    seconds: ['ثانية', 'ثانيتان', 'ثوانٍ']
  },
  en: {
    days: ['day', 'days', 'days'],
    hours: ['hour', 'hours', 'hours'],
    minutes: ['minute', 'minutes', 'minutes'],
    seconds: ['second', 'seconds', 'seconds']
  },
  fr: {
    days: ['jour', 'jours', 'jours'],
    hours: ['heure', 'heures', 'heures'],
    minutes: ['minute', 'minutes', 'minutes'],
    seconds: ['seconde', 'secondes', 'secondes']
  }
};

function countdownUnitLabel(value: number, unit: keyof typeof countdownLabels.ar, language: SiteLanguage) {
  const forms = countdownLabels[language]?.[unit] || countdownLabels.ar[unit];
  if (language === 'ar') {
    if (value === 1) return forms[0];
    if (value === 2) return forms[1];
    if (value >= 3 && value <= 10) return forms[2];
    return forms[0];
  }
  return value === 1 ? forms[0] : forms[1];
}

function HeroMysteryBoxCard({ box, language }: { box: MysteryBoxHeader; language: SiteLanguage }) {
  const countdown = useRemainingTime(box.showCountdownInHeader ? box.endsAt : null);
  const countdownUnits = [
    { value: countdown?.days ?? 0, unit: 'days' as const },
    { value: countdown?.hours ?? 0, unit: 'hours' as const },
    { value: countdown?.minutes ?? 0, unit: 'minutes' as const },
    { value: countdown?.seconds ?? 0, unit: 'seconds' as const }
  ];

  return (
    <div className="relative">
      <div className="absolute -inset-3 rounded-[2rem] border border-[#D8C08A]/20 sm:-inset-4" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[1.65rem] border border-[#D8C08A]/35 bg-[#FBF7EF] shadow-[0_30px_70px_-38px_rgba(0,0,0,0.75)]">
        <div className="relative h-52 overflow-hidden bg-[#123B30] sm:h-60">
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(155deg, #194A3C 0%, #0B2A23 100%)' }} aria-hidden="true" />
          <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(#EBDDBF 0.8px, transparent 0.8px)', backgroundSize: '18px 18px' }} aria-hidden="true" />
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-[#D8C08A]/20" aria-hidden="true" />
          <div className="absolute -right-6 -top-10 h-40 w-40 rounded-full border border-[#D8C08A]/15" aria-hidden="true" />
          <div className="absolute inset-0 grid place-items-center text-[#D8C08A]/50" aria-hidden="true">
            <Gift size={44} strokeWidth={1.1} />
          </div>
          {box.bannerImage && (
            <img
              src={box.bannerImage}
              alt={box.label}
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#071C17]/55 to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#071C17]/45 to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4 sm:p-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F4EBDD]/30 bg-[#0B2A23]/60 px-3 py-1.5 text-[11px] font-semibold text-[#F4EBDD] backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C9DDBE]" aria-hidden="true" />
              {t('متاح الآن', language)}
            </span>
            {box.almostSoldOut && (
              <span className="rounded-full border border-[#D8C08A]/50 bg-[#F4EBDD]/95 px-3 py-1.5 text-[11px] font-bold text-[#6B4E1F]">{t('اقترب النفاد', language)}</span>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8A6F3E]">
            <span aria-hidden="true">{box.icon || '🎁'}</span>
            <span className="line-clamp-1">{box.seasonLabel || t('صندوق الغموض', language)}</span>
          </div>
          <h2 className="font-editorial mt-2 line-clamp-2 text-[1.7rem] leading-[1.35] text-[#12352B] sm:text-3xl">{box.label}</h2>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2 border-b border-[#E3D8C3] pb-4">
            <span className="text-2xl font-bold tracking-tight text-[#12352B]">{formatPrice(Number(box.price.amount), box.price.currency, language)}</span>
            {box.price.tier === 'early_bird' && (
              <span className="rounded-full bg-[#EFE3CB] px-2.5 py-1 text-[10px] font-bold text-[#6B4E1F]">{t('سعر مبكر', language)}</span>
            )}
            <span className="ms-auto text-xs text-[#7A6A52]">
              {box.itemCount > 0 ? pluralItems(box.itemCount, language) : t('صندوق الغموض', language)}
              {typeof box.remaining === 'number' && ` · ${t('بقي', language)} ${box.remaining}`}
            </span>
          </div>

          {box.showCountdownInHeader && countdown && (
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A7A60]">{t('ينتهي خلال', language)}</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {countdownUnits.map((unit) => (
                  <div key={unit.unit} className="rounded-lg border border-[#E1D6C1] bg-[#F4EDE0] px-1 py-2 text-center">
                    <p className="font-editorial text-lg leading-none text-[#183F34]">{String(unit.value).padStart(2, '0')}</p>
                    <p className="mt-1 text-[9px] font-medium text-[#7A6A52]">{countdownUnitLabel(unit.value, unit.unit, language)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <span className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#123B30] px-5 py-3 text-sm font-semibold text-[#F6EFE3]">
            <Gift size={16} aria-hidden="true" />
            {t('قريبًا', language)}
          </span>
          <p className="mt-3 text-center text-[11px] text-[#8A7A60]">{t('محتوى عائلي', language)}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  const language = useSiteLanguage();
  return <div className="grid min-h-48 place-items-center text-sm text-slate-500" role="status">{t('جارٍ تحميل المحتوى…', language)}</div>;
}

function ErrorState({ message }: { message: string }) {
  const language = useSiteLanguage();
  return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-800" role="alert">{t(message, language)}</div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-emerald-950/20 bg-white/70 px-6 py-12 text-center text-slate-600">{children}</div>;
}

export function LandingPage() {
  const language = useSiteLanguage();
  const { data: stories, loading, error } = useRemote<StorySummary[]>('/stories?limit=4');
  const { data: books } = useRemote<BookSummary[]>('/books?limit=3');
  const { data: activeMysteryBox, loading: mysteryBoxLoading } = useRemote<{ box: MysteryBoxHeader | null }>(`/mystery-box/active?lang=${language}`);
  const mysteryBox = activeMysteryBox?.box || null;

  return (
    <SiteLayout>
      <main>
        <section className="relative overflow-hidden bg-[#0D2E26] text-[#F4EBDD]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.16]" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(#E8D9BC 0.7px, transparent 0.7px)', backgroundSize: '22px 22px' }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#D8C08A]/25" aria-hidden="true" />
          <Container className="relative grid min-h-[580px] gap-14 py-16 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#D8C08A]/40 bg-[#F4EBDD]/[0.04] px-4 py-2 text-sm text-[#E6D8BE]">
                <Sparkles size={15} /> حكايات من نور الهداية
              </span>
              <h1 className="font-editorial mt-7 max-w-2xl text-4xl leading-[1.5] tracking-tight text-[#F6EFE3] sm:text-5xl lg:text-[3.6rem]">
                قصصٌ تُروى… <span className="text-[#D8C08A]">وقيمٌ تبقى.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#D5DDD6] sm:text-lg">
                عِش مع قصص الأنبياء والصحابة ومحطات التاريخ الإسلامي، في تجربة قراءة ممتعة وموثوقة لكل أفراد الأسرة.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/stories" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#EFE3CB] px-6 py-3.5 text-sm font-bold text-[#10352B] shadow-[0_12px_30px_-18px_rgba(0,0,0,0.6)] transition-colors hover:bg-[#F7F0E2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EFE3CB]">
                  {t('ابدأ القراءة', language)}
                  <ChevronLeft size={18} />
                </Link>
                <a href="#start-journey" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#F4EBDD]/30 px-6 py-3.5 text-sm font-semibold text-[#F4EBDD] transition-colors hover:border-[#F4EBDD]/50 hover:bg-[#F4EBDD]/5">
                  {t('كيف تعمل الحكايات؟', language)}
                </a>
              </div>
              <p className="mt-4 text-sm text-[#BFCFC5]">
                {t('مجاني للبدء', language)} · {t('أجزاء قصيرة', language)} · {t('تقدّمك محفوظ', language)}
              </p>
              <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-[#C6D4CB]">
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
                  ? <HeroMysteryBoxCard box={mysteryBox} language={language} />
                  : <HeroBrandPanel language={language} />}
            </div>
          </Container>
        </section>

        <section id="start-journey" className="scroll-mt-24 border-b border-line bg-surface-soft py-14 sm:py-20">
          <Container>
            <div className="max-w-2xl">
              <p className="text-sm font-bold tracking-[0.18em] text-brand-ink">{t('ابدأ من هنا', language)}</p>
              <h2 className="mt-3 text-2xl font-black text-ink sm:text-3xl">{t('ثلاث خطوات، وحكاية تبدأ', language)}</h2>
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
                    <span className="text-sm font-black text-ink-faint">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="text-lg font-bold text-ink">{t(step.title, language)}</h3>
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
          <SectionHeading eyebrow="اختر رحلتك" title="حكايات لكل قارئ" action={<Link to="/stories" className="text-sm font-bold text-emerald-800 hover:text-emerald-600">كل القصص <ChevronLeft className="inline" size={17} /></Link>} />
          {loading && <LoadingState />}
          {error && <ErrorState message={error} />}
          {!loading && !error && !stories?.length && <EmptyState>نعمل على تجهيز أولى الحكايات المنشورة. عُد إلينا قريبًا.</EmptyState>}
          {!!stories?.length && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{stories.map((story) => <StoryCard key={story.id} story={story} />)}</div>}
        </Container>

        <section className="bg-[#f3f1e9] py-16 sm:py-20">
          <Container>
            <SectionHeading eyebrow="مكتبة البيت" title="كتب تجمع العائلة" action={<Link to="/books" className="text-sm font-bold text-emerald-800">زيارة المتجر <ChevronLeft className="inline" size={17} /></Link>} />
            {!books?.length ? <EmptyState>قريبًا، ستجد هنا كتبًا مختارة للصغار والكبار.</EmptyState> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{books.map((book) => <BookCard key={book.id} book={book} />)}</div>}
            <p className="mt-5 text-center text-xs text-slate-500">استعرض الكتب ثم تابع إلى صفحة الكتاب لإتمام الدفع الآمن عند تفعيل إعدادات Stripe.</p>
          </Container>
        </section>

        <Container className="py-16 sm:py-20">
          <div className="grid gap-6 rounded-[2rem] bg-emerald-900 p-8 text-white sm:grid-cols-[1fr_auto] sm:items-center sm:p-12">
            <div>
              <p className="text-sm font-bold text-amber-200">مساحة آمنة للعائلة</p>
              <h2 className="mt-3 text-2xl font-extrabold">تعلّم، تأمّل، وشارك الحكاية</h2>
              <p className="mt-3 max-w-2xl leading-7 text-emerald-50/75">أنشئ حسابك لمتابعة تقدّمك والاطّلاع على حالة اشتراكك، واستمتع بمحتوى يتدرج معك خطوة بخطوة.</p>
            </div>
            <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-200 px-6 py-3 font-bold text-emerald-950 hover:bg-amber-100">إنشاء حساب مجاني <ChevronLeft size={17} /></Link>
          </div>
        </Container>
      </main>
    </SiteLayout>
  );
}

export function StoriesPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const { data: stories, loading, error } = useRemote<StorySummary[]>('/stories?limit=100');
  const { data: collections } = useRemote<CollectionSummary[]>('/collections');
  const { user } = useStoryAuth();
  const { data: readingProgress } = useRemote<Array<{ storyId: number; completedParts: number[] }>>(user ? '/reading-progress' : '');
  const progressFor = (story: StorySummary) => {
    const completed = readingProgress?.find((entry) => entry.storyId === story.id)?.completedParts.length || 0;
    const total = story.parts?.length || 0;
    return total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  };
  const filteredStories = useMemo(() => stories?.filter((story) => {
    const haystack = `${story.title} ${story.summary} ${story.hook || ''} ${story.collection?.title || ''}`.toLocaleLowerCase('ar');
    const matchesSearch = haystack.includes(search.trim().toLocaleLowerCase('ar'));
    const matchesCollection = collectionFilter === 'all' || String(story.collectionId) === collectionFilter;
    const matchesType = typeFilter === 'all' || story.type === typeFilter;
    const matchesAge = ageFilter === 'all' || (story.ageGroup || 'all') === ageFilter;
    const matchesAccess = accessFilter === 'all' || (accessFilter === 'free' ? story.isFree : !story.isFree);
    return matchesSearch && matchesCollection && matchesType && matchesAge && matchesAccess;
  }) || [], [stories, search, collectionFilter, typeFilter, ageFilter, accessFilter]);
  const language = useSiteLanguage();
  const recommended = stories?.find((story) => story.isStoryOfTheWeek) || stories?.[0];
  const recommendedMinutes = recommended?.parts?.reduce((total, part) => total + (part.estimatedReadingMinutes || 0), 0) || 0;
  const continueStories = (stories || []).filter((story) => progressFor(story) > 0 && progressFor(story) < 100);
  const newStories = [...(stories || [])]
    .filter((story) => story.publishAt && Date.now() - new Date(story.publishAt).getTime() < 14 * 24 * 60 * 60 * 1000)
    .slice(0, 4);
  const filterSelect = 'rounded-full border border-emerald-950/15 bg-white px-4 py-2 text-sm font-semibold text-emerald-900';

  return (
    <SiteLayout>
      <main><Container className="py-12 sm:py-16">
        <p className="text-sm font-bold tracking-widest text-emerald-700">مكتبة الحكايات</p>
        <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><h1 className="text-3xl font-black text-emerald-950 sm:text-4xl">اختر حكايتك القادمة</h1><p className="mt-3 text-slate-600">قصص موثقة، مقسمة إلى أجزاء قصيرة تناسب وقتك.</p></div>
          <label className="flex h-12 w-full items-center gap-3 rounded-full border border-emerald-950/15 bg-white px-4 sm:max-w-sm">
            <Search size={18} className="text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن قصة أو موضوع" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" aria-label="ابحث عن قصة" />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label={t('تصفية الحكايات', language)}>
          <select aria-label={t('المجموعة', language)} value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)} className={filterSelect}>
            <option value="all">{t('كل المجموعات', language)}</option>
            {(collections || []).map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
          </select>
          <select aria-label={t('النوع', language)} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={filterSelect}>
            <option value="all">{t('كل الأنواع', language)}</option><option value="quran">{t('من القرآن الكريم', language)}</option><option value="sunnah">{t('من السنة النبوية', language)}</option><option value="history">{t('تاريخية', language)}</option><option value="new">{t('مستوحاة', language)}</option>
          </select>
          <select aria-label={t('الفئة العمرية', language)} value={ageFilter} onChange={(event) => setAgeFilter(event.target.value)} className={filterSelect}>
            <option value="all">{t('كل الأعمار', language)}</option><option value="kids">{t('الأطفال', language)}</option><option value="teens">{t('اليافعون', language)}</option><option value="adults">{t('البالغون', language)}</option>
          </select>
          <select aria-label={t('الوصول', language)} value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)} className={filterSelect}>
            <option value="all">{t('الكل', language)}</option><option value="free">{t('مجاني', language)}</option><option value="premium">{t('للمشتركين', language)}</option>
          </select>
          {(search || collectionFilter !== 'all' || typeFilter !== 'all' || ageFilter !== 'all' || accessFilter !== 'all') && <button type="button" onClick={() => { setSearch(''); setCollectionFilter('all'); setTypeFilter('all'); setAgeFilter('all'); setAccessFilter('all'); }} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-semibold text-slate-600">{t('مسح الفلاتر', language)}</button>}
        </div>
        {!search && recommended && (
          <div className="mt-8">
            <StoryCard story={recommended} language={language} variant="featured" progress={progressFor(recommended)} />
            {recommendedMinutes > 0 && <p className="mt-2 text-xs font-semibold text-ink-muted">{pluralMinutes(recommendedMinutes, language)} · {pluralParts(recommended.parts?.length || 0, language)}</p>}
          </div>
        )}
        {!!continueStories.length && !search && (
          <section className="mt-12">
            <div className="flex items-end justify-between"><h2 className="text-2xl font-black text-ink">{t('تابع القراءة', language)}</h2><span className="text-sm text-ink-muted">{continueStories.length}</span></div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{continueStories.slice(0, 3).map((story) => <StoryCard key={story.id} story={story} language={language} progress={progressFor(story)} />)}</div>
          </section>
        )}
        {!!newStories.length && !search && (
          <section className="mt-12">
            <h2 className="text-2xl font-black text-ink">{t('جديد هذا الأسبوع', language)}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{newStories.map((story) => <StoryCard key={story.id} story={story} language={language} progress={progressFor(story)} />)}</div>
          </section>
        )}
        {!!collections?.length && <div className="mt-9 flex flex-wrap gap-2">{collections.map((collection) => <a key={collection.id} href={`#collection-${collection.id}`} className="rounded-full border border-emerald-950/15 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:border-emerald-700">{collection.title}</a>)}</div>}
        {loading && <LoadingState />}
        {error && <div className="mt-8"><ErrorState message={error} /></div>}
        {!loading && !error && !filteredStories.length && <div className="mt-8"><EmptyState>{search ? 'لا توجد حكايات تطابق بحثك.' : 'لا توجد حكايات منشورة حتى الآن.'}</EmptyState></div>}
        {!!filteredStories.length && (
          <div className="mt-10 space-y-12">
            {collections?.length ? collections.map((collection) => {
              const collectionStories = filteredStories.filter((story) => story.collectionId === collection.id);
              if (!collectionStories.length) return null;
              return <section id={`collection-${collection.id}`} key={collection.id}><SectionHeading eyebrow="مجموعة قصصية" title={collection.title} /><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{collectionStories.map((story) => <StoryCard key={story.id} story={story} language={language} progress={progressFor(story)} />)}</div></section>;
            }) : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredStories.map((story) => <StoryCard key={story.id} story={story} language={language} progress={progressFor(story)} />)}</div>}
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
    <Link to="/stories" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowUpLeft size={17} />{t('العودة إلى القصص', language)}</Link>
    {loading && <LoadingState />}
    {error && <div className="mt-8"><ErrorState message={error} /></div>}
    {collection && <>
      {collection.bannerImage && <div className="mt-7 aspect-[16/6] overflow-hidden rounded-3xl border border-line bg-surface-soft">
        <img src={collection.bannerImage} alt={collection.bannerAltText || ''} className="h-full w-full object-cover" />
      </div>}
      <header className="mt-7 max-w-3xl">
        <p className="text-sm font-bold text-emerald-700">{t('مجموعة قصص', language)}</p>
        <h1 className="mt-2 text-3xl font-black text-emerald-950 sm:text-4xl">{collection.title}</h1>
        {collection.description && <p className="mt-4 leading-8 text-slate-600">{collection.description}</p>}
      </header>
      {collection.stories?.length
        ? <div className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{collection.stories.map((story) => <StoryCard key={story.id} story={{ ...story, collection }} />)}</div>
        : <p className="mt-8 rounded-2xl bg-slate-50 p-8 text-center text-slate-600">{t('لا توجد قصص منشورة في هذه المجموعة بعد.', language)}</p>}
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
  const completedParts = readingProgress?.find((entry) => entry.storyId === story?.id)?.completedParts || [];
  const completedPartSet = new Set(completedParts);
  const completedStoryParts = parts.filter((part) => completedPartSet.has(part.id));
  const readableParts = parts.filter((part) => part.accessible);
  const finished = parts.length > 0 && completedStoryParts.length === parts.length;
  const nextPart = finished ? undefined : readableParts.find((part) => !completedPartSet.has(part.id)) || readableParts[0];
  const totalMinutes = parts.reduce((total, part) => total + (part.estimatedReadingMinutes || 0), 0);
  const progressPercent = parts.length ? Math.min(100, Math.round((completedStoryParts.length / parts.length) * 100)) : 0;
  const started = completedStoryParts.length > 0;
  const { data: profile } = useRemote<ProfileSummary>(user && finished ? '/me/profile-summary' : '');
  const { data: libraryStories } = useRemote<StorySummary[]>('/stories?limit=100');
  const { data: libraryBooks } = useRemote<BookSummary[]>('/books?limit=100');
  const readIds = new Set((readingProgress || []).filter((entry) => entry.completedParts?.length).map((entry) => entry.storyId));
  const lastOtherRead = (readingProgress || [])
    .filter((entry) => entry.storyId !== story?.id && entry.lastReadAt)
    .sort((left, right) => new Date(right.lastReadAt || 0).getTime() - new Date(left.lastReadAt || 0).getTime())[0];
  const recommendationSource = (libraryStories || []).find((candidate) => candidate.id === lastOtherRead?.storyId);
  const sameCollectionStories = (libraryStories || []).filter((candidate) => candidate.id !== story?.id &&
    !readIds.has(candidate.id) && candidate.collection?.id === story?.collection?.id);
  const sameTypeStories = (libraryStories || []).filter((candidate) => candidate.id !== story?.id &&
    !readIds.has(candidate.id) && candidate.type === story?.type);
  const unreadRecommendationPool = [...sameCollectionStories, ...sameTypeStories, ...(libraryStories || []).filter((candidate) =>
    candidate.id !== story?.id && !readIds.has(candidate.id))]
    .filter((candidate, index, all) => all.findIndex((entry) => entry.id === candidate.id) === index);
  // If the reader has finished every other published story, still offer a
  // re-read instead of leaving the end-of-story page as a dead end.
  const recommendationPool = unreadRecommendationPool.length
    ? unreadRecommendationPool
    : (libraryStories || []).filter((candidate) => candidate.id !== story?.id);
  const recommendations = recommendationPool.slice(0, 3);
  const matchingBook = (libraryBooks || []).find((book) => book.title === story?.title) || (libraryBooks || [])[0];
  const nextStory = recommendations[0];
  const lastPart = parts[parts.length - 1];
  const retention = retentionText(language);
  const [shareNotice, setShareNotice] = useState('');
  const quote = story?.hook || story?.summary || '';

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

  async function shareStory() {
    if (!story) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: story.title, text: story.summary, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNotice(t('تم نسخ رابط الحكاية.', language));
    } catch {
      setShareNotice(t('تعذر المشاركة تلقائيًا. انسخ الرابط من شريط العنوان.', language));
    }
  }

  return (
    <SiteLayout>
      <main><Container className="py-9 sm:py-14">
        <Link to="/stories" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowUpLeft size={17} className="rtl:rotate-180" /> {t('العودة إلى القصص', language)}</Link>
        {loading && <LoadingState />}
        {error && <div className="mt-8"><ErrorState message={error} /></div>}
        {story && (
          <div className="mt-7 grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <StoryArtwork story={story} className="aspect-[3/4] rounded-[2rem] shadow-lg" imageOverride={story.heroImage || story.cover} focalPoint={story.focalPoint} />
              {story.imageCredit && <p className="mt-2 text-xs text-ink-faint">{t('حقوق الصورة', language)}: {story.imageCredit}</p>}
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-700">{story.collection?.title || t('حكاية إيمانية', language)} · {story.sourceBadge === 'quran_verse' ? t('من القرآن الكريم', language) : story.sourceBadge === 'authentic_hadith' ? t('من السنة النبوية', language) : t('قصة موثقة', language)}</p>
              <h1 dir="auto" className="mt-4 text-3xl font-black leading-relaxed text-emerald-950 sm:text-4xl">{story.title}</h1>
              {story.hook && <p dir="auto" className="mt-3 text-lg font-semibold leading-8 text-brand-ink">{story.hook}</p>}
              <p dir="auto" className="mt-3 text-lg leading-9 text-slate-600">{story.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2"><BookOpen size={16} /> {pluralParts(parts.length, language)}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2"><Clock3 size={16} /> {pluralMinutes(totalMinutes, language)}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2"><ShieldCheck size={16} /> {t('مراجعة موثوقة', language)}</span>
                <button type="button" onClick={() => void shareStory()} className="inline-flex items-center gap-2 rounded-full border border-emerald-950/15 px-3 py-2 hover:bg-emerald-50"><Share2 size={16} /> {t('شارك الحكاية', language)}</button>
              </div>
              {shareNotice && <p role="status" className="mt-2 text-sm font-semibold text-emerald-800">{shareNotice}</p>}
              <div className="mt-7 rounded-3xl border border-line bg-surface-soft p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-ink">{t(started ? 'تابع من حيث توقفت' : 'ابدأ من هنا', language)}</p>
                    <p className="mt-1 text-lg font-bold leading-7 text-ink">{t(started ? 'خطوتك التالية قصيرة' : 'الحكاية جاهزة، والخطوة الأولى قصيرة', language)}</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {parts.length} {t('أجزاء', language)} · {totalMinutes} {t('دقيقة', language)} · {t('ابدأ بالجزء الأول ثم تابع بالترتيب', language)}
                    </p>
                  </div>
                  {finished ? (
                    <Link to={`/stories/${story.slug}/read/${lastPart?.partNumber || 1}#quiz`} className={buttonClasses({ size: 'md' })}>
                      <CircleHelp size={17} /> {t('اختبر فهمك', language)}
                    </Link>
                  ) : nextPart ? (
                    <Link to={`/stories/${story.slug}/read/${nextPart.partNumber}`} className={buttonClasses({ size: 'md' })}>
                      {started ? `${t('تابع القراءة', language)} · ${t('الجزء', language)} ${nextPart.partNumber}` : t('ابدأ القراءة', language)}
                      <ChevronLeft size={17} className="ltr:rotate-180" />
                    </Link>
                  ) : (
                    <Link to="/membership" className={buttonClasses({ size: 'md' })}>
                      <LockKeyhole size={16} /> {t('افتح الحكاية بالاشتراك', language)}
                    </Link>
                  )}
                </div>
                {started && (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label={t('تقدّم القراءة', language)}>
                      <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="shrink-0 text-xs font-bold text-ink-muted">{finished ? t('مكتملة', language) : `${progressPercent}%`}</span>
                  </div>
                )}
                {finished && user && profile && (
                  <div className="mt-5 rounded-2xl border border-line bg-surface p-4 dark:border-white/10 dark:bg-emerald-950/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-bold text-ink dark:text-emerald-50"><Award size={17} /> {retention.reward}</p>
                      <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-ink dark:bg-emerald-500/15 dark:text-emerald-100">{retention.proof(completedStoryParts.length, parts.length)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-surface-soft p-2 dark:bg-white/5"><p className="text-lg font-black text-ink dark:text-white">{profile.user.points}</p><p className="text-[11px] text-ink-muted dark:text-emerald-100/70">{retention.points}</p></div>
                      <div className="rounded-xl bg-surface-soft p-2 dark:bg-white/5"><p className="text-lg font-black text-ink dark:text-white">{retention.days(profile.streak.current)}</p><p className="text-[11px] text-ink-muted dark:text-emerald-100/70">{retention.streak}</p></div>
                      <div className="rounded-xl bg-surface-soft p-2 dark:bg-white/5"><p className="text-lg font-black text-ink dark:text-white">{profile.level.name || profile.level.level}</p><p className="text-[11px] text-ink-muted dark:text-emerald-100/70">{retention.level}</p></div>
                    </div>
                    {profile.nextBadges[0] && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted dark:text-emerald-100/70">
                          <span className="flex items-center gap-1.5"><Trophy size={14} /> {profile.nextBadges[0].name}</span>
                          <span>{retention.badgeProgress(profile.nextBadges[0].progress.currentValue, profile.nextBadges[0].progress.targetValue)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((profile.nextBadges[0].progress.ratio || 0) * 100)}>
                          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round((profile.nextBadges[0].progress.ratio || 0) * 100))}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {finished && <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Link to={`/stories/${story.slug}/read/${lastPart?.partNumber || 1}#quiz`} className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-center text-sm font-bold text-brand-ink hover:bg-brand-soft dark:border-white/15 dark:text-emerald-50 dark:hover:bg-white/10"><CircleHelp size={15} /> {retention.quiz}</Link>
                  <Link to={nextStory ? `/stories/${nextStory.slug}` : '/stories'} className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-center text-sm font-bold text-brand-ink hover:bg-brand-soft dark:border-white/15 dark:text-emerald-50 dark:hover:bg-white/10"><BookOpen size={15} /> {nextStory ? retention.nextStory : retention.choose}</Link>
                  <button type="button" onClick={() => void shareStory()} className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-bold text-brand-ink hover:bg-brand-soft dark:border-white/15 dark:text-emerald-50 dark:hover:bg-white/10"><Share2 size={15} /> {retention.share}</button>
                </div>}
              </div>
              {story.reviewerName && <p className="mt-4 text-sm text-slate-500">{t('راجَعها:', language)} {/administration plateforme/i.test(story.reviewerName) ? t('لجنة المراجعة العلمية', language) : story.reviewerName}</p>}
              {!!story.sourceReferences?.length && <div className="mt-6 rounded-2xl border border-emerald-950/10 bg-white p-5"><h2 className="font-bold text-emerald-950">المصادر</h2><ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-slate-600">{story.sourceReferences.map((source, index) => <li key={`${source.reference}-${index}`}>{source.reference}</li>)}</ul></div>}
              <div className="mt-8">
                <h2 className="text-xl font-extrabold text-emerald-950">{t('أجزاء الحكاية', language)}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-500">{t('كل جزء قصير، ويمكنك حفظ تقدّمك بعد كل جزء.', language)}</p>
                <div className="mt-4 space-y-3">
                  {parts.map((part) => {
                    const isDone = completedParts.includes(part.id);
                    return (
                      <div key={part.id} className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${isDone ? 'border-brand/25 bg-brand-soft/50' : 'border-emerald-950/10 bg-white'}`}>
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold ${isDone ? 'bg-brand text-brand-on' : 'bg-emerald-50 text-emerald-800'}`}>{isDone ? <Check size={18} /> : part.partNumber}</span>
                          <div className="min-w-0">
                            <p dir="auto" className="truncate font-bold text-emerald-950">{part.title}{nextPart?.id === part.id && !isDone && <span className="ms-2 rounded-full bg-emerald-900 px-2 py-0.5 text-[0.625rem] font-bold text-white">{t('التالي', language)}</span>}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                              <Clock3 size={13} /> {formatReadingTime(part.estimatedReadingMinutes, language)}
                              {isDone && <span className="font-bold text-brand-ink">· {t('أكملت', language)}</span>}
                            </p>
                            {part.endingHook && <p dir="auto" className="mt-1 line-clamp-1 text-xs text-slate-500">{part.endingHook}</p>}
                          </div>
                        </div>
                        {part.accessible ? <Link to={`/stories/${story.slug}/read/${part.partNumber}`} className="shrink-0 rounded-full bg-emerald-900 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">{t(isDone ? 'أعد القراءة' : 'اقرأ', language)}</Link> : <Link to="/membership" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-500"><LockKeyhole size={15} /> {t('مقفل', language)}</Link>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-line bg-surface p-5">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-800"><CircleHelp size={21} /></span>
                  <h2 className="mt-3 text-lg font-extrabold text-ink">{t('اختبر فهمك بعد القراءة', language)}</h2>
                  <p className="mt-1 text-sm leading-7 text-ink-muted">{t('اختبار قصير مبني على مصادر الحكاية، مع نقاط تُضاف إلى تقدّمك.', language)}</p>
                  <Link to={`/stories/${story.slug}/read/${lastPart?.partNumber || 1}#quiz`} className={buttonClasses({ size: 'sm', className: 'mt-4' })}>{t('ابدأ الاختبار', language)}</Link>
                </div>
                {matchingBook && <div className="rounded-3xl border border-line bg-surface p-5">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><ShoppingBag size={21} /></span>
                  <h2 className="mt-3 text-lg font-extrabold text-ink">{matchingBook.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm leading-7 text-ink-muted">{t('نسخة كتابية من الحكاية، للقراءة الهادئة أو للإهداء.', language)}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="font-extrabold text-brand-ink">{formatPrice(matchingBook.price, matchingBook.currency, language)}</span>
                    <Link to={`/books/${matchingBook.slug}`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('اطلب الكتاب', language)}</Link>
                  </div>
                </div>}
                <div className="rounded-3xl border border-line bg-surface p-5">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-800"><Gift size={21} /></span>
                  <h2 className="mt-3 text-lg font-extrabold text-ink">{t('هل لديك فكرة حكاية؟', language)}</h2>
                  <p className="mt-1 text-sm leading-7 text-ink-muted">{t('اقترح موضوعًا أو شخصية نحكي عنها في قصة قادمة، وسنراجع الاقتراح بعناية.', language)}</p>
                  <Link to="/story-request" className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-4' })}>{t('اقترح قصة', language)}</Link>
                </div>
                <div className="rounded-3xl border border-brand/25 bg-brand-soft/50 p-5">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-brand-ink"><Share2 size={21} /></span>
                  <h2 className="mt-3 text-lg font-extrabold text-ink">{t('شارك الحكاية', language)}</h2>
                  <p dir="auto" className="mt-1 line-clamp-3 rounded-xl bg-white/70 p-3 text-sm italic leading-7 text-ink-muted">“{quote}”</p>
                  <button type="button" onClick={() => void shareStory()} className={buttonClasses({ size: 'sm', className: 'mt-4' })}>{t('نسخ الرابط أو مشاركته', language)}</button>
                  {shareNotice && <p role="status" className="mt-2 text-xs font-semibold text-brand-ink">{shareNotice}</p>}
                </div>
              </div>
              {!!recommendations.length && <div className="mt-10">
                <h2 className="mb-1 text-xl font-extrabold text-emerald-950">{recommendationSource ? retention.because(recommendationSource.title) : retention.discover}</h2>
                {recommendationSource && <p className="mb-4 text-sm text-slate-500">{retention.discover}</p>}
                <div className="grid gap-5 sm:grid-cols-3">{recommendations.map((candidate) => <StoryCard key={candidate.id} story={candidate} language={language} />)}</div>
              </div>}
              {!!story.videos?.length && <div id="story-video" className="mt-10"><h2 className="mb-4 text-xl font-extrabold text-emerald-950">{t('شاهد الحكاية', language)}</h2><div className="grid gap-4 sm:grid-cols-2">{story.videos.map((video) => <StoryVideoPlayer key={video.id} video={video} language={language} />)}</div></div>}
            </div>
          </div>
        )}
      </Container></main>
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
  if (!source) return <div className="grid aspect-video place-items-center rounded-2xl bg-slate-100 text-sm text-slate-500">{t('جارٍ تحميل الفيديو…', language)}</div>;
  const embedUrl = video.videoUrl ? embeddedVideoUrl(video.videoUrl) : null;
  return <article className="space-y-2">
    {embedUrl
      ? <iframe src={embedUrl} title={video.title || `${t('الحلقة', language)} ${video.episodeNumber}`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" className="aspect-video w-full rounded-2xl bg-black" />
      : <video controls preload="none" className="w-full rounded-2xl bg-black" aria-label={video.title || `${t('الحلقة', language)} ${video.episodeNumber}`}>
          <source src={source} />
          {video.subtitles && <track kind="captions" src={video.subtitles} srcLang={language} label={language.toUpperCase()} default />}
        </video>}
    {video.title && <h3 className="font-bold text-emerald-950">{video.title}</h3>}
    {video.description && <p className="text-sm leading-6 text-slate-600">{video.description}</p>}
  </article>;
}

export function ReaderPage() {
  const { slug = '', partNumber = '' } = useParams();
  const number = Number(partNumber);
  const language = useSiteLanguage();
  const { user } = useStoryAuth();
  const [readingTheme, setReadingTheme] = useState<'light' | 'dark'>(() =>
    window.localStorage.getItem('reader-theme') === 'dark' ? 'dark' : 'light'
  );
  const [story, setStory] = useState<StorySummary | null>(null);
  const [part, setPart] = useState<(StoryPart & { content: string; endingHook: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [quizLocked, setQuizLocked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [completedPartsCount, setCompletedPartsCount] = useState(0);
  const [completion, setCompletion] = useState<CompletionPayload | null>(null);
  const [notificationPromptVisible, setNotificationPromptVisible] = useState(false);

  useEffect(() => {
    window.localStorage.setItem('reader-theme', readingTheme);
  }, [readingTheme]);

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
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<StorySummary>(`/stories/${encodeURIComponent(slug)}`),
      api.get<StoryPart & { content: string; endingHook: string }>(`/stories/${encodeURIComponent(slug)}/parts/${number}`)
    ]).then(([storyResponse, partResponse]) => {
      if (active) {
        setStory(storyResponse);
        setPart(partResponse);
        setQuiz(null);
        setQuizLocked(false);
        api.get<Quiz>(`/stories/${encodeURIComponent(slug)}/parts/${number}/quiz`).then((quizResponse) => {
          if (active) setQuiz(quizResponse);
        }).catch((caught: unknown) => {
          if (active && caught instanceof ApiError && caught.code === 'CONTENT_LOCKED') setQuizLocked(true);
        });
      }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل الجزء.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, number, language]);

  async function markAsRead() {
    if (!user || !story || !part) return;
    setBusy(true);
    setNotice(null);
    try {
      const progress = await api.get<ReadingProgressEntry[]>('/reading-progress');
      const completedParts = progress.find((entry) => entry.storyId === story.id)?.completedParts || [];
      const nextCompleted = [...new Set([...completedParts, part.id])];
      const saved = await api.put<{ completion?: CompletionPayload | null }>(`/reading-progress/${story.id}`, {
        lastPartId: part.id,
        completedParts: nextCompleted
      });
      setCompletedPartsCount(nextCompleted.length);
      if (saved?.completion) setCompletion(saved.completion);
      setNotice(t('تم حفظ تقدّمك في القراءة.', language));
      if (nextCompleted.length > 0 && !user.emailPreferences?.reminders) {
        setNotificationPromptVisible(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ تقدّم القراءة.');
    } finally {
      setBusy(false);
    }
  }

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

  if (loading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (error && !part) return <SiteLayout><Container className="py-12"><ErrorState message={error} /><Link to={`/stories/${slug}`} className="mt-5 inline-flex items-center gap-2 font-bold text-emerald-800"><ArrowLeft size={16} /> العودة للقصة</Link></Container></SiteLayout>;
  if (!story || !part) return <Navigate to="/stories" replace />;
  const previous = story.parts?.find((candidate) => candidate.partNumber === number - 1);
  const next = story.parts?.find((candidate) => candidate.partNumber === number + 1);
  const totalParts = story.parts?.length || part.partNumber;
  const readingPercent = totalParts ? Math.round((part.partNumber / totalParts) * 100) : 0;
  const partPosition = language === 'fr'
    ? `Partie ${part.partNumber} sur ${totalParts}`
    : language === 'en'
      ? `Part ${part.partNumber} of ${totalParts}`
      : `الجزء ${part.partNumber} من ${totalParts}`;

  return (
    <SiteLayout>
      <main data-reading-theme={readingTheme}><Container className="max-w-4xl py-9 sm:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to={`/stories/${story.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowLeft size={16} /> {story.title}</Link>
          <button type="button" aria-pressed={readingTheme === 'dark'} aria-label={t(readingTheme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن', language)} onClick={() => setReadingTheme((theme) => theme === 'dark' ? 'light' : 'dark')} className="inline-flex items-center gap-2 rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900 hover:bg-emerald-50">
            {readingTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {t(readingTheme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن', language)}
          </button>
        </div>
        <div className="mt-7 border-b border-emerald-950/10 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-emerald-700">{partPosition}</p>
            <p className="text-xs font-semibold text-slate-500">{readingPercent}% {t('من الحكاية', language)}</p>
          </div>
          <h1 dir="auto" className="mt-3 text-3xl font-black leading-relaxed text-emerald-950 sm:text-4xl">{part.title}</h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Clock3 size={15} /> {formatReadingTime(part.estimatedReadingMinutes, language)}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-emerald-950/10" role="progressbar" aria-valuemin={1} aria-valuemax={totalParts} aria-valuenow={part.partNumber} aria-label={partPosition}>
            <div className="h-full rounded-full bg-emerald-700 transition-[width] duration-500" style={{ width: `${readingPercent}%` }} />
          </div>
        </div>
        {part.illustrationImage && <figure className="mt-8 overflow-hidden rounded-3xl border border-emerald-950/10 dark:border-white/10">
          <img src={part.illustrationImage} alt={part.illustrationAlt || ''} className="max-h-[28rem] w-full object-cover" loading="lazy" />
        </figure>}
        <article dir="auto" className="mt-8 whitespace-pre-line text-start text-lg leading-[2.2] text-slate-700">{part.content}</article>
        {part.endingHook && <div dir="auto" className="mt-8 rounded-2xl border-r-4 border-amber-500 bg-amber-50 p-5 leading-8 text-amber-950">{part.endingHook}</div>}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-emerald-950/10 pb-8">
          {previous ? <Link to={`/stories/${slug}/read/${previous.partNumber}`} className="inline-flex items-center gap-2 rounded-full border border-emerald-950/15 px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50"><ChevronRight size={17} /> {t('الجزء السابق', language)}</Link> : <span />}
          {next && next.accessible && <Link to={`/stories/${slug}/read/${next.partNumber}`} className="inline-flex items-center gap-2 rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">{t('الجزء التالي', language)} <ChevronLeft size={17} /></Link>}
          {next && !next.accessible && <Link to="/membership" className="inline-flex items-center gap-2 rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"><LockKeyhole size={16} /> {t('تابع باشتراك', language)}</Link>}
        </div>
        {!next && (
          <div className="mt-6 rounded-3xl border border-line bg-surface-soft p-6 sm:p-7">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand-ink"><Sparkles size={20} aria-hidden="true" /></span>
            <h2 className="mt-4 text-xl font-extrabold text-ink">{t('أكملت الحكاية', language)}</h2>
            <p className="mt-2 max-w-2xl leading-8 text-ink-muted">{t('وصلت إلى نهاية هذه الحكاية. يمكنك حفظ تقدّمك، أو اختيار حكاية جديدة تبدأ بها.', language)}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {quiz ? <a href="#quiz" className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-bold text-brand-ink hover:bg-brand-soft dark:border-white/15 dark:text-emerald-50 dark:hover:bg-white/10"><CircleHelp size={15} /> {t('اختبر فهمك', language)}</a> : <button type="button" onClick={() => { void navigator.clipboard?.writeText(window.location.href); }} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-bold text-brand-ink hover:bg-brand-soft dark:border-white/15 dark:text-emerald-50 dark:hover:bg-white/10"><Share2 size={15} /> {t('شارك هذا الجزء', language)}</button>}
              <Link to="/stories" className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-bold text-brand-ink hover:bg-brand-soft dark:border-white/15 dark:text-emerald-50 dark:hover:bg-white/10"><BookOpen size={15} /> {t('اختر حكاية أخرى', language)}</Link>
              <Link to={`/stories/${slug}`} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-bold text-brand-ink hover:bg-brand-soft dark:border-white/15 dark:text-emerald-50 dark:hover:bg-white/10"><ArrowLeft size={15} /> {t('العودة إلى الحكاية', language)}</Link>
            </div>
          </div>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-emerald-50 p-5">
          <div><p className="font-bold text-emerald-950">{t('أنهيت هذا الجزء؟', language)}</p><p className="mt-1 text-sm text-slate-600">{t('احفظ تقدّمك وتابع القراءة من حيث توقفت.', language)}</p></div>
          {user ? <button onClick={markAsRead} disabled={busy} className={buttonClasses({ size: 'sm' })}>{busy ? t('جارٍ الحفظ…', language) : t('حفظ تقدّمي', language)}</button> : <Link to="/login" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('سجّل الدخول للحفظ', language)}</Link>}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {quiz && <a href="#quiz" className="rounded-xl border border-line bg-surface px-4 py-3 text-center text-sm font-bold text-brand-ink hover:bg-brand-soft">{t('اختبر فهمك', language)}</a>}
          {next && next.accessible && <Link to={`/stories/${slug}/read/${next.partNumber}`} className="rounded-xl border border-line bg-surface px-4 py-3 text-center text-sm font-bold text-brand-ink hover:bg-brand-soft">{t('الجزء التالي', language)}</Link>}
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(window.location.href); }} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-brand-ink hover:bg-brand-soft">{t('شارك هذا الجزء', language)}</button>
        </div>
        {notice && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-800" role="status"><Sparkles size={16} className="text-amber-600" aria-hidden="true" /> {notice}</p>}
        {completion && <div className="mt-4 rounded-2xl border border-brand/25 bg-brand-soft/50 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
          <p className="flex items-center gap-2 font-bold text-brand-ink dark:text-emerald-100"><Award size={17} /> {retentionText(language).reward}</p>
          <p className="mt-1 text-sm text-ink-muted dark:text-emerald-100/80">{retentionText(language).proof(completion.completedParts, completion.totalParts)}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-surface px-3 py-1.5 dark:bg-white/10">{completion.pointsGained > 0 ? `+${completion.pointsGained}` : '0'} {retentionText(language).points}</span>
            <span className="rounded-full bg-surface px-3 py-1.5 dark:bg-white/10"><Flame size={13} className="inline" /> {retentionText(language).days(completion.streak.current)}</span>
            <span className="rounded-full bg-surface px-3 py-1.5 dark:bg-white/10">{completion.level.name || completion.level.level}</span>
          </div>
          {completion.nextBadges[0] && <div className="mt-3">
            <div className="flex justify-between gap-2 text-xs font-semibold text-ink-muted dark:text-emerald-100/70"><span>{completion.nextBadges[0].name}</span><span>{retentionText(language).badgeProgress(completion.nextBadges[0].currentValue || 0, completion.nextBadges[0].targetValue || 0)}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken dark:bg-white/10"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round((completion.nextBadges[0].ratio || 0) * 100))}%` }} /></div>
          </div>}
        </div>}
        {user && completedPartsCount > 0 && notificationPromptVisible && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-bold">{t('هل نرسل لك تذكيرًا لطيفًا بالحكاية القادمة؟', language)}</p>
          <p className="mt-1 text-emerald-900/80">{t('يمكنك تفعيل التذكيرات أو إيقافها في أي وقت من إعدادات حسابك.', language)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/account" className={buttonClasses({ size: 'sm' })}>{t('إدارة التذكيرات', language)}</Link>
            <button type="button" onClick={() => setNotificationPromptVisible(false)} className="rounded-full border border-emerald-900/20 px-4 py-2 text-sm font-bold">{t('ليس الآن', language)}</button>
          </div>
        </div>}
        {quiz && <section id="quiz" className="mt-12 scroll-mt-24 rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800"><CircleHelp size={23} /></span>
            <div><h2 className="text-xl font-extrabold text-emerald-950">اختبر فهمك</h2><p className="mt-2 leading-7 text-slate-600">أجب عن أسئلة قصيرة مستندة إلى مصادر القصة.</p></div>
          </div>
          {!user && <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-900">{t('الاختبار متاح للأعضاء المسجلين.', language)} <Link className="font-bold underline" to="/login">{t('سجّل الدخول', language)}</Link></div>}
          {user && !attempt && !result && <button onClick={startQuiz} disabled={busy} className="mt-6 rounded-full bg-emerald-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? t('جارٍ التحضير…', language) : t('ابدأ الاختبار', language)}</button>}
          {attempt && quiz && <form onSubmit={submitQuiz} className="mt-7 space-y-7">
            <h3 className="font-bold text-emerald-900">{quiz.title}</h3>
            {attempt.timeLimitSeconds && <p className={`text-sm ${remainingSeconds === 0 ? 'font-bold text-red-700' : 'text-amber-800'}`}>{t('الوقت المتبقي', language)}: {remainingSeconds == null ? '--:--' : `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`}{remainingSeconds === 0 && ` — ${t('انتهى الوقت', language)}`}</p>}
            {attempt.questions.map((question, index) => <fieldset key={question.id} className="space-y-3"><legend className="font-bold leading-7 text-emerald-950">{index + 1}. {question.text}</legend>{question.options.map((option) => {
              const multiple = question.type === 'multiple_choice';
              const current = answers[question.id];
              const checked = multiple ? Array.isArray(current) && current.includes(String(option.id)) : current === String(option.id);
              return <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-950/10 p-3 text-sm hover:bg-emerald-50"><input type={multiple ? 'checkbox' : 'radio'} name={`question-${question.id}`} checked={checked} onChange={() => setAnswers((currentAnswers) => {
                if (!multiple) return { ...currentAnswers, [question.id]: String(option.id) };
                const selected = Array.isArray(currentAnswers[question.id]) ? currentAnswers[question.id] as string[] : [];
                return { ...currentAnswers, [question.id]: selected.includes(String(option.id)) ? selected.filter((id) => id !== String(option.id)) : [...selected, String(option.id)] };
              })} />{option.text}</label>;
            })}</fieldset>)}
            <button type="submit" disabled={busy || remainingSeconds === 0 || attempt.questions.some((question) => !answers[question.id] || Array.isArray(answers[question.id]) && !(answers[question.id] as string[]).length)} className="rounded-full bg-emerald-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? t('جارٍ الإرسال…', language) : t('إرسال الإجابات', language)}</button>
          </form>}
          {result && <div className="mt-7">
            <p className={`text-xl font-extrabold ${result.passed ? 'text-emerald-800' : 'text-amber-800'}`}>
              {t('نتيجتك', language)}: {result.score}% {result.passed ? `— ${t('أحسنت!', language)}` : `— ${t('واصل التعلّم', language)}`}
            </p>
            <div className="mt-5 space-y-4">
              {result.feedback.map((item, index) => <div key={item.questionId} className="rounded-xl bg-[#f8f7f2] p-4 text-sm leading-7">
                <p className="font-bold">{index + 1}. {item.correct ? t('إجابة صحيحة', language) : item.correctAnswer ? `${t('الإجابة الصحيحة', language)}: ${item.correctAnswer.join('، ')}` : t('إجابة غير صحيحة', language)}</p>
                {item.explanation && <p className="mt-1 text-slate-600">{item.explanation}</p>}
                {item.source && <p className="mt-1 text-xs text-emerald-800">{t('المصدر', language)}: {item.source}</p>}
              </div>)}
            </div>
            {result.canRetry && <button onClick={() => { setResult(null); setAttempt(null); void startQuiz(); }} disabled={busy} className="mt-5 rounded-full border border-emerald-900 px-5 py-2.5 font-bold text-emerald-900 disabled:opacity-50">{t('إعادة المحاولة', language)}</button>}
          </div>}
          {error && <div className="mt-5"><ErrorState message={error} /></div>}
        </section>}
        {quizLocked && <div className="mt-12 rounded-2xl bg-amber-50 p-5 text-amber-900">{t('هذا الاختبار متاح للمشتركين.', language)} <Link to="/membership" className="font-bold underline">{t('عرض الاشتراكات', language)}</Link></div>}
      </Container></main>
    </SiteLayout>
  );
}

export function BooksPage() {
  const { data: books, loading, error } = useRemote<BookSummary[]>('/books?limit=100');
  return (
    <SiteLayout><main><Container className="py-12 sm:py-16">
      <p className="text-sm font-bold tracking-widest text-emerald-700">متجر الحكايات</p>
      <h1 className="mt-3 text-3xl font-black text-emerald-950 sm:text-4xl">كتب تختارها العائلة معًا</h1>
      <p className="mt-3 max-w-2xl leading-8 text-slate-600">إصدارات مطبوعة ورقمية مستوحاة من مكتبتنا القصصية، لتبقى الحكاية قريبة منكم.</p>
      <p className="mt-6 text-sm leading-6 text-emerald-900">اختر أي كتاب ثم تابع إلى صفحة التفاصيل لإتمام الدفع الآمن عند تفعيل إعدادات Stripe.</p>
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
  campaignType?: 'amount_goal' | 'items_goal' | 'both';
  targetUnits?: number | null;
  sponsoredUnits?: number;
  unitName?: string;
  coverImage?: string | null;
  canDonate?: boolean;
  amountPercent?: number;
  unitsPercent?: number;
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
  const [platformAmount, setPlatformAmount] = useState('10');
  const [platformRecurring, setPlatformRecurring] = useState(false);
  const [platformAnonymous, setPlatformAnonymous] = useState(false);
  const [platformBusy, setPlatformBusy] = useState(false);

  async function supportPlatform(event: FormEvent) {
    event.preventDefault();
    if (!user || user.role !== 'READER') { navigate('/login'); return; }
    setPlatformBusy(true);
    setCheckoutError(null);
    try {
      const response = await api.post<{ checkoutUrl: string }>('/donations/checkout', {
        amount: Number(platformAmount),
        language,
        recurring: platformRecurring,
        isAnonymous: platformAnonymous
      });
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : 'تعذر بدء التبرع.');
      setPlatformBusy(false);
    }
  }

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
    <p className="text-sm font-bold tracking-widest text-emerald-700">{t('مساهمة مجتمعية', language)}</p>
    <h1 className="mt-3 text-3xl font-black text-emerald-950 sm:text-4xl">{t('دعم نشر الحكايات الموثوقة', language)}</h1>
    <p className="mt-3 max-w-2xl leading-8 text-slate-600">{t('ساهم في تطوير محتوى موثوق وآمن للعائلة. تتم معالجة التبرعات عبر Stripe.', language)}</p>
    <form onSubmit={supportPlatform} className="mt-7 grid gap-3 rounded-3xl border border-emerald-950/10 bg-emerald-50/60 p-5 sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm font-semibold text-emerald-950">دعم المنصة مباشرة (EUR)<input type="number" min="1" step="0.01" value={platformAmount} onChange={(event) => setPlatformAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-emerald-950/15 bg-white px-3 py-2.5" /></label>
      <div className="flex flex-col justify-center gap-2 text-sm text-emerald-950"><label className="flex items-center gap-2"><input type="checkbox" checked={platformRecurring} onChange={(event) => setPlatformRecurring(event.target.checked)} />دعم شهري متكرر</label><label className="flex items-center gap-2"><input type="checkbox" checked={platformAnonymous} onChange={(event) => setPlatformAnonymous(event.target.checked)} />إخفاء اسمي</label></div>
      <button disabled={platformBusy} className="self-end rounded-full bg-emerald-900 px-6 py-3 font-bold text-white disabled:opacity-50">{platformBusy ? 'جارٍ التحويل…' : 'ادعم المنصة'}</button>
    </form>
    {checkoutError && <div className="mt-5"><ErrorState message={checkoutError} /></div>}
    {error && <div className="mt-5"><ErrorState message={error} /></div>}
    {loading && <LoadingState />}
    {!loading && !error && !campaigns?.length && <EmptyState>{t('لا توجد حملات تبرع نشطة حاليًا.', language)}</EmptyState>}
    <div className="mt-8 grid gap-5 md:grid-cols-2">{campaigns?.map((campaign) => {
      const goal = Number(campaign.goalAmount);
      const raised = Number(campaign.raisedAmount);
      return <article key={campaign.id} className="overflow-hidden rounded-3xl border border-emerald-950/10 bg-white">
        {campaign.coverImage && <img src={campaign.coverImage} alt="" className="h-44 w-full object-cover" />}
        <div className="p-6">
        <h2 className="text-xl font-extrabold text-emerald-950"><Link to={`/donation-campaigns/${campaign.slug}`} className="hover:underline">{campaign.title}</Link></h2>
        <p className="mt-3 leading-7 text-slate-600">{campaign.description}</p>
        <p className="mt-5 text-sm font-bold text-emerald-900">{formatPrice(raised, campaign.currency, language)} / {formatPrice(goal, campaign.currency, language)}</p>
        <progress value={Math.min(raised, goal)} max={goal} aria-label={t('تقدم الحملة', language)} className="mt-2 w-full" />
        {campaign.targetUnits ? <p className="mt-2 text-sm font-semibold text-emerald-800">{campaign.sponsoredUnits || 0} / {campaign.targetUnits} {campaign.unitName || 'كتاب'}</p> : null}
        <div className="mt-5 flex gap-3">
          <label className="min-w-0 flex-1 text-sm font-semibold">{t('مبلغ التبرع', language)}<input type="number" min="1" step="0.01" value={amounts[campaign.id] || '5'} onChange={(event) => setAmounts((current) => ({ ...current, [campaign.id]: event.target.value }))} dir="ltr" className="mt-1 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 text-left" /></label>
          <button onClick={() => void donate(campaign)} disabled={busyId === campaign.id} className="self-end rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{busyId === campaign.id ? t('جارٍ التحويل…', language) : t('تبرع الآن', language)}</button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={Boolean(recurring[campaign.id])} onChange={(event) => setRecurring((current) => ({ ...current, [campaign.id]: event.target.checked }))} />{t('اجعل التبرع شهريًا متكررًا', language)}</label>
        <Link to={`/donation-campaigns/${campaign.slug}`} className="mt-4 inline-block text-sm font-bold text-emerald-800 underline">تفاصيل الحملة ومواقع التوزيع</Link>
        </div>
      </article>;
    })}</div>
  </Container></main></SiteLayout>;
}

type DonationCampaignDetail = DonationCampaignSummary & {
  summary?: string;
  bannerImage?: string | null;
  costPerUnit?: number | string | null;
  extraCosts?: number | string | null;
  totalCost?: number | string | null;
  donorCount?: number;
  allowRecurring?: boolean;
  allowAnonymous?: boolean;
  allowCustomAmount?: boolean;
  minAmount?: number | string;
  maxAmount?: number | string | null;
  linked?: { story?: { slug: string; title: string } | null; book?: { slug: string; title: string } | null; collection?: { slug: string; title: string } | null };
  tiers?: Array<{ id: number; amount: number | string; units: number | null; label: string }>;
  items?: Array<{ id: number; label: string; quantityTarget: number; unitCost: number | string; quantitySponsored: number; quantityDistributed: number; book?: { slug: string; title: string } | null }>;
  places?: Array<{ id: number; name: string; type: string; city?: string | null; country?: string | null; plannedQuantity: number; status: string; distributionDate?: string | null; notes?: string | null; reportText?: string | null }>;
  updates?: Array<{ id: number; title: string; body: string; publishedAt: string }>;
  supporters?: Array<{ name: string; units: number; date: string }>;
};

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
    <div className="relative min-h-[22rem] overflow-hidden bg-emerald-950">
      {campaign.bannerImage || campaign.coverImage ? <img src={campaign.bannerImage || campaign.coverImage || ''} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" /> : null}
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-950/40 to-transparent" />
      <Container className="relative flex min-h-[22rem] flex-col justify-end py-10 text-white">
        <p className="text-sm font-bold tracking-widest text-amber-200">حملة تبرع</p>
        <h1 className="mt-3 max-w-4xl text-3xl font-black leading-tight sm:text-5xl">{campaign.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-8 text-white/80 sm:text-base">{campaign.summary || campaign.description}</p>
      </Container>
    </div>
    <Container className="grid gap-8 py-10 lg:grid-cols-[1.35fr_0.8fr]">
      <div className="space-y-8">
        <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-3xl font-black text-emerald-950">{formatPrice(raised, campaign.currency, language)}</p><p className="mt-1 text-sm text-slate-500">من هدف {formatPrice(goal, campaign.currency, language)} · {percent}%</p></div>
            {campaign.targetUnits ? <p className="text-lg font-extrabold text-emerald-800">{campaign.sponsoredUnits || 0} / {campaign.targetUnits} {campaign.unitName || 'كتاب'}</p> : null}
          </div>
          <progress value={Math.min(raised, goal)} max={goal} aria-label="تقدم الحملة" className="mt-4 h-3 w-full overflow-hidden rounded-full" />
          {campaign.targetUnits ? <progress value={Math.min(campaign.sponsoredUnits || 0, campaign.targetUnits)} max={campaign.targetUnits} aria-label="الوحدات الممولة" className="mt-2 h-2 w-full" /> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">متبرعون</p><p className="mt-1 text-xl font-black text-emerald-950">{campaign.donorCount || 0}</p></div>
            <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-bold text-amber-800">تكلفة الوحدة</p><p className="mt-1 text-xl font-black text-amber-950">{campaign.costPerUnit ? formatPrice(campaign.costPerUnit, campaign.currency, language) : '—'}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-600">التكلفة الإجمالية</p><p className="mt-1 text-xl font-black text-slate-900">{campaign.totalCost ? formatPrice(campaign.totalCost, campaign.currency, language) : '—'}</p></div>
          </div>
          <p className="mt-5 whitespace-pre-wrap leading-8 text-slate-600">{campaign.description}</p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">{campaign.linked?.story && <Link to={`/stories/${campaign.linked.story.slug}`} className="rounded-full bg-emerald-50 px-4 py-2 font-bold text-emerald-900">القصة: {campaign.linked.story.title}</Link>}{campaign.linked?.book && <Link to={`/books/${campaign.linked.book.slug}`} className="rounded-full bg-amber-50 px-4 py-2 font-bold text-amber-900">الكتاب: {campaign.linked.book.title}</Link>}</div>
        </section>

        {!!campaign.items?.length && <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8"><h2 className="text-2xl font-black text-emerald-950">الموارد التي نوزعها</h2><div className="mt-4 space-y-3">{campaign.items.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-2xl bg-slate-50 p-4 text-sm"><span className="font-bold">{item.label}</span><span>{item.quantitySponsored} / {item.quantityTarget} · وُزّع {item.quantityDistributed}</span></div>)}</div></section>}

        {!!campaign.places?.length && <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8"><h2 className="text-2xl font-black text-emerald-950">مواقع التوزيع</h2><div className="mt-4 space-y-3">{campaign.places.map((place) => <article key={place.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-emerald-950">{place.name}</h3><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{place.status === 'distributed' ? 'وُزّع' : place.status === 'shipped' ? 'شُحن' : 'مخطط'}</span></div><p className="mt-1 text-sm text-slate-500">{[place.city, place.country].filter(Boolean).join('، ')} · {place.plannedQuantity} نسخة</p>{place.reportText && <p className="mt-2 text-sm leading-7 text-slate-600">{place.reportText}</p>}</article>)}</div></section>}

        {!!campaign.updates?.length && <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8"><h2 className="text-2xl font-black text-emerald-950">مستجدات الحملة</h2><div className="mt-4 space-y-5">{campaign.updates.map((update) => <article key={update.id} className="border-s-2 border-emerald-200 ps-4"><p className="text-xs text-slate-500">{new Date(update.publishedAt).toLocaleDateString(language)}</p><h3 className="mt-1 font-bold text-emerald-950">{update.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-600">{update.body}</p></article>)}</div></section>}

        {!!campaign.supporters?.length && <section className="rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8"><h2 className="text-2xl font-black text-emerald-950">شكرًا لداعمينا</h2><div className="mt-4 flex flex-wrap gap-2">{campaign.supporters.map((supporter, index) => <span key={`${supporter.name}-${index}`} className="rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">{supporter.name}{supporter.units ? ` · ${supporter.units}` : ''}</span>)}</div></section>}
      </div>

      <form onSubmit={donate} className="h-fit space-y-4 rounded-3xl border border-emerald-950/10 bg-white p-6 lg:sticky lg:top-24">
        <h2 className="text-xl font-black text-emerald-950">ساهم في الحملة</h2>
        {checkoutError && <ErrorState message={checkoutError} />}
        {campaign.canDonate === false && <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">هذه الحملة لا تقبل تبرعات جديدة حاليًا.</p>}
        {!!campaign.tiers?.length && <div className="space-y-2">{campaign.tiers.map((tier) => <label key={tier.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm ${tierId === tier.id ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200'}`}><span><input type="radio" name="tier" checked={tierId === tier.id} onChange={() => { setTierId(tier.id); setAmount(String(tier.amount)); }} className="me-2" />{tier.label}</span><strong>{formatPrice(tier.amount, campaign.currency, language)}</strong></label>)}</div>}
        {campaign.allowCustomAmount !== false && <label className="block text-sm font-semibold text-slate-700">مبلغ مخصص ({campaign.currency})<input type="number" min={Number(campaign.minAmount || 1)} max={campaign.maxAmount ? Number(campaign.maxAmount) : undefined} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setTierId(null); }} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label>}
        <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} className="mt-1" />تبرع شهري متكرر</label>
        <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} className="mt-1" />إخفاء اسمي من قائمة الداعمين</label>
        <label className="block text-sm font-semibold text-slate-700">رسالة اختيارية<textarea rows={3} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label>
        <button disabled={busy || campaign.canDonate === false} className="w-full rounded-full bg-emerald-900 px-5 py-3.5 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ التحويل…' : 'تبرع عبر Stripe'}</button>
        <p className="text-center text-xs leading-6 text-slate-500"><ShieldCheck size={13} className="inline" /> المبلغ يُحسب على الخادم؛ لا يمكن تعديل السعر من المتصفح.</p>
      </form>
    </Container>
  </main></SiteLayout>;
}

type PublicEvent = { id: number; slug: string; title: string; rules: string; startsAt: string; endsAt: string; quizId: number | null; winnerDisplayName?: string | null; winnerAnnouncement?: string };
type LeaderboardEntry = { rank: number; displayName: string; score: number };
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
    <p className="text-sm font-bold tracking-widest text-emerald-700">{t('المجتمع', language)}</p>
    <h1 className="mt-3 text-3xl font-black text-emerald-950 sm:text-4xl">{t('المسابقات والفعاليات', language)}</h1>
    {message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-900">{message}</p>}
    {loading && <LoadingState />}
    {error && <ErrorState message={error} />}
    {!loading && !error && !events?.length && <EmptyState>{t('لا توجد فعاليات منشورة حاليًا.', language)}</EmptyState>}
    <div className="mt-8 grid gap-5 md:grid-cols-2">{events?.map((event) => <article key={event.id} className="rounded-3xl border border-emerald-950/10 bg-white p-6">
      <h2 className="text-xl font-extrabold text-emerald-950">{event.title}</h2>
      <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-600">{event.rules}</p>
      {(event.winnerDisplayName || event.winnerAnnouncement) && <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-amber-950"><h3 className="font-bold">{t('إعلان الفائز', language)}{event.winnerDisplayName ? ` · ${event.winnerDisplayName}` : ''}</h3>{event.winnerAnnouncement && <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{event.winnerAnnouncement}</p>}</div>}
      <p className="mt-4 text-xs text-slate-500">{new Date(event.startsAt).toLocaleString(language)} – {new Date(event.endsAt).toLocaleString(language)}</p>
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void join(event)} disabled={busyId === event.id} className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === event.id ? t('جارٍ التسجيل…', language) : t('شارك', language)}</button><button onClick={() => void showLeaderboard(event)} className="rounded-full border border-emerald-900 px-4 py-2 text-sm font-bold text-emerald-900">{t('لوحة المتصدرين', language)}</button></div>
      {selectedId === event.id && <ol className="mt-4 space-y-2 border-t pt-4">{leaderboard.length ? leaderboard.map((item) => <li key={`${event.id}-${item.rank}`} className="flex justify-between text-sm"><span>{item.rank}. {item.displayName}</span><strong>{item.score}</strong></li>) : <li className="text-sm text-slate-500">{t('لا توجد مشاركات حتى الآن.', language)}</li>}</ol>}
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
  alreadyOwned: boolean;
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

type GuestCartLine = { bookId: number; quantity: number };
const GUEST_CART_KEY = 'islamic-stories-guest-cart';

function readGuestCart(): GuestCartLine[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((line) => Number.isSafeInteger(line?.bookId) && line.bookId > 0).map((line) => ({ bookId: Number(line.bookId), quantity: Math.max(1, Math.min(20, Number(line.quantity) || 1)) })) : [];
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
  const [shippingAddress, setShippingAddress] = useState({ name: '', line1: '', city: '', postalCode: '', country: '', phone: '' });

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
    if (hasEbook && !digitalConsent) {
      setError('وافق على البدء الفوري في التنزيل قبل إتمام الدفع.');
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
        items: cart.items.map((item) => ({ bookId: item.bookId, quantity: item.quantity })),
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
    return <SiteLayout><Container className="max-w-2xl py-16"><div className="rounded-3xl border border-emerald-950/10 bg-white p-8 text-center"><ShoppingBag className="mx-auto text-emerald-800" size={36} /><h1 className="mt-4 text-2xl font-black text-emerald-950">سلة المشتريات</h1><p className="mt-2 text-slate-600">{guestCount ? `لديك ${guestCount} كتاب في السلة المؤقتة. سجّل الدخول لدمجها وإتمام الشراء.` : 'سجّل الدخول لعرض سلتك وإتمام الشراء بأمان.'}</p><button onClick={() => navigate('/login')} className="mt-6 rounded-full bg-emerald-900 px-6 py-3 font-bold text-white">تسجيل الدخول</button></div></Container></SiteLayout>;
  }

  return <SiteLayout><main><Container className="max-w-6xl py-12 sm:py-16">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-emerald-700">متجر الحكايات</p><h1 className="mt-2 text-3xl font-black text-emerald-950">سلة المشتريات</h1></div><Link to="/books" className="font-bold text-emerald-800 underline">متابعة التسوق</Link></div>
    {error && <div className="mt-5"><ErrorState message={error} /></div>}
    {!cart.items.length ? <div className="mt-8 rounded-3xl border border-emerald-950/10 bg-white p-10 text-center"><ShoppingBag className="mx-auto text-emerald-800" size={38} /><h2 className="mt-4 text-xl font-extrabold text-emerald-950">سلتك فارغة</h2><p className="mt-2 text-slate-600">أضف كتابًا إلكترونيًا أو نسخة مطبوعة للبدء.</p><Link to="/books" className="mt-6 inline-block rounded-full bg-emerald-900 px-6 py-3 font-bold text-white">تصفح الكتب</Link></div> :
    <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
      <section className="space-y-4">{cart.items.map((item) => <article key={item.bookId} className="flex gap-4 rounded-2xl border border-emerald-950/10 bg-white p-4 sm:p-5">
        <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-[#efe8d8]">{item.cover ? <img src={item.cover} alt="" className="h-full w-full object-cover" /> : <BookOpen className="m-5 text-emerald-800" size={28} />}</div>
        <div className="min-w-0 flex-1"><h2 className="font-bold text-emerald-950">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.format === 'ebook' ? 'كتاب إلكتروني · تنزيل فوري' : 'نسخة مطبوعة'}</p><p className="mt-2 font-extrabold text-emerald-800">{formatPrice(item.unitPrice, item.currency, language)}</p>
          {!item.available && <p className="mt-1 text-xs font-bold text-red-700">الكمية المطلوبة غير متوفرة حاليًا.</p>}
          {item.alreadyOwned && <p className="mt-1 text-xs font-bold text-red-700">هذا الكتاب موجود في مكتبتك بالفعل.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {item.format === 'print' ? <div className="inline-flex items-center rounded-full border border-emerald-950/15"><button type="button" onClick={() => void updateQuantity(item, item.quantity - 1)} disabled={busyBook === item.bookId || item.quantity <= 1} className="px-3 py-1.5 disabled:opacity-40">−</button><span className="min-w-8 text-center text-sm font-bold">{item.quantity}</span><button type="button" onClick={() => void updateQuantity(item, item.quantity + 1)} disabled={busyBook === item.bookId || (item.stockQuantity !== null && item.quantity >= item.stockQuantity)} className="px-3 py-1.5 disabled:opacity-40">+</button></div> : <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">الكمية: 1</span>}
            <button type="button" onClick={() => void removeItem(item)} disabled={busyBook === item.bookId} className="text-sm font-bold text-red-700 underline disabled:opacity-40">حذف</button>
          </div>
        </div>
      </article>)}</section>
      <form onSubmit={checkout} className="h-fit space-y-4 rounded-3xl border border-emerald-950/10 bg-white p-6 lg:sticky lg:top-24">
        <h2 className="text-xl font-extrabold text-emerald-950">ملخص الطلب</h2>
        <div className="space-y-2 border-b border-slate-100 pb-4 text-sm"><div className="flex justify-between"><span>المجموع الفرعي</span><span>{formatPrice(cart.subtotal, cart.currency, language)}</span></div>{cart.hasPhysical && <div className="flex justify-between"><span>الشحن</span><span>{formatPrice(cart.shipping, cart.currency, language)}</span></div>}{promoCode.trim() && <p className="text-xs text-emerald-800">يُطبّق رمز الخصم عند إنشاء الطلب ويُتحقق منه على الخادم.</p>}<div className="flex justify-between text-lg font-black text-emerald-950"><span>الإجمالي</span><span>{formatPrice(cart.total, cart.currency, language)}</span></div></div>
        <label className="block text-sm font-semibold text-slate-700">رمز الخصم (اختياري)<input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} maxLength={64} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 text-left" /></label>
        {cart.hasPhysical && <fieldset className="space-y-3"><legend className="text-sm font-bold text-emerald-950">عنوان التوصيل</legend><input required placeholder="الاسم الكامل" value={shippingAddress.name} onChange={(event) => setShippingAddress({ ...shippingAddress, name: event.target.value })} className="w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /><input required placeholder="العنوان" value={shippingAddress.line1} onChange={(event) => setShippingAddress({ ...shippingAddress, line1: event.target.value })} className="w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /><div className="grid grid-cols-2 gap-3"><input required placeholder="المدينة" value={shippingAddress.city} onChange={(event) => setShippingAddress({ ...shippingAddress, city: event.target.value })} className="rounded-xl border border-emerald-950/15 px-3 py-2.5" /><input required placeholder="الرمز البريدي" value={shippingAddress.postalCode} onChange={(event) => setShippingAddress({ ...shippingAddress, postalCode: event.target.value })} className="rounded-xl border border-emerald-950/15 px-3 py-2.5" /><input required placeholder="رمز الدولة (FR)" minLength={2} maxLength={2} value={shippingAddress.country} onChange={(event) => setShippingAddress({ ...shippingAddress, country: event.target.value.toUpperCase() })} className="rounded-xl border border-emerald-950/15 px-3 py-2.5 uppercase" /><input required placeholder="الهاتف" value={shippingAddress.phone} onChange={(event) => setShippingAddress({ ...shippingAddress, phone: event.target.value })} className="rounded-xl border border-emerald-950/15 px-3 py-2.5" /></div></fieldset>}
        {cart.items.some((item) => item.format === 'ebook') && <label className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-950"><input required type="checkbox" checked={digitalConsent} onChange={(event) => setDigitalConsent(event.target.checked)} className="mt-1" />أوافق على البدء الفوري في تنزيل الكتب الإلكترونية، وأعلم أن حق التراجع عن المحتوى الرقمي يسقط بعد بدء التنزيل.</label>}
        <button type="submit" disabled={checkingOut || !cart.items.length} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-900 px-5 py-3.5 font-bold text-white disabled:opacity-50"><CreditCard size={17} /> {checkingOut ? 'جارٍ تحويلك للدفع…' : 'إتمام الدفع الآمن'}</button>
        <p className="text-center text-xs leading-6 text-slate-500"><ShieldCheck size={13} className="inline" /> دفع آمن عبر Stripe. لا نحتفظ ببيانات البطاقة.</p>
      </form>
    </div>}
  </Container></main></SiteLayout>;
}

export function BookDetailPage() {
  const { slug = '' } = useParams();
  const language = useSiteLanguage();
  const navigate = useLocalizedNavigate();
  const { user } = useStoryAuth();
  const { policy: returnPolicy } = useReturnPolicy(language);
  const returnLine = returnPolicyShortLine(returnPolicy, language);
  const { data: book, loading, error } = useRemote<BookSummary>(`/books/${encodeURIComponent(slug)}`);
  const [quantity, setQuantity] = useState(1);
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    line1: '',
    city: '',
    postalCode: '',
    country: '',
    phone: ''
  });
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [digitalConsent, setDigitalConsent] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [canDownload, setCanDownload] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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
    api.get<{ canDownload: boolean }>(`/books/${encodeURIComponent(book.slug)}/access`)
      .then(({ canDownload: access }) => { if (active) setCanDownload(access); })
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
      if (existing) existing.quantity = book.format === 'ebook' ? 1 : Math.min(20, existing.quantity + quantity);
      else lines.push({ bookId: book.id, quantity: book.format === 'ebook' ? 1 : quantity });
      writeGuestCart(lines);
      setCartNotice('أُضيف الكتاب إلى سلتك. ستُدمج السلة بعد تسجيل الدخول.');
      return;
    }
    if (user.role !== 'READER') { navigate('/login'); return; }
    setCartBusy(true);
    setCheckoutError(null);
    setCartNotice(null);
    try {
      await api.post('/cart/items', { bookId: book.id, quantity: book.format === 'print' ? quantity : 1 });
      setCartNotice(t('تمت إضافة الكتاب إلى السلة.', language));
      window.dispatchEvent(new Event('cart:changed'));
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : 'تعذر إضافة الكتاب إلى السلة.');
    } finally {
      setCartBusy(false);
    }
  }

  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (!book) return;
    if (!user || user.role !== 'READER') {
      navigate('/login');
      return;
    }
    if (book.format === 'ebook' && !digitalConsent) {
      setCheckoutError(t('وافق على بدء التنزيل الفوري قبل إتمام الدفع.', language));
      return;
    }
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const response = await api.post<{ checkoutUrl: string }>('/payments/books/checkout', {
        items: [{ bookId: book.id, quantity }],
        language,
        digitalConsent: book.format === 'ebook' ? digitalConsent : false,
        ...(book.format === 'print' ? { shippingAddress } : {})
      });
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : 'تعذر بدء عملية الشراء.');
      setCheckingOut(false);
    }
  }

  return <SiteLayout><main><Container className="py-10 sm:py-16">
    {loading && <LoadingState />}{error && <ErrorState message={error} />}
    {book && <div className="grid gap-9 md:grid-cols-[0.8fr_1.2fr]">
      <div className="overflow-hidden rounded-3xl border border-emerald-950/10 bg-[#efe8d8]">
        {book.cover ? <img src={book.cover} alt={book.title} className="aspect-[0.9] h-full w-full object-cover" /> : <div className="grid aspect-[0.9] place-items-center bg-gradient-to-br from-amber-100 via-[#e5d7b8] to-emerald-100"><BookOpen size={54} strokeWidth={1.2} className="text-emerald-800/70" /></div>}
      </div>
      <div className="self-center">
        <p className="text-sm font-bold text-emerald-700">من متجر الحكايات</p>
        <h1 className="mt-3 text-3xl font-black leading-relaxed text-emerald-950">{book.title}</h1>
        <p className="mt-5 leading-8 text-slate-600">{book.description || 'كتاب يجمع بين متعة الحكاية وقيمها.'}</p>
        <p className="mt-5 text-xl font-extrabold text-emerald-800">{formatPrice(book.price, book.currency, language)}</p>
        {book.format === 'print' && returnLine && <div className="mt-4 rounded-2xl border border-emerald-950/10 bg-emerald-50/70 p-4 text-sm leading-7 text-emerald-950">
          <p className="font-semibold">{returnLine}</p>
          <Link to={`/${language}/policy/returns`} className="mt-1 inline-block font-bold text-emerald-800 underline">{t('اقرأ سياسة الإرجاع الكاملة', language)}</Link>
        </div>}
        {book.format === 'ebook' && <p className="mt-2 text-sm leading-6 text-slate-600">{t('يُشترى هذا الكتاب الإلكتروني بشكل منفصل، ولا يشمله الاشتراك.', language)}</p>}
        {book.format === 'print' && book.stockQuantity !== null && book.stockQuantity !== undefined && <p className="mt-2 text-sm text-slate-500">المتوفر: {book.stockQuantity}</p>}
        {!user && <p className="mt-5 text-sm text-slate-600">أكمل الطلب بعد <Link to="/login" className="font-bold text-emerald-800 underline">تسجيل الدخول</Link>.</p>}
        {checkoutError && <div className="mt-5"><ErrorState message={checkoutError} /></div>}
        {cartNotice && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{cartNotice} <Link to="/cart" className="underline">عرض السلة</Link></p>}
        {downloadError && <div className="mt-5"><ErrorState message={downloadError} /></div>}
        {book.format === 'ebook' && canDownload ? <button type="button" onClick={downloadEbook} disabled={downloadBusy || checkingAccess} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50"><BookOpen size={17} /> {t(downloadBusy ? 'جارٍ تجهيز التنزيل…' : 'تنزيل الكتاب الإلكتروني', language)}</button> :
        <form onSubmit={checkout} className="mt-6 space-y-4 rounded-2xl border border-emerald-950/10 bg-white p-5">
          {book.format === 'print' && <>
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-950"><MapPin size={17} /> عنوان التوصيل</div>
            <label className="block text-sm font-semibold text-slate-700">الاسم الكامل<input required value={shippingAddress.name} onChange={(event) => setShippingAddress({ ...shippingAddress, name: event.target.value })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 outline-none focus:border-emerald-700" /></label>
            <label className="block text-sm font-semibold text-slate-700">العنوان<input required value={shippingAddress.line1} onChange={(event) => setShippingAddress({ ...shippingAddress, line1: event.target.value })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 outline-none focus:border-emerald-700" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">المدينة<input required value={shippingAddress.city} onChange={(event) => setShippingAddress({ ...shippingAddress, city: event.target.value })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 outline-none focus:border-emerald-700" /></label>
              <label className="text-sm font-semibold text-slate-700">الرمز البريدي<input required value={shippingAddress.postalCode} onChange={(event) => setShippingAddress({ ...shippingAddress, postalCode: event.target.value })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 outline-none focus:border-emerald-700" /></label>
              <label className="text-sm font-semibold text-slate-700">رمز الدولة (حرفان)<input required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" value={shippingAddress.country} onChange={(event) => setShippingAddress({ ...shippingAddress, country: event.target.value.toUpperCase() })} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 text-left uppercase outline-none focus:border-emerald-700" /></label>
              <label className="text-sm font-semibold text-slate-700">رقم الهاتف<input required type="tel" value={shippingAddress.phone} onChange={(event) => setShippingAddress({ ...shippingAddress, phone: event.target.value })} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 text-left outline-none focus:border-emerald-700" /></label>
            </div>
            {book.stockQuantity !== null && book.stockQuantity !== undefined && book.stockQuantity > 0 && <label className="block text-sm font-semibold text-slate-700">الكمية<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5">{Array.from({ length: Math.min(book.stockQuantity, 10) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}</select></label>}
          </>}
          {book.format === 'print' && <p className="text-xs leading-6 text-slate-500">تُحسب تكلفة الشحن من إعدادات المتجر وتظهر بوضوح قبل تأكيد الدفع.</p>}
          {book.format === 'ebook' && <label className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-950"><input required type="checkbox" checked={digitalConsent} onChange={(event) => setDigitalConsent(event.target.checked)} className="mt-1" />أوافق على البدء الفوري في تنزيل الكتاب الإلكتروني، وأعلم أن حقي في التراجع عن المحتوى الرقمي يسقط بعد بدء التنزيل.</label>}
          {book.format === 'print' && returnLine && <p className="rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-950">
            {returnLine}{' '}
            <Link to={`/${language}/policy/returns`} className="font-bold underline">{t('سياسة الإرجاع', language)}</Link>
          </p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => void addToCart()} disabled={cartBusy || (book.format === 'print' && book.stockQuantity === 0)} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-900/20 bg-white px-5 py-3 font-bold text-emerald-900 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
              <ShoppingBag size={17} /> {cartBusy ? 'جارٍ الإضافة…' : 'أضف إلى السلة'}
            </button>
            <button type="submit" disabled={checkingOut || (book.format === 'print' && book.stockQuantity === 0) || (book.format === 'ebook' && !digitalConsent)} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-900 px-5 py-3 font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
              <CreditCard size={17} /> {checkingOut ? 'جارٍ تحويلك للدفع…' : 'اشترِ الآن'}
            </button>
          </div>
        </form>
        }
        <Link to="/books" className="mt-6 inline-flex items-center gap-2 font-bold text-emerald-800"><ArrowLeft size={17} /> العودة إلى المتجر</Link>
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
  if (user) return <Navigate to="/account" replace />;

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
          navigate('/account', { replace: true });
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
        navigate('/login', { replace: true, state: { message: 'تم إنشاء حسابك بنجاح. سجّل الدخول للمتابعة.' } });
      }
    } catch (caught) {
      setError(localizeAuthError(caught, language));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout><main className="grid min-h-[calc(100vh-180px)] place-items-center px-5 py-12">
      <div className="w-full max-w-lg rounded-[2rem] border border-emerald-950/10 bg-white p-7 shadow-sm sm:p-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowLeft size={16} /> الرئيسية</Link>
        <span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">{mode === 'login' ? <LogIn size={23} /> : <Bookmark size={23} />}</span>
        <h1 className="mt-5 text-2xl font-black text-emerald-950">{recoveryStage ? 'إعادة تعيين كلمة المرور' : mode === 'login' ? 'مرحبًا بعودتك' : 'انضم إلى مجتمع الحكايات'}</h1>
        <p className="mt-2 leading-7 text-slate-600">{recoveryStage === 'email' ? 'أدخل بريدك الإلكتروني لنرسل إليك رمز إعادة التعيين.' : recoveryStage === 'code' ? 'أدخل الرمز الذي أرسلناه إلى بريدك الإلكتروني.' : recoveryStage === 'password' ? 'اختر كلمة مرور جديدة لحسابك.' : mode === 'login' ? 'سجّل الدخول لمتابعة قراءتك واشتراكك.' : 'أنشئ حساب قارئ مجانًا واحفظ تقدّمك في القراءة.'}</p>
        {message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900" role="status">{message}</p>}
        {error && <div className="mt-5"><ErrorState message={error} /></div>}
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === 'register' && stage === 'details' && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-slate-700">الاسم الأول<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">اسم العائلة<input required value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
            </div>
          </>}
          {(mode === 'login' && (recoveryStage === 'email' || !recoveryStage) || mode === 'register' && stage === 'email') && <label className="block space-y-2 text-sm font-semibold text-slate-700">البريد الإلكتروني<input type="email" required value={email} readOnly={mode === 'login' && recoveryStage !== 'email' && Boolean(searchParams.get('email'))} onChange={(event) => setEmail(event.target.value)} autoComplete="email" dir="ltr" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 text-left outline-none focus:border-emerald-700" /></label>}
          {recoveryStage === 'code' && <label className="block space-y-2 text-sm font-semibold text-slate-700">رمز إعادة التعيين<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} dir="ltr" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 text-center tracking-[0.5em] outline-none focus:border-emerald-700" /></label>}
          {mode === 'register' && stage === 'code' && <><p className="text-sm text-slate-600">رمز التحقق أُرسل إلى <span dir="ltr" className="font-semibold">{email}</span></p><label className="block space-y-2 text-sm font-semibold text-slate-700">رمز التحقق<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} dir="ltr" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 text-center tracking-[0.5em] outline-none focus:border-emerald-700" /></label></>}
          {(mode === 'login' && (!recoveryStage || recoveryStage === 'password') || mode === 'register' && stage === 'details') && <>
            {mode === 'register' && <label className="block space-y-2 text-sm font-semibold text-slate-700">البريد الإلكتروني<input type="email" required value={email} readOnly dir="ltr" className="w-full rounded-xl border border-emerald-950/10 bg-slate-50 px-4 py-3 text-left text-slate-500" /></label>}
            <label className="block space-y-2 text-sm font-semibold text-slate-700">{recoveryStage === 'password' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}<input type="password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' && !recoveryStage ? 'current-password' : 'new-password'} className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
            {(mode === 'register' && stage === 'details' || mode === 'login' && recoveryStage === 'password') && <label className="block space-y-2 text-sm font-semibold text-slate-700">{recoveryStage === 'password' ? 'تأكيد كلمة المرور الجديدة' : 'تأكيد كلمة المرور'}<input type="password" required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>}
          </>}
          <button type="submit" disabled={busy} className="w-full rounded-full bg-emerald-900 px-5 py-3.5 font-bold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">
            {busy ? 'جارٍ الإرسال…' : recoveryStage === 'email' ? 'إرسال رمز إعادة التعيين' : recoveryStage === 'code' ? 'التحقق من الرمز' : recoveryStage === 'password' ? 'حفظ كلمة المرور الجديدة' : mode === 'login' ? 'تسجيل الدخول' : stage === 'email' ? 'إرسال رمز التحقق' : stage === 'code' ? 'تأكيد البريد' : 'إنشاء الحساب'}
          </button>
        </form>
        {mode === 'login' && !recoveryStage && <button type="button" onClick={() => { setError(null); setMessage(null); setRecoveryStage('email'); }} className="mt-5 block w-full text-center text-sm font-bold text-emerald-800 underline">نسيت كلمة المرور؟</button>}
        {mode === 'login' && recoveryStage && <button type="button" onClick={() => { setRecoveryStage(null); setError(null); setMessage(null); setResetToken(''); }} className="mt-5 block w-full text-center text-sm font-bold text-emerald-800 underline">العودة إلى تسجيل الدخول</button>}
        {!recoveryStage && <p className="mt-6 text-center text-sm text-slate-600">
          {mode === 'login' ? <>ليس لديك حساب؟ <Link to="/register" className="font-bold text-emerald-800 hover:underline">أنشئ حسابًا</Link></> : <>لديك حساب بالفعل؟ <Link to="/login" className="font-bold text-emerald-800 hover:underline">سجّل الدخول</Link></>}
        </p>}
      </div>
    </main></SiteLayout>
  );
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
      setCheckoutError(caught instanceof Error ? caught.message : 'تعذر بدء الاشتراك.');
      setCheckoutId(null);
    }
  }

  return <SiteLayout><main><Container className="py-12 sm:py-16">
    <p className="text-sm font-bold tracking-widest text-emerald-700">الأسعار والباقات</p>
    <h1 className="mt-3 text-3xl font-black text-emerald-950 sm:text-4xl">اختر باقة القراءة المناسبة</h1>
    <p className="mt-3 max-w-3xl leading-8 text-slate-600">قارن الأسعار وما تتضمنه كل باقة قبل الاشتراك. تُدار الأسعار والمزايا من لوحة الإدارة.</p>
    {loading && <LoadingState />}
    {error && <div className="mt-6"><ErrorState message={error} /></div>}
    {!loading && !error && !plans?.length && <div className="mt-8"><EmptyState>لا توجد باقات منشورة حاليًا.</EmptyState></div>}
    {!!plans?.length && <label className="mt-6 block max-w-xl text-sm font-semibold text-slate-700">{t('رمز الخصم (اختياري)', language)}<input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} maxLength={64} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 bg-white px-3 py-2.5" /></label>}
    {!!plans?.length && <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => <article key={plan.id} className="flex flex-col rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-extrabold text-emerald-950">{plan.name}</h2><p className="mt-1 text-sm text-slate-500">{t(plan.isFamily ? 'باقة عائلية' : 'باقة فردية', language)}</p></div>
          <span className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{formatPrice(plan.price, plan.currency, language)} / {t(plan.interval === 'month' ? 'شهر' : 'سنة', language)}</span>
        </div>
        <h3 className="mt-6 font-bold text-emerald-950">{t('ما الذي تتضمنه', language)}</h3>
        <ul className="mt-3 flex-1 space-y-2 text-sm leading-7 text-slate-600">
          {plan.features.map((feature, index) => <li key={`${index}-${feature}`} className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-emerald-700" />{feature}</li>)}
        </ul>
        {user?.role === 'READER'
          ? <button onClick={() => startCheckout(plan.id)} disabled={checkoutId !== null} className="mt-7 w-full rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{t(checkoutId === plan.id ? 'جارٍ تحويلك للدفع…' : 'الاشتراك الآمن', language)}</button>
          : <Link to="/register" className="mt-7 block w-full rounded-full bg-emerald-900 px-5 py-3 text-center font-bold text-white">{t('إنشاء حساب للاشتراك', language)}</Link>}
      </article>)}
    </div>}
    {checkoutError && <div className="mt-6"><ErrorState message={checkoutError} /></div>}
    <p className="mt-10 text-center text-sm text-slate-600">{t('يمكن شراء الكتب الإلكترونية بشكل منفصل دون اشتراك.', language)} <Link to="/books" className="font-bold text-emerald-800 underline">{t('تصفّح الكتب', language)}</Link></p>
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

  return <SiteLayout><main className="bg-slate-50"><Container className="py-12">
    <div className="mx-auto max-w-3xl rounded-[2rem] border border-emerald-950/10 bg-white p-8 shadow-sm">
      <p className="text-sm font-bold tracking-[0.2em] text-emerald-700">{t('طلبات القصص', language)}</p>
      <h1 className="mt-3 text-3xl font-black text-emerald-950">{t('اقترح قصة أو موضوعًا جديدًا', language)}</h1>
      <p className="mt-3 leading-7 text-slate-600">{t('أرسل عنوانًا موجزًا ووصفًا مختصرًا للمحتوى المطلوب. يمكننا تحويل الطلب لاحقًا إلى قصة جديدة أو جزء في السلسلة.', language)}</p>
      {message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block space-y-2 text-sm font-semibold text-slate-700">{t('عنوان الفكرة', language)}<input required value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">{t('الوصف', language)}<textarea required rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">{t('المصدر أو المرجع (اختياري)', language)}<input value={source} onChange={(event) => setSource(event.target.value)} className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">{t('بريد التواصل (اختياري)', language)}<input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
        <button type="submit" disabled={busy} className="rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-60">{busy ? t('جارٍ الإرسال…', language) : t('إرسال الطلب', language)}</button>
      </form>
    </div>
  </Container></main></SiteLayout>;
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

  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-12">
    <div className="w-full max-w-lg rounded-[2rem] border border-emerald-950/10 bg-white p-8 shadow-sm">
      <a href={import.meta.env.VITE_CLIENT_URL || '/'} className="text-sm font-bold text-emerald-800">{t('Voir le site public', language)}</a>
      <span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-800"><ShieldCheck size={23} /></span>
      <h1 className="mt-5 text-2xl font-black text-emerald-950">{t('Connexion administrateur', language)}</h1>
      <p className="mt-2 leading-7 text-slate-600">{t('La connexion nécessite votre mot de passe puis le code envoyé à votre adresse administrateur.', language)}</p>
      {message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{message}</p>}
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      <form onSubmit={submit} className="mt-7 space-y-4">
        <label className="block space-y-2 text-sm font-semibold text-slate-700">{t('Adresse e-mail', language)}<input type="email" required readOnly={stage === 'code'} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" dir="ltr" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 text-left outline-none focus:border-emerald-700 read-only:bg-slate-50" /></label>
        {stage === 'credentials' && <label className="block space-y-2 text-sm font-semibold text-slate-700">{t('Mot de passe', language)}<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>}
        {stage === 'code' && <label className="block space-y-2 text-sm font-semibold text-slate-700">{t('Code de vérification', language)}<input required inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} dir="ltr" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 text-center tracking-[0.5em] outline-none focus:border-emerald-700" /></label>}
        <button disabled={busy} className="w-full rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? t('Vérification…', language) : stage === 'credentials' ? t('Envoyer le code de connexion', language) : t('Ouvrir le tableau de bord', language)}</button>
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
  orderNumber: string | null;
  status: string;
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
  customer: { firstName: string; lastName: string; email: string } | null;
  items: Array<{ quantity: number; title: string; format: 'print' | 'ebook' | null }>;
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
  const { data: ordersPage, loading, error: loadError } = useRemote<{ items: AdminStoreOrder[] }>(`/admin/store-orders?refresh=${reloadKey}`);
  const orders = ordersPage?.items || [];
  const { data: health } = useRemote<{ stripeConfigured: boolean; stripeMode: string; webhookSecretConfigured: boolean; pendingOrders: number; failedEvents: number; amountMismatchOrders: number }>(`/admin/payments/health?refresh=${reloadKey}`);

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

  async function syncOrder(order: AdminStoreOrder) {
    setBusyId(order.id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<{ reconciliation: { status?: string; reason?: string; reconciled?: boolean } }>(`/admin/store-orders/${order.id}/sync`, {});
      setNotice(`تمت مزامنة الطلب ${order.orderNumber || order.id}: ${result.reconciliation?.status || result.reconciliation?.reason || 'محدّث'}.`);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذرت مزامنة الطلب مع Stripe.');
    } finally {
      setBusyId(null);
    }
  }

  return translateTree(<main><Container className="max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-black text-emerald-950">طلبات المتجر</h1><p className="mt-2 text-slate-600">كل الطلبات، بما فيها المعلّقة والفاشلة، مع حالة الدفع والتجهيز.</p></div>
      <button onClick={() => setReloadKey((value) => value + 1)} className="rounded-xl border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">تحديث</button>
    </div>
    {health && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">Stripe</p><p className="mt-1 font-black text-emerald-950">{health.stripeConfigured ? health.stripeMode : 'غير مهيأ'}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">سر الويبهوك</p><p className="mt-1 font-black text-emerald-950">{health.webhookSecretConfigured ? 'مُعرّف' : 'ناقص'}</p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-800">مدفوعات معلّقة</p><p className="mt-1 font-black text-amber-950">{health.pendingOrders}</p></div><div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-bold text-red-700">أحداث فاشلة</p><p className="mt-1 font-black text-red-950">{health.failedEvents}</p></div><div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-bold text-red-700">عدم تطابق المبلغ</p><p className="mt-1 font-black text-red-950">{health.amountMismatchOrders}</p></div></div>}
    {error && <div className="mt-6"><ErrorState message={error} /></div>}{loadError && <div className="mt-6"><ErrorState message={loadError} /></div>}{notice && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">{notice}</p>}
    <section className="mt-8 space-y-4">
      {loading && <LoadingState />}
      {!loading && !loadError && !orders.length && <EmptyState>لا توجد طلبات بعد.</EmptyState>}
      {orders.map((order) => {
        const draft = drafts[order.id] || {
          fulfillmentStatus: order.fulfillmentStatus,
          trackingNumber: order.trackingNumber || ''
        };
        return <article key={order.id} className="rounded-2xl border border-emerald-950/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-bold text-emerald-950">طلب {order.orderNumber || `#${order.id}`} · {formatPrice(order.total, order.currency, language)}</h2><p className="mt-1 text-sm text-slate-600">{order.customer ? `${order.customer.firstName} ${order.customer.lastName} · ${order.customer.email}` : '—'}</p><p className="mt-1 text-xs text-slate-500">{new Date(order.createdAt).toLocaleDateString(language)}</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800">{order.status}</span><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">{fulfillmentLabels[order.fulfillmentStatus]}</span><button type="button" onClick={() => void syncOrder(order)} disabled={busyId === order.id} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800 disabled:opacity-50">مزامنة Stripe</button></div>
          </div>
          <ul className="mt-4 list-inside list-disc text-sm text-slate-700">{order.items.map((item, index) => <li key={`${order.id}-${index}`}>{item.title} × {item.quantity} <span className="text-slate-500">({item.format === 'ebook' ? 'إلكتروني' : 'ورقي'})</span></li>)}</ul>
          {order.shippingAddress && <div className="mt-4 rounded-xl bg-[#f7f6f0] p-4 text-sm leading-7 text-slate-700"><p className="font-bold text-emerald-950">{order.shippingAddress.name} · {order.shippingAddress.phone}</p><p>{order.shippingAddress.line1}{order.shippingAddress.line2 ? `، ${order.shippingAddress.line2}` : ''}</p><p>{order.shippingAddress.postalCode} {order.shippingAddress.city}، {order.shippingAddress.country}</p></div>}
          {['paid', 'fulfilled'].includes(order.status) && order.items.some((item) => item.format === 'print') && <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-slate-700">حالة التجهيز<select value={draft.fulfillmentStatus} onChange={(event) => setDrafts((value) => ({ ...value, [order.id]: { ...draft, fulfillmentStatus: event.target.value as AdminStoreOrder['fulfillmentStatus'] } }))} className="mt-1 block rounded-xl border border-emerald-950/15 px-3 py-2">{fulfillmentOrder.map((status) => <option key={status} value={status} disabled={fulfillmentOrder.indexOf(status) < fulfillmentOrder.indexOf(order.fulfillmentStatus)}>{fulfillmentLabels[status]}</option>)}</select></label>
            <label className="min-w-52 flex-1 text-sm font-semibold text-slate-700">رقم التتبع<input dir="ltr" value={draft.trackingNumber} onChange={(event) => setDrafts((value) => ({ ...value, [order.id]: { ...draft, trackingNumber: event.target.value } }))} className="mt-1 block w-full rounded-xl border border-emerald-950/15 px-3 py-2 text-left" /></label>
            <button onClick={() => saveOrder(order)} disabled={busyId === order.id || (draft.fulfillmentStatus === order.fulfillmentStatus && draft.trackingNumber === (order.trackingNumber || ''))} className="rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busyId === order.id ? 'جارٍ الحفظ…' : 'حفظ التحديث'}</button>
          </div>}
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
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-black text-emerald-950">الاشتراكات والباقات</h1><p className="mt-2 text-slate-600">حالة الوصول تُحدّث من أحداث Stripe، والتعديلات اليدوية متاحة للسجلات غير المرتبطة بمزوّد الدفع.</p></div><button onClick={() => setReloadKey((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900"><RefreshCw size={15} /> تحديث</button></div>
    {error && <div className="mt-6"><ErrorState message={error} /></div>}{loadError && <div className="mt-6"><ErrorState message={loadError} /></div>}{notice && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">{notice}</p>}
    <section className="mt-9">
      <SectionHeading title="حالة كل مشترك" />
      {loading && <LoadingState />}
      {!loading && !loadError && !subscriptions?.length && <EmptyState>لا توجد اشتراكات بعد.</EmptyState>}
      <div className="space-y-3">{subscriptions?.map((subscription) => {
        const status = statusDrafts[subscription.id] || subscription.status;
        return <article key={subscription.id} className="rounded-2xl border border-emerald-950/10 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-bold text-emerald-950">{subscription.user.firstName} {subscription.user.lastName}</h2><p className="mt-1 text-sm text-slate-500">{subscription.user.email}</p><p className="mt-2 text-sm text-slate-600">{subscription.plan ? localizedPlanName(subscription.plan, language) : t('باقة', language)} · {subscription.accessActive ? t('الوصول مفعّل', language) : t('الوصول غير مفعّل', language)}</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${subscription.accessActive ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{status}</span>{subscription.stripeSubscriptionId ? <span className="text-xs text-slate-500">Stripe</span> : <select value={status} onChange={(event) => setStatusDrafts((value) => ({ ...value, [subscription.id]: event.target.value as ReaderSubscription['status'] }))} className="rounded-xl border border-emerald-950/15 px-3 py-2 text-sm"><option value="incomplete">غير مكتمل</option><option value="active">نشط</option><option value="past_due">متأخر السداد</option><option value="canceled">ملغي</option><option value="unpaid">غير مدفوع</option><option value="paused">متوقف</option><option value="expired">منتهي</option></select>}</div>
          </div>
          {subscription.stripeSubscriptionId ? <div className="mt-4">{subscription.cancelAtPeriodEnd ? <button onClick={() => updateStripeRenewal(subscription.id, 'resume')} disabled={busyId === subscription.id} className="text-sm font-bold text-emerald-800 underline disabled:opacity-50">استئناف التجديد</button> : <button onClick={() => updateStripeRenewal(subscription.id, 'cancel')} disabled={busyId === subscription.id} className="text-sm font-bold text-red-700 underline disabled:opacity-50">إيقاف التجديد</button>}</div> : <button onClick={() => updateManualStatus(subscription.id)} disabled={busyId === subscription.id || status === subscription.status} className="mt-4 rounded-full bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === subscription.id ? 'جارٍ الحفظ…' : 'حفظ الحالة'}</button>}
        </article>;
      })}</div>
    </section>
    <section className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-3xl border border-emerald-950/10 bg-white p-6">
        <SectionHeading title={editingPlanId ? 'تعديل الباقة' : 'إنشاء باقة'} />
        {planError && <ErrorState message={planError} />}
        <form onSubmit={savePlan} className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">أدخل اسم الباقة ومزاياها يدويًا بكل لغة. لا تُنشأ ترجمات تلقائية.</p>
          {planLanguages.map(({ code, label }) => <fieldset key={code} className="space-y-3 rounded-2xl border border-emerald-950/10 p-4">
            <legend className="px-2 text-sm font-bold">{label}</legend>
            <label className="block text-sm font-semibold text-slate-700">اسم الباقة<input required value={planDraft.translations[code].name} onChange={(event) => setPlanDraft((current) => ({ ...current, translations: { ...current.translations, [code]: { ...current.translations[code], name: event.target.value } } }))} dir={code === 'ar' ? 'rtl' : 'ltr'} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label>
            <label className="block text-sm font-semibold text-slate-700">المزايا (ميزة واحدة في كل سطر)<textarea required rows={3} value={planDraft.translations[code].features} onChange={(event) => setPlanDraft((current) => ({ ...current, translations: { ...current.translations, [code]: { ...current.translations[code], features: event.target.value } } }))} dir={code === 'ar' ? 'rtl' : 'ltr'} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label>
          </fieldset>)}
          <label className="block text-sm font-semibold text-slate-700">الرابط المختصر (slug)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={planDraft.slug} onChange={(event) => setPlanDraft({ ...planDraft, slug: event.target.value })} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 text-left" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-slate-700">السعر باليورو<input required type="number" min="0.01" step="0.01" value={planDraft.price} onChange={(event) => setPlanDraft({ ...planDraft, price: event.target.value })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label><label className="text-sm font-semibold text-slate-700">الفترة<select value={planDraft.interval} onChange={(event) => setPlanDraft({ ...planDraft, interval: event.target.value as 'month' | 'year' })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5"><option value="month">شهرية</option><option value="year">سنوية</option></select></label></div>
          <div className="flex gap-3">
            <button disabled={planBusy} className="flex-1 rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{planBusy ? 'جارٍ الحفظ…' : editingPlanId ? 'حفظ الباقة' : 'إنشاء الباقة'}</button>
            {editingPlanId && <button type="button" onClick={() => { setEditingPlanId(null); setPlanDraft(emptyPlanDraft()); }} className="rounded-full border border-emerald-950/15 px-5 py-3 font-bold">{t('إلغاء', language)}</button>}
          </div>
        </form>
      </div>
      <div><SectionHeading title="الباقات المنشورة" /><div className="space-y-3">{plansLoading && <LoadingState />}{plansLoadError && <ErrorState message={plansLoadError} />}{plans?.map((plan) => <article key={plan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-950/10 bg-white p-5"><div><h3 className="font-bold text-emerald-950">{localizedPlanName(plan, language)}</h3><p className="mt-1 text-sm text-slate-600">{formatPrice(plan.price, plan.currency, language)} / {t(plan.interval === 'month' ? 'شهر' : 'سنة', language)}</p></div><div className="flex items-center gap-3"><button onClick={() => editPlan(plan)} className="text-sm font-bold text-emerald-800 underline">{t('تعديل', language)}</button><button onClick={() => togglePlan(plan)} className="text-sm font-bold text-red-700 underline">{t(plan.isActive ? 'إيقاف الباقة' : 'تفعيل الباقة', language)}</button></div></article>)}</div></div>
    </section>
  </Container></main>, language);
}

type CheckoutDownload = {
  orderItemId: number;
  bookId: number;
  slug: string;
  title: string;
  cover: string | null;
  canDownload: boolean;
  downloadsRemaining: number | null;
  downloadLimit: number | null;
};

type CheckoutOrder = {
  id: number;
  orderNumber: string | null;
  status: string;
  normalizedStatus: string;
  currency: string;
  total: string;
  totalMinor: number | null;
  createdAt: string;
  items: Array<{ id: number; title: string; quantity: number; format: string | null }>;
  downloads: CheckoutDownload[];
};

type CheckoutResult = {
  kind: 'book' | 'subscription' | 'donation';
  status: string;
  orderId?: number;
  order?: CheckoutOrder;
  recurring?: boolean;
  accessActive?: boolean;
  plan?: { name: string; translations?: PlanTranslations };
};

function checkoutIsPaid(result: CheckoutResult | null) {
  if (!result) return false;
  return ['paid', 'fulfilled', 'active'].includes(result.order?.normalizedStatus || result.order?.status || result.status) || Boolean(result.accessActive);
}

function checkoutIsTerminalFailure(result: CheckoutResult | null) {
  const status = result?.order?.normalizedStatus || result?.order?.status || result?.status;
  return ['failed', 'expired', 'canceled', 'cancelled', 'amount_mismatch', 'refunded'].includes(status || '');
}

export function OrderThankYouPage() {
  const { id = '' } = useParams();
  return <CheckoutResultPage orderIdOverride={id} />;
}

export function CheckoutResultPage({ orderIdOverride }: { orderIdOverride?: string } = {}) {
  const [searchParams] = useSearchParams();
  const language = useSiteLanguage();
  const sessionId = searchParams.get('session_id');
  const orderId = orderIdOverride || searchParams.get('order_id');
  const { user, isLoading } = useStoryAuth();
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user || (!sessionId && !orderId)) { setLoading(false); return; }
    let active = true;
    let timer: number | undefined;
    let attempts = 0;
    async function check() {
      attempts += 1;
      try {
        const response = orderId
          ? await api.get<{ order: CheckoutOrder }>(`/orders/${orderId}/status`).then((value) => ({ kind: 'book' as const, status: value.order.normalizedStatus, orderId: value.order.id, order: value.order }))
          : await api.get<CheckoutResult>(`/payments/session/${encodeURIComponent(sessionId || '')}`);
        if (!active) return;
        setResult(response);
        setError(null);
        setLoading(false);
        if (checkoutIsPaid(response) || checkoutIsTerminalFailure(response)) return;
        if (attempts >= 30) { setTimedOut(true); return; }
        timer = window.setTimeout(check, 2000);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'تعذر التحقق من حالة الدفع.');
        setLoading(false);
        if (attempts >= 30) setTimedOut(true);
        else timer = window.setTimeout(check, 2000);
      }
    }
    setLoading(true);
    setTimedOut(false);
    void check();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [user, sessionId, orderId, attempt]);

  async function downloadBook(download: CheckoutDownload) {
    setDownloadBusy(download.slug);
    setDownloadError(null);
    try {
      const token = await api.post<{ url: string }>(`/books/${encodeURIComponent(download.slug)}/download-token`, {});
      window.location.assign(token.url);
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'تعذر تجهيز رابط التنزيل.');
    } finally {
      setDownloadBusy(null);
    }
  }

  if (isLoading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (!user) return <Navigate to="/login" replace />;
  const paid = checkoutIsPaid(result);
  const failed = checkoutIsTerminalFailure(result);
  const order = result?.order;

  return <SiteLayout><main><Container className="max-w-4xl py-14 sm:py-20">
    <div className={`rounded-[2rem] border p-7 sm:p-10 ${paid ? 'border-emerald-200 bg-emerald-50/70' : failed ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <span className={`grid h-14 w-14 place-items-center rounded-2xl ${paid ? 'bg-emerald-100 text-emerald-800' : failed ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
        {paid ? <Check size={25} /> : failed ? <X size={25} /> : <CreditCard size={24} />}
      </span>
      <h1 className="mt-6 text-3xl font-black leading-relaxed text-emerald-950">
        {paid ? (order ? 'تم تأكيد طلبك' : 'تم تأكيد الدفع') : failed ? 'لم يكتمل الدفع' : 'جارٍ تأكيد عملية الدفع'}
      </h1>
      {loading && <p role="status" className="mt-4 flex items-center gap-2 text-slate-600"><RefreshCw size={16} className="animate-spin" /> نتحقق من حالة الطلب مباشرة لدى Stripe…</p>}
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      {paid && <p className="mt-4 leading-8 text-slate-700">استلمنا دفعتك. كل روابط التنزيل الخاصة بهذا الطلب موجودة أدناه وفي مكتبتك.</p>}
      {failed && <p className="mt-4 leading-8 text-slate-700">لم يُخصم المبلغ أو تم إلغاء العملية. يمكنك العودة إلى السلة والمحاولة مرة أخرى.</p>}
      {!paid && !failed && !error && <p className="mt-4 leading-8 text-slate-700">قد يستغرق تأكيد Stripe بضع ثوان. لا تغلق الصفحة؛ نتحقق تلقائيًا كل ثانيتين.</p>}
      {timedOut && !paid && !failed && <div className="mt-5 rounded-2xl bg-white/70 p-4 text-sm leading-7 text-slate-700">
        <p>التأكيد يتأخر أكثر من المعتاد. إذا وصلتك رسالة الدفع من Stripe فاضغط «تحقق مرة أخرى»، أو تواصل مع الدعم مع رقم الطلب.</p>
        <a href="mailto:support@example.com" className="mt-2 inline-block font-bold text-emerald-800 underline">تواصل مع الدعم</a>
      </div>}
      <div className="mt-7 flex flex-wrap items-center gap-3">
        {!paid && !failed && <button type="button" onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded-full bg-emerald-900 px-6 py-3 font-bold text-white"><RefreshCw size={16} /> تحقق مرة أخرى</button>}
        <Link to={failed ? '/cart' : result?.kind === 'donation' ? '/donations' : '/account'} className="inline-flex items-center gap-2 rounded-full border border-emerald-900/20 bg-white px-6 py-3 font-bold text-emerald-900">
          {failed ? 'العودة إلى السلة' : 'متابعة'}
        </Link>
        {order && <Link to="/account" className="font-bold text-emerald-800 underline">طلباتي ومكتبتي</Link>}
      </div>
    </div>

    {order && <section className="mt-8 rounded-[2rem] border border-emerald-950/10 bg-white p-7 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-2xl font-black text-emerald-950">ملخص الطلب</h2><p className="mt-1 text-sm text-slate-500">رقم {order.orderNumber || order.id} · {new Date(order.createdAt).toLocaleDateString(language)}</p></div>
        <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-900">{order.normalizedStatus}</span>
      </div>
      <ul className="mt-5 divide-y divide-slate-100">{order.items.map((item) => <li key={item.id} className="flex justify-between gap-3 py-3 text-sm"><span className="font-semibold text-slate-800">{item.title} <span className="font-normal text-slate-500">× {item.quantity}</span></span><span className="text-slate-500">{item.format === 'ebook' ? 'كتاب إلكتروني' : 'نسخة مطبوعة'}</span></li>)}</ul>
      <p className="mt-3 text-end text-lg font-black text-emerald-950">{formatPrice(order.total, order.currency, language)}</p>

      {!!order.downloads.length && <div className="mt-8 border-t border-slate-100 pt-7">
        <h3 className="text-xl font-extrabold text-emerald-950">تنزيلاتك</h3>
        <p className="mt-1 text-sm text-slate-500">كل كتاب إلكتروني في الطلب، مع عدد التنزيلات المتبقية.</p>
        {downloadError && <div className="mt-4"><ErrorState message={downloadError} /></div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{order.downloads.map((download) => <article key={download.orderItemId} className="flex gap-3 rounded-2xl border border-emerald-950/10 p-4">
          <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-[#efe8d8]">{download.cover ? <img src={download.cover} alt="" className="h-full w-full object-cover" /> : <BookOpen className="m-3 text-emerald-800" size={24} />}</div>
          <div className="min-w-0 flex-1"><h4 className="line-clamp-2 font-bold text-emerald-950">{download.title}</h4><p className="mt-1 text-xs text-slate-500">{download.downloadsRemaining === null ? 'تنزيلات غير محدودة' : `${download.downloadsRemaining} تنزيلات متبقية`}</p>
            {download.canDownload ? <button type="button" onClick={() => void downloadBook(download)} disabled={downloadBusy === download.slug || download.downloadsRemaining === 0} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><BookOpen size={14} /> {downloadBusy === download.slug ? 'جارٍ التجهيز…' : 'تنزيل PDF'}</button> : <span className="mt-2 block text-xs font-bold text-red-700">غير متاح حاليًا</span>}
          </div>
        </article>)}</div>
      </div>}
    </section>}
  </Container></main></SiteLayout>;
}

export function MembershipPage() {
  const { user } = useStoryAuth();
  return <SiteLayout><main><Container className="max-w-3xl py-14 sm:py-20">
    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-800"><Star size={25} /></span>
    <h1 className="mt-6 text-3xl font-black leading-relaxed text-emerald-950">اقرأ الحكاية كاملة</h1>
    <p className="mt-4 leading-8 text-slate-600">بعض الأجزاء متاحة للمشتركين. يمكنك الاطلاع على الباقات المتاحة وإدارة حالة اشتراكك من حسابك.</p>
    {user ? <Link to="/account" className="mt-7 inline-flex rounded-full bg-emerald-900 px-6 py-3 font-bold text-white">عرض حالة اشتراكي</Link> : <Link to="/register" className="mt-7 inline-flex rounded-full bg-emerald-900 px-6 py-3 font-bold text-white">إنشاء حساب</Link>}
    <p className="mt-5 text-sm text-slate-500">الأجزاء المجانية تبقى متاحة دائمًا وفق سياسة النشر.</p>
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
      <p className="text-sm font-bold tracking-widest text-emerald-700">{t('قيمنا ومعاييرنا', language)}</p>
      <h1 className="mt-3 text-3xl font-black leading-relaxed text-emerald-950 sm:text-4xl">{managedPolicy.title}</h1>
      <div className="mt-7 whitespace-pre-wrap rounded-2xl border border-emerald-950/10 bg-white p-6 leading-8 text-slate-700">{managedPolicy.body}</div>
    </Container></main></SiteLayout>;
  }
  return <SiteLayout><main><Container className="max-w-4xl py-12 sm:py-16">
    <p className="text-sm font-bold tracking-widest text-emerald-700">قيمنا ومعاييرنا</p>
    <h1 className="mt-3 text-3xl font-black leading-relaxed text-emerald-950 sm:text-4xl">{content.title}</h1>
    <p className="mt-5 text-lg leading-9 text-slate-600">{content.intro}</p>
    <div className="mt-9 space-y-4">{content.sections.map(([title, description], index) => <article key={title} className="rounded-2xl border border-emerald-950/10 bg-white p-6 sm:p-7"><div className="flex items-start gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-800">{String(index + 1).padStart(2, '0')}</span><div><h2 className="text-lg font-extrabold text-emerald-950">{title}</h2><p className="mt-2 leading-8 text-slate-600">{description}</p></div></div></article>)}</div>
    <div className="mt-8 flex items-center gap-2 rounded-2xl bg-emerald-50 p-5 text-sm leading-7 text-emerald-950"><ShieldCheck size={20} className="shrink-0" /> نواصل تحسين هذه المعايير مع المراجعين والمتخصصين، ونراجع كل مادة قبل إتاحتها للقراء.</div>
  </Container></main></SiteLayout>;
}
