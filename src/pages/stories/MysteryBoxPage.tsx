import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, Gift, Lock, ShieldCheck, Sparkles, Truck, Zap } from 'lucide-react';
import { SiteLayout } from './StoryPlatform';
import { ApiError, api } from '@/lib/api';
import { useStoryAuth } from '@/contexts/StoryAuthContext';
import {
  MysteryBoxArt,
  cardPalette,
  countdownUnit,
  formatMoney,
  itemsInsideLabel,
  splitDuration,
  useCountdown
} from '@/components/mystery-box/MysteryBoxCard';
import { useMysteryBox } from '@/hooks/useMysteryBox';
import { translateTemplate, translateText, type SiteLanguage } from '@/lib/localization';

type PublicItem = { id: number; displayName?: string; teaserText?: string; name?: string; type: string; quantity?: number; revealed?: boolean };
type PromoBlock = { type: 'text' | 'image'; title: string; body: string; imageUrl: string | null; imageAlt: string | null };
type ShippingFeeEntry = { amount: string; amountMinor: number; freeShipping: boolean } | null;
type PublicBox = {
  slug: string;
  title: string;
  tagline: string | null;
  seasonLabel: string;
  state: 'draft' | 'scheduled' | 'active' | 'sold_out' | 'ended';
  startsAt: string;
  endsAt: string;
  price: { amount: string; currency: string; tier: 'standard' | 'early_bird'; earlyBirdEndsAt?: string | null; savingsPercent?: number };
  value: { amount: string; savingsPercent?: number };
  stock: { limit: number | null; sold: number; remaining: number | null };
  perUserLimit: number;
  description: string | null;
  promo?: PromoBlock[];
  digitalConsentText: string;
  faq: Array<{ question: string; answer: string }>;
  termsText: string | null;
  requiresShipping: boolean;
  itemCount?: number;
  items: PublicItem[];
  appearance: {
    colorFrom: string;
    colorTo: string;
    accentColor: string;
    animationStyle: 'shimmer' | 'pulse' | 'sparkle' | 'none';
    showCountdownInHeader: boolean;
    bannerImage?: string | null;
  } | null;
  shipping: {
    shippingFee: string;
    freeShippingThreshold: string | null;
    allowedCountries: string[];
    fees: Record<string, ShippingFeeEntry>;
    deliveryEstimate: string | null;
    shippingNote: string | null;
    carrier: string | null;
  } | null;
};
type BoxResponse = {
  box: PublicBox;
  purchase: { id: number; status: string } | null;
  canPurchase: boolean;
  blockedReason: string | null;
  perUserPurchaseCount?: number;
  paidPurchaseCount?: number;
};

const copy = (language: SiteLanguage) => {
  const t = (text: string) => translateText(text, language);
  return {
    back: t('العودة إلى الموقع'),
    inside: t('ماذا داخل الصندوق؟'),
    rules: t('قواعد المشاركة'),
    faq: t('الأسئلة الشائعة'),
    buy: t('أكمل الشراء'),
    consent: t('أوافق على البدء الفوري في تسليم المحتوى الرقمي، وأعلم أن حقي في التراجع ينتهي عند فتح الصندوق.'),
    country: t('بلد التوصيل'),
    limit: (n: number) => translateTemplate('الحد الأقصى {count} لكل عميل', { count: n }, language),
    returns: t('سياسة الاستبدال والإرجاع'),
    soldOut: t('نُفدت الكمية. لم يُخصم منك شيء.'),
    ended: t('انتهى هذا الطرح. تابعنا للإصدار القادم.'),
    loginFirst: t('سجّل الدخول لإتمام الشراء.'),
    reserved: t('نحفظ لك المقعد مؤقتًا أثناء الدفع (31 دقيقة).'),
    notStarted: t('لم يبدأ الطرح بعد.'),
    left: t('متبقٍ')
  };
};

function useSiteLanguage() {
  const { locale } = useParams();
  return (['ar', 'en', 'fr'].includes(String(locale)) ? locale : 'ar') as SiteLanguage;
}

