import { BookOpen, Sparkles } from 'lucide-react';
import { translateText, type SiteLanguage } from '@/lib/localization';
import { GeometricPattern } from './Ornament';

const palettes = [
  { from: '#0d3a2c', via: '#1d6b50', to: '#082019', glow: '#d8b36a' },
  { from: '#0f2230', via: '#27465a', to: '#0a1720', glow: '#c99a5f' },
  { from: '#3a2a1b', via: '#7c5a33', to: '#231810', glow: '#ecd3a0' },
  { from: '#22322a', via: '#3f5d49', to: '#131e18', glow: '#d9bd80' }
];

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100000;
  }
  return hash;
}

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
 * Story cover with a designed fallback: gradient + geometric pattern +
 * medallion. No faces, bodies or prophetic imagery of any kind.
 */
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
  const palette = palettes[hashSeed(`${seed ?? ''}${title}`) % palettes.length];
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
          <div className="absolute inset-0 bg-gradient-to-t from-[#08130f]/70 via-transparent to-transparent" />
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(145deg, ${palette.from} 0%, ${palette.via} 48%, ${palette.to} 100%)`
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(120% 90% at 82% 10%, ${palette.glow}2e 0%, transparent 55%), radial-gradient(90% 70% at 10% 100%, #ffffff14 0%, transparent 60%)`
            }}
          />
          <GeometricPattern className="absolute inset-0 text-white" opacity={0.18} color="#ffffff" />
          <svg
            className="absolute inset-x-0 bottom-0 h-[72%] w-full text-white"
            viewBox="0 0 320 220"
            fill="none"
            preserveAspectRatio="xMidYMax meet"
            aria-hidden="true"
          >
            <path
              d="M160 26c-44 0-70 35-70 74v120h140V100c0-39-26-74-70-74Z"
              stroke="currentColor"
              strokeOpacity="0.14"
              strokeWidth="1.2"
            />
            <path
              d="M160 46c-30 0-48 26-48 54v120h96V100c0-28-18-54-48-54Z"
              stroke="currentColor"
              strokeOpacity="0.1"
              strokeWidth="1"
              strokeDasharray="3 6"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <span
              className="grid h-[4.25rem] w-[4.25rem] place-items-center rounded-full border backdrop-blur-[2px]"
              style={{ borderColor: `${palette.glow}80`, backgroundColor: '#0b1a1559' }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: palette.glow }}>
                <path
                  d="M12 2.4 14.8 8 21 8.8 16.5 13 17.6 19.2 12 16.2 6.4 19.2 7.5 13 3 8.8 9.2 8Z"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                />
                <path d="M12 9.4v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
        </>
      )}
      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4">
          <p className="font-ui text-base font-semibold leading-relaxed text-white">{title}</p>
        </div>
      )}
      {children}
    </div>
  );
}
