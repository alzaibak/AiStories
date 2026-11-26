import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

export type ReturnPolicyReason = {
  code: string;
  label: string;
  isSellerFault: boolean;
  requiresDetails: boolean;
  requiresPhotos: boolean;
};

export type ReturnPolicy = {
  returnsEnabled: boolean;
  defaultReturnWindowDays: number;
  legalWithdrawalDays: number;
  applyLegalWithdrawalRules: boolean;
  deliveryDeductionMode: 'defined_fee' | 'fee_paid';
  returnShippingPayer: 'customer' | 'prepaid_label';
  shipBackDeadlineDays: number;
  refundDeadlineDays: number;
  defaultDeliveryEstimateDays: number;
  returnAddressText: string;
  policyText: Record<SiteLanguage, string>;
  conditionText: Record<SiteLanguage, string>;
  instructions: string;
  reasons: ReturnPolicyReason[];
};

export function useReturnPolicy(language: SiteLanguage) {
  const [policy, setPolicy] = useState<ReturnPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<ReturnPolicy>(`/returns/policy?lang=${language}`)
      .then((payload) => { if (active) setPolicy(payload); })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : translateText('تعذر تحميل سياسة الإرجاع.', language));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language]);

  return { policy, loading, error };
}

/** Short line shown next to the buy button and in the checkout recap. */
export function returnPolicyShortLine(policy: ReturnPolicy | null, language: SiteLanguage) {
  if (!policy || !policy.returnsEnabled) return null;
  const days = policy.defaultReturnWindowDays;
  const fee = policy.applyLegalWithdrawalRules
    ? translateText('تُخصم رسوم التوصيل بعد فترة العدول القانونية.', language)
    : translateText('تُخصم رسوم التوصيل في جميع الحالات.', language);
  return `${translateText('الكتب المطبوعة قابلة للإرجاع خلال', language)} ${days} ${translateText('يومًا من التسليم.', language)} ${fee}`;
}

function money(minor: number, language: SiteLanguage) {
  return new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR' }).format(minor / 100);
}

const digitalPolicyText: Record<SiteLanguage, { title: string; body: string; lines: string[] }> = {
  ar: {
    title: 'الكتب الإلكترونية والمنتجات الرقمية',
    body: 'تنطبق شروط مختلفة على المحتوى الرقمي لأن التسليم يبدأ فور إتمام الشراء.',
    lines: [
      'الكتب الإلكترونية والمنتجات الرقمية غير قابلة للإرجاع أو الاستبدال.',
      'لا يحق استرداد المبلغ بعد إتمام الشراء أو بدء تنزيل الملف.',
      'لا تنطبق مهلة الإرجاع أو فترة العدول على المحتوى الرقمي بعد بدء التنزيل.'
    ]
  },
  en: {
    title: 'E-books and digital products',
    body: 'Different rules apply to digital content because delivery starts immediately after purchase.',
    lines: [
      'E-books and digital products cannot be returned or exchanged.',
      'No refund is available after purchase or after the download has started.',
      'The return window and the legal withdrawal period do not apply once digital delivery has started.'
    ]
  },
  fr: {
    title: 'Livres numériques et produits électroniques',
    body: 'Des règles différentes s’appliquent au contenu numérique, car la livraison commence immédiatement après l’achat.',
    lines: [
      'Les livres numériques et produits électroniques ne sont ni retournables ni échangeables.',
      'Aucun remboursement n’est possible après l’achat ou le début du téléchargement.',
      'Le délai de retour et le droit de rétractation ne s’appliquent plus une fois la livraison numérique commencée.'
    ]
  }
};

