import { useId } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import { translateText, type SiteLanguage } from '@/lib/localization';

export function AccessBadge({
  isFree,
  language = 'ar',
  variant = 'overlay'
}: {
  isFree: boolean;
  language?: SiteLanguage;
  variant?: 'overlay' | 'plain';
}) {
  const label = translateText(isFree ? 'قراءة مجانية' : 'للمشتركين', language);
  const Icon = isFree ? BookOpen : Sparkles;
  const tone = isFree
    ? 'bg-brand-soft/90 text-brand-ink'
    : 'bg-gold-soft/95 text-gold-ink';
  const plainTone = isFree
    ? 'bg-brand-soft text-brand-ink'
    : 'bg-gold-soft text-gold-ink';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.6875rem] font-semibold backdrop-blur-sm ${variant === 'overlay' ? tone : plainTone}`}
    >
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Story cover. A real image is shown as-is; otherwise a generated cover is
 * drawn from the shared book palette (emerald gradient, faint gold star field,
 * crescent and star, cream title). Never an empty dark box, no faces or
 * prophetic imagery of any kind.
 */
/** Eight-point star outline, used for the faint pattern and dots. */
function starPath(cx: number, cy: number, outer: number) {
  const points: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    const radius = index % 2 === 0 ? outer : outer * 0.42;
    const angle = (Math.PI / 8) * index - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return `M${points.join(' L')} Z`;
}

export function CoverArt({
  title,
  cover,
  variants,
  seed,
  showTitle = false,
  className = '',
  sizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
  priority = false,
  children
}: {
  title: string;
  cover?: string | null;
  variants?: Array<{ width: number; url: string }> | null;
  seed?: string | number;
  showTitle?: boolean;
  className?: string;
  sizes?: string;
  priority?: boolean;
  children?: React.ReactNode;
}) {
  const patternId = `cover-stars-${useId().replace(/[:]/g, '')}`;
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {cover ? (
        <>
          <img
            src={cover}
            srcSet={variants?.length ? variants.map((variant) => `${variant.url} ${variant.width}w`).join(', ') : undefined}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            sizes={sizes}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {showTitle && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent p-4">
              <p className="font-display text-base leading-snug text-[#F7F1E1]">{title}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(150deg, var(--cover-from) 0%, var(--cover-to) 100%)'
            }}
          />
          {/* Faint, staggered eight-point star field in gold. */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 340 450"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            style={{ color: 'var(--cover-gold)', opacity: 0.13 }}
          >
            <defs>
              <pattern id={patternId} width="104" height="104" patternUnits="userSpaceOnUse">
                <g fill="none" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round">
                  <path d={starPath(26, 26, 10)} />
                  <path d={starPath(78, 78, 10)} opacity="0.75" />
                  <circle cx="78" cy="26" r="0.9" fill="currentColor" stroke="none" />
                  <circle cx="26" cy="78" r="0.9" fill="currentColor" stroke="none" />
                </g>
              </pattern>
            </defs>
            <rect width="340" height="450" fill={`url(#${patternId})`} />
          </svg>

          {/* Gold crescent and star, centered. */}
          <div className="absolute inset-0 grid place-items-center">
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true" style={{ color: 'var(--cover-gold)' }}>
              <path
                d="M62 18a31 31 0 1 0 0 60 25 25 0 1 1 0-60Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path
                d="M69 34.6 71.7 40.4 78 41.2 73.5 45.5 74.6 51.7 69 48.8 63.4 51.7 64.5 45.5 60 41.2 66.3 40.4Z"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div
            className="absolute inset-x-0 bottom-0 px-5 pb-6 pt-16"
            style={{ backgroundImage: 'linear-gradient(to top, rgb(4 22 18 / 0.86), transparent)' }}
          >
            <p
              dir="auto"
              className="font-reading text-[1.1875rem] font-semibold leading-[1.75] [text-wrap:balance]"
              style={{ color: 'var(--cover-cream)' }}
            >
              {title}
            </p>
          </div>
        </>
      )}
      {children}
    </div>
  );
}
