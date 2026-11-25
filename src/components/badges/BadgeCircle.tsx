import { useEffect, useId, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CircleHelp,
  Compass,
  Flame,
  Heart,
  Library,
  Lock,
  MoonStar,
  Scroll,
  Share2,
  Sparkles,
  Star,
  Trophy,
  Users,
  X,
  type LucideIcon
} from 'lucide-react';
import { translateText, type SiteLanguage } from '@/lib/localization';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'special';
export type BadgeCategory = 'reading' | 'quiz' | 'streak' | 'collection' | 'competition' | 'community' | 'supporter' | 'event';
export type BadgeState = 'unlocked' | 'in_progress' | 'locked' | 'secret';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type BadgeView = {
  id: number;
  code?: string;
  name: string | null;
  description?: string | null;
  howToEarn?: string | null;
  iconKey?: string | null;
  imageUrl?: string | null;
  tier?: BadgeTier | string | null;
  category?: BadgeCategory | string | null;
  state?: BadgeState;
  unlocked?: boolean;
  isSecret?: boolean;
  isFeatured?: boolean;
  points?: number;
  awardedAt?: string | null;
  earnedCount?: number | null;
  progress?: { currentValue: number; targetValue: number; ratio: number };
};

const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  'circle-help': CircleHelp,
  flame: Flame,
  trophy: Trophy,
  star: Star,
  library: Library,
  scroll: Scroll,
  compass: Compass,
  users: Users,
  heart: Heart,
  crescent: MoonStar,
  award: Award,
  sparkles: Sparkles
};

export const BADGE_ICON_KEYS = Object.keys(ICONS);

const SIZES: Record<BadgeSize, { px: number; ring: number; text: string; icon: number }> = {
  xs: { px: 32, ring: 3, text: 'text-[9px]', icon: 14 },
  sm: { px: 48, ring: 4, text: 'text-[10px]', icon: 20 },
  md: { px: 80, ring: 5, text: 'text-xs', icon: 32 },
  lg: { px: 120, ring: 6, text: 'text-sm', icon: 48 },
  xl: { px: 160, ring: 8, text: 'text-base', icon: 64 }
};

const TIER_RINGS: Record<BadgeTier, [string, string]> = {
  bronze: ['#7c3f19', '#e6b184'],
  silver: ['#5b6572', '#eef2f6'],
  gold: ['#8a5a05', '#ffe6a1'],
  platinum: ['#24405c', '#dbeafe'],
  special: ['#0f766e', '#f5c451']
};

export const COLOR_PRESETS: Record<string, [string, string]> = {
  emerald: ['#0f766e', '#5eead4'],
  gold: ['#92400e', '#fcd34d'],
  sapphire: ['#1d4ed8', '#93c5fd'],
  rose: ['#9f1239', '#fda4af'],
  violet: ['#5b21b6', '#c4b5fd'],
  sand: ['#8a6a3b', '#f2e3c6']
};

const CATEGORY_LABELS: Record<string, string> = {
  reading: 'القراءة',
  quiz: 'الاختبارات',
  streak: 'الاستمرارية',
  collection: 'المجموعات',
  competition: 'المسابقات',
  community: 'المجتمع',
  supporter: 'الدعم',
  event: 'الفعاليات'
};

const TIER_LABELS: Record<BadgeTier, string> = {
  bronze: 'برونزي',
  silver: 'فضي',
  gold: 'ذهبي',
  platinum: 'بلاتيني',
  special: 'خاص'
};

const BADGE_STATE_LABELS: Record<BadgeState, string> = {
  unlocked: 'مفتوحة',
  in_progress: 'قيد التقدم',
  locked: 'مقفلة',
  secret: 'شارة سرية'
};

export function tierLabel(tier: string | null | undefined, language: SiteLanguage) {
  const key = TIER_LABELS[(tier || 'bronze') as BadgeTier] || TIER_LABELS.bronze;
  return translateText(key, language);
}

export function categoryLabel(category: string | null | undefined, language: SiteLanguage) {
  const key = CATEGORY_LABELS[category || 'reading'] || CATEGORY_LABELS.reading;
  return translateText(key, language);
}

