/**
 * Brand mark: an eight-point Islamic star (rub el hizb) enclosing an open book.
 * Purely geometric — no figures, no calligraphic lettering.
 */
export function BrandMark({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-hidden="true"
      className={className}
    >
      {/* Same printed-cover palette in every theme, so the mark never turns mint. */}
      <rect width="48" height="48" rx="14" fill="var(--cover-from)" />
      <rect width="48" height="48" rx="14" fill="url(#brand-mark-sheen)" opacity="0.55" />
      <defs>
        <linearGradient id="brand-mark-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--cover-from)" />
          <stop offset="100%" stopColor="var(--cover-to)" />
        </linearGradient>
      </defs>
      <path
        d="M24 6.5 28.9 14.1 37.5 12.5 35.9 21.1 43.5 26 35.9 30.9 37.5 39.5 28.9 37.9 24 45.5 19.1 37.9 10.5 39.5 12.1 30.9 4.5 26 12.1 21.1 10.5 12.5 19.1 14.1Z"
        stroke="var(--cover-gold)"
        strokeWidth="1.1"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M17 19.4c2.4-1.1 4.8-1.1 7 .3 2.2-1.4 4.6-1.4 7-.3v10.1c-2.4-1-4.8-1-7 .4-2.2-1.4-4.6-1.4-7-.4Z"
        fill="none"
        stroke="var(--cover-gold)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M24 19.7v10.2" stroke="var(--cover-gold)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
