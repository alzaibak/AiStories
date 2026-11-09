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
  ChevronRight, CircleHelp, Clock3, CreditCard, Headphones, Heart,
  LockKeyhole, LogIn, MapPin, Menu, RefreshCw, Search, ShieldCheck,
  ShoppingBag, Sparkles, Star, UserRound, X
} from 'lucide-react';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import { api, type ReaderSubscription } from '@/lib/api';
import { translateText, translateTree } from '@/lib/localization';
import { localizeAuthError } from '@/lib/authErrors';

type SiteLanguage = 'ar' | 'en' | 'fr';
const siteLanguages: SiteLanguage[] = ['ar', 'en', 'fr'];

function useSiteLanguage(): SiteLanguage {
  const { locale } = useParams();
  return siteLanguages.includes(locale as SiteLanguage) ? locale as SiteLanguage : 'ar';
}

function t(text: string, language: SiteLanguage) {
  return translateText(text, language);
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
  videos?: Array<{ id: number; videoUrl?: string; episodeNumber: number; durationSeconds?: number }>;
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

type QuizQuestion = { id: number; text: string; options: string[] };
type Quiz = { id: number; title: string; passingScore: number; questions: QuizQuestion[] };
type QuizAttempt = { attemptId: number; questions: QuizQuestion[] };
type QuizResult = {
  score: number;
  passed: boolean;
  feedback: Array<{
    questionId: number;
    correct: boolean;
    correctAnswer: string;
    explanation: string;
    source: string;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const language = useSiteLanguage();
  const location = useLocation();
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  const languagePath = (nextLanguage: SiteLanguage) =>
    `/${nextLanguage}${location.pathname.replace(/^\/(fr|en|ar)(?=\/|$)/, '')}`;

  return (
    <header className="sticky top-0 z-30 border-b border-emerald-950/10 bg-[#fbfaf6]/95 backdrop-blur">
      <Container className="flex h-[76px] items-center justify-between gap-5">
        <Link to="/" className="flex shrink-0 items-center gap-3" aria-label={t('الصفحة الرئيسية', language)}>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-900 text-amber-200">
            <BookOpen size={22} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-emerald-950">{t('حكايات إسلامية', language)}</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
          <Link className="transition hover:text-emerald-800" to="/stories">{t('القصص', language)}</Link>
          <Link className="transition hover:text-emerald-800" to="/books">{t('المتجر', language)}</Link>
          <Link className="transition hover:text-emerald-800" to="/policy">{t('منهجنا', language)}</Link>
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <nav aria-label="Language" className="flex items-center gap-1 text-xs font-bold">
            {siteLanguages.map((item) => <RouterLink
              key={item}
              to={`${languagePath(item)}${location.search}${location.hash}`}
              lang={item}
              aria-current={language === item ? 'page' : undefined}
              className={`rounded-full px-2 py-1 uppercase ${language === item ? 'bg-emerald-100 text-emerald-950' : 'text-slate-500 hover:text-emerald-900'}`}
            >{item}</RouterLink>)}
          </nav>
          {user ? (
            <>
              <Link to={['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role) ? '/admin/content' : '/account'} className="inline-flex items-center gap-2 rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
                <UserRound size={16} /> {t(['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role) ? 'الإدارة' : 'حسابي', language)}
              </Link>
              <button onClick={logout} className="px-2 py-2 text-sm font-semibold text-slate-500 hover:text-emerald-900">{t('خروج', language)}</button>
            </>
          ) : (
            <>
              <Link to="/login" className="px-3 py-2 text-sm font-semibold text-emerald-950 hover:text-emerald-700">{t('دخول', language)}</Link>
              <Link to="/register" className="rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">{t('ابدأ رحلتك', language)}</Link>
            </>
          )}
        </div>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full border border-emerald-950/10 text-emerald-950 md:hidden"
          aria-label={t(menuOpen ? 'إغلاق القائمة' : 'فتح القائمة', language)}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav aria-label="Language" className="flex items-center justify-center gap-2 pb-3 text-xs font-bold md:hidden">
          {siteLanguages.map((item) => <RouterLink
            key={item}
            to={`${languagePath(item)}${location.search}${location.hash}`}
            lang={item}
            aria-current={language === item ? 'page' : undefined}
            className={`rounded-full px-2 py-1 uppercase ${language === item ? 'bg-emerald-100 text-emerald-950' : 'text-slate-500 hover:text-emerald-900'}`}
          >{item}</RouterLink>)}
        </nav>
      </Container>
      {menuOpen && (
        <div className="border-t border-emerald-950/10 bg-[#fbfaf6] px-5 py-4 md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-4 text-sm font-semibold text-emerald-950">
            <Link onClick={() => setMenuOpen(false)} to="/stories">{t('القصص', language)}</Link>
            <Link onClick={() => setMenuOpen(false)} to="/books">{t('المتجر', language)}</Link>
            <Link onClick={() => setMenuOpen(false)} to="/policy">{t('منهجنا', language)}</Link>
            {user ? <Link onClick={() => setMenuOpen(false)} to={['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role) ? '/admin/content' : '/account'}>{t(user.role === 'READER' ? 'حسابي والاشتراك' : 'الإدارة', language)}</Link> : <Link onClick={() => setMenuOpen(false)} to="/login">{t('تسجيل الدخول', language)}</Link>}
          </nav>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const language = useSiteLanguage();
  return (
    <footer className="mt-20 border-t border-emerald-950/10 bg-[#f3f1e9] py-10">
      <Container className="flex flex-col gap-5 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-emerald-950">{t('حكايات إسلامية', language)}</p>
          <p className="mt-1">{t('قصص موثوقة، تُروى بمحبة للأجيال القادمة.', language)}</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/policy/sources" className="hover:text-emerald-900">{t('المصادر والتوثيق', language)}</Link>
          <Link to="/policy/depiction" className="hover:text-emerald-900">{t('سياسة التصوير', language)}</Link>
          <Link to="/books" className="hover:text-emerald-900">{t('المتجر', language)}</Link>
        </div>
      </Container>
    </footer>
  );
}

function SiteLayout({ children }: { children: ReactNode }) {
  const language = useSiteLanguage();
  return <div className="min-h-screen bg-[#fbfaf6] text-slate-900"><Header />{translateTree(children, language)}<Footer /></div>;
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
      {!story.cover && <span className="absolute inset-x-5 bottom-5 line-clamp-2 text-lg font-bold leading-8 text-white">{story.title}</span>}
    </div>
  );
}

function StoryCard({ story }: { story: StorySummary }) {
  const language = useSiteLanguage();
  return (
    <Link to={`/stories/${story.slug}`} className="group overflow-hidden rounded-3xl border border-emerald-950/10 bg-white transition hover:-translate-y-1 hover:shadow-xl">
      <StoryArtwork story={story} className="aspect-[1.25] transition duration-500 group-hover:scale-[1.02]" />
      <div className="p-5">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-emerald-700">
          <span>{story.collection?.title || t('حكاية إيمانية', language)}</span>
          {story.isFree && <span className="rounded-full bg-emerald-50 px-2.5 py-1">{t('قراءة مجانية', language)}</span>}
        </div>
        <h3 className="mt-3 text-lg font-bold text-emerald-950 group-hover:text-emerald-700">{story.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-7 text-slate-600">{story.summary}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-emerald-800">{t('اكتشف الحكاية', language)} <ChevronLeft size={16} /></span>
      </div>
    </Link>
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
  const { data: stories, loading, error } = useRemote<StorySummary[]>('/stories?limit=4');
  const { data: books } = useRemote<BookSummary[]>('/books?limit=3');
  const featured = stories?.find((story) => story.isStoryOfTheWeek) || stories?.[0];

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
                <Link to="/stories" className="inline-flex items-center gap-2 rounded-full bg-amber-200 px-6 py-3.5 font-bold text-emerald-950 transition hover:bg-amber-100">اكتشف القصص <ChevronLeft size={18} /></Link>
                <Link to="/policy/sources" className="rounded-full border border-white/30 px-6 py-3.5 font-semibold text-white hover:bg-white/10">كيف نتحقق من مصادرنا؟</Link>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-emerald-100/80">
                <span className="inline-flex items-center gap-2"><ShieldCheck size={17} /> مراجعة وتوثيق</span>
                <span className="inline-flex items-center gap-2"><Headphones size={17} /> قراءة ومشاهدة</span>
                <span className="inline-flex items-center gap-2"><Heart size={17} /> محتوى عائلي</span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -inset-5 rounded-[3rem] border border-amber-100/20" />
              <div className="relative aspect-[4/4.5] overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-emerald-700 to-[#bd8b51] shadow-2xl">
                {featured?.cover && <img src={featured.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c251f]/90 via-transparent to-transparent" />
                <div className="absolute bottom-0 p-7 sm:p-9">
                  <span className="rounded-full bg-amber-200 px-3 py-1.5 text-xs font-bold text-emerald-950">حكاية الأسبوع</span>
                  <h2 className="mt-4 text-2xl font-extrabold leading-10">{featured?.title || 'حكايات تلهم القلب والعقل'}</h2>
                  <p className="mt-2 line-clamp-2 leading-7 text-white/75">{featured?.summary || 'رحلة بين دروس الشجاعة والصبر والرحمة، كما حفظتها لنا مصادرنا.'}</p>
                  {featured && <Link to={`/stories/${featured.slug}`} className="mt-5 inline-flex items-center gap-2 font-bold text-amber-200">تابع القراءة <ChevronLeft size={17} /></Link>}
                </div>
                <div className="absolute left-5 top-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10 text-amber-100 backdrop-blur"><BookOpen size={25} /></div>
              </div>
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
            <p className="mt-5 text-center text-xs text-slate-500">ستتوفر عملية الشراء الآمن بعد اكتمال إعداد الدفع الإلكتروني.</p>
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
  const [search, setSearch] = useState('');
  const { data: stories, loading, error } = useRemote<StorySummary[]>('/stories?limit=100');
  const { data: collections } = useRemote<CollectionSummary[]>('/collections');
  const filteredStories = useMemo(() => stories?.filter((story) =>
    `${story.title} ${story.summary} ${story.collection?.title || ''}`.toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar'))
  ) || [], [stories, search]);

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

export function StoryDetailPage() {
  const { slug = '' } = useParams();
  const { data: story, loading, error } = useRemote<StorySummary>(`/stories/${encodeURIComponent(slug)}`);

  return (
    <SiteLayout>
      <main><Container className="py-9 sm:py-14">
        <Link to="/stories" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowUpLeft size={17} /> العودة إلى القصص</Link>
        {loading && <LoadingState />}
        {error && <div className="mt-8"><ErrorState message={error} /></div>}
        {story && (
          <div className="mt-7 grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <StoryArtwork story={story} className="aspect-[0.9] rounded-[2rem] shadow-lg" />
            <div>
              <p className="text-sm font-bold text-emerald-700">{story.collection?.title || 'حكاية إيمانية'} · {story.sourceBadge === 'quran_verse' ? 'من القرآن الكريم' : story.sourceBadge === 'authentic_hadith' ? 'من السنة النبوية' : 'قصة موثقة'}</p>
              <h1 className="mt-4 text-3xl font-black leading-relaxed text-emerald-950 sm:text-4xl">{story.title}</h1>
              <p className="mt-5 text-lg leading-9 text-slate-600">{story.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2"><BookOpen size={16} /> {story.parts?.length || 0} أجزاء</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2"><ShieldCheck size={16} /> مراجعة موثوقة</span>
              </div>
              {story.reviewerName && <p className="mt-4 text-sm text-slate-500">راجَعها: {story.reviewerName}</p>}
              {!!story.sourceReferences?.length && <div className="mt-6 rounded-2xl border border-emerald-950/10 bg-white p-5"><h2 className="font-bold text-emerald-950">المصادر</h2><ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-slate-600">{story.sourceReferences.map((source, index) => <li key={`${source.reference}-${index}`}>{source.reference}</li>)}</ul></div>}
              <div className="mt-8">
                <h2 className="text-xl font-extrabold text-emerald-950">أجزاء الحكاية</h2>
                <div className="mt-4 space-y-3">
                  {story.parts?.map((part) => (
                    <div key={part.id} className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-950/10 bg-white p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-800">{part.partNumber}</span>
                        <div className="min-w-0"><p className="truncate font-bold text-emerald-950">{part.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 size={13} /> {part.estimatedReadingMinutes} دقائق</p></div>
                      </div>
                      {part.accessible ? <Link to={`/stories/${story.slug}/read/${part.partNumber}`} className="shrink-0 rounded-full bg-emerald-900 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">اقرأ</Link> : <Link to="/membership" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-500"><LockKeyhole size={15} /> مقفل</Link>}
                    </div>
                  ))}
                </div>
              </div>
              {!!story.videos?.some((video) => video.videoUrl) && <div className="mt-10"><h2 className="mb-4 text-xl font-extrabold text-emerald-950">شاهد الحكاية</h2><div className="grid gap-4 sm:grid-cols-2">{story.videos.filter((video) => video.videoUrl).map((video) => <video key={video.id} src={video.videoUrl} controls preload="none" className="w-full rounded-2xl bg-black" aria-label={`الحلقة ${video.episodeNumber}`} />)}</div></div>}
            </div>
          </div>
        )}
      </Container></main>
    </SiteLayout>
  );
}

export function ReaderPage() {
  const { slug = '', partNumber = '' } = useParams();
  const number = Number(partNumber);
  const { user } = useStoryAuth();
  const [story, setStory] = useState<StorySummary | null>(null);
  const [part, setPart] = useState<(StoryPart & { content: string; endingHook: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);

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
      }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل الجزء.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, number]);

  async function markAsRead() {
    if (!user || !story || !part) return;
    setBusy(true);
    setNotice(null);
    try {
      const progress = await api.get<Array<{ storyId: number; completedParts: number[] }>>('/reading-progress');
      const completedParts = progress.find((entry) => entry.storyId === story.id)?.completedParts || [];
      await api.put(`/reading-progress/${story.id}`, {
        lastPartId: part.id,
        completedParts: [...new Set([...completedParts, part.id])]
      });
      setNotice('تم حفظ تقدّمك في القراءة.');
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
      const quizInfo = await api.get<Quiz>(`/stories/${encodeURIComponent(slug)}/parts/${number}/quiz`);
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

  return (
    <SiteLayout>
      <main><Container className="max-w-4xl py-9 sm:py-14">
        <Link to={`/stories/${story.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowLeft size={16} /> {story.title}</Link>
        <div className="mt-7 border-b border-emerald-950/10 pb-6">
          <p className="text-sm font-bold text-emerald-700">الجزء {part.partNumber} من {story.parts?.length || part.partNumber}</p>
          <h1 className="mt-3 text-3xl font-black leading-relaxed text-emerald-950 sm:text-4xl">{part.title}</h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Clock3 size={15} /> نحو {part.estimatedReadingMinutes} دقائق للقراءة</p>
        </div>
        <article className="mt-8 whitespace-pre-line text-right text-lg leading-[2.2] text-slate-700">{part.content}</article>
        {part.endingHook && <div className="mt-8 rounded-2xl border-r-4 border-amber-500 bg-amber-50 p-5 leading-8 text-amber-950">{part.endingHook}</div>}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-emerald-950/10 pb-8">
          {previous ? <Link to={`/stories/${slug}/read/${previous.partNumber}`} className="inline-flex items-center gap-2 rounded-full border border-emerald-950/15 px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50"><ChevronRight size={17} /> الجزء السابق</Link> : <span />}
          {next && next.accessible && <Link to={`/stories/${slug}/read/${next.partNumber}`} className="inline-flex items-center gap-2 rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">الجزء التالي <ChevronLeft size={17} /></Link>}
          {next && !next.accessible && <Link to="/membership" className="inline-flex items-center gap-2 rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"><LockKeyhole size={16} /> تابع باشتراك</Link>}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-emerald-50 p-5">
          <div><p className="font-bold text-emerald-950">أنهيت هذا الجزء؟</p><p className="mt-1 text-sm text-slate-600">احفظ تقدّمك وتابع القراءة من حيث توقفت.</p></div>
          {user ? <button onClick={markAsRead} disabled={busy} className="rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy ? 'جارٍ الحفظ…' : 'حفظ تقدّمي'}</button> : <Link to="/login" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-emerald-900">سجّل الدخول للحفظ</Link>}
        </div>
        {notice && <p className="mt-4 text-sm font-semibold text-emerald-800" role="status">{notice}</p>}
        <section className="mt-12 rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800"><CircleHelp size={23} /></span>
            <div><h2 className="text-xl font-extrabold text-emerald-950">اختبر فهمك</h2><p className="mt-2 leading-7 text-slate-600">أجب عن أسئلة قصيرة مستندة إلى مصادر القصة.</p></div>
          </div>
          {!user && <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-900">الاختبار متاح للأعضاء المسجلين. <Link className="font-bold underline" to="/login">سجّل الدخول</Link> للبدء.</div>}
          {user && !attempt && !result && <button onClick={startQuiz} disabled={busy} className="mt-6 rounded-full bg-emerald-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'جارٍ التحضير…' : 'ابدأ الاختبار'}</button>}
          {attempt && quiz && <form onSubmit={submitQuiz} className="mt-7 space-y-7">
            <h3 className="font-bold text-emerald-900">{quiz.title}</h3>
            {attempt.questions.map((question, index) => <fieldset key={question.id} className="space-y-3"><legend className="font-bold leading-7 text-emerald-950">{index + 1}. {question.text}</legend>{question.options.map((option) => <label key={option} className="flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-950/10 p-3 text-sm hover:bg-emerald-50"><input type="radio" name={`question-${question.id}`} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} />{option}</label>)}</fieldset>)}
            <button type="submit" disabled={busy || attempt.questions.some((question) => !answers[question.id])} className="rounded-full bg-emerald-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'جارٍ الإرسال…' : 'إرسال الإجابات'}</button>
          </form>}
          {result && <div className="mt-7"><p className={`text-xl font-extrabold ${result.passed ? 'text-emerald-800' : 'text-amber-800'}`}>نتيجتك: {result.score}% {result.passed ? '— أحسنت!' : '— واصل التعلّم'}</p><div className="mt-5 space-y-4">{result.feedback.map((item, index) => <div key={item.questionId} className="rounded-xl bg-[#f8f7f2] p-4 text-sm leading-7"><p className="font-bold">{index + 1}. {item.correct ? 'إجابة صحيحة' : `الإجابة الصحيحة: ${item.correctAnswer}`}</p><p className="mt-1 text-slate-600">{item.explanation}</p><p className="mt-1 text-xs text-emerald-800">المصدر: {item.source}</p></div>)}</div></div>}
          {error && <div className="mt-5"><ErrorState message={error} /></div>}
        </section>
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
      <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900"><ShoppingBag size={17} /> الدفع الآمن متاح للكتب المنشورة عند تفعيل إعدادات المتجر.</div>
      <div className="mt-10">{loading && <LoadingState />}{error && <ErrorState message={error} />}{!loading && !error && !books?.length && <EmptyState>لا توجد كتب منشورة حاليًا. ستُضاف الكتب الجديدة إلى المتجر قريبًا.</EmptyState>}{!!books?.length && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{books.map((book) => <BookCard key={book.id} book={book} />)}</div>}</div>
    </Container></main></SiteLayout>
  );
}

export function BookDetailPage() {
  const { slug = '' } = useParams();
  const language = useSiteLanguage();
  const navigate = useNavigate();
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
        {book.format === 'print' && book.stockQuantity !== null && book.stockQuantity !== undefined && <p className="mt-2 text-sm text-slate-500">المتوفر: {book.stockQuantity}</p>}
        {!user && <p className="mt-5 text-sm text-slate-600">أكمل الطلب بعد <Link to="/login" className="font-bold text-emerald-800 underline">تسجيل الدخول</Link>.</p>}
        {checkoutError && <div className="mt-5"><ErrorState message={checkoutError} /></div>}
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
          <p className="text-xs leading-6 text-slate-500">سيظهر مبلغ الشحن عند إتمام الدفع الآمن.</p>
          <button type="submit" disabled={checkingOut || (book.format === 'print' && book.stockQuantity === 0)} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-900 px-5 py-3 font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <CreditCard size={17} /> {checkingOut ? 'جارٍ تحويلك للدفع…' : 'المتابعة إلى الدفع الآمن'}
          </button>
        </form>
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
          setMessage(await requestPasswordResetCode(email, language));
          setRecoveryStage('code');
        } else if (recoveryStage === 'code') {
          setResetToken(await verifyPasswordResetCode(email, code));
          setRecoveryStage('password');
          setCode('');
        } else if (recoveryStage === 'password') {
          if (password !== confirmPassword) throw new Error('Les mots de passe ne correspondent pas.');
          setMessage(await resetPassword(email, password, resetToken));
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
          {(mode === 'login' && !recoveryStage || mode === 'register' && stage === 'details') && <>
            {mode === 'register' && <label className="block space-y-2 text-sm font-semibold text-slate-700">البريد الإلكتروني<input type="email" required value={email} readOnly dir="ltr" className="w-full rounded-xl border border-emerald-950/10 bg-slate-50 px-4 py-3 text-left text-slate-500" /></label>}
            <label className="block space-y-2 text-sm font-semibold text-slate-700">كلمة المرور<input type="password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' && !recoveryStage ? 'current-password' : 'new-password'} className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
          </>}
          {mode === 'login' && recoveryStage === 'password' && <label className="block space-y-2 text-sm font-semibold text-slate-700">تأكيد كلمة المرور الجديدة<input type="password" required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>}
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

export function AccountPage() {
  const { user, isLoading, logout, refreshUser, error: authError } = useStoryAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<number | null>(null);
  const [subscriptionActionError, setSubscriptionActionError] = useState<string | null>(null);
  const [planCheckoutId, setPlanCheckoutId] = useState<number | null>(null);
  const [planCheckoutError, setPlanCheckoutError] = useState<string | null>(null);
  const { data: progress, loading, error } = useRemote<Array<{
    id: number;
    storyId: number;
    completedParts: number[];
    story?: { title: string; slug: string; cover?: string | null };
  }>>('/reading-progress');
  const { data: plans, loading: plansLoading, error: plansError } = useRemote<SubscriptionPlan[]>('/plans');
  const subscriptions: ReaderSubscription[] = user?.subscriptions || [];
  if (isLoading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (!user) return <Navigate to="/login" replace />;
  if (['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role)) return <Navigate to="/admin/content" replace />;

  async function startPlanCheckout(planId: number) {
    setPlanCheckoutId(planId);
    setPlanCheckoutError(null);
    try {
      const response = await api.post<{ checkoutUrl: string }>('/payments/subscriptions/checkout', { planId, language });
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

  return <SiteLayout><main><Container className="py-12 sm:py-16">
    <p className="text-sm font-bold tracking-widest text-emerald-700">مساحتك</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-black text-emerald-950">أهلًا، {user.firstName}</h1><p className="mt-2 text-slate-600">{user.email}</p></div><div className="flex gap-2"><button onClick={async () => { setRefreshing(true); await refreshUser(); setRefreshing(false); }} disabled={refreshing} className="rounded-full border border-emerald-950/15 px-5 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60">{refreshing ? 'جارٍ التحديث…' : 'تحديث الحالة'}</button><button onClick={logout} className="rounded-full border border-emerald-950/15 px-5 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50">تسجيل الخروج</button></div></div>
    {authError && <div className="mt-5"><ErrorState message={authError} /></div>}
    <div className="mt-10 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
      <section><SectionHeading title="تابع القراءة" />{loading && <LoadingState />}{error && <ErrorState message={error} />}{!loading && !error && !progress?.length && <EmptyState>لم تحفظ أي تقدّم بعد. <Link to="/stories" className="font-bold text-emerald-800 underline">اكتشف القصص</Link></EmptyState>}{!!progress?.length && <div className="space-y-3">{progress.map((item) => <Link key={item.id} to={`/stories/${item.story?.slug || ''}`} className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-950/10 bg-white p-5 hover:border-emerald-700"><div><h3 className="font-bold text-emerald-950">{item.story?.title || 'حكاية'}</h3><p className="mt-1 text-sm text-slate-500">أتممت {item.completedParts.length} أجزاء</p></div><ChevronLeft size={20} className="text-emerald-700" /></Link>)}</div>}</section>
      <section><SectionHeading title="حالة الاشتراك" /><div className="rounded-3xl border border-emerald-950/10 bg-white p-6">
        {!subscriptions.length ? <><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Star size={22} /></span><h3 className="mt-4 font-bold text-emerald-950">لا يوجد اشتراك حالي</h3><p className="mt-2 text-sm leading-7 text-slate-600">تابع قراءة الأجزاء المجانية أو اختر إحدى الباقات المتاحة أدناه.</p></> :
          <div className="space-y-4">{subscriptions.map((subscription) => <SubscriptionCard key={subscription.id} subscription={subscription} busy={updatingSubscriptionId === subscription.id} onCancel={() => updateSubscription(subscription.id, 'cancel')} onResume={() => updateSubscription(subscription.id, 'resume')} />)}</div>}
        {subscriptionActionError && <div className="mt-4"><ErrorState message={subscriptionActionError} /></div>}
      </div></section>
    </div>
    <section className="mt-12">
      <SectionHeading eyebrow="اختر ما يناسب عائلتك" title="باقات القراءة" />
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
  isFamily: boolean;
};

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
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-emerald-950">{subscription.plan?.name || t('اشتراك', language)}</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusColor}`}>{t(labels[subscription.status], language)}</span></div>
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
  const [searchParams] = useSearchParams();
  const {
    user, isLoading, adminLogin, verifyAdminCode,
    requestPasswordResetCode, verifyPasswordResetCode, resetPassword
  } = useStoryAuth();
  const [stage, setStage] = useState<'credentials' | 'code'>('credentials');
  const [recoveryStage, setRecoveryStage] = useState<'email' | 'code' | 'password' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get('reset') === '1') {
      setEmail(searchParams.get('email') || '');
      setRecoveryStage('email');
    }
  }, [searchParams]);

  if (isLoading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (user) return <Navigate to={['ADMIN', 'SUPER_ADMIN', 'EDITOR'].includes(user.role) ? '/admin/content' : '/account'} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (recoveryStage === 'email') {
        setMessage(await requestPasswordResetCode(email, language));
        setRecoveryStage('code');
      } else if (recoveryStage === 'code') {
        setResetToken(await verifyPasswordResetCode(email, code));
        setRecoveryStage('password');
        setCode('');
      } else if (recoveryStage === 'password') {
        if (password !== confirmPassword) throw new Error('Les mots de passe ne correspondent pas.');
        setMessage(await resetPassword(email, password, resetToken));
        setRecoveryStage(null);
        setPassword('');
        setConfirmPassword('');
        setCode('');
      } else if (stage === 'credentials') {
        setMessage(await adminLogin(email, password));
        setStage('code');
      } else {
        await verifyAdminCode(email, code);
        navigate('/admin/content', { replace: true });
      }
    } catch (caught) {
      setError(localizeAuthError(caught, language));
    } finally {
      setBusy(false);
    }
  }

  return <SiteLayout><main className="grid min-h-[calc(100vh-180px)] place-items-center px-5 py-12">
    <div className="w-full max-w-lg rounded-[2rem] border border-emerald-950/10 bg-white p-8 shadow-sm">
      <Link to="/" className="text-sm font-bold text-emerald-800">العودة إلى الرئيسية</Link>
      <span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-800"><ShieldCheck size={23} /></span>
      <h1 className="mt-5 text-2xl font-black text-emerald-950">{recoveryStage ? 'إعادة تعيين كلمة المرور' : 'دخول الإدارة'}</h1>
      <p className="mt-2 leading-7 text-slate-600">{recoveryStage === 'email' ? 'أدخل بريد الإدارة لإرسال رمز إعادة التعيين.' : recoveryStage === 'code' ? 'أدخل رمز إعادة التعيين المرسل إلى بريد الإدارة.' : recoveryStage === 'password' ? 'اختر كلمة مرور جديدة لحساب الإدارة.' : 'يتطلب الدخول كلمة المرور ورمز التحقق المرسل إلى بريد الإدارة.'}</p>
      {message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{message}</p>}
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      <form onSubmit={submit} className="mt-7 space-y-4">
        {(recoveryStage === 'email' || !recoveryStage) && <label className="block space-y-2 text-sm font-semibold text-slate-700">البريد الإلكتروني<input type="email" required readOnly={!recoveryStage && stage === 'code'} value={email} onChange={(event) => setEmail(event.target.value)} dir="ltr" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 text-left outline-none focus:border-emerald-700 read-only:bg-slate-50" /></label>}
        {!recoveryStage && stage === 'credentials' && <label className="block space-y-2 text-sm font-semibold text-slate-700">كلمة المرور<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>}
        {(!recoveryStage && stage === 'code' || recoveryStage === 'code') && <label className="block space-y-2 text-sm font-semibold text-slate-700">رمز التحقق<input required inputMode="numeric" pattern={recoveryStage ? '[0-9]{6}' : '[0-9]{8}'} maxLength={recoveryStage ? 6 : 8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} dir="ltr" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 text-center tracking-[0.5em] outline-none focus:border-emerald-700" /></label>}
        {recoveryStage === 'password' && <>
          <label className="block space-y-2 text-sm font-semibold text-slate-700">كلمة المرور الجديدة<input type="password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
          <label className="block space-y-2 text-sm font-semibold text-slate-700">تأكيد كلمة المرور<input type="password" required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 outline-none focus:border-emerald-700" /></label>
        </>}
        <button disabled={busy} className="w-full rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ التحقق…' : recoveryStage === 'email' ? 'إرسال رمز إعادة التعيين' : recoveryStage === 'code' ? 'التحقق من الرمز' : recoveryStage === 'password' ? 'حفظ كلمة المرور الجديدة' : stage === 'credentials' ? 'إرسال رمز التحقق' : 'دخول لوحة الإدارة'}</button>
      </form>
      {!recoveryStage && stage === 'credentials' && <button type="button" onClick={() => { setError(null); setMessage(null); setRecoveryStage('email'); }} className="mt-5 block w-full text-center text-sm font-bold text-emerald-800 underline">نسيت كلمة المرور؟</button>}
      {recoveryStage && <button type="button" onClick={() => { setRecoveryStage(null); setError(null); setMessage(null); setResetToken(''); }} className="mt-5 block w-full text-center text-sm font-bold text-emerald-800 underline">العودة إلى تسجيل الدخول</button>}
    </div>
  </main></SiteLayout>;
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
  const { user, isLoading, logout } = useStoryAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { fulfillmentStatus: AdminStoreOrder['fulfillmentStatus']; trackingNumber: string }>>({});
  const { data: orders, loading, error: loadError } = useRemote<AdminStoreOrder[]>(`/admin/store-orders?refresh=${reloadKey}`);

  if (isLoading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <Navigate to="/account" replace />;

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

  return <SiteLayout><main><Container className="py-12 sm:py-16">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-bold tracking-widest text-emerald-700">لوحة الإدارة</p><h1 className="mt-3 text-3xl font-black text-emerald-950">طلبات الكتب الورقية</h1><p className="mt-2 text-slate-600">الطلبات المدفوعة وعناوين الشحن وحالة التجهيز.</p></div>
      <div className="flex flex-wrap gap-2"><Link to="/admin/content" className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">إدارة المحتوى</Link><Link to="/admin/subscriptions" className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">الاشتراكات والباقات</Link><button onClick={() => setReloadKey((value) => value + 1)} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">تحديث</button><button onClick={logout} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">خروج</button></div>
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
  </Container></main></SiteLayout>;
}

export function AdminSubscriptionsPage() {
  const language = useSiteLanguage();
  const { user, isLoading, logout } = useStoryAuth();
  const navigate = useNavigate();
  const [reloadKey, setReloadKey] = useState(0);
  const [statusDrafts, setStatusDrafts] = useState<Record<number, ReaderSubscription['status']>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState({ name: '', slug: '', price: '', interval: 'month' as 'month' | 'year', features: '' });
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const { data: subscriptions, loading, error: loadError } = useRemote<AdminSubscription[]>(`/admin/subscriptions?refresh=${reloadKey}`);
  const { data: plans, loading: plansLoading, error: plansLoadError } = useRemote<SubscriptionPlan[]>(`/plans?refresh=${reloadKey}`);

  if (isLoading) return <SiteLayout><Container className="py-16"><LoadingState /></Container></SiteLayout>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return <Navigate to="/account" replace />;

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

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    setPlanBusy(true);
    setPlanError(null);
    try {
      await api.post('/admin/plans', {
        name: planDraft.name,
        slug: planDraft.slug,
        price: Number(planDraft.price),
        currency: 'EUR',
        interval: planDraft.interval,
        features: planDraft.features.split('\n').map((feature) => feature.trim()).filter(Boolean),
        isFamily: true,
        isActive: true
      });
      setPlanDraft({ name: '', slug: '', price: '', interval: 'month', features: '' });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setPlanError(caught instanceof Error ? caught.message : 'تعذر إنشاء الباقة.');
    } finally {
      setPlanBusy(false);
    }
  }

  async function togglePlan(plan: SubscriptionPlan) {
    try {
      await api.patch(`/admin/plans/${plan.id}`, { isActive: false });
      setNotice('تم إيقاف الباقة؛ لن تظهر للمشتركين الجدد.');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تعديل الباقة.');
    }
  }

  return <SiteLayout><main><Container className="py-12 sm:py-16">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-bold tracking-widest text-emerald-700">لوحة الإدارة</p><h1 className="mt-3 text-3xl font-black text-emerald-950">الاشتراكات والباقات</h1><p className="mt-2 text-slate-600">حالة الوصول تُحدّث من أحداث Stripe، والتعديلات اليدوية متاحة للسجلات غير المرتبطة بمزوّد الدفع.</p></div><div className="flex flex-wrap gap-2"><Link to="/admin/content" className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">إدارة المحتوى</Link><Link to="/admin/orders" className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">طلبات الكتب</Link><button onClick={() => setReloadKey((value) => value + 1)} className="inline-flex items-center gap-2 rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900"><RefreshCw size={15} /> تحديث</button><button onClick={logout} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold text-emerald-900">خروج</button></div></div>
    {error && <div className="mt-6"><ErrorState message={error} /></div>}{loadError && <div className="mt-6"><ErrorState message={loadError} /></div>}{notice && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">{notice}</p>}
    <section className="mt-9">
      <SectionHeading title="حالة كل مشترك" />
      {loading && <LoadingState />}
      {!loading && !loadError && !subscriptions?.length && <EmptyState>لا توجد اشتراكات بعد.</EmptyState>}
      <div className="space-y-3">{subscriptions?.map((subscription) => {
        const status = statusDrafts[subscription.id] || subscription.status;
        return <article key={subscription.id} className="rounded-2xl border border-emerald-950/10 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-bold text-emerald-950">{subscription.user.firstName} {subscription.user.lastName}</h2><p className="mt-1 text-sm text-slate-500">{subscription.user.email}</p><p className="mt-2 text-sm text-slate-600">{subscription.plan?.name || 'باقة'} · {subscription.accessActive ? 'الوصول مفعّل' : 'الوصول غير مفعّل'}</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${subscription.accessActive ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{status}</span>{subscription.stripeSubscriptionId ? <span className="text-xs text-slate-500">Stripe</span> : <select value={status} onChange={(event) => setStatusDrafts((value) => ({ ...value, [subscription.id]: event.target.value as ReaderSubscription['status'] }))} className="rounded-xl border border-emerald-950/15 px-3 py-2 text-sm"><option value="incomplete">غير مكتمل</option><option value="active">نشط</option><option value="past_due">متأخر السداد</option><option value="canceled">ملغي</option><option value="unpaid">غير مدفوع</option><option value="paused">متوقف</option><option value="expired">منتهي</option></select>}</div>
          </div>
          {subscription.stripeSubscriptionId ? <div className="mt-4">{subscription.cancelAtPeriodEnd ? <button onClick={() => updateStripeRenewal(subscription.id, 'resume')} disabled={busyId === subscription.id} className="text-sm font-bold text-emerald-800 underline disabled:opacity-50">استئناف التجديد</button> : <button onClick={() => updateStripeRenewal(subscription.id, 'cancel')} disabled={busyId === subscription.id} className="text-sm font-bold text-red-700 underline disabled:opacity-50">إيقاف التجديد</button>}</div> : <button onClick={() => updateManualStatus(subscription.id)} disabled={busyId === subscription.id || status === subscription.status} className="mt-4 rounded-full bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === subscription.id ? 'جارٍ الحفظ…' : 'حفظ الحالة'}</button>}
        </article>;
      })}</div>
    </section>
    <section className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-3xl border border-emerald-950/10 bg-white p-6">
        <SectionHeading title="إنشاء باقة" />
        {planError && <ErrorState message={planError} />}
        <form onSubmit={createPlan} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">اسم الباقة<input required value={planDraft.name} onChange={(event) => setPlanDraft({ ...planDraft, name: event.target.value })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label>
          <label className="block text-sm font-semibold text-slate-700">الرابط المختصر (slug)<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={planDraft.slug} onChange={(event) => setPlanDraft({ ...planDraft, slug: event.target.value })} dir="ltr" className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5 text-left" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-slate-700">السعر باليورو<input required type="number" min="0.01" step="0.01" value={planDraft.price} onChange={(event) => setPlanDraft({ ...planDraft, price: event.target.value })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label><label className="text-sm font-semibold text-slate-700">الفترة<select value={planDraft.interval} onChange={(event) => setPlanDraft({ ...planDraft, interval: event.target.value as 'month' | 'year' })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5"><option value="month">شهرية</option><option value="year">سنوية</option></select></label></div>
          <label className="block text-sm font-semibold text-slate-700">المزايا (ميزة واحدة في كل سطر)<textarea rows={4} value={planDraft.features} onChange={(event) => setPlanDraft({ ...planDraft, features: event.target.value })} className="mt-2 w-full rounded-xl border border-emerald-950/15 px-3 py-2.5" /></label>
          <button disabled={planBusy} className="w-full rounded-full bg-emerald-900 px-5 py-3 font-bold text-white disabled:opacity-50">{planBusy ? 'جارٍ الإنشاء…' : 'إنشاء الباقة'}</button>
        </form>
      </div>
      <div><SectionHeading title="الباقات المنشورة" /><div className="space-y-3">{plansLoading && <LoadingState />}{plansLoadError && <ErrorState message={plansLoadError} />}{plans?.map((plan) => <article key={plan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-950/10 bg-white p-5"><div><h3 className="font-bold text-emerald-950">{plan.name}</h3><p className="mt-1 text-sm text-slate-600">{formatPrice(plan.price, plan.currency)} / {plan.interval === 'month' ? 'شهر' : 'سنة'}</p></div><button onClick={() => togglePlan(plan)} className="text-sm font-bold text-red-700 underline">إيقاف الباقة</button></article>)}</div></div>
    </section>
  </Container></main></SiteLayout>;
}

type CheckoutResult = {
  kind: 'book' | 'subscription';
  status: string;
  accessActive?: boolean;
  plan?: { name: string };
};

export function CheckoutResultPage() {
  const [searchParams] = useSearchParams();
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
    {result && <p className="mt-4 leading-8 text-slate-600">{paid ? result.kind === 'book' ? 'استلمنا دفعتك، وسيصلك تأكيد الطلب على بريدك الإلكتروني.' : `اشتراكك في ${result.plan?.name || 'الباقة'} فعّال الآن.` : 'قد يستغرق تحديث الحالة لحظات بعد عودتك من بوابة الدفع.'}</p>}
    {!sessionId && <p className="mt-4 text-slate-600">لم يتم العثور على رقم جلسة الدفع.</p>}
    <button onClick={() => window.location.reload()} className="mt-7 inline-flex items-center gap-2 rounded-full bg-emerald-900 px-6 py-3 font-bold text-white"><RefreshCw size={16} /> تحديث حالة الدفع</button>
    <Link to={result?.kind === 'book' ? '/books' : '/account'} className="mr-3 mt-7 inline-flex font-bold text-emerald-800">متابعة</Link>
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

  return <SiteLayout><main><Container className="max-w-4xl py-12 sm:py-16">
    <p className="text-sm font-bold tracking-widest text-emerald-700">قيمنا ومعاييرنا</p>
    <h1 className="mt-3 text-3xl font-black leading-relaxed text-emerald-950 sm:text-4xl">{content.title}</h1>
    <p className="mt-5 text-lg leading-9 text-slate-600">{content.intro}</p>
    <div className="mt-9 space-y-4">{content.sections.map(([title, description], index) => <article key={title} className="rounded-2xl border border-emerald-950/10 bg-white p-6 sm:p-7"><div className="flex items-start gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-800">{String(index + 1).padStart(2, '0')}</span><div><h2 className="text-lg font-extrabold text-emerald-950">{title}</h2><p className="mt-2 leading-8 text-slate-600">{description}</p></div></div></article>)}</div>
    <div className="mt-8 flex items-center gap-2 rounded-2xl bg-emerald-50 p-5 text-sm leading-7 text-emerald-950"><ShieldCheck size={20} className="shrink-0" /> نواصل تحسين هذه المعايير مع المراجعين والمتخصصين، ونراجع كل مادة قبل إتاحتها للقراء.</div>
  </Container></main></SiteLayout>;
}