function badgeGradient(badge: BadgeView) {
  const preset = (badge as BadgeView & { colorTheme?: { preset?: string; from?: string; to?: string } }).colorTheme;
  if (preset?.from && preset?.to) return [preset.from, preset.to] as [string, string];
  const name = preset?.preset && COLOR_PRESETS[preset.preset] ? preset.preset : null;
  if (name) return COLOR_PRESETS[name];
  const categoryColors: Record<string, [string, string]> = {
    reading: COLOR_PRESETS.emerald,
    quiz: COLOR_PRESETS.sapphire,
    streak: ['#c2410c', '#fdba74'],
    collection: COLOR_PRESETS.gold,
    competition: COLOR_PRESETS.violet,
    community: ['#0e7490', '#a5f3fc'],
    supporter: COLOR_PRESETS.rose,
    event: ['#4338ca', '#c7d2fe']
  };
  return categoryColors[badge.category || 'reading'] || COLOR_PRESETS.emerald;
}

function resolveState(badge: BadgeView): BadgeState {
  if (badge.state) return badge.state;
  if (badge.unlocked) return 'unlocked';
  if (badge.progress && badge.progress.ratio > 0) return 'in_progress';
  return 'locked';
}

type BadgeCircleProps = {
  badge: BadgeView;
  size?: BadgeSize;
  language?: SiteLanguage;
  interactive?: boolean;
  showName?: boolean;
  showProgressLabel?: boolean;
  reveal?: boolean;
  onOpen?: (badge: BadgeView) => void;
  className?: string;
};

