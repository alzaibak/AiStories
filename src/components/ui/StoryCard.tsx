import { ArrowLeft, BookOpen, Clock3, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { translateText, type SiteLanguage } from '@/lib/localization';
import { pluralMinutes, pluralParts } from '@/lib/plural';
import { AccessBadge, CoverArt } from './CoverArt';
import { ProgressBar } from './Progress';
import { SourceBadge } from './SourceBadge';

export interface StoryCardData {
  id: number | string;
  title: string;
  slug: string;
  summary?: string | null;
  cover?: string | null;
  coverVariants?: Array<{ width: number; url: string }> | null;
  sourceBadge?: string | null;
  isFree?: boolean;
  ageGroup?: string | null;
  reviewerName?: string | null;
  collection?: { title: string; slug?: string } | null;
  parts?: Array<{ estimatedReadingMinutes?: number | null }> | null;
  partsCount?: number | null;
  readingMinutes?: number | null;
  hook?: string | null;
  publishAt?: string | null;
  updatedAt?: string | null;
  isStoryOfTheWeek?: boolean;
}

function readingMinutesOf(story: StoryCardData) {
  if (typeof story.readingMinutes === 'number') return story.readingMinutes;
  if (!story.parts?.length) return null;
  return story.parts.reduce((total, part) => total + (part.estimatedReadingMinutes || 0), 0) || null;
}

export function ReviewerLine({
  name,
  language = 'ar',
  className = ''
}: {
  name?: string | null;
  language?: SiteLanguage;
  className?: string;
}) {
  if (!name) return null;
  return (
    <p className={`inline-flex items-center gap-1.5 text-xs text-ink-muted ${className}`}>
      <ShieldCheck size={13} strokeWidth={1.9} className="text-brand-ink" aria-hidden="true" />
      <span>{translateText('مراجعة علمية', language)}</span>
      <span aria-hidden="true">·</span>
      <span className="font-semibold text-ink">{name}</span>
    </p>
  );
}

/**
 * The library's core card. Always shows the source class, access level and
 * (when known) the named reviewer, so trust signals travel with every entry.
 */
export function StoryCard({
  story,
  language = 'ar',
  variant = 'grid',
  progress,
  className = ''
}: {
  story: StoryCardData;
  language?: SiteLanguage;
  variant?: 'grid' | 'featured';
  progress?: number;
  className?: string;
}) {
  const { locale = language } = useParams();
  const href = `/${locale}/stories/${story.slug}`;
  const partsCount = story.partsCount ?? story.parts?.length ?? null;
  const minutes = readingMinutesOf(story);
  const hasProgress = typeof progress === 'number' && progress > 0;
  const publishedAt = story.publishAt ? new Date(story.publishAt).getTime() : 0;
  const isNew = publishedAt > 0 && Date.now() - publishedAt < 21 * 24 * 60 * 60 * 1000;
  const isUpdated = Boolean(story.updatedAt && publishedAt &&
    new Date(story.updatedAt).getTime() - publishedAt > 24 * 60 * 60 * 1000 &&
    Date.now() - new Date(story.updatedAt).getTime() < 14 * 24 * 60 * 60 * 1000);

  if (variant === 'featured') {
    return (
      <article className={`group relative ${className}`}>
        <div className="ds-card overflow-hidden transition duration-300 hover:shadow-lift md:grid md:grid-cols-[1.02fr_1fr]">
          <div className="relative aspect-[3/4] overflow-hidden md:aspect-auto md:min-h-[22rem]">
            <Link to={href} aria-hidden="true" tabIndex={-1} className="absolute inset-0 block">
              <CoverArt
                title={story.title}
                cover={story.cover}
                variants={story.coverVariants}
                seed={story.id}
                className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.03]"
                sizes="(min-width: 768px) 50vw, 100vw"
                priority
              />
            </Link>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
              <SourceBadge source={story.sourceBadge} language={language} size="md" />
              <AccessBadge isFree={Boolean(story.isFree)} language={language} />
            </div>
            {(isNew || isUpdated) && <div className="pointer-events-none absolute inset-x-0 bottom-0 flex gap-2 p-4">
              {isNew && <span className="rounded-full bg-brand px-2.5 py-1 text-[0.6875rem] font-bold text-brand-on">{translateText('جديد', language)}</span>}
              {isUpdated && <span className="rounded-full bg-gold px-2.5 py-1 text-[0.6875rem] font-bold text-gold-on">{translateText('محدّثة', language)}</span>}
            </div>}
          </div>
          <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink-muted">
              {story.collection?.title && <span className="text-brand-ink">{story.collection.title}</span>}
              {partsCount ? (
                <span className="inline-flex items-center gap-1">
                  <BookOpen size={13} aria-hidden="true" /> {pluralParts(partsCount, language)}
                </span>
              ) : null}
              {minutes ? (
                <span className="inline-flex items-center gap-1">
                  <Clock3 size={13} aria-hidden="true" /> {pluralMinutes(minutes, language)}
                </span>
              ) : null}
              {story.isStoryOfTheWeek && <span className="rounded-full bg-gold-soft px-2 py-1 text-gold-ink">{translateText('حكاية الأسبوع', language)}</span>}
            </div>
            <h3 className="text-2xl font-bold leading-snug text-ink sm:text-3xl">
              <Link to={href} className="hover:text-brand-ink">
                {story.title}
              </Link>
            </h3>
            {(story.hook || story.summary) && (
              <p className="line-clamp-3 text-sm leading-7 text-ink-muted sm:text-base sm:leading-8">
                {story.hook || story.summary}
              </p>
            )}
            {hasProgress && (
              <div className="space-y-2">
                <ProgressBar value={progress} label={translateText('تقدّم القراءة', language)} />
                <p className="text-xs text-ink-muted">
                  {progress}% {translateText('أنجزت', language)}
                </p>
              </div>
            )}
            {story.reviewerName && <ReviewerLine name={story.reviewerName} language={language} />}
            <Link
              to={href}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-brand-on shadow-soft transition hover:bg-brand-strong"
            >
              {hasProgress ? translateText('تابع القراءة', language) : translateText('اكتشف الحكاية', language)}
              <ArrowLeft size={16} className="ltr:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`group relative h-full ${className}`}>
      <div className="ds-card flex h-full flex-col overflow-hidden transition duration-300 ease-out group-hover:-translate-y-1 group-hover:border-line-strong group-hover:shadow-lift">
        <div className="relative aspect-[3/4] overflow-hidden">
          <Link to={href} className="absolute inset-0 block" tabIndex={-1} aria-hidden="true">
            <CoverArt
              title={story.title}
              cover={story.cover}
              variants={story.coverVariants}
              seed={story.id}
              className="absolute inset-0 h-full w-full transition duration-700 ease-out group-hover:scale-[1.035]"
            />
          </Link>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <SourceBadge source={story.sourceBadge} language={language} />
            <AccessBadge isFree={Boolean(story.isFree)} language={language} />
          </div>
          {(isNew || isUpdated) && <div className="pointer-events-none absolute inset-x-0 bottom-0 flex gap-2 p-3">
            {isNew && <span className="rounded-full bg-brand px-2 py-1 text-[0.625rem] font-bold text-brand-on">{translateText('جديد', language)}</span>}
            {isUpdated && <span className="rounded-full bg-gold px-2 py-1 text-[0.625rem] font-bold text-gold-on">{translateText('محدّثة', language)}</span>}
          </div>}
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] font-semibold text-ink-faint">
            {story.collection?.title && <span className="text-brand-ink">{story.collection.title}</span>}
            {partsCount ? <span>{pluralParts(partsCount, language)}</span> : null}
            {minutes ? <span>{pluralMinutes(minutes, language)}</span> : null}
            {story.isStoryOfTheWeek && <span className="text-gold-ink">{translateText('حكاية الأسبوع', language)}</span>}
          </div>
          <h3 dir="auto" className="mt-2 text-lg font-bold leading-snug text-ink">
            <Link to={href} className="transition hover:text-brand-ink">
              {story.title}
            </Link>
          </h3>
          {(story.hook || story.summary) && (
            <p dir="auto" className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{story.hook || story.summary}</p>
          )}
          {hasProgress && (
            <div className="mt-3 space-y-1.5">
              <ProgressBar value={progress} label={translateText('تقدّم القراءة', language)} />
              <p className="text-[0.6875rem] text-ink-muted">
                {progress >= 100 ? translateText('أكملت الحكاية', language) : `${progress}% ${translateText('أنجزت', language)}`}
              </p>
            </div>
          )}
          <div className="mt-auto flex items-end justify-between gap-3 pt-4">
            {story.reviewerName ? (
              <ReviewerLine name={story.reviewerName} language={language} />
            ) : (
              <span className="text-[0.6875rem] text-ink-faint">{translateText('مراجعة علمية', language)}</span>
            )}
            <Link
              to={href}
              aria-label={`${translateText('اكتشف الحكاية', language)}: ${story.title}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-brand-ink transition group-hover:border-brand group-hover:bg-brand group-hover:text-brand-on"
            >
              <ArrowLeft size={16} className="ltr:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
