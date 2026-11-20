import { useId } from 'react';

/**
 * Subtle tiling of eight-point stars and interlaced lines.
 * Rendered with currentColor so it inherits the surrounding ink/gold.
 * Decorative only: hidden from assistive technology.
 */
export function GeometricPattern({
  className = '',
  opacity = 0.16,
  scale = 1,
  color = 'currentColor'
}: {
  className?: string;
  opacity?: number;
  scale?: number;
  color?: string;
}) {
  const id = useId().replace(/[:]/g, '');
  return (
    <svg
      aria-hidden="true"
      className={className}
      style={{ opacity }}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id={`girih-${id}`}
          width={72 * scale}
          height={72 * scale}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(0)"
        >
          <g
            fill="none"
            stroke={color}
            strokeWidth="1"
            strokeLinejoin="round"
            transform={`scale(${scale})`}
          >
            <path d="M36 4 42.6 12.4 53 10.4 51 20.8 60 27 51 33.2 53 43.6 42.6 41.6 36 50 29.4 41.6 19 43.6 21 33.2 12 27 21 20.8 19 10.4 29.4 12.4Z" />
            <rect x="26" y="17" width="20" height="20" />
            <path d="M36 0v6M36 48v6M0 27h6M66 27h6" />
            <circle cx="36" cy="27" r="1.4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#girih-${id})`} />
    </svg>
  );
}

/** Calligraphic-style rule used between sections. */
export function OrnamentDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`} aria-hidden="true">
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-line-strong sm:w-24" />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-gold-ink">
        <path
          d="M12 2.6 14.6 7.4 20 8.2 16.1 12 17 17.4 12 14.8 7 17.4 7.9 12 4 8.2 9.4 7.4Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="11" r="1.2" fill="currentColor" />
      </svg>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-line-strong sm:w-24" />
    </div>
  );
}

/** Large, calm empty-state illustration: a mihrab arch, stars, an open book. */
export function EmptyStateArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 160" className={className} fill="none" aria-hidden="true">
      <path
        d="M120 18c-26 0-42 22-42 44v50h84V62c0-22-16-44-42-44Z"
        stroke="rgb(var(--ds-line-strong-rgb))"
        strokeWidth="1.4"
      />
      <path
        d="M120 28c-19 0-31 17-31 34v41h62V62c0-17-12-34-31-34Z"
        stroke="rgb(var(--ds-line-rgb))"
        strokeWidth="1.2"
        strokeDasharray="3 5"
      />
      <path
        d="M103 82c6-2.6 12-2.6 17 .8 5-3.4 11-3.4 17-.8v18c-6-2.4-12-2.4-17 1-5-3.4-11-3.4-17-1Z"
        fill="rgb(var(--ds-surface-rgb))"
        stroke="rgb(var(--ds-gold-rgb))"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M120 83v17" stroke="rgb(var(--ds-gold-rgb))" strokeWidth="1.5" strokeLinecap="round" />
      {[
        [42, 30],
        [198, 26],
        [30, 96],
        [210, 92]
      ].map(([x, y], index) => (
        <path
          key={index}
          d={`M${x} ${y - 6} ${x + 2.3} ${y - 2.3} ${x + 6} ${y} ${x + 2.3} ${y + 2.3} ${x} ${y + 6} ${x - 2.3} ${y + 2.3} ${x - 6} ${y} ${x - 2.3} ${y - 2.3}Z`}
          fill="rgb(var(--ds-gold-rgb))"
          opacity="0.5"
        />
      ))}
      <path d="M12 130h216" stroke="rgb(var(--ds-line-strong-rgb))" strokeWidth="1" />
      <path d="M76 140h88" stroke="rgb(var(--ds-line-rgb))" strokeWidth="1" />
    </svg>
  );
}
