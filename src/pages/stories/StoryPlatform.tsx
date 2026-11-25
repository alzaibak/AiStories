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
  Gift, ShoppingBag, Sparkles, Star, UserRound, X
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
  collection?: { id: number; title: string; slug: string; isFree?: boolean };
  parts?: StoryPart[];
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

function StoryArtwork({ story, className = '' }: { story: Pick<StorySummary, 'title' | 'cover'>; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-[#b4834f] ${className}`}>
      {story.cover && <img src={story.cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      {!story.cover && (
        <>
          <div className="absolute -left-8 -top-10 h-48 w-48 rounded-full border border-white/15" />
          <div className="absolute -left-2 -top-4 h-36 w-36 rounded-full border border-white/15" />
          <Sparkles className="absolute bottom-5 left-5 text-amber-200/80" size={20} />
        </>
      )}
      {!story.cover && <span dir="auto" className="absolute inset-x-5 bottom-5 line-clamp-2 text-lg font-bold leading-8 text-white">{story.title}</span>}
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

function HeroMysteryBoxCard({ box, language }: { box: MysteryBoxHeader; language: SiteLanguage }) {
  const countdown = useRemainingTime(box.showCountdownInHeader ? box.endsAt : null);
  const accent = box.accentColor || '#F3E3B8';
  const countdownUnits = [
    { value: countdown?.days ?? 0, label: t('يوم', language) },
    { value: countdown?.hours ?? 0, label: t('ساعة', language) },
    { value: countdown?.minutes ?? 0, label: t('دقيقة', language) },
    { value: countdown?.seconds ?? 0, label: t('ثانية', language) }
  ];

  return (
    <div className="relative">
      <div className="absolute -inset-5 rounded-[3rem] border border-amber-100/20" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/15 shadow-2xl">
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(145deg, ${box.colorFrom} 0%, ${box.colorTo} 100%)` }} />
        <div className="absolute inset-0 opacity-45" style={{ backgroundImage: 'radial-gradient(circle at 18% 10%, rgba(255,255,255,.38) 0, transparent 34%), radial-gradient(circle at 90% 85%, rgba(0,0,0,.4) 0, transparent 48%)' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
        <div className="relative flex min-h-[30rem] flex-col justify-between gap-8 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-2xl backdrop-blur ${box.animationStyle === 'pulse' ? 'animate-pulse' : ''}`} aria-hidden="true">
              {box.icon || '🎁'}
            </span>
            <div className="flex flex-wrap justify-end gap-2">
              {box.almostSoldOut && (
                <span className="rounded-full border border-amber-200/40 bg-amber-200/15 px-3 py-1.5 text-[11px] font-bold text-amber-100 backdrop-blur">{t('اقترب النفاد', language)}</span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[11px] font-bold text-white/85 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
                {t('متاح الآن', language)}
              </span>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: accent }}>
              {box.seasonLabel || t('صندوق الغموض', language)}
            </p>
            <h2 className="mt-2 line-clamp-2 text-3xl font-black leading-[1.35] text-white">{box.label}</h2>
            <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
              <span className="text-2xl font-black text-white">{formatPrice(Number(box.price.amount), box.price.currency, language)}</span>
              {box.price.tier === 'early_bird' && (
                <span className="mb-1 rounded-full px-2.5 py-1 text-[10px] font-black" style={{ backgroundColor: accent, color: '#102f27' }}>{t('سعر مبكر', language)}</span>
              )}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-white/70">
              {box.itemCount > 0 && <span>{box.itemCount} {t('عنصرًا داخل الصندوق', language)}</span>}
              {typeof box.remaining === 'number' && <span>{box.itemCount > 0 ? '· ' : ''}{t('بقي', language)} {box.remaining}</span>}
            </p>

            {box.showCountdownInHeader && countdown && (
              <div className="mt-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">{t('ينتهي خلال', language)}</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {countdownUnits.map((unit) => (
                    <div key={unit.label} className="rounded-xl border border-white/10 bg-black/20 px-1 py-2 text-center backdrop-blur">
                      <p className="text-lg font-black leading-none text-white">{String(unit.value).padStart(2, '0')}</p>
                      <p className="mt-1 text-[9px] font-semibold text-white/60">{unit.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <span className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black shadow-soft" style={{ backgroundColor: accent, color: '#102f27' }}>
              <Gift size={16} aria-hidden="true" />
              {t('قريبًا', language)}
            </span>
          </div>
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
        <section className="relative overflow-hidden bg-[#102f27] text-white">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 85% 20%, #ca9b5b 0, transparent 26%), radial-gradient(circle at 12% 90%, #278369 0, transparent 32%)' }} />
          <Container className="relative grid min-h-[570px] gap-12 py-16 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-amber-100">
                <Sparkles size={16} /> حكايات من نور الهداية
              </span>
              <h1 className="mt-7 max-w-2xl text-4xl font-black leading-[1.45] tracking-tight sm:text-5xl lg:text-6xl">
                قصصٌ تُروى… <span className="text-amber-200">وقيمٌ تبقى.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-emerald-50/80 sm:text-lg">
                عِش مع قصص الأنبياء والصحابة ومحطات التاريخ الإسلامي، في تجربة قراءة ممتعة وموثوقة لكل أفراد الأسرة.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/stories" className={buttonClasses({ variant: 'gold', size: 'lg' })}>
                  {t('ابدأ القراءة', language)}
                  <ChevronLeft size={18} />
                </Link>
                <a href="#start-journey" className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'border-white/25 bg-white/5 text-white hover:border-white/40 hover:bg-white/10' })}>
                  {t('كيف تعمل الحكايات؟', language)}
                </a>
              </div>
              <p className="mt-4 text-sm text-emerald-100/70">
                {t('مجاني للبدء', language)} · {t('أجزاء قصيرة', language)} · {t('تقدّمك محفوظ', language)}
              </p>
              <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-emerald-100/80">
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
        <p className="text-sm font-bold tracking-widest text-emerald-700">مكتبة الحكايات</p>
        <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><h1 className="text-3xl font-black text-emerald-950 sm:text-4xl">اختر حكايتك القادمة</h1><p className="mt-3 text-slate-600">قصص موثقة، مقسمة إلى أجزاء قصيرة تناسب وقتك.</p></div>
          <label className="flex h-12 w-full items-center gap-3 rounded-full border border-emerald-950/15 bg-white px-4 sm:max-w-sm">
            <Search size={18} className="text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن قصة أو موضوع" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" aria-label="ابحث عن قصة" />
          </label>
        </div>
        {!search && recommended && (
          <div className="mt-8 overflow-hidden rounded-3xl border border-brand/20 bg-brand-soft/60 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-ink">{t('ابدأ من هنا', language)}</p>
                <h2 dir="auto" className="mt-2 text-2xl font-black text-ink">{recommended.title}</h2>
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
        {!!collections?.length && <div className="mt-9 flex flex-wrap gap-2">{collections.map((collection) => <a key={collection.id} href={`#collection-${collection.id}`} className="rounded-full border border-emerald-950/15 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:border-emerald-700">{collection.title}</a>)}</div>}
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
    <Link to="/stories" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowUpLeft size={17} />{t('العودة إلى القصص', language)}</Link>
    {loading && <LoadingState />}
    {error && <div className="mt-8"><ErrorState message={error} /></div>}
    {collection && <>
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
  const completedCount = parts.filter((part) => completedPartSet.has(part.id)).length;
  const readableParts = parts.filter((part) => part.accessible);
  const finished = parts.length > 0 && completedCount === parts.length;
  const started = completedCount > 0;
  const totalMinutes = parts.reduce((total, part) => total + (part.estimatedReadingMinutes || 0), 0);
  const progressPercent = parts.length ? Math.max(0, Math.min(100, Math.round((completedCount / parts.length) * 100))) : 0;
  const lastPart = parts[parts.length - 1];
  const { data: profile } = useRemote<ProfileSummary>(user && started ? '/me/profile-summary' : '');
  const { data: libraryStories } = useRemote<StorySummary[]>('/stories?limit=100');
  const readIds = new Set((readingProgress || []).filter((entry) => entry.completedParts?.length).map((entry) => entry.storyId));

  const [resumePartNumber, setResumePartNumber] = useState<number | null>(null);
  useEffect(() => {
    if (!story) return;
    const stored = Number(window.localStorage.getItem(`reader-last-part:${story.id}`));
    setResumePartNumber(Number.isSafeInteger(stored) && stored > 0 ? stored : null);
  }, [story]);

  const resumePart = parts.find((part) => part.partNumber === resumePartNumber && part.accessible)
    || readableParts.find((part) => !completedPartSet.has(part.id))
    || readableParts[0];
  const currentPart = finished ? undefined : resumePart;
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
  const primaryHref = finished
    ? `/stories/${story?.slug}/read/${lastPart?.partNumber || 1}#quiz`
    : currentPart
      ? `/stories/${story?.slug}/read/${currentPart.partNumber}`
      : '/membership';
  const primaryLabel = finished
    ? t('أعد القراءة', language)
    : currentPart
      ? started
        ? `${t('متابعة القراءة')} — ${t('الجزء', language)} ${currentPart.partNumber}`
        : t('ابدأ القراءة')
      : t('افتح الحكاية بالاشتراك');

  return (
    <SiteLayout>
      <main>
        <Container className="py-7 sm:py-12">
          <nav aria-label={t('مسار التصفح', language)} className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Link to="/stories" className="inline-flex items-center gap-1.5 font-semibold hover:text-brand-ink">
              <ArrowUpLeft size={16} className="rtl:rotate-180" aria-hidden="true" /> {t('العودة إلى القصص', language)}
            </Link>
            {story?.collection?.title && <span aria-hidden="true">/</span>}
            {story?.collection?.title && (
              <Link to={`/collections/${story.collection.slug}`} className="hover:text-brand-ink">{story.collection.title}</Link>
            )}
          </nav>

          {loading && <LoadingState />}
          {error && <div className="mt-8"><ErrorState message={error} /></div>}

          {story && (
            <>
              <section className="mt-6 grid items-start gap-8 sm:mt-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-12">
                <div className="mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none">
                  <CoverArt
                    title={story.title}
                    cover={story.heroImage || story.cover}
                    variants={story.coverVariants}
                    seed={story.id}
                    priority
                    sizes="(min-width: 1024px) 34vw, 100vw"
                    className="aspect-[3/4] rounded-[20px] border border-line"
                  />
                  {story.imageCredit && <p className="mt-2 text-xs text-ink-faint">{t('حقوق الصورة', language)}: {story.imageCredit}</p>}
                </div>

                <div className="min-w-0">
                  <p className="ds-eyebrow">{sourceLabel}</p>
                  <h1 dir="auto" className="ds-title mt-3 text-[2.35rem] leading-[1.25] text-ink sm:text-5xl">{story.title}</h1>
                  {story.hook && <p dir="auto" className="mt-4 max-w-[46rem] font-reading text-xl leading-9 text-brand-ink">{story.hook}</p>}
                  <p dir="auto" className="mt-3 line-clamp-2 max-w-[46rem] text-base leading-8 text-ink-muted">{story.summary}</p>

                  <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-muted">
                    {parts.length > 0 && <span>{pluralParts(parts.length, language)}</span>}
                    {totalMinutes > 0 && <><span aria-hidden="true">·</span><span>{pluralMinutes(totalMinutes, language)}</span></>}
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5 text-ink">
                      <ShieldCheck size={14} className="text-brand-ink" aria-hidden="true" />
                      {story.reviewerName ? t('مراجعة علمية', language) : t('مراجعة موثوقة', language)}
                    </span>
                  </p>

                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <Link to={primaryHref} className={buttonClasses({ size: 'lg' })}>
                      {primaryLabel}
                      {!finished && <ChevronLeft size={17} className="ltr:rotate-180" aria-hidden="true" />}
                    </Link>
                    <details className="relative">
                      <summary
                        aria-label={t('شارك الحكاية', language)}
                        className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full border border-line text-ink-muted transition hover:bg-surface-soft hover:text-ink [&::-webkit-details-marker]:hidden"
                      >
                        <Share2 size={17} aria-hidden="true" />
                      </summary>
                      <div className="ds-pop absolute end-0 top-full z-20 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-lift">
                        <button type="button" onClick={() => void copyLink()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-soft">
                          <Share2 size={15} aria-hidden="true" /> {t('نسخ الرابط', language)}
                        </button>
                        {shareNotice && <p role="status" className="px-3 pb-1 pt-1 text-xs text-ink-muted">{shareNotice}</p>}
                      </div>
                    </details>
                  </div>
                </div>
              </section>

              <section aria-labelledby="journey-heading" className="mt-12 rounded-2xl border border-line bg-surface/50 p-5 sm:mt-16 sm:p-7">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id="journey-heading" className="text-xl font-semibold text-ink">{t('رحلة القراءة', language)}</h2>
                  <p className="text-sm text-ink-muted">
                    {completedCount} / {parts.length} {t('أجزاء', language)}
                    {progressPercent >= 100 && <span className="text-success"> · {t('اكتملت', language)}</span>}
                  </p>
                </div>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label={t('تقدّم القراءة', language)}>
                  <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
                </div>

                <ol className="journey mt-5">
                  {parts.map((part) => {
                    const done = completedPartSet.has(part.id);
                    const locked = !done && part.accessible === false;
                    const current = !done && !locked && currentPart?.id === part.id;
                    const state = done ? 'done' : locked ? 'locked' : current ? 'current' : 'todo';
                    return (
                      <li
                        key={part.id}
                        className="journey-row"
                        data-state={state}
                        aria-current={current ? 'step' : undefined}
                      >
                        <span className="journey-dot" aria-hidden="true">
                          {done ? <Check size={17} /> : locked ? <LockKeyhole size={15} /> : part.partNumber}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="journey-title flex flex-wrap items-baseline gap-x-2" dir="auto">
                            <span className={`font-semibold text-ink ${current ? 'text-[1.0625rem]' : ''}`}>
                              {t('الجزء', language)} {part.partNumber} — {part.title}
                            </span>
                            {current && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-ink">{t('التالي', language)}</span>}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                            <span className="inline-flex items-center gap-1"><Clock3 size={12} aria-hidden="true" /> {formatReadingTime(part.estimatedReadingMinutes, language)}</span>
                            {done && <span className="text-success">· {t('اكتمل', language)}</span>}
                          </p>
                          {part.endingHook && !locked && <p dir="auto" className="mt-1 line-clamp-1 text-xs text-ink-faint">{part.endingHook}</p>}
                        </div>
                        <div className="shrink-0 self-center">
                          {locked ? (
                            <Link to="/membership" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-ink-muted hover:text-ink">
                              <LockKeyhole size={13} aria-hidden="true" /> {t('افتح', language)}
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
                </ol>

                {(started || finished) && user && profile && (
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
                <details className="mt-8 border-y border-line">
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

              <div className="mt-10 grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-line bg-surface p-5">
                  <h2 className="text-base font-semibold text-ink">{t('اختبر فهمك', language)}</h2>
                  <p className="mt-1 text-sm leading-7 text-ink-muted">{t('اختبار قصير مبني على مصادر الحكاية.')}</p>
                  {finished ? (
                    <Link to={`/stories/${story.slug}/read/${lastPart?.partNumber || 1}#quiz`} className={buttonClasses({ size: 'sm', className: 'mt-4' })}>
                      {t('ابدأ الاختبار', language)}
                    </Link>
                  ) : (
                    <p className="mt-3 text-xs text-ink-faint">{t('يُفتح الاختبار بعد إكمال الجزء الأخير', language)}</p>
                  )}
                </section>

                <section className="rounded-2xl border border-line p-5">
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

              {!!story.videos?.length && (
                <section id="story-video" className="mt-12" aria-labelledby="watch-story">
                  <h2 id="watch-story" className="text-xl font-semibold text-ink">{t('شاهد الحكاية', language)}</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {story.videos.map((video) => <StoryVideoPlayer key={video.id} video={video} language={language} />)}
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

type ReaderPreferences = {
  size: 's' | 'm' | 'l' | 'xl';
  spacing: 'compact' | 'normal' | 'airy';
  width: 'narrow' | 'wide';
};

const defaultReaderPreferences: ReaderPreferences = { size: 'm', spacing: 'normal', width: 'narrow' };

function readReaderPreferences(): ReaderPreferences {
  try {
    const raw = window.localStorage.getItem('reader-preferences');
    if (!raw) return defaultReaderPreferences;
    const parsed = JSON.parse(raw) as Partial<ReaderPreferences>;
    return {
      size: ['s', 'm', 'l', 'xl'].includes(String(parsed.size)) ? parsed.size as ReaderPreferences['size'] : 'm',
      spacing: ['compact', 'normal', 'airy'].includes(String(parsed.spacing)) ? parsed.spacing as ReaderPreferences['spacing'] : 'normal',
      width: parsed.width === 'wide' ? 'wide' : 'narrow'
    };
  } catch {
    return defaultReaderPreferences;
  }
}

function readStoredReadingTheme(): 'light' | 'reading' | 'dark' {
  try {
    const stored = window.localStorage.getItem('reader-theme');
    if (stored === 'dark' || stored === 'reading' || stored === 'sepia') return stored === 'sepia' ? 'reading' : stored;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function ReaderPage() {
  const { slug = '', partNumber = '' } = useParams();
  const number = Number(partNumber);
  const language = useSiteLanguage();
  const { user } = useStoryAuth();
  const navigate = useLocalizedNavigate();
  const { setTheme: setSiteTheme } = useSiteTheme();
  const [readingTheme, setReadingTheme] = useState<'light' | 'reading' | 'dark'>(readStoredReadingTheme);
  const [preferences, setPreferences] = useState<ReaderPreferences>(readReaderPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
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
  const [notice, setNotice] = useState<string | null>(null);
  const [completedPartsCount, setCompletedPartsCount] = useState(0);
  const [completion, setCompletion] = useState<CompletionPayload | null>(null);
  const [notificationPromptVisible, setNotificationPromptVisible] = useState(false);

  useEffect(() => {
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
    Promise.all([
      api.get<StorySummary>(`/stories/${encodeURIComponent(slug)}`),
      api.get<StoryPart & { content: string; endingHook: string }>(`/stories/${encodeURIComponent(slug)}/parts/${number}`)
    ]).then(([storyResponse, partResponse]) => {
      if (!active) return;
      setStory(storyResponse);
      setPart(partResponse);
      setQuiz(null);
      setQuizLocked(false);
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
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل الجزء.');
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
      const following = story.parts?.find((candidate) => candidate.partNumber === part.partNumber + 1);
      if (following?.accessible) {
        navigate(`/stories/${story.slug}/read/${following.partNumber}`);
        window.scrollTo({ top: 0, behavior: 'auto' });
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
  if (error && !part) return <SiteLayout><Container className="py-12"><ErrorState message={error} /><Link to={`/stories/${slug}`} className="mt-5 inline-flex items-center gap-2 font-semibold text-brand-ink"><ArrowLeft size={16} /> {t('العودة إلى الحكاية', language)}</Link></Container></SiteLayout>;
  if (!story || !part) return <Navigate to="/stories" replace />;

  const previous = story.parts?.find((candidate) => candidate.partNumber === number - 1);
  const next = story.parts?.find((candidate) => candidate.partNumber === number + 1);
  const totalParts = story.parts?.length || part.partNumber;
  const partPosition = language === 'fr'
    ? `Partie ${part.partNumber} sur ${totalParts}`
    : language === 'en'
      ? `Part ${part.partNumber} of ${totalParts}`
      : `الجزء ${part.partNumber} من ${totalParts}`;
  const isLastPart = !next;
  const retention = retentionCopy(language);

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
  const readingActionLabel = user ? t('أنهِ الجزء وتابع', language) : t('سجّل الدخول للحفظ', language);

  return (
    <SiteLayout>
      <main
        data-reading-theme={readingTheme}
        className="reader-shell"
        data-reader-size={preferences.size}
        data-reader-spacing={preferences.spacing}
        data-reader-width={preferences.width}
      >
        <div className="reader-scroll-progress" aria-hidden="true"><span style={{ width: `${scrollProgress}%` }} /></div>

        <div className="sticky top-[var(--header-height)] z-20 border-b border-line bg-canvas/95 backdrop-blur-sm">
          <Container className="flex min-h-14 items-center gap-2 py-1.5">
            <Link to={`/stories/${story.slug}`} className="inline-flex min-h-11 items-center gap-1.5 pe-2 text-sm font-semibold text-ink-muted hover:text-ink">
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="hidden max-w-48 truncate sm:inline">{story.title}</span>
            </Link>
            <p className="mx-auto min-w-0 truncate px-2 text-center text-xs font-semibold text-ink-faint">{partPosition}</p>
            <button
              type="button"
              aria-pressed={readingTheme !== 'light'}
              aria-label={t(readingTheme === 'light' ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح', language)}
              onClick={() => setReadingTheme(readingTheme === 'light' ? 'dark' : 'light')}
              className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-soft hover:text-ink"
            >
              {readingTheme === 'light' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
            </button>
            <button
              type="button"
              aria-expanded={settingsOpen}
              aria-label={t('إعدادات القراءة', language)}
              onClick={() => setSettingsOpen((open) => !open)}
              className={`inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-semibold transition ${settingsOpen ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-soft hover:text-ink'}`}
            >
              <span aria-hidden="true" className="font-reading text-base leading-none">Aa</span>
            </button>
          </Container>

          {settingsOpen && (
            <Container className="border-t border-line bg-surface py-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              </div>
            </Container>
          )}
        </div>

        <Container className="max-w-5xl pb-24 pt-8 sm:pt-12">
          <header className="mx-auto max-w-[46rem] text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">{partPosition}</p>
            <h1 dir="auto" className="ds-title mt-2 text-2xl leading-relaxed text-ink sm:text-3xl">{part.title}</h1>
            <p className="mt-2 inline-flex items-center gap-2 text-xs text-ink-muted">
              <Clock3 size={13} aria-hidden="true" /> {formatReadingTime(part.estimatedReadingMinutes, language)}
            </p>
          </header>

          <div className="star-divider my-7" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2.6 14.6 7.4 20 8.2 16.1 12 17 17.4 12 14.8 7 17.4 7.9 12 4 8.2 9.4 7.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
          </div>

          {part.illustrationImage && (
            <figure className="mx-auto mb-8 max-w-[46rem] overflow-hidden rounded-2xl border border-line">
              <img src={part.illustrationImage} alt={part.illustrationAlt || ''} className="max-h-[26rem] w-full object-cover" loading="lazy" />
            </figure>
          )}

          <article dir="auto" className="reader-body">
            {part.content}
          </article>

          {part.endingHook && (
            <p dir="auto" className="mx-auto mt-9 max-w-[38rem] border-s-2 border-gold ps-4 text-base italic leading-8 text-ink-muted">
              {part.endingHook}
            </p>
          )}

          <div className="mx-auto mt-10 flex max-w-[46rem] flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
            {previous ? (
              <Link to={`/stories/${slug}/read/${previous.partNumber}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-muted hover:text-ink">
                <ChevronRight size={17} aria-hidden="true" /> {t('الجزء السابق', language)}
              </Link>
            ) : <span />}
            {user ? (
              <button type="button" onClick={() => void markAsRead()} disabled={busy} className={buttonClasses({ size: 'md' })}>
                {busy ? t('جارٍ الحفظ…', language) : isLastPart ? t('أنهِ الحكاية', language) : readingActionLabel}
                {!isLastPart && <ChevronLeft size={17} className="ltr:rotate-180" aria-hidden="true" />}
              </button>
            ) : (
              <Link to="/login" className={buttonClasses({ size: 'md' })}>{t('سجّل الدخول للحفظ', language)}</Link>
            )}
          </div>

          {notice && <p role="status" className="calm-toast mx-auto mt-4 flex max-w-[46rem] items-center gap-2 text-sm font-semibold text-success"><Check size={16} aria-hidden="true" /> {notice}</p>}
          {error && <div className="mx-auto mt-4 max-w-[46rem]"><ErrorState message={error} /></div>}

          {isLastPart && (
            <section className="mx-auto mt-10 max-w-[46rem] rounded-2xl border border-line bg-surface p-6">
              <p className="ds-eyebrow">{t('نهاية الحكاية', language)}</p>
              <h2 className="ds-title mt-2 text-2xl text-ink">{retention.finished}</h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{retention.proof(completedPartsCount, totalParts)}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {quiz && <a href="#quiz" className={buttonClasses({ size: 'sm' })}><CircleHelp size={15} aria-hidden="true" /> {t('اختبر فهمك', language)}</a>}
                <Link to={`/stories/${story.slug}`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{retention.back}</Link>
                <Link to="/stories" className={buttonClasses({ variant: 'quiet', size: 'sm' })}>{t('اختر حكاية', language)}</Link>
              </div>
              {completion && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-brand-ink"><Award size={16} aria-hidden="true" /> {completion.pointsGained > 0 ? `+${completion.pointsGained}` : '0'} {retention.points}</p>
                  <p className="mt-1 text-xs text-ink-muted"><Flame size={12} className="inline" aria-hidden="true" /> {retention.days(completion.streak.current)} · {completion.level.name || completion.level.level}</p>
                </div>
              )}
            </section>
          )}

          {user && completedPartsCount > 0 && notificationPromptVisible && (
            <div className="mx-auto mt-6 max-w-[46rem] rounded-2xl border border-line p-4 text-sm text-ink">
              <p className="font-semibold">{t('هل نرسل لك تذكيرًا لطيفًا بالحكاية القادمة؟', language)}</p>
              <p className="mt-1 text-ink-muted">{t('يمكنك تفعيل التذكيرات أو إيقافها في أي وقت من إعدادات حسابك.', language)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/account" className={buttonClasses({ size: 'sm' })}>{t('إدارة التذكيرات', language)}</Link>
                <button type="button" onClick={() => setNotificationPromptVisible(false)} className="min-h-9 rounded-full border border-line px-4 text-sm font-semibold text-ink-muted hover:text-ink">{t('ليس الآن', language)}</button>
              </div>
            </div>
          )}

          {quiz && isLastPart && (
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 px-4 py-2 backdrop-blur-sm sm:hidden">
          <div className="flex items-center gap-2">
            {previous && <Link to={`/stories/${slug}/read/${previous.partNumber}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-ink-muted" aria-label={t('الجزء السابق', language)}><ChevronRight size={18} aria-hidden="true" /></Link>}
            {user ? (
              <button type="button" onClick={() => void markAsRead()} disabled={busy} className={buttonClasses({ size: 'md', block: true })}>
                {busy ? t('جارٍ الحفظ…', language) : isLastPart ? t('أنهِ الحكاية', language) : readingActionLabel}
              </button>
            ) : (
              <Link to="/login" className={buttonClasses({ size: 'md', block: true })}>{t('سجّل الدخول للحفظ', language)}</Link>
            )}
          </div>
        </div>
      </main>
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
    <p className="text-sm font-bold tracking-widest text-emerald-700">{t('مساهمة مجتمعية', language)}</p>
    <h1 className="mt-3 text-3xl font-black text-emerald-950 sm:text-4xl">{t('دعم نشر الحكايات الموثوقة', language)}</h1>
    <p className="mt-3 max-w-2xl leading-8 text-slate-600">{t('ساهم في تطوير محتوى موثوق وآمن للعائلة. تتم معالجة التبرعات عبر Stripe.', language)}</p>
    {checkoutError && <div className="mt-5"><ErrorState message={checkoutError} /></div>}
    {error && <div className="mt-5"><ErrorState message={error} /></div>}
    {loading && <LoadingState />}
    {!loading && !error && !campaigns?.length && <EmptyState>{t('لا توجد حملات تبرع نشطة حاليًا.', language)}</EmptyState>}
    <div className="mt-8 grid gap-5 md:grid-cols-2">{campaigns?.map((campaign) => {
      const goal = Number(campaign.goalAmount);
      const raised = Number(campaign.raisedAmount);
      return <article key={campaign.id} className="rounded-3xl border border-emerald-950/10 bg-white p-6">
        <h2 className="text-xl font-extrabold text-emerald-950">{campaign.title}</h2>
        <p className="mt-3 leading-7 text-slate-600">{campaign.description}</p>
        <p className="mt-5 text-sm font-bold text-emerald-900">{formatPrice(raised, campaign.currency, language)} / {formatPrice(goal, campaign.currency, language)}</p>
        <progress value={Math.min(raised, goal)} max={goal} aria-label={t('تقدم الحملة', language)} className="mt-2 w-full" />
        <div className="mt-5 flex gap-3">
          <label className="min-w-0 flex-1 text-sm font-semibold">{t('مبلغ التبرع', language)}<input type="number" min="0.5" step="0.01" value={amounts[campaign.id] || '5'} onChange={(event) => setAmounts((current) => ({ ...current, [campaign.id]: event.target.value }))} dir="ltr" className="mt-1 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 text-left" /></label>
          <button onClick={() => void donate(campaign)} disabled={busyId === campaign.id} className="self-end rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{busyId === campaign.id ? t('جارٍ التحويل…', language) : t('تبرع الآن', language)}</button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={Boolean(recurring[campaign.id])} onChange={(event) => setRecurring((current) => ({ ...current, [campaign.id]: event.target.checked }))} />{t('اجعل التبرع شهريًا متكررًا', language)}</label>
      </article>;
    })}</div>
  </Container></main></SiteLayout>;
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

export function BookDetailPage() {
  const { slug = '' } = useParams();
  const language = useSiteLanguage();
  const navigate = useLocalizedNavigate();
  const { user } = useStoryAuth();
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
  const [promoCode, setPromoCode] = useState('');
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

  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (!book) return;
    if (!user || user.role !== 'READER') {
      navigate('/login');
      return;
    }
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const response = await api.post<{ checkoutUrl: string }>('/payments/books/checkout', {
        items: [{ bookId: book.id, quantity }],
        language,
        ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
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
        {book.cover ? <img src={book.cover} alt="" className="aspect-[0.9] h-full w-full object-cover" /> : <div className="grid aspect-[0.9] place-items-center bg-gradient-to-br from-amber-100 via-[#e5d7b8] to-emerald-100"><BookOpen size={54} strokeWidth={1.2} className="text-emerald-800/70" /></div>}
      </div>
      <div className="self-center">
        <p className="text-sm font-bold text-emerald-700">من متجر الحكايات</p>
        <h1 className="mt-3 text-3xl font-black leading-relaxed text-emerald-950">{book.title}</h1>
        <p className="mt-5 leading-8 text-slate-600">{book.description || 'كتاب يجمع بين متعة الحكاية وقيمها.'}</p>
        <p className="mt-5 text-xl font-extrabold text-emerald-800">{formatPrice(book.price, book.currency, language)}</p>
        {book.format === 'ebook' && <p className="mt-2 text-sm leading-6 text-slate-600">{t('يُشترى هذا الكتاب الإلكتروني بشكل منفصل، ولا يشمله الاشتراك.', language)}</p>}
        {book.format === 'print' && book.stockQuantity !== null && book.stockQuantity !== undefined && <p className="mt-2 text-sm text-slate-500">المتوفر: {book.stockQuantity}</p>}
        {!user && <p className="mt-5 text-sm text-slate-600">أكمل الطلب بعد <Link to="/login" className="font-bold text-emerald-800 underline">تسجيل الدخول</Link>.</p>}
        {checkoutError && <div className="mt-5"><ErrorState message={checkoutError} /></div>}
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
          <label className="block text-sm font-semibold text-slate-700">{t('رمز الخصم (اختياري)', language)}<input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} maxLength={64} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 outline-none focus:border-emerald-700" /></label>
          <p className="text-xs leading-6 text-slate-500">سيظهر مبلغ الشحن عند إتمام الدفع الآمن.</p>
          <button type="submit" disabled={checkingOut || (book.format === 'print' && book.stockQuantity === 0)} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-900 px-5 py-3 font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <CreditCard size={17} /> {checkingOut ? 'جارٍ تحويلك للدفع…' : 'المتابعة إلى الدفع الآمن'}
          </button>
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
    {team ? <article className="rounded-2xl border border-emerald-950/10 bg-white p-5">
      <h3 className="text-lg font-bold text-emerald-950">{team.name}</h3>
      {team.inviteCode && <p className="mt-2 text-sm text-slate-600">{t('رمز دعوة الفريق', language)}: <code dir="ltr" className="font-bold">{team.inviteCode}</code></p>}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">{team.members.map((member, index) => <li key={`${member.displayName}-${index}`} className="flex justify-between rounded-xl bg-emerald-50 p-3 text-sm"><span>{member.displayName}</span><span>{member.completedParts} · {t('أجزاء مكتملة', language)}</span></li>)}</ul>
    </article> : !loading && <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={(event) => { event.preventDefault(); void submit('create'); }} className="rounded-2xl border border-emerald-950/10 bg-white p-5">
        <h3 className="font-bold">{t('إنشاء فريق', language)}</h3>
        <label className="mt-3 block text-sm font-semibold">{t('اسم الفريق', language)}<input required maxLength={120} value={teamName} onChange={(event) => setTeamName(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="mt-3 block text-sm font-semibold">{t('اسم العرض أو الاسم المستعار', language)}<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <button disabled={busy} className="mt-4 rounded-full bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t('إنشاء الفريق', language)}</button>
      </form>
      <form onSubmit={(event) => { event.preventDefault(); void submit('join'); }} className="rounded-2xl border border-emerald-950/10 bg-white p-5">
        <h3 className="font-bold">{t('الانضمام إلى فريق', language)}</h3>
        <label className="mt-3 block text-sm font-semibold">{t('رمز الدعوة', language)}<input required value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} dir="ltr" className="mt-1 w-full rounded-xl border px-3 py-2 text-left" /></label>
        <label className="mt-3 block text-sm font-semibold">{t('اسم العرض أو الاسم المستعار', language)}<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <button disabled={busy} className="mt-4 rounded-full bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t('انضمام', language)}</button>
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
    <p className="text-sm font-bold tracking-widest text-emerald-700">مساحتك</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-black text-emerald-950">أهلًا، {user.firstName}</h1><p className="mt-2 text-slate-600">{user.email}</p></div><div className="flex gap-2"><button onClick={async () => { setRefreshing(true); await refreshUser(); setRefreshing(false); }} disabled={refreshing} className="rounded-full border border-emerald-950/15 px-5 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60">{refreshing ? 'جارٍ التحديث…' : 'تحديث الحالة'}</button><button onClick={logout} className="rounded-full border border-emerald-950/15 px-5 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50">تسجيل الخروج</button></div></div>
    {authError && <div className="mt-5"><ErrorState message={authError} /></div>}
    <form onSubmit={saveEmailPreferences} className="mt-6 rounded-2xl border border-emerald-950/10 bg-white p-5">
      <h2 className="text-lg font-extrabold">{t('تفضيلات البريد الإلكتروني', language)}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={emailPreferences.marketing} onChange={(event) => setEmailPreferences((current) => ({ ...current, marketing: event.target.checked }))} /><span>{t('رسائل القصص الجديدة والعروض', language)}</span></label>
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={emailPreferences.reminders} onChange={(event) => setEmailPreferences((current) => ({ ...current, reminders: event.target.checked }))} /><span>{t('التذكيرات المجدولة', language)}</span></label>
      </div>
      <button disabled={savingEmailPreferences} className="mt-4 rounded-full border border-emerald-900 px-4 py-2 text-sm font-bold text-emerald-900 disabled:opacity-50">{t(savingEmailPreferences ? 'جارٍ الحفظ…' : 'حفظ تفضيلات البريد الإلكتروني', language)}</button>
      {emailPreferencesError && <div className="mt-3"><ErrorState message={emailPreferencesError} /></div>}
      {emailPreferencesNotice && <p role="status" className="mt-3 text-sm text-emerald-800">{emailPreferencesNotice}</p>}
    </form>
    <TeamAccountPanel />
    <div className="mt-10 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
      <section><SectionHeading title="تابع القراءة" />{loading && <LoadingState />}{error && <ErrorState message={error} />}{!loading && !error && !progress?.length && <EmptyState>لم تحفظ أي تقدّم بعد. <Link to="/stories" className="font-bold text-emerald-800 underline">اكتشف القصص</Link></EmptyState>}{!!progress?.length && <div className="space-y-3">{progress.map((item) => <Link key={item.id} to={item.nextPart ? `/stories/${item.story?.slug || ''}/read/${item.nextPart.partNumber}` : `/stories/${item.story?.slug || ''}`} className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-950/10 bg-white p-5 hover:border-emerald-700"><div><h3 className="font-bold text-emerald-950">{item.story?.title || 'حكاية'}</h3><p className="mt-1 text-sm text-slate-500">{t('أتممت', language)} {item.completedParts.length} {t('أجزاء', language)} · {item.nextPart ? `${t('التالي', language)} ${item.nextPart.partNumber}` : t('افتح الحكاية', language)}</p></div><ChevronLeft size={20} className="text-emerald-700" /></Link>)}</div>}</section>
      <section><SectionHeading title="حالة الاشتراك" /><div className="rounded-3xl border border-emerald-950/10 bg-white p-6">
        {!subscriptions.length ? <><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Star size={22} /></span><h3 className="mt-4 font-bold text-emerald-950">لا يوجد اشتراك حالي</h3><p className="mt-2 text-sm leading-7 text-slate-600">تابع قراءة الأجزاء المجانية أو اختر إحدى الباقات المتاحة أدناه.</p></> :
          <div className="space-y-4">{subscriptions.map((subscription) => <SubscriptionCard key={subscription.id} subscription={subscription} busy={updatingSubscriptionId === subscription.id} onCancel={() => updateSubscription(subscription.id, 'cancel')} onResume={() => updateSubscription(subscription.id, 'resume')} />)}</div>}
        {subscriptionActionError && <div className="mt-4"><ErrorState message={subscriptionActionError} /></div>}
      </div></section>
    </div>
    <section className="mt-12">
      <SectionHeading title={t('سجل الاختبارات', language)} />
      {quizAttemptsLoading && <LoadingState />}
      {quizAttemptsError && <ErrorState message={quizAttemptsError} />}
      {!quizAttemptsLoading && !quizAttemptsError && !quizAttempts?.length && <EmptyState>{t('لم تسجل أي محاولات اختبار بعد.', language)}</EmptyState>}
      {!!quizAttempts?.length && <div className="space-y-3">{quizAttempts.map((attempt) => <article key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-950/10 bg-white p-5"><div><h3 className="font-bold text-emerald-950">{attempt.quiz?.title || t('اختبار', language)}</h3><p className="mt-1 text-sm text-slate-500">{attempt.quiz?.story?.title || ''} · {new Date(attempt.finishedAt).toLocaleDateString(language)}</p></div><div className="flex items-center gap-3"><span className="font-extrabold">{attempt.score}%</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${attempt.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{t(attempt.passed ? 'ناجح' : 'لم يجتز', language)}</span></div></article>)}</div>}
    </section>
    <section className="mt-12">
      <SectionHeading title={t('شاراتي والشهادات', language)} />
      {badgesLoading && <LoadingState />}
      {badgesError && <ErrorState message={badgesError} />}
      {!badgesLoading && !badgesError && !badges?.length && <EmptyState>{t('لا توجد شهادات أو شارات بعد.', language)}</EmptyState>}
      {!!badges?.length && <div className="grid gap-3 md:grid-cols-2">{badges.map((badge) => <article key={badge.id} className="rounded-2xl border border-emerald-950/10 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-emerald-950">{badge.name}</h3><p className="text-xs text-slate-500">{badge.code}</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-lg">{badge.icon || '🏅'}</span></div><p className="mt-3 text-sm text-slate-500">{new Date(badge.awardedAt).toLocaleDateString(language)}</p></article>)}</div>}
      {certificatesLoading && <LoadingState />}
      {certificatesError && <ErrorState message={certificatesError} />}
      {!certificatesLoading && !certificatesError && !!certificates?.length && <div className="mt-4 space-y-3">{certificates.map((certificate) => <article key={certificate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-950/10 bg-white p-5"><div><h3 className="font-bold text-emerald-950">{certificate.title}</h3><p className="mt-1 text-sm text-slate-500">{certificate.verificationCode}</p></div><a href={certificate.downloadUrl} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">{t('تحميل الشهادة', language)}</a></article>)}</div>}
    </section>
    <section className="mt-12">
      <SectionHeading eyebrow="اختر ما يناسب عائلتك" title="باقات القراءة" />
      <section className="mb-6 rounded-2xl border border-emerald-950/10 bg-white p-5">
        <h2 className="text-xl font-extrabold">{t('تبرعاتي الشهرية', language)}</h2>
        {recurringDonationsLoading && <LoadingState />}
        {(recurringDonationsError || recurringDonationError) && <div className="mt-3"><ErrorState message={recurringDonationError || recurringDonationsError || ''} /></div>}
        {!recurringDonationsLoading && !recurringDonationsError && !recurringDonationItems.length && <p className="mt-3 text-sm text-slate-500">{t('لا توجد تبرعات شهرية.', language)}</p>}
        <div className="mt-3 space-y-3">{recurringDonationItems.map((donation) => <article key={donation.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><div><p className="font-bold">{donation.campaign} · {Number(donation.amount).toFixed(2)} {donation.currency}</p><p className="text-slate-500">{donation.status}{donation.cancelAtPeriodEnd ? ` · ${t('سيُلغى بنهاية الفترة', language)}` : ''}</p></div>{['active', 'past_due'].includes(donation.status) && !donation.cancelAtPeriodEnd && <button onClick={() => void cancelRecurringDonation(donation.id)} disabled={cancelingDonationId === donation.id} className="rounded-lg border border-red-200 px-3 py-2 font-bold text-red-700 disabled:opacity-50">{t(cancelingDonationId === donation.id ? 'جارٍ الإلغاء…' : 'إلغاء التبرع', language)}</button>}</article>)}</div>
      </section>
      <form onSubmit={redeemGiftCode} className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-emerald-950/10 bg-white p-5">
        <label className="min-w-[220px] flex-1 text-sm font-semibold">{t('استخدم رمز هدية الاشتراك', language)}<input required maxLength={64} value={giftCode} onChange={(event) => setGiftCode(event.target.value.toUpperCase())} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label>
        <button disabled={giftCodeBusy} className="rounded-full bg-emerald-900 px-5 py-2.5 font-bold text-white disabled:opacity-50">{t(giftCodeBusy ? 'جارٍ التفعيل…' : 'تفعيل الهدية', language)}</button>
      </form>
      {giftCodeError && <div className="mb-4"><ErrorState message={giftCodeError} /></div>}
      {giftCodeNotice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">{giftCodeNotice}</p>}
      <label className="mb-5 block max-w-xl text-sm font-semibold text-slate-700">{t('رمز الخصم للاشتراك (اختياري)', language)}<input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} maxLength={64} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 bg-white px-3 py-2.5" /></label>
      {plansLoading && <LoadingState />}
      {plansError && <ErrorState message={plansError} />}
      {!plansLoading && !plansError && !plans?.length && <EmptyState>لا توجد باقات متاحة حاليًا. ستُعلن هنا عند إعدادها.</EmptyState>}
      {!!plans?.length && <div className="grid gap-5 md:grid-cols-2">{plans.map((plan) => <article key={plan.id} className="rounded-3xl border border-emerald-950/10 bg-white p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-extrabold text-emerald-950">{plan.name}</h3><p className="mt-1 text-sm text-slate-500">{t(plan.isFamily ? 'باقة عائلية' : 'باقة فردية', language)}</p></div><span className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{formatPrice(plan.price, plan.currency, language)} / {t(plan.interval === 'month' ? 'شهر' : 'سنة', language)}</span></div><ul className="mt-5 space-y-2 text-sm leading-7 text-slate-600">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-emerald-700" />{feature}</li>)}</ul><button onClick={() => startPlanCheckout(plan.id)} disabled={planCheckoutId !== null || subscriptions.some((item) => item.accessActive)} className="mt-6 w-full rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{t(planCheckoutId === plan.id ? 'جارٍ تحويلك للدفع…' : 'الاشتراك الآمن', language)}</button></article>)}</div>}
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
  const statusColor = subscription.accessActive ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900';
  return <article className="border-b border-emerald-950/10 pb-4 last:border-0 last:pb-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-emerald-950">{subscription.plan ? localizedPlanName(subscription.plan, language) : t('اشتراك', language)}</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusColor}`}>{t(labels[subscription.status], language)}</span></div>
    <p className="mt-2 text-sm text-slate-600">{t(subscription.accessActive ? 'الوصول إلى المحتوى مفعّل' : 'الوصول إلى المحتوى غير مفعّل', language)}</p>
    {subscription.expiresAt && <p className="mt-1 text-xs text-slate-500">{t('تاريخ الانتهاء:', language)} {new Intl.DateTimeFormat(language).format(new Date(subscription.expiresAt))}</p>}
    {subscription.cancelAtPeriodEnd && <p className="mt-1 text-xs text-amber-800">{t('سيتوقف التجديد في نهاية الفترة الحالية.', language)}</p>}
    {subscription.canManageRenewal && subscription.status === 'active' && !subscription.cancelAtPeriodEnd && <button onClick={onCancel} disabled={busy} className="mt-3 text-xs font-bold text-red-700 underline disabled:opacity-50">{t(busy ? 'جارٍ التحديث…' : 'إيقاف التجديد', language)}</button>}
    {subscription.canManageRenewal && subscription.cancelAtPeriodEnd && <button onClick={onResume} disabled={busy} className="mt-3 text-xs font-bold text-emerald-800 underline disabled:opacity-50">{t(busy ? 'جارٍ التحديث…' : 'استمرار التجديد', language)}</button>}
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
      <div><h1 className="text-2xl font-black text-emerald-950">طلبات الكتب الورقية</h1><p className="mt-2 text-slate-600">الطلبات المدفوعة وعناوين الشحن وحالة التجهيز.</p></div>
      <button onClick={() => setReloadKey((value) => value + 1)} className="rounded-xl border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">تحديث</button>
    </div>
    {error && <div className="mt-6"><ErrorState message={error} /></div>}{loadError && <div className="mt-6"><ErrorState message={loadError} /></div>}{notice && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">{notice}</p>}
    <section className="mt-8 space-y-4">
      {loading && <LoadingState />}
      {!loading && !loadError && !orders?.length && <EmptyState>لا توجد طلبات ورقية مدفوعة تحتاج إلى تجهيز.</EmptyState>}
      {orders?.map((order) => {
        const draft = drafts[order.id] || {
          fulfillmentStatus: order.fulfillmentStatus,
          trackingNumber: order.trackingNumber || ''
        };
        return <article key={order.id} className="rounded-2xl border border-emerald-950/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-bold text-emerald-950">طلب رقم {order.id} · {formatPrice(order.total, order.currency, language)}</h2><p className="mt-1 text-sm text-slate-600">{order.user.firstName} {order.user.lastName} · {order.user.email}</p><p className="mt-1 text-xs text-slate-500">{new Date(order.createdAt).toLocaleDateString(language)}</p></div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">{fulfillmentLabels[order.fulfillmentStatus]}</span>
          </div>
          <ul className="mt-4 list-inside list-disc text-sm text-slate-700">{order.items.map((item, index) => <li key={`${order.id}-${index}`}>{item.titleSnapshot || item.book.title} × {item.quantity}</li>)}</ul>
          {order.shippingAddress && <div className="mt-4 rounded-xl bg-[#f7f6f0] p-4 text-sm leading-7 text-slate-700"><p className="font-bold text-emerald-950">{order.shippingAddress.name} · {order.shippingAddress.phone}</p><p>{order.shippingAddress.line1}{order.shippingAddress.line2 ? `، ${order.shippingAddress.line2}` : ''}</p><p>{order.shippingAddress.postalCode} {order.shippingAddress.city}، {order.shippingAddress.country}</p></div>}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-slate-700">حالة التجهيز<select value={draft.fulfillmentStatus} onChange={(event) => setDrafts((value) => ({ ...value, [order.id]: { ...draft, fulfillmentStatus: event.target.value as AdminStoreOrder['fulfillmentStatus'] } }))} className="mt-1 block rounded-xl border border-emerald-950/15 px-3 py-2">{fulfillmentOrder.map((status) => <option key={status} value={status} disabled={fulfillmentOrder.indexOf(status) < fulfillmentOrder.indexOf(order.fulfillmentStatus)}>{fulfillmentLabels[status]}</option>)}</select></label>
            <label className="min-w-52 flex-1 text-sm font-semibold text-slate-700">رقم التتبع<input dir="ltr" value={draft.trackingNumber} onChange={(event) => setDrafts((value) => ({ ...value, [order.id]: { ...draft, trackingNumber: event.target.value } }))} className="mt-1 block w-full rounded-xl border border-emerald-950/15 px-3 py-2 text-left" /></label>
            <button onClick={() => saveOrder(order)} disabled={busyId === order.id || (draft.fulfillmentStatus === order.fulfillmentStatus && draft.trackingNumber === (order.trackingNumber || ''))} className="rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busyId === order.id ? 'جارٍ الحفظ…' : 'حفظ التحديث'}</button>
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

type CheckoutResult = {
  kind: 'book' | 'subscription' | 'donation';
  status: string;
  recurring?: boolean;
  accessActive?: boolean;
  plan?: { name: string; translations?: PlanTranslations };
};

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
    <span className={`grid h-14 w-14 place-items-center rounded-2xl ${paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{paid ? <Check size={25} /> : <CreditCard size={24} />}</span>
    <h1 className="mt-6 text-3xl font-black leading-relaxed text-emerald-950">{paid ? 'تم تأكيد الدفع' : 'جارٍ تأكيد عملية الدفع'}</h1>
    {loading && <p className="mt-4 text-slate-600">نتحقق من حالة الطلب الآمنة…</p>}
    {error && <div className="mt-5"><ErrorState message={error} /></div>}
    {result && <p className="mt-4 leading-8 text-slate-600">{paid
      ? result.kind === 'book'
        ? 'استلمنا دفعتك، وسيصلك تأكيد الطلب على بريدك الإلكتروني.'
        : result.kind === 'donation'
          ? t(result.recurring ? 'شكرًا لدعمك؛ تم تسجيل تبرعك الشهري.' : 'شكرًا لدعمك؛ تم تسجيل تبرعك.', language)
        : <>{t('اشتراكك في', language)} {result.plan?.translations?.[language]?.name || (language === 'ar' ? result.plan?.name : t('اشتراك', language)) || t('باقة', language)} {t('فعّال الآن.', language)}</>
      : 'قد يستغرق تحديث الحالة لحظات بعد عودتك من بوابة الدفع.'}</p>}
    {!sessionId && <p className="mt-4 text-slate-600">لم يتم العثور على رقم جلسة الدفع.</p>}
    <button onClick={() => window.location.reload()} className="mt-7 inline-flex items-center gap-2 rounded-full bg-emerald-900 px-6 py-3 font-bold text-white"><RefreshCw size={16} /> تحديث حالة الدفع</button>
    <Link to={result?.kind === 'book' ? '/books' : result?.kind === 'donation' ? '/donations' : '/account'} className="mr-3 mt-7 inline-flex font-bold text-emerald-800">متابعة</Link>
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
