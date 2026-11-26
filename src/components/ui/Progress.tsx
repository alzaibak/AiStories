import { translateText, type SiteLanguage } from '@/lib/localization';

export function ProgressBar({
  value,
  className = '',
  label,
  tone = 'brand'
}: {
  value: number;
  className?: string;
  label?: string;
  tone?: 'brand' | 'gold';
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-soft ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone === 'gold' ? 'bg-gold' : 'bg-brand'}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  label,
  language = 'ar',
  className = ''
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  language?: SiteLanguage;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <span
      className={`relative inline-grid place-items-center ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label || translateText('تقدّم القراءة', language)}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--ds-line-rgb))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--ds-brand-rgb))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <span className="absolute text-[0.6875rem] font-semibold tabular-nums text-ink">
        {clamped}%
      </span>
    </span>
  );
}
