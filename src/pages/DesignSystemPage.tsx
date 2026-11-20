import { BookOpen, Check, Moon, Sparkles, Sun } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { buttonClasses, Button } from '@/components/ui/Button';
import { AccessBadge } from '@/components/ui/CoverArt';
import { OrnamentDivider, EmptyStateArt, GeometricPattern } from '@/components/ui/Ornament';
import { ProgressBar, ProgressRing } from '@/components/ui/Progress';
import { QuizQuestionCard } from '@/components/ui/QuizQuestionCard';
import { SourceBadge } from '@/components/ui/SourceBadge';
import { StoryCard } from '@/components/ui/StoryCard';
import { translateText, type SiteLanguage } from '@/lib/localization';
import { SiteLayout } from '@/pages/stories/StoryPlatform';

const modes = ['light', 'sepia', 'dark'] as const;
type PreviewMode = (typeof modes)[number];

const modeLabel: Record<PreviewMode, string> = {
  light: 'فاتح',
  sepia: 'وضع ورقي',
  dark: 'داكن'
};

const swatches: Array<{ token: string; label: string }> = [
  { token: 'canvas', label: 'خلفية الصفحة' },
  { token: 'surface', label: 'البطاقات' },
  { token: 'surface-soft', label: 'الأسطح الهادئة' },
  { token: 'surface-sunken', label: 'الأسطح الغائرة' },
  { token: 'ink', label: 'النص الأساسي' },
  { token: 'ink-muted', label: 'النص الثانوي' },
  { token: 'line', label: 'الفواصل' },
  { token: 'line-strong', label: 'حدود أقوى' },
  { token: 'brand', label: 'الأخضر الأساسي' },
  { token: 'brand-soft', label: 'لمسة خضراء' },
  { token: 'gold', label: 'الذهب' },
  { token: 'gold-ink', label: 'نص ذهبي' }
];

const contrastRows: Array<{ pair: string; light: string; sepia: string; dark: string }> = [
  { pair: 'النص على الخلفية', light: '14.6:1', sepia: '10.9:1', dark: '15.3:1' },
  { pair: 'النص الثانوي على الخلفية', light: '5.4:1', sepia: '5.6:1', dark: '8.8:1' },
  { pair: 'الزر الأساسي', light: '8.9:1', sepia: '8.1:1', dark: '7.9:1' },
  { pair: 'النص الذهبي', light: '5.6:1', sepia: '6.1:1', dark: '10.1:1' }
];

function useDemoLanguage(): SiteLanguage {
  const { locale } = useParams();
  return locale === 'en' || locale === 'fr' ? locale : 'ar';
}