export function BadgeCircle({
  badge,
  size = 'md',
  language = 'ar',
  interactive = true,
  showName = false,
  showProgressLabel = true,
  reveal = false,
  onOpen,
  className = ''
}: BadgeCircleProps) {
  const gradientId = useId().replace(/[:]/g, '');
  const state = resolveState(badge);
  const sizing = SIZES[size];
  const tier = (badge.tier || 'bronze') as BadgeTier;
  const [ringFrom, ringTo] = TIER_RINGS[tier] || TIER_RINGS.bronze;
  const [surfaceFrom, surfaceTo] = badgeGradient(badge);
  const progress = Math.max(0, Math.min(1, badge.progress?.ratio ?? (badge.unlocked ? 1 : 0)));
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dimmed = state === 'locked' || state === 'secret';
  const Icon = ICONS[badge.iconKey || 'award'] || Award;
  const [imageFailed, setImageFailed] = useState(false);

  const ariaLabel = useMemo(() => {
    if (state === 'secret') return translateText('شارة سرية', language);
    const name = badge.name || '';
    if (state === 'unlocked') {
      return `${name} — ${translateText('مفتوحة', language)}${badge.awardedAt ? ` · ${new Date(badge.awardedAt).toLocaleDateString(language)}` : ''}`;
    }
    if (state === 'in_progress') {
      const current = badge.progress?.currentValue ?? 0;
      const target = badge.progress?.targetValue ?? 0;
      return `${name} — ${translateText('قيد التقدم', language)} ${current}/${target}`;
    }
    return `${name} — ${translateText('مقفلة', language)}`;
  }, [badge.awardedAt, badge.name, badge.progress?.currentValue, badge.progress?.targetValue, language, state]);

  const content = (
    <span
      className="badge-circle relative inline-flex items-center justify-center"
      style={{ width: sizing.px, height: sizing.px }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`ring-${gradientId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={ringFrom} />
            <stop offset="45%" stopColor={ringTo} />
            <stop offset="100%" stopColor={ringFrom} />
          </linearGradient>
          <radialGradient id={`surface-${gradientId}`} cx="35%" cy="28%" r="80%">
            <stop offset="0%" stopColor={surfaceFrom} stopOpacity={dimmed ? 0.28 : 0.95} />
            <stop offset="100%" stopColor={surfaceTo} stopOpacity={dimmed ? 0.18 : 0.7} />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r={radius} fill="none" stroke={`url(#ring-${gradientId})`} strokeWidth={sizing.ring} opacity={dimmed ? 0.4 : 1} />
        <circle cx="50" cy="50" r="38" fill={`url(#surface-${gradientId})`} />
        {state === 'in_progress' && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={ringTo}
            strokeWidth={sizing.ring}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.02, progress) * circumference} ${circumference}`}
            transform="rotate(-90 50 50) scale(-1 1) translate(-100 0)"
            className="badge-progress-ring"
          />
        )}
      </svg>
      <span
        className="relative flex items-center justify-center"
        style={{ color: dimmed ? 'rgba(100,116,139,0.75)' : '#fffdf7' }}
      >
        {state === 'secret'
          ? <span className="font-black" style={{ fontSize: sizing.icon * 0.9 }}>?</span>
          : badge.imageUrl && !imageFailed
            ? <img
                src={badge.imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setImageFailed(true)}
                className={`rounded-full object-cover ${dimmed ? 'opacity-40 grayscale' : ''}`}
                style={{ width: sizing.px * 0.58, height: sizing.px * 0.58 }}
              />
            : <Icon size={sizing.icon} strokeWidth={1.8} className={dimmed ? 'grayscale' : ''} />}
      </span>
      {state === 'locked' && (
        <span className="absolute -bottom-0.5 -end-0.5 rounded-full bg-white/95 p-1 text-slate-500 shadow ring-1 ring-slate-200">
          <Lock size={Math.max(10, sizing.icon * 0.42)} strokeWidth={2.4} />
        </span>
      )}
      {state === 'unlocked' && (
        <span
          className="absolute -top-1 -end-1 rounded-full bg-white/95 shadow ring-1 ring-amber-200"
          style={{ padding: Math.max(1, sizing.px / 48) }}
          aria-hidden="true"
        >
          <Star size={Math.max(8, sizing.icon * 0.34)} className="fill-amber-400 text-amber-500" />
        </span>
      )}
      <span className="sr-only">{ariaLabel}</span>
    </span>
  );

  const label = showName && state !== 'secret' && badge.name
    ? (
      <span className={`mt-2 block max-w-[9rem] truncate text-center font-semibold text-slate-700 dark:text-slate-200 ${sizing.text}`}>
        {badge.name}
      </span>
    )
    : null;

  const progressLabel = showProgressLabel && state === 'in_progress'
    ? (
      <span className={`mt-1 block text-center font-bold tabular-nums text-slate-600 dark:text-slate-300 ${sizing.text}`}>
        {badge.progress?.currentValue ?? 0}/{badge.progress?.targetValue ?? 0}
      </span>
    )
    : null;

  const body = (
    <span className="inline-flex flex-col items-center">
      <span className={reveal && state === 'unlocked' ? 'badge-reveal' : undefined}>{content}</span>
      {label}
      {progressLabel}
    </span>
  );

  if (!interactive) {
    return (
      <span role="img" aria-label={ariaLabel} className={className}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen?.(badge)}
      aria-label={ariaLabel}
      className={`group rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${className}`}
    >
      {body}
    </button>
  );
}

type BadgeDetailModalProps = {
  badge: BadgeView | null;
  language: SiteLanguage;
  onClose: () => void;
  onToggleFeature?: (badge: BadgeView) => Promise<void> | void;
  featuredLimit?: number;
  earnedPercent?: number | null;
  canFeature?: boolean;
};

export function BadgeDetailModal({ badge, language, onClose, onToggleFeature, earnedPercent, canFeature = true }: BadgeDetailModalProps) {
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!badge) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [badge, onClose]);

  if (!badge) return null;
  const state = resolveState(badge);
  const secret = state === 'secret';
  const progress = badge.progress;

  async function share() {
    const text = `${badge.name || ''} — ${translateText('حكايات إسلامية', language)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: badge.name || '', text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        setShared(true);
      }
    } catch {
      // Sharing is optional.
    }
  }

  async function toggleFeature() {
    if (!onToggleFeature) return;
    setBusy(true);
    try {
      await onToggleFeature(badge);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={secret ? translateText('شارة سرية', language) : badge.name || ''}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-emerald-900/10 bg-[#fffdf7] p-6 text-start shadow-2xl dark:border-white/10 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              {translateText(BADGE_STATE_LABELS[state], language)}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
              {secret ? translateText('شارة سرية', language) : badge.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={translateText('إغلاق', language)}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 flex justify-center">
          <BadgeCircle badge={badge} size="xl" language={language} interactive={false} />
        </div>
        {secret
          ? <p className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">{translateText('تُكشف هذه الشارة بعد الحصول عليها.', language)}</p>
          : (
            <>
              <p className="mt-5 text-sm leading-7 text-slate-700 dark:text-slate-200">{badge.description}</p>
              <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
                <p className="font-bold">{translateText('كيف تحصل عليها', language)}</p>
                <p className="mt-1 leading-7">{badge.howToEarn || '—'}</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{translateText('الفئة', language)}</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">{categoryLabel(badge.category, language)}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{translateText('المستوى', language)}</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">{tierLabel(badge.tier, language)}</dd>
                </div>
                {state === 'unlocked'
                  ? (
                    <div className="col-span-2 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                      <dt className="text-xs text-slate-500 dark:text-slate-400">{translateText('تاريخ الحصول', language)}</dt>
                      <dd className="font-bold text-slate-800 dark:text-slate-100">
                        {badge.awardedAt ? new Date(badge.awardedAt).toLocaleDateString(language) : '—'}
                      </dd>
                    </div>
                  )
                  : progress && progress.targetValue > 0
                    ? (
                      <div className="col-span-2 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">{translateText('تقدمك', language)}</dt>
                        <dd className="font-bold text-slate-800 dark:text-slate-100">
                          {progress.currentValue}/{progress.targetValue}
                        </dd>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                        </div>
                      </div>
                    )
                    : null}
                {typeof earnedPercent === 'number' && (
                  <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400">
                    {translateText('حصل عليها', language)} {earnedPercent}% {translateText('من القراء', language)}
                  </div>
                )}
              </dl>
            </>
          )}
        <div className="mt-6 flex flex-wrap gap-3">
          {state === 'unlocked' && onToggleFeature && canFeature && (
            <button
              type="button"
              onClick={toggleFeature}
              disabled={busy}
              className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {badge.isFeatured
                ? translateText('إزالة من الملف', language)
                : translateText('تثبيت على ملفي', language)}
            </button>
          )}
          <button
            type="button"
            onClick={share}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <Share2 size={15} />
            {shared ? translateText('تم النسخ', language) : translateText('مشاركة', language)}
          </button>
        </div>
      </div>
    </div>
  );
}

type BadgeCelebrationProps = {
  badge: BadgeView | null;
  language: SiteLanguage;
  onClose: () => void;
  durationMs?: number;
};

export function BadgeCelebration({ badge, language, onClose, durationMs = 6000 }: BadgeCelebrationProps) {
  useEffect(() => {
    if (!badge) return undefined;
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [badge, durationMs, onClose]);

  if (!badge) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="badge-celebration fixed bottom-6 start-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border border-amber-200 bg-[#fffdf7] p-5 text-center shadow-2xl rtl:translate-x-1/2 dark:border-amber-500/30 dark:bg-slate-900"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <span
            key={index}
            className="badge-confetti absolute h-2 w-2 rounded-full"
            style={{
              left: `${12 + index * 15}%`,
              background: ['#0f766e', '#f5c451', '#5eead4', '#e6b184'][index % 4],
              animationDelay: `${index * 90}ms`
            }}
          />
        ))}
      </div>
      <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
        {translateText('شارة جديدة', language)}
      </p>
      <div className="mt-3 flex justify-center">
        <BadgeCircle badge={badge} size="lg" language={language} interactive={false} reveal />
      </div>
      <p className="mt-3 text-lg font-black text-slate-950 dark:text-white">{badge.name}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{badge.description}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 rounded-full bg-emerald-900 px-5 py-2 text-sm font-bold text-white"
      >
        {translateText('رائع', language)}
      </button>
    </div>
  );
}

export default BadgeCircle;