function workedExample(policy: ReturnPolicy | null, language: SiteLanguage) {
  const price = 1500;
  const fee = 490;
  const legalDays = policy?.legalWithdrawalDays ?? 14;
  const applyLegal = policy?.applyLegalWithdrawalRules !== false;
  const withinLegal = applyLegal ? Math.max(0, price) : Math.max(0, price - fee);
  const afterLegal = Math.max(0, price - fee);
  return {
    legalDays,
    withinLegal,
    afterLegal,
    fee,
    price,
    legalLine: applyLegal
      ? `${translateText('خلال', language)} ${legalDays} ${translateText('يومًا: يُرد', language)} ${money(withinLegal, language)} (${translateText('السعر كاملًا، بما فيه التوصيل', language)})`
      : `${translateText('القواعد القانونية معطّلة: يُرد', language)} ${money(withinLegal, language)}`,
    commercialLine: `${translateText('بعد', language)} ${legalDays} ${translateText('يومًا: يُرد', language)} ${money(afterLegal, language)} (${translateText('السعر بعد خصم التوصيل', language)} ${money(fee, language)})`
  };
}

export function ReturnsPolicyPage() {
  const { locale = 'ar' } = useParams();
  const language = (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as SiteLanguage;
  const t = (text: string) => translateText(text, language);
  const { policy, loading, error } = useReturnPolicy(language);
  const example = workedExample(policy, language);
  const digitalPolicy = digitalPolicyText[language];

  return <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
    <p className="text-sm font-semibold tracking-widest text-brand-ink">{t('سياسة الإرجاع والاسترداد')}</p>
    <h1 className="mt-3 text-3xl font-semibold leading-relaxed text-brand-ink dark:text-brand-on sm:text-4xl">{t('إرجاع الكتب المطبوعة')}</h1>
    <p className="mt-4 text-lg leading-9 text-ink-muted dark:text-ink-muted">
      {policy?.policyText?.[language] || t('نوضح هنا شروط الإرجاع والاسترداد بوضوح قبل الشراء.')}
    </p>

    {loading && <div className="mt-8 h-24 animate-pulse rounded-2xl bg-brand-soft dark:bg-surface/5" />}
    {error && <p role="alert" className="mt-6 rounded-2xl border border-danger bg-danger-soft p-4 text-sm text-danger">{error}</p>}

    {policy && <div className="mt-9 space-y-5">
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Clock3, title: 'مدة الإرجاع', value: `${policy.defaultReturnWindowDays} ${t('يومًا من التسليم')}` },
          { icon: ShieldCheck, title: 'فترة العدول القانونية', value: `${policy.legalWithdrawalDays} ${t('يومًا')}` },
          { icon: Truck, title: 'شحن الإرجاع', value: policy.returnShippingPayer === 'prepaid_label' ? t('على حسابنا') : t('على حساب العميل، مع تتبع') }
        ].map(({ icon: Icon, title, value }) => <article key={title} className="rounded-2xl border border-line bg-surface p-5 dark:bg-surface-sunken">
          <Icon size={20} className="text-brand-ink dark:text-brand-ink" />
          <h2 className="mt-2 text-sm font-semibold text-ink dark:text-brand-on">{t(title)}</h2>
          <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted">{value}</p>
        </article>)}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 dark:bg-surface-sunken">
        <h2 className="text-lg font-semibold text-ink dark:text-brand-on">{t('كيف تطلب الإرجاع؟')}</h2>
        <ol className="mt-4 space-y-3 text-sm leading-7 text-ink-muted dark:text-ink-muted">
          {[t('افتح حسابك ← الطلبات، واختر الكتاب المؤهل ثم «إرجاع كتاب».'),
            t('اختر السبب وأضف تعليقًا وصورًا إن طُلب منك ذلك.'),
            t('راجع ملخص المبلغ المسترد قبل التأكيد.'),
            t('بعد الموافقة، أرسل الطرد إلى عنوان الإرجاع وأدخل رقم التتبع.'),
            t('نفحص الكتاب ثم نصدر الاسترداد إلى وسيلة الدفع الأصلية.')
          ].map((step, index) => <li key={step} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink dark:bg-brand/15 dark:text-brand-on">{index + 1}</span>
            <span>{step}</span>
          </li>)}
        </ol>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 dark:bg-surface-sunken">
        <h2 className="text-lg font-semibold text-ink dark:text-brand-on">{t('الشروط')}</h2>
        <p className="mt-3 leading-8 text-ink-muted dark:text-ink-muted">{policy.conditionText?.[language] || t('يجب أن يصل الكتاب بحالته الأصلية وغير مستعمل.')}</p>
        <ul className="mt-4 space-y-2 text-sm text-ink-muted dark:text-ink-muted">
          {[t('الكتب المطبوعة فقط؛ الكتب الإلكترونية والاشتراكات والتبرعات غير قابلة للإرجاع.'),
            t('تُحسب المدة من تاريخ التسليم المسجل في حسابك.'),
            t('يُرد المبلغ المدفوع فعليًا بعد الخصم، لا السعر قبل الخصم.'),
            t('الطلب الواحد يُرجع مرة واحدة لكل نسخة.')
          ].map((line) => <li key={line} className="flex gap-2"><CheckCircle2 size={16} className="mt-1 shrink-0 text-brand-ink" />{line}</li>)}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface-soft p-6 dark:bg-surface/5">
        <h2 className="text-lg font-semibold text-ink dark:text-brand-on">{digitalPolicy.title}</h2>
        <p className="mt-2 text-sm leading-7 text-ink-muted dark:text-ink-muted">{digitalPolicy.body}</p>
        <ul className="mt-4 space-y-2 text-sm font-semibold text-ink">
          {digitalPolicy.lines.map((line) => <li key={line} className="flex gap-2"><AlertTriangle size={16} className="mt-1 shrink-0 text-ink-muted dark:text-ink-muted" />{line}</li>)}
        </ul>
      </section>

      <section className="rounded-2xl border border-gold bg-gold-soft p-6 dark:border-gold dark:bg-gold-soft">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gold-ink dark:text-gold-ink"><AlertTriangle size={18} /> {t('مثال محسوب من الإعدادات الحالية')}</h2>
        <p className="mt-2 text-sm text-gold-ink dark:text-gold-ink">{t('كتاب بـ 15.00 EUR ورسوم توصيل 4.90 EUR.')}</p>
        <ul className="mt-3 space-y-2 text-sm font-semibold text-gold-ink dark:text-gold-ink">
          <li>{example.legalLine}</li>
          <li>{example.commercialLine}</li>
        </ul>
        {!policy.applyLegalWithdrawalRules && <p className="mt-3 rounded-xl bg-surface/70 p-3 text-xs leading-6 text-gold-ink dark:bg-black/20 dark:text-gold-ink">
          {t('تنبيه: القواعد القانونية لفترة العدول معطّلة في الإعدادات الحالية. راجع الإدارة إن كنت تعتقد أن هذا خطأ.')}
        </p>}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 dark:bg-surface-sunken">
        <h2 className="text-lg font-semibold text-ink dark:text-brand-on">{t('الأسباب المقبولة')}</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {policy.reasons.map((reason) => <li key={reason.code} className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-ink dark:bg-brand/15 dark:text-brand-on">{reason.label}</li>)}
        </ul>
        <p className="mt-4 text-sm leading-7 text-ink-muted dark:text-ink-muted">{policy.instructions}</p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 dark:bg-surface-sunken">
        <h2 className="text-lg font-semibold text-ink dark:text-brand-on">{t('عنوان الإرجاع')}</h2>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-soft p-4 text-sm leading-6 text-ink dark:bg-surface/5">{policy.returnAddressText || t('يُرسل العنوان بعد الموافقة على الطلب.')}</pre>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-soft p-5 text-sm text-brand-ink dark:bg-brand/40 dark:text-brand-on">
        <span className="inline-flex items-center gap-2"><BookOpen size={16} /> {t('هل لديك سؤال عن طلب قديم؟')}</span>
        <Link to={`/${language}/account`} className="rounded-full bg-brand px-4 py-2 font-semibold text-brand-on">{t('طلباتي وإرجاعاتي')}</Link>
      </div>

      <p className="flex items-center justify-center gap-2 text-xs text-ink-muted dark:text-ink-muted"><RefreshCw size={12} /> {t('تُحدَّث هذه الصفحة تلقائيًا عند تغيير الإدارة لسياسة الإرجاع.')}</p>
    </div>}
  </div>;
}