function ThemePreview({
  mode,
  language,
  children
}: {
  mode: PreviewMode;
  language: SiteLanguage;
  children: React.ReactNode;
}) {
  return (
    <div
      data-site-theme={mode}
      className={`rounded-[1.75rem] border border-line bg-paper p-4 text-ink shadow-soft ${mode === 'dark' ? 'dark' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold text-ink-muted">
          {mode === 'light' ? <Sun size={13} /> : mode === 'sepia' ? <BookOpen size={13} /> : <Moon size={13} />}
          {translateText(modeLabel[mode], language)}
        </span>
        <code dir="ltr" className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[0.625rem] text-ink-faint">
          {mode}
        </code>
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <header className="mb-7 max-w-2xl">
      <p className="ds-eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
      {note && <p className="mt-2 text-sm leading-7 text-ink-muted">{note}</p>}
    </header>
  );
}

const demoStory = {
  id: 1,
  title: 'حكاية السفينة والصبر',
  slug: 'hikayat-as-safina',
  summary: 'رحلة من الصبر والثبات، تُروى بلغة هادئة تناسب القراءة العائلية، مع الإشارة إلى ما ورد في المصادر.',
  sourceBadge: 'quran_verse',
  isFree: true,
  collection: { title: 'حكايات الأنبياء' },
  parts: [{ estimatedReadingMinutes: 6 }, { estimatedReadingMinutes: 7 }, { estimatedReadingMinutes: 5 }],
  reviewerName: 'د. أحمد السالم'
};

const demoOptions = [
  { id: 1, text: 'نص قرآني موثّق بآية كريمة' },
  { id: 2, text: 'حديث صحيح مع تخريجه' },
  { id: 3, text: 'سرد أدبي مستوحى، يوضّح أنه ليس نصًا شرعيًا' },
  { id: 4, text: 'رواية تاريخية بلا إسناد' }
];

export default function DesignSystemPage() {
  const language = useDemoLanguage();

  return (
    <SiteLayout>
      <main>
        {/* Hero ------------------------------------------------------------- */}
        <section className="relative overflow-hidden border-b border-line bg-surface-soft/60">
          <GeometricPattern className="absolute inset-0 text-brand" opacity={0.07} color="rgb(var(--ds-brand-rgb))" />
          <div className="ds-container relative py-14 sm:py-20">
            <p className="ds-eyebrow">{translateText('أساسيات', language)}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-ink sm:text-5xl">
              {translateText('نظام التصميم', language)}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg sm:leading-9">
              {translateText('حكايات الأنبياء', language)} · {translateText('قراءة هادئة، مصدر واضح', language)} —{' '}
              {translateText('ألوان دافئة، طباعة عربية مريحة، وثلاث أضواء للقراءة: نهاري، ورقي، وليلي.', language)}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['1.15rem', '1.5rem', '2rem', '3rem'].map((size) => (
                <span key={size} dir="ltr" className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[0.6875rem] text-ink-muted">
                  {size}
                </span>
              ))}
              <span className="rounded-full bg-brand-soft px-3 py-1 text-[0.6875rem] font-semibold text-brand-ink">
                WCAG AA ✓
              </span>
            </div>
          </div>
        </section>

        {/* Palette ---------------------------------------------------------- */}
        <section className="ds-container ds-section">
          <SectionTitle
            eyebrow={translateText('الألوان', language)}
            title={translateText('لوحة دافئة وواثقة', language)}
            note={translateText('ورق كريمي، أخضر زمردي عميق، ذهب هادئ وحبر داكن. كل زوج نص/خلفية يحقق تباينًا لا يقل عن AA.', language)}
          />
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-ink-faint">
            <span>{translateText('داخل كل بطاقة:', language)}</span>
            {modes.map((mode, index) => (
              <span key={mode} className="inline-flex items-center gap-1">
                {index > 0 && <span aria-hidden="true">·</span>}
                <span className="h-2 w-2 rounded-full border border-line-strong bg-surface" />
                {translateText(modeLabel[mode], language)}
              </span>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {swatches.map((item) => (
              <div key={item.token} className="ds-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{translateText(item.label, language)}</p>
                  <code dir="ltr" className="font-mono text-[0.625rem] text-ink-faint">--ds-{item.token}</code>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {modes.map((mode) => (
                    <span key={mode} data-site-theme={mode} className="rounded-lg border border-line bg-paper p-1">
                      <span
                        className="block h-11 w-full rounded-md border border-line/60"
                        style={{ backgroundColor: `rgb(var(--ds-${item.token}-rgb))` }}
                        title={`${item.token} / ${mode}`}
                      />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="ds-card mt-5 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line bg-surface-soft/60 px-4 py-3">
              <Sparkles size={15} className="text-gold-ink" aria-hidden="true" />
              <p className="text-sm font-semibold text-ink">{translateText('تباين', language)}</p>
            </div>
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="text-xs text-ink-faint">
                  <th className="px-4 py-2 text-start font-semibold">{translateText('الزوج اللوني', language)}</th>
                  <th className="px-3 py-2 text-start font-semibold">{translateText('الوضع الفاتح', language)}</th>
                  <th className="px-3 py-2 text-start font-semibold">{translateText('الوضع الورقي', language)}</th>
                  <th className="px-3 py-2 text-start font-semibold">{translateText('الوضع الداكن', language)}</th>
                </tr>
              </thead>
              <tbody>
                {contrastRows.map((row) => (
                  <tr key={row.pair} className="border-t border-line/70">
                    <td className="px-4 py-2.5 text-ink-muted">{translateText(row.pair, language)}</td>
                    {[row.light, row.sepia, row.dark].map((value) => (
                      <td key={value} className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[0.6875rem] font-bold text-success">
                          <Check size={11} aria-hidden="true" /> {value}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <OrnamentDivider />

        {/* Typography ------------------------------------------------------- */}
        <section className="ds-container ds-section">
          <SectionTitle
            eyebrow={translateText('الخطوط', language)}
            title={translateText('طباعة تُقرأ بلا جهد', language)}
            note={translateText('IBM Plex Sans Arabic للواجهة، Noto Naskh Arabic لنص الحكاية، مع Lora للنص اللاتيني. الخطوط مستضافة محليًا.', language)}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="ds-card p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-ink-faint">{translateText('قراءة', language)} · Noto Naskh Arabic</p>
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[0.625rem] font-bold text-brand-ink">1.0625–1.1875rem / 2.05</span>
              </div>
              <p dir="rtl" className="ds-reading mt-4">
                كان المساء يهبط على المدينة بهدوء، والمصابيح تُشعل واحدة بعد أخرى، بينما يجلس الأطفال حول الجدّ
                ينتظرون بداية الحكاية. وفي صوتِه ذلك الدفءُ الذي يجعل الوقت يمرّ خفيفًا.
              </p>
              <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">
                {translateText('الخط الأمثل للقراءة الطويلة: ارتفاع سطر واسع، وعرض سطر لا يتجاوز 36rem.', language)}
              </p>
            </article>

            <article className="ds-card p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-ink-faint">{translateText('واجهة', language)} · IBM Plex Sans Arabic</p>
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[0.625rem] font-bold text-brand-ink">400 / 500 / 600 / 700</span>
              </div>
              <h3 className="mt-4 text-2xl font-bold leading-snug text-ink sm:text-3xl">حكايات تلهم القلب والعقل</h3>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                عناوين واضحة، أزرار مقروءة، ونصوص ثانوية هادئة. لا زخرفة تزاحم المحتوى.
              </p>
              <div className="mt-5 border-t border-line pt-4">
                <p className="font-reading text-base leading-8 text-ink-muted" dir="ltr" lang="en">
                  The evening settled over the city, one lamp at a time. <span className="text-ink-faint">— Lora, Latin reading</span>
                </p>
              </div>
            </article>
          </div>
        </section>

        <OrnamentDivider />

        {/* Story card ------------------------------------------------------- */}
        <section className="ds-container ds-section">
          <SectionTitle
            eyebrow={translateText('المكونات', language)}
            title={translateText('بطاقة القصة', language)}
            note={translateText('شارة المصدر والوصول تظهران دائمًا، مع اسم المراجع وعدد الأجزاء ووقت القراءة.', language)}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {modes.map((mode) => (
              <ThemePreview key={mode} mode={mode} language={language}>
                <StoryCard story={demoStory} language={language} progress={mode === 'sepia' ? 45 : undefined} />
              </ThemePreview>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {modes.slice(0, 2).map((mode) => (
              <ThemePreview key={mode} mode={mode} language={language}>
                <StoryCard story={{ ...demoStory, id: 2, title: 'حكاية الأمانة', slug: 'hikayat-al-amana', sourceBadge: 'authentic_hadith', isFree: false }} language={language} variant="featured" />
              </ThemePreview>
            ))}
          </div>
        </section>

        {/* Quiz card -------------------------------------------------------- */}
        <section className="ds-container ds-section">
          <SectionTitle
            eyebrow={translateText('المكونات', language)}
            title={translateText('بطاقة السؤال', language)}
            note={translateText('سؤال واحد لكل شاشة، أهداف لمس كبيرة، تغذية راجعة فورية مع شرح ومصدر.', language)}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {modes.map((mode) => (
              <ThemePreview key={mode} mode={mode} language={language}>
                <QuizQuestionCard
                  language={language}
                  index={3}
                  total={8}
                  points={20}
                  difficulty={mode === 'dark' ? 'kids' : 'adults'}
                  timeLeftSeconds={mode === 'light' ? 48 : undefined}
                  questionText="أي وصف يناسب «قصة مستوحاة» في مكتبتنا؟"
                  options={demoOptions}
                  selected={mode === 'sepia' || mode === 'dark' ? 3 : null}
                  feedback={
                    mode === 'sepia'
                      ? {
                          status: 'wrong',
                          correctIds: [3],
                          explanation: 'القصص المستوحاة سرد أدبي يوضّح صراحة أنه ليس نصًا شرعيًا ولا رواية تاريخية.',
                          source: 'سياسة المصادر والتصوير'
                        }
                      : mode === 'dark'
                        ? {
                            status: 'correct',
                            correctIds: [3],
                            explanation: 'أحسنت. السرد المستوحى يُقدَّم بوصفه أدبًا، ويبقى منفصلًا عن الوحي والتاريخ.',
                            source: 'منهجية التوثيق — القسم 2'
                          }
                        : null
                  }
                />
              </ThemePreview>
            ))}
          </div>
        </section>

        {/* Badges, buttons, progress --------------------------------------- */}
        <section className="ds-container ds-section">
          <SectionTitle
            eyebrow={translateText('المكونات', language)}
            title={translateText('شارة المصدر', language)}
            note={translateText('أربع فئات لا تختلط: قرآن، سنة صحيحة، تاريخ، وسرد مستوحى. لكل فئة أيقونة ولون.', language)}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {modes.map((mode) => (
              <ThemePreview key={mode} mode={mode} language={language}>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <SourceBadge source="quran_verse" language={language} />
                    <SourceBadge source="authentic_hadith" language={language} />
                    <SourceBadge source="historical_source" language={language} />
                    <SourceBadge source="inspired_story" language={language} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <AccessBadge isFree language={language} variant="plain" />
                    <AccessBadge isFree={false} language={language} variant="plain" />
                  </div>
                  <div className="flex items-center gap-3 border-t border-line pt-3">
                    <ProgressRing value={62} language={language} />
                    <div className="min-w-0 flex-1">
                      <ProgressBar value={46} label={translateText('تقدّم القراءة', language)} />
                      <p className="mt-2 text-[0.6875rem] text-ink-muted">{translateText('الجزء 2 من 4', language)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button size="sm">{translateText('اقرأ الحكاية', language)}</Button>
                    <Button size="sm" variant="secondary">{translateText('إلى القصص', language)}</Button>
                    <Button size="sm" variant="ghost">{translateText('لماذا؟', language)}</Button>
                  </div>
                </div>
              </ThemePreview>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="ds-card p-5">
              <p className="text-xs font-bold text-ink-faint">{translateText('أزرار', language)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button>{translateText('ابدأ القراءة', language)}</Button>
                <Button variant="gold">{translateText('عرض الباقات', language)}</Button>
                <Button variant="secondary">{translateText('اقتراح قصة', language)}</Button>
                <Button variant="quiet">{translateText('إغلاق', language)}</Button>
                <Button disabled>{translateText('غير متاح بعد', language)}</Button>
              </div>
            </div>
            <div className="ds-card p-5">
              <p className="text-xs font-bold text-ink-faint">{translateText('هيكل التحميل', language)}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[0, 1].map((index) => (
                  <div key={index} className="overflow-hidden rounded-2xl border border-line">
                    <div className="ds-skeleton aspect-[4/3] rounded-none" />
                    <div className="space-y-2 p-3">
                      <div className="ds-skeleton h-2.5 w-1/3" />
                      <div className="ds-skeleton h-3.5 w-4/5" />
                      <div className="ds-skeleton h-2.5 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ds-card mt-4 p-5">
            <p className="text-xs font-bold text-ink-faint">{translateText('حالات فارغة', language)}</p>
            <div className="mt-3 grid place-items-center gap-3 rounded-3xl border border-dashed border-line bg-surface-soft/40 px-5 py-8 text-center">
              <EmptyStateArt className="h-28 w-auto" />
              <div>
                <p className="font-semibold text-ink">{translateText('لا توجد حكايات منشورة حتى الآن.', language)}</p>
                <p className="mt-1 text-sm text-ink-muted">{translateText('نعمل على تجهيز أولى الحكايات المنشورة. عُد إلينا قريبًا.', language)}</p>
              </div>
              <a href={`/${language}/stories`} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
                {translateText('إلى القصص', language)}
              </a>
            </div>
          </div>
        </section>
      </main>
    </SiteLayout>
  );
}
