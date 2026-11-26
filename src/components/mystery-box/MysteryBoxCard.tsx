import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, Zap } from 'lucide-react';
import type { ActiveMysteryBox } from '@/hooks/useMysteryBox';
import { serverNow } from '@/hooks/useMysteryBox';
import { translateTemplate, translateText, type SiteLanguage } from '@/lib/localization';

export function formatMoney(amount: string | number, currency: string, language: SiteLanguage) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat(language === 'ar' ? 'ar' : language, {
      style: 'currency',
      currency: String(currency || 'EUR').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Correct plural forms, including the Arabic zero/one/two/few/many set. */
export function itemsLabel(count: number, language: SiteLanguage) {
  const n = Math.max(0, Math.round(count));
  if (language === 'ar') {
    if (n === 0) return translateText('لا عناصر', 'ar');
    if (n === 1) return translateText('عنصر واحد', 'ar');
    if (n === 2) return translateText('عنصران', 'ar');
    return `${n} ${translateText(n <= 10 ? 'عناصر' : 'عنصرًا', 'ar')}`;
  }
  const unit = translateText('عنصر', language);
  return `${new Intl.NumberFormat(language).format(n)} ${unit}${n === 1 ? '' : 's'}`;
}

export function itemsInsideLabel(count: number, language: SiteLanguage) {
  return `${itemsLabel(count, language)} ${translateText('داخل الصندوق', language)}`;
}

function normalizeHex(value: string | undefined, fallback: string) {
  const raw = String(value || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : fallback;
}

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string) {
  const first = luminance(normalizeHex(a, '#000000'));
  const second = luminance(normalizeHex(b, '#ffffff'));
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The card always keeps a deep emerald ground, so its text stays a fixed cream.
 * Admin colours are used as light only: when they cannot reach AA on that
 * ground they fall back to the brand gold.
 */
export function cardPalette(box: Pick<ActiveMysteryBox, 'colorFrom' | 'colorTo' | 'accentColor'>) {
  const gold = '#D9B15F';
  const accent = normalizeHex(box.accentColor, gold);
  const from = normalizeHex(box.colorFrom, '#10523C');
  const to = normalizeHex(box.colorTo, '#C5A25A');
  return {
    ground: '#08150F',
    ink: '#F4EEDD',
    muted: 'rgba(244,238,221,0.72)',
    gold,
    from,
    to,
    // Admin colours are light, never paint: they are pulled toward the deep
    // emerald so even a saturated red can only tint, never recolour, the card.
    glowFrom: blendToward(from, '#0B1F18', 0.86),
    glowTo: blendToward(to, '#0B1F18', 0.86),
    accent: contrastRatio(accent, '#08150F') >= 4.5 ? accent : gold
  };
}

function blendToward(hex: string, target: string, amount: number) {
  const parse = (value: string) => {
    const clean = normalizeHex(value, target).replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  };
  const a = parse(hex);
  const b = parse(target);
  const mix = a.map((value, index) => Math.round(value * (1 - amount) + b[index] * amount));
  return `#${mix.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function useCountdown(target: string | null | undefined) {
  const [remaining, setRemaining] = useState(() => (target ? Math.max(0, new Date(target).getTime() - serverNow()) : 0));

  useEffect(() => {
    if (!target) return;
    const tick = () => setRemaining(Math.max(0, new Date(target).getTime() - serverNow()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  return remaining;
}

export function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  };
}

/** Stylised closed gift with a bolt and light escaping under the lid. */
export function MysteryBoxArt({ accent, glowFrom, glowTo, className = '' }: {
  accent: string;
  glowFrom: string;
  glowTo: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 320 240" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="mb-glow" cx="50%" cy="58%" r="52%">
          <stop offset="0%" stopColor={glowFrom} stopOpacity="0.55" />
          <stop offset="55%" stopColor={glowTo} stopOpacity="0.22" />
          <stop offset="100%" stopColor="#08150F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mb-box" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14483A" />
          <stop offset="100%" stopColor="#0A241C" />
        </linearGradient>
        <linearGradient id="mb-lid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1B5A48" />
          <stop offset="100%" stopColor="#0E3328" />
        </linearGradient>
      </defs>

      <circle cx="160" cy="132" r="112" fill="url(#mb-glow)" />

      <g stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.8" className="mb-rays">
        <line x1="160" y1="96" x2="160" y2="72" />
        <line x1="126" y1="102" x2="112" y2="80" />
        <line x1="194" y1="102" x2="208" y2="80" />
        <line x1="104" y1="122" x2="84" y2="112" />
        <line x1="216" y1="122" x2="236" y2="112" />
      </g>

      <rect x="66" y="108" width="188" height="34" rx="10" fill="url(#mb-lid)" stroke={accent} strokeOpacity="0.45" />
      <rect x="78" y="140" width="164" height="76" rx="12" fill="url(#mb-box)" stroke={accent} strokeOpacity="0.32" />
      <rect x="148" y="108" width="24" height="108" fill={accent} opacity="0.85" />
      <path d="M172 34 L140 88 L160 88 L146 122 L186 70 L164 70 Z" fill={accent} className="mb-bolt" />
      <g fill={accent} className="mb-sparks">
        <circle cx="236" cy="66" r="2.2" />
        <circle cx="88" cy="72" r="1.8" />
        <circle cx="210" cy="150" r="1.6" />
      </g>
    </svg>
  );
}

const STATE_KEY = {
  active: 'متاح الآن',
  scheduled: 'يبدأ قريبًا',
  sold_out: 'نُفدت الكمية'
} as const;

function stateLabel(state: ActiveMysteryBox['state'], language: SiteLanguage) {
  // Older payloads may omit the state; an announced box is then live.
  return translateText(STATE_KEY[state] || STATE_KEY.active, language);
}

/**
 * Unit words live in the dictionary. Arabic already carries its plural forms;
 * French and English only need the plural s.
 */
export function countdownUnit(key: 'يوم' | 'ساعة' | 'دقيقة' | 'ثانية', value: number, language: SiteLanguage) {
  const word = translateText(key, language);
  return language === 'ar' ? word : `${word}${value === 1 ? '' : 's'}`;
}

function Countdown({ box, language }: { box: ActiveMysteryBox; language: SiteLanguage }) {
  const remaining = useCountdown(box.state === 'scheduled' ? box.startsAt : box.endsAt);
  const units = splitDuration(remaining);
  const heading = translateText(box.state === 'scheduled' ? 'يبدأ خلال' : 'ينتهي خلال', language);
  const urgent = box.state === 'active' && remaining > 0 && remaining < 60 * 60 * 1000;

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(244,238,221,0.62)' }}>{heading}</p>
      <div className="mt-2 flex items-center gap-1.5" role="timer" aria-live="off">
        {[
          { value: units.days, label: countdownUnit('يوم', units.days, language) },
          { value: units.hours, label: countdownUnit('ساعة', units.hours, language) },
          { value: units.minutes, label: countdownUnit('دقيقة', units.minutes, language) },
          { value: units.seconds, label: countdownUnit('ثانية', units.seconds, language) }
        ].map((unit) => (
          <div key={unit.label} className="flex min-w-[3rem] flex-col items-center rounded-xl border border-white/10 bg-black/25 px-1 py-1.5">
            <span className="tabular-nums text-lg font-semibold leading-none text-[#F4EEDD]">{String(unit.value).padStart(2, '0')}</span>
            <span className="mt-1 text-[9px] font-semibold" style={{ color: 'rgba(244,238,221,0.6)' }}>{unit.label}</span>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {urgent ? translateText('ينتهي الطرح خلال أقل من ساعة', language) : ''}
      </p>
    </div>
  );
}

export function MysteryBoxCard({
  box,
  language,
  onBuy,
  buying = false,
  error = null
}: {
  box: ActiveMysteryBox;
  language: SiteLanguage;
  onBuy: (box: ActiveMysteryBox) => void;
  buying?: boolean;
  error?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const palette = cardPalette(box);
  const soldOut = box.state === 'sold_out';
  const scheduled = box.state === 'scheduled';
  const price = formatMoney(box.price.amount, box.price.currency, language);
  const animation = soldOut ? 'none' : (box.animationStyle || 'shimmer');
  const total = box.stockTotal ?? null;
  const stockPercent = total && typeof box.remaining === 'number'
    ? Math.max(3, Math.min(100, Math.round((box.remaining / total) * 100)))
    : null;

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setVisible(entry.isIntersecting);
    }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState !== 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // The card opens the box page, where the shipping country and the digital
  // consent are collected; the label says so instead of promising a purchase.
  const actionLabel = soldOut
    ? translateText('نُفدت الكمية', language)
    : scheduled
      ? translateText('التفاصيل', language)
      : translateTemplate('متابعة الشراء — {price}', { price }, language);

  return (
    <div
      ref={ref}
      data-mb-animation={visible && tabVisible ? animation : 'none'}
      className="mb-card relative isolate overflow-hidden rounded-[28px] border"
      style={{
        borderColor: 'rgba(217,177,95,0.45)',
        backgroundImage: 'linear-gradient(160deg, #0B1F18 0%, #07130F 78%)',
        color: palette.ink
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `radial-gradient(60% 45% at 50% 38%, ${palette.glowFrom}b3 0%, transparent 70%), radial-gradient(45% 40% at 82% 12%, ${palette.glowTo}80 0%, transparent 72%), radial-gradient(70% 50% at 50% 62%, rgba(217,177,95,0.08) 0%, transparent 72%)` }}
      />
      <div aria-hidden="true" className="mb-stars pointer-events-none absolute inset-0" style={{ color: palette.accent }} />
      <span aria-hidden="true" className="mb-sweep" />

      <div className="relative flex flex-col gap-5 p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: palette.accent }}>
            <Zap size={12} aria-hidden="true" />
            {translateText('إصدار محدود', language)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] font-semibold" style={{ color: palette.ink }}>
            <span
              className={soldOut ? 'h-1.5 w-1.5 rounded-full' : 'mb-dot h-1.5 w-1.5 rounded-full'}
              style={{ backgroundColor: soldOut ? 'rgba(244,238,221,0.5)' : palette.accent }}
              aria-hidden="true"
            />
            {stateLabel(box.state, language)}
          </span>
        </div>

        <div className="relative mx-auto w-full max-w-[14rem]">
          {/* The box photo uploaded in the admin replaces the drawn art. */}
          {box.bannerImage
            ? <img src={box.bannerImage} alt={box.label} loading="lazy" className="aspect-[4/3] w-full rounded-2xl border border-white/10 object-cover shadow-[0_10px_30px_rgba(0,0,0,0.35)]" />
            : <MysteryBoxArt accent={palette.accent} glowFrom={palette.glowFrom} glowTo={palette.glowTo} className="h-auto w-full" />}
        </div>

        <div>
          {box.seasonLabel.trim().length >= 3 && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: palette.accent }}>{box.seasonLabel}</p>
          )}
          <h2 className="mt-1 text-2xl font-semibold leading-[1.4] sm:text-[1.7rem]" style={{ color: palette.ink }}>{box.label}</h2>

          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
            <span className="font-display text-3xl font-semibold leading-none tabular-nums" style={{ color: palette.gold }}>{price}</span>
            {box.price.tier === 'early_bird' && (
              <span className="mb-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: palette.accent, color: '#08150F' }}>
                {translateText('سعر مبكر', language)}
              </span>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold" style={{ color: palette.muted }}>
              {box.itemCount > 0 && <span>{itemsInsideLabel(box.itemCount, language)}</span>}
              {typeof box.remaining === 'number' && (
                <span>
                  {box.itemCount > 0 ? '· ' : ''}
                  {translateTemplate('بقي {count}', { count: box.remaining }, language)}
                </span>
              )}
            </div>
            {stockPercent !== null && !soldOut && (
              <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(244,238,221,0.14)' }} aria-hidden="true">
                <span className="block h-full rounded-full opacity-80" style={{ width: `${stockPercent}%`, backgroundColor: palette.gold }} />
              </div>
            )}
            {box.almostSoldOut && !soldOut && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: 'rgba(217,177,95,0.5)', color: palette.gold }}>
                {translateText('اقترب النفاد', language)}
              </span>
            )}
          </div>

          {!soldOut && <div className="mt-4"><Countdown box={box} language={language} /></div>}
        </div>

        <div>
          <button
            type="button"
            onClick={() => onBuy(box)}
            disabled={soldOut || buying}
            className="mb-buy inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70"
            style={soldOut
              ? { backgroundColor: 'rgba(244,238,221,0.12)', color: 'rgba(244,238,221,0.7)' }
              : { backgroundColor: palette.gold, color: '#08150F' }}
          >
            {!soldOut && !scheduled && <Zap size={16} aria-hidden="true" />}
            {buying ? translateText('جارٍ التحويل…', language) : actionLabel}
            {!soldOut && !scheduled && <ChevronLeft size={16} className="ltr:rotate-180" aria-hidden="true" />}
          </button>
          {soldOut && (
            <p className="mt-2 text-center text-[11px]" style={{ color: palette.muted }}>
              {translateText('تابعنا للإصدار القادم', language)}
            </p>
          )}
          {error && <p role="alert" className="mt-2 text-center text-[11px] font-semibold text-red-200">{error}</p>}
          <Link
            to={`/mystery-box/${box.slug}`}
            className="mt-1 flex min-h-11 items-center justify-center gap-1 text-[11px] font-semibold underline decoration-white/30 underline-offset-4"
            style={{ color: palette.muted }}
          >
            {translateText('اكتشف ما داخل الصندوق', language)}
            <ArrowLeft size={12} className="rtl:hidden" aria-hidden="true" />
            <ChevronLeft size={12} className="ltr:hidden" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export const MYSTERY_BOX_CLOSE_KEY = 'mystery-box-bar-dismissed';

export function MysteryBoxBar({ box, language }: { box: ActiveMysteryBox; language: SiteLanguage }) {
  const [closed, setClosed] = useState(true);
  const palette = cardPalette(box);
  const remaining = useCountdown(box.state === 'scheduled' ? box.startsAt : box.endsAt);
  const units = splitDuration(remaining);
  const key = `${box.slug}:${new Date(box.endsAt).getTime()}`;

  useEffect(() => {
    try {
      setClosed(window.localStorage.getItem(MYSTERY_BOX_CLOSE_KEY) === key);
    } catch {
      setClosed(false);
    }
  }, [key]);

  if (closed || box.state === 'sold_out') return null;
  const price = formatMoney(box.price.amount, box.price.currency, language);
  const dayUnit = translateText('ي', language);
  const hourUnit = translateText('س', language);
  const minuteUnit = translateText('د', language);
  const compact = units.days > 0
    ? `${units.days}${dayUnit} ${String(units.hours).padStart(2, '0')}${hourUnit} ${String(units.minutes).padStart(2, '0')}${minuteUnit}`
    : `${String(units.hours).padStart(2, '0')}:${String(units.minutes).padStart(2, '0')}:${String(units.seconds).padStart(2, '0')}`;

  return (
    <div style={{ backgroundColor: '#07130F', color: palette.ink }}>
      <div className="mx-auto flex min-h-10 w-full max-w-7xl items-center gap-2 px-4 text-[12px] sm:px-8">
        {box.bannerImage
          ? <img src={box.bannerImage} alt="" aria-hidden="true" className="h-7 w-10 shrink-0 rounded object-cover" />
          : <Zap size={13} aria-hidden="true" style={{ color: palette.gold }} />}
        <Link to={`/mystery-box/${box.slug}`} className="min-w-0 flex-1 truncate hover:underline">
          <span className="font-semibold" style={{ color: palette.gold }}>{translateText('الصندوق الغامض', language)}</span>
          <span style={{ color: 'rgba(244,238,221,0.7)' }}> — {box.label}<span className="hidden sm:inline"> · {price}</span>{box.showCountdownInHeader ? ' · ' : ''}</span>
          {box.showCountdownInHeader && (
            <span className="tabular-nums">
              {translateText(box.state === 'scheduled' ? 'يبدأ خلال ' : 'ينتهي خلال ', language)}
              {compact}
            </span>
          )}
        </Link>
        <Link to={`/mystery-box/${box.slug}`} className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold" style={{ backgroundColor: palette.gold, color: '#08150F' }}>
          {translateText('شاهد', language)}
        </Link>
        <button
          type="button"
          aria-label={translateText('إغلاق الشريط', language)}
          onClick={() => {
            setClosed(true);
            try {
              window.localStorage.setItem(MYSTERY_BOX_CLOSE_KEY, key);
            } catch {
              /* private mode */
            }
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