function CountdownStrip({ box, language }: { box: PublicBox; language: SiteLanguage }) {
  const remaining = useCountdown(box.state === 'scheduled' ? box.startsAt : box.endsAt);
  const units = splitDuration(remaining);
  const heading = translateText(box.state === 'scheduled' ? 'يبدأ الطرح خلال' : 'ينتهي الطرح خلال', language);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#D9B15F' }}>{heading}</p>
      <div className="mt-2 grid grid-cols-4 gap-2" role="timer" aria-live="off">
        {[
          { value: units.days, label: countdownUnit('يوم', units.days, language) },
          { value: units.hours, label: countdownUnit('ساعة', units.hours, language) },
          { value: units.minutes, label: countdownUnit('دقيقة', units.minutes, language) },
          { value: units.seconds, label: countdownUnit('ثانية', units.seconds, language) }
        ].map((unit) => (
          <div key={unit.label} className="rounded-2xl border border-white/10 bg-black/25 px-2 py-3 text-center">
            <p className="tabular-nums text-xl font-semibold leading-none text-[#F4EEDD]">{String(unit.value).padStart(2, '0')}</p>
            <p className="mt-1.5 text-[10px] font-semibold text-[#F4EEDD]/60">{unit.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function countryName(code: string, language: SiteLanguage) {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

export function MysteryBoxPage() {
  const { slug = '' } = useParams();
  const language = useSiteLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useStoryAuth();
  const { refresh } = useMysteryBox(language);
  const [data, setData] = useState<BoxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [country, setCountry] = useState('FR');
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const text = copy(language);

  const load = useMemo(() => async () => {
    try {
      const response = await api.get<BoxResponse>(`/mystery-box/${slug}?lang=${language}`);
      setData(response);
      setLoadError(null);
      if (response.box.shipping?.allowedCountries?.length) {
        setCountry((current) => response.box.shipping!.allowedCountries.includes(current) ? current : response.box.shipping!.allowedCountries[0]);
      }
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Not found');
    } finally {
      setLoading(false);
    }
  }, [slug, language]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get('checkout') === 'cancelled') {
      setBuyError(translateText('أُلغي الدفع. لم يُخصم منك شيء، ويمكنك المحاولة مجددًا.', language));
    }
  }, [searchParams, language]);

  // An abandoned attempt holds the reader's slot for 30 minutes. As long as no
  // purchase was paid, that unpaid reservation is dropped so buying works again.
  useEffect(() => {
    if (!user || !data) return;
    if (data.box.state !== 'active') return;
    if ((data.paidPurchaseCount || 0) > 0) return;
    if ((data.perUserPurchaseCount || 0) === 0) return;
    let active = true;
    api.post(`/mystery-box/${data.box.slug}/checkout/cancel`, {})
      .then(() => { if (active) void load(); })
      .catch(() => { /* the reservation simply expires on its own */ });
    return () => { active = false; };
  }, [user, data, load]);

  const box = data?.box || null;
  const palette = cardPalette({
    colorFrom: box?.appearance?.colorFrom || '#10523C',
    colorTo: box?.appearance?.colorTo || '#C5A25A',
    accentColor: box?.appearance?.accentColor || '#D9B15F'
  });
  const price = box ? formatMoney(box.price.amount, box.price.currency, language) : '';
  // The server prices every allowed country: `fees[country]` is the exact fee
  // that Stripe will charge, already applying the free-shipping threshold.
  const feeEntry: ShippingFeeEntry = box?.shipping ? box.shipping.fees?.[country] ?? null : null;
  const shippingFree = feeEntry?.freeShipping === true || feeEntry?.amountMinor === 0;
  const shippingLabel = feeEntry
    ? (shippingFree ? translateText('مجاني', language) : formatMoney(feeEntry.amount, box!.price.currency, language))
    : '—';
  const total = box && box.requiresShipping && feeEntry
    ? formatMoney(Number(box.price.amount) + Number(feeEntry.amount), box.price.currency, language)
    : price;

  async function pay() {
    if (!box) return;
    setBuyError(null);
    setConsentError(null);
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/mystery-box/${box.slug}`)}`);
      return;
    }
    if (!consent) {
      setConsentError(text.consent);
      return;
    }
    setBuying(true);
    try {
      const response = await api.post<{ checkoutUrl: string }>(`/mystery-box/${box.slug}/checkout`, {
        language,
        ...(box.requiresShipping ? { country } : {}),
        digitalContentConsent: consent
      });
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      const code = caught instanceof ApiError ? String(caught.code || '') : '';
      if (/SOLD_OUT|STOCK/i.test(code)) setBuyError(text.soldOut);
      else if (/ENDED|NOT_STARTED|WINDOW/i.test(code)) setBuyError(text.ended);
      else if (/PER_USER|LIMIT/i.test(code)) setBuyError(text.limit(box.perUserLimit));
      else if (/SHIPPING|COUNTRY/i.test(code)) setBuyError(translateText('تعذّر تحديد بلد التوصيل لهذا الصندوق.', language));
      else setBuyError(caught instanceof Error ? caught.message : text.soldOut);
      void refresh();
      void load();
    } finally {
      setBuying(false);
    }
  }

  if (loading) {
    return (
      <SiteLayout>
        <main className="mx-auto w-full max-w-6xl px-5 py-16" role="status" aria-live="polite">
          <div className="h-8 w-48 animate-pulse rounded-full bg-surface-soft" />
          <div className="mt-6 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div className="h-96 animate-pulse rounded-[28px] bg-surface-soft" />
            <div className="h-96 animate-pulse rounded-[28px] bg-surface-soft" />
          </div>
          <span className="sr-only">{translateText('جارٍ تحميل الصندوق…', language)}</span>
        </main>
      </SiteLayout>
    );
  }

  if (!box) {
    return (
      <SiteLayout>
        <main className="mx-auto w-full max-w-2xl px-5 py-20 text-center">
          <Gift size={40} className="mx-auto text-brand-ink" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold text-brand-ink">{translateText('لا يوجد صندوق بهذا العنوان', language)}</h1>
          <p className="mt-2 text-ink-muted">{translateText('قد يكون الطرح قد انتهى أو تعذّر تحميله. أعد المحاولة بعد لحظات.', language)}</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 font-semibold text-brand-on">{text.back}</Link>
        </main>
      </SiteLayout>
    );
  }

  const soldOut = box.state === 'sold_out';
  const ended = box.state === 'ended';
  const scheduled = box.state === 'scheduled';
  const canBuy = data?.canPurchase && !soldOut && !ended && !scheduled;

  return (
    <SiteLayout>
      <main className="pb-28 md:pb-16">
        <div
          className="relative overflow-hidden"
          style={{
            backgroundColor: '#07130F',
            ...(box.appearance?.bannerImage ? {} : { backgroundImage: 'linear-gradient(160deg, #0B1F18 0%, #07130F 80%)' })
          }}
        >
          {/* The photo attached to the box in the admin is the hero backdrop. */}
          {box.appearance?.bannerImage && (
            <>
              <img src={box.appearance.bannerImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-45" />
              <span aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(160deg, rgba(7,19,15,0.82) 0%, rgba(7,19,15,0.94) 75%)' }} />
            </>
          )}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: `radial-gradient(55% 45% at 70% 20%, ${palette.glowFrom}b3 0%, transparent 70%), radial-gradient(40% 40% at 15% 85%, ${palette.glowTo}8c 0%, transparent 72%)` }} />
          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 md:grid-cols-[0.95fr_1.05fr] md:items-center md:py-16">
            <div className="order-2 flex justify-center md:order-1">
              <div className="w-full max-w-[16rem] sm:max-w-sm">
                <MysteryBoxArt accent={palette.accent} glowFrom={palette.glowFrom} glowTo={palette.glowTo} className="h-auto w-full" />
              </div>
            </div>
            <div className="order-1 md:order-2">
              <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F4EEDD]/70 hover:text-[#F4EEDD]">
                <ArrowLeft size={14} className="rtl:hidden" aria-hidden="true" />
                <ChevronLeft size={14} className="ltr:hidden" aria-hidden="true" />
                {text.back}
              </Link>
              <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: palette.accent }}>
                <Zap size={12} aria-hidden="true" />
                {translateText('إصدار محدود', language)}
              </span>
              {box.seasonLabel.trim().length >= 3 && <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: palette.accent }}>{box.seasonLabel}</p>}
              <h1 className="mt-2 text-3xl font-semibold leading-[1.4] text-[#F4EEDD] sm:text-4xl">{box.title}</h1>
              {box.tagline && box.tagline.trim().length >= 3 && <p className="mt-3 max-w-xl leading-8 text-[#F4EEDD]/75">{box.tagline}</p>}

              <div className="mt-6 flex flex-wrap items-end gap-3">
                <span className="text-3xl font-semibold tabular-nums" style={{ color: palette.gold }}>{price}</span>
                {box.price.tier === 'early_bird' && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: palette.accent, color: '#08150F' }}>
                    {translateText('سعر مبكر', language)}
                  </span>
                )}
                {typeof box.stock.remaining === 'number' && (
                  <span className="pb-1 text-xs font-semibold text-[#F4EEDD]/70">{box.stock.remaining} {text.left}</span>
                )}
              </div>

              {!soldOut && !ended && <div className="mt-6 max-w-md"><CountdownStrip box={box} language={language} /></div>}

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold text-[#F4EEDD]/70">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} aria-hidden="true" /> {text.limit(box.perUserLimit)}</span>
                {box.requiresShipping && <span className="inline-flex items-center gap-1.5"><Truck size={14} aria-hidden="true" /> {box.shipping?.deliveryEstimate || translateText('شحن محسوب', language)}</span>}
                {typeof box.stock.remaining === 'number' && <span>{itemsInsideLabel(box.itemCount ?? box.items.length, language)}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 md:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-8">
            {box.promo && box.promo.length > 0 && (
              <section aria-label={translateText('محتوى ترويجي', language)} className="space-y-4">
                {box.promo.map((block: PromoBlock, index: number) => block.type === 'image' && block.imageUrl ? (
                  <figure key={`promo-${index}`} className="overflow-hidden rounded-[24px] border border-line bg-surface">
                    <img src={block.imageUrl} alt={block.imageAlt || block.title || ''} className="max-h-[24rem] w-full object-cover" loading="lazy" />
                    {(block.title || block.body) && (
                      <figcaption className="p-5">
                        {block.title && <p className="text-lg font-semibold text-brand-ink">{block.title}</p>}
                        {block.body && <p className="mt-2 whitespace-pre-line text-sm leading-8 text-ink-muted">{block.body}</p>}
                      </figcaption>
                    )}
                  </figure>
                ) : (
                  <article key={`promo-${index}`} className="rounded-[24px] border border-line bg-surface p-5">
                    {block.title && <h2 className="text-xl font-semibold text-brand-ink">{block.title}</h2>}
                    {block.body && <p className="mt-2 whitespace-pre-line leading-8 text-ink-muted">{block.body}</p>}
                  </article>
                ))}
              </section>
            )}

            <section>
              <h2 className="text-xl font-semibold text-brand-ink">{text.inside}</h2>
              {box.description && <p className="mt-3 leading-8 text-ink-muted">{box.description}</p>}
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {box.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
                      {item.revealed === false ? <Lock size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {item.displayName || item.teaserText || item.name || translateText('عنصر مفاجأة', language)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {(item.quantity || 1) > 1
                          ? `${item.quantity}×`
                          : translateText(item.displayName ? 'داخل الصندوق' : 'يُكشف بعد الشراء', language)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-brand-ink">{text.rules}</h2>
              <ul className="mt-3 space-y-2.5 text-sm leading-7 text-ink-muted">
                <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-brand-ink" aria-hidden="true" />{text.limit(box.perUserLimit)}</li>
                {box.requiresShipping && <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-brand-ink" aria-hidden="true" />{translateText('الشحن يُحسب حسب بلد التوصيل ويُعرض قبل الدفع.', language)}</li>}
                <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-brand-ink" aria-hidden="true" />{text.reserved}</li>
                {box.termsText && <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-brand-ink" aria-hidden="true" />{box.termsText}</li>}
                <li className="flex gap-2">
                  <Check size={16} className="mt-1 shrink-0 text-brand-ink" aria-hidden="true" />
                  <Link to="/policy/returns" className="font-semibold text-brand-ink underline underline-offset-4">{text.returns}</Link>
                </li>
              </ul>
            </section>

            {box.faq.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold text-brand-ink">{text.faq}</h2>
                <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                  {box.faq.slice(0, 6).map((entry, index) => (
                    <details key={index} className="group p-4">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:content-none">
                        <span className="flex items-center justify-between gap-3">{entry.question}<ChevronLeft size={16} className="shrink-0 transition group-open:-rotate-90" aria-hidden="true" /></span>
                      </summary>
                      <p className="mt-2 text-sm leading-7 text-ink-muted">{entry.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside id="buy" className="h-fit scroll-mt-24 rounded-[28px] border border-line bg-surface p-6 shadow-soft md:sticky md:top-24">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">{translateText('ملخص الطلب', language)}</p>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-muted">{box.title}</span>
              <span className="text-xl font-semibold tabular-nums text-brand-ink">{price}</span>
            </div>
            {box.requiresShipping && (
              <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-muted">{translateText('الشحن', language)}</span>
                <span className="tabular-nums text-brand-ink">{shippingLabel}</span>
              </div>
            )}
            <div className="my-4 h-px bg-line" />
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink">{translateText('الإجمالي', language)}</span>
              <span className="text-2xl font-semibold tabular-nums text-brand-ink">{total}</span>
            </div>

            {box.requiresShipping && box.shipping?.allowedCountries?.length ? (
              <label className="mt-5 block space-y-1.5 text-xs font-semibold text-ink">
                {text.country}
                <select value={country} onChange={(event) => setCountry(event.target.value)} className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
                  {box.shipping.allowedCountries.map((code) => <option key={code} value={code}>{countryName(code, language)}</option>)}
                </select>
              </label>
            ) : null}

            <label className="mt-5 flex items-start gap-2.5 text-[11px] leading-5 text-ink-muted">
              <input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setConsentError(null); }} className="mt-0.5 h-4 w-4 shrink-0 rounded border-line" />
              <span>{box.digitalConsentText || text.consent}</span>
            </label>
            {consentError && <p role="alert" className="mt-2 text-[11px] font-semibold text-danger">{consentError}</p>}

            <button
              type="button"
              onClick={pay}
              disabled={!canBuy || buying}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: palette.gold, color: '#08150F' }}
            >
              <Zap size={16} aria-hidden="true" />
              {buying
                ? translateText('جارٍ التحويل…', language)
                : soldOut || ended
                  ? translateText('نُفدت الكمية', language)
                  : scheduled
                    ? translateText('لم يبدأ بعد', language)
                    : text.buy}
            </button>

            {buyError && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-xs leading-6 text-danger">{buyError}</p>}
            {!user && <p className="mt-3 text-center text-[11px] text-ink-faint">{text.loginFirst} <Link to={`/login?next=${encodeURIComponent(`/mystery-box/${box.slug}`)}`} className="font-semibold text-brand-ink underline">{translateText('دخول', language)}</Link></p>}
            {data?.blockedReason === 'per_user_limit' && <p className="mt-3 text-center text-[11px] font-semibold text-ink-muted">{text.limit(box.perUserLimit)}</p>}
            {soldOut && <p className="mt-3 text-center text-[11px] text-ink-muted">{translateText('تابعنا للإصدار القادم', language)}</p>}
            <p className="mt-3 text-center text-[10px] leading-5 text-ink-faint">{text.reserved}</p>
          </aside>
        </div>
      </main>

      {canBuy && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-ink-muted">{box.title}</p>
              <p className="text-base font-semibold tabular-nums text-brand-ink">{total}</p>
            </div>
            <button
              type="button"
              onClick={() => document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="ms-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold"
              style={{ backgroundColor: palette.gold, color: '#08150F' }}
            >
              <Zap size={15} aria-hidden="true" />
              {translateText('متابعة الشراء', language)}
            </button>
          </div>
        </div>
      )}
    </SiteLayout>
  );
}

export function MysteryBoxEntryPage() {
  const language = useSiteLanguage();
  const { box, loading } = useMysteryBox(language);
  if (loading) {
    return (
      <SiteLayout>
        <main className="mx-auto w-full max-w-3xl px-5 py-24" role="status">
          <div className="h-64 animate-pulse rounded-[28px] bg-surface-soft" />
        </main>
      </SiteLayout>
    );
  }
  if (!box) {
    return (
      <SiteLayout>
        <main className="mx-auto w-full max-w-2xl px-5 py-20 text-center">
          <Gift size={40} className="mx-auto text-brand-ink" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold text-brand-ink">{translateText('لا يوجد صندوق متاح حاليًا', language)}</h1>
          <p className="mt-2 text-ink-muted">{translateText('تابعنا للإصدار القادم.', language)}</p>
          <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-6 font-semibold text-brand-on">{translateText('العودة إلى الموقع', language)}</Link>
        </main>
      </SiteLayout>
    );
  }
  return <Navigate to={`/mystery-box/${box.slug}`} replace />;
}

type PurchaseRow = {
  id: number;
  status: string;
  amountTotal: string;
  currency: string;
  box?: { title?: string; slug?: string };
};

/** Reader-facing labels: the raw status codes never reach the page. */
const PURCHASE_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد التأكيد',
  paid: 'مدفوع',
  fulfilled: 'تم التسليم',
  partially_fulfilled: 'تم التسليم جزئياً',
  refunded: 'مسترجع',
  cancelled: 'ملغى'
};

export function MysteryBoxSuccessPage() {
  const language = useSiteLanguage();
  const { user } = useStoryAuth();
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let timer = 0;
    api.get<{ purchases: PurchaseRow[] }>(`/me/mystery-boxes?lang=${language}`)
      .then((response) => {
        if (!active) return;
        setPurchases(response.purchases);
        const latest = response.purchases[0];
        if (latest?.status === 'pending' && attempt < 5) {
          timer = window.setTimeout(() => setAttempt((value) => value + 1), 2500);
        }
      })
      .catch(() => { if (active) setPurchases([]); });
    return () => { active = false; window.clearTimeout(timer); };
  }, [user, language, attempt]);

  const paid = purchases?.find((row) => row.status !== 'pending') || purchases?.[0] || null;

  return (
    <SiteLayout>
      <main className="mx-auto w-full max-w-2xl px-5 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand-ink"><Check size={26} aria-hidden="true" /></span>
        <h1 className="mt-5 text-2xl font-semibold text-brand-ink">
          {translateText('تم استلام طلبك', language)}
        </h1>
        <p className="mt-3 leading-8 text-ink-muted">
          {translateText('سنؤكد الدفع من خادم الدفع خلال لحظات، ويصلك بريد بالتفاصيل. ستجد طلبك في حسابك.', language)}
        </p>
        {paid && (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-5 text-start">
            <p className="text-sm font-semibold text-ink">{paid.box?.title || translateText('صندوق غامض', language)}</p>
            <p className="mt-1 text-xs text-ink-muted">
              #{paid.id} · {formatMoney(paid.amountTotal, paid.currency, language)} · {translateText(PURCHASE_STATUS_LABELS[paid.status] || paid.status, language)}
            </p>
          </div>
        )}
        {!user && <p className="mt-4 text-sm text-ink-muted">{translateText('سجّل الدخول لعرض الطلب في حسابك.', language)}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/account" className="inline-flex min-h-11 items-center rounded-full bg-brand px-6 font-semibold text-brand-on">
            {translateText('حسابي', language)}
          </Link>
          <Link to="/stories" className="inline-flex min-h-11 items-center rounded-full border border-line px-6 font-semibold text-ink">
            {translateText('متابعة القراءة', language)}
          </Link>
        </div>
      </main>
    </SiteLayout>
  );
}
