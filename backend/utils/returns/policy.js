const { ReturnPolicySettings } = require('../../models');

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_REASONS = [
  {
    code: 'no_longer_needed',
    isSellerFault: false,
    requiresDetails: false,
    requiresPhotos: false,
    translations: {
      ar: 'لم أعد بحاجة إلى الكتاب',
      en: 'I no longer need the book',
      fr: 'Je n’ai plus besoin du livre'
    }
  },
  {
    code: 'ordered_by_mistake',
    isSellerFault: false,
    requiresDetails: false,
    requiresPhotos: false,
    translations: {
      ar: 'طلبت الكتاب بالخطأ',
      en: 'I ordered it by mistake',
      fr: 'Commande effectuée par erreur'
    }
  },
  {
    code: 'not_as_described',
    isSellerFault: false,
    requiresDetails: true,
    requiresPhotos: false,
    translations: {
      ar: 'الكتاب لا يطابق الوصف',
      en: 'The book does not match the description',
      fr: 'Le livre ne correspond pas à la description'
    }
  },
  {
    code: 'damaged',
    isSellerFault: true,
    requiresDetails: true,
    requiresPhotos: true,
    translations: {
      ar: 'الكتاب تالف أو تضرر أثناء النقل',
      en: 'The book arrived damaged',
      fr: 'Le livre est arrivé endommagé'
    }
  },
  {
    code: 'defective',
    isSellerFault: true,
    requiresDetails: true,
    requiresPhotos: true,
    translations: {
      ar: 'الكتاب معيب أو غير قابل للاستخدام',
      en: 'The book is defective',
      fr: 'Le livre est défectueux'
    }
  },
  {
    code: 'wrong_item',
    isSellerFault: true,
    requiresDetails: true,
    requiresPhotos: true,
    translations: {
      ar: 'وصلني كتاب مختلف',
      en: 'I received the wrong book',
      fr: 'J’ai reçu un autre livre'
    }
  },
  {
    code: 'lost_parcel',
    isSellerFault: true,
    requiresDetails: true,
    requiresPhotos: false,
    translations: {
      ar: 'لم يصل الطرد',
      en: 'The parcel never arrived',
      fr: 'Le colis n’est jamais arrivé'
    }
  },
  {
    code: 'other',
    isSellerFault: false,
    requiresDetails: true,
    requiresPhotos: false,
    translations: {
      ar: 'سبب آخر',
      en: 'Another reason',
      fr: 'Autre raison'
    }
  }
];

const DEFAULT_POLICY_TEXT = {
  ar: 'يمكن إرجاع الكتب المطبوعة فقط، خلال المدة المحددة ابتداءً من تاريخ التسليم. تُرد قيمة الكتاب المدفوعة فعليًا بعد الخصم، وتُخصم رسوم التوصيل خارج فترة العدول القانونية. الكتب الرقمية والمنتجات الإلكترونية غير قابلة للإرجاع أو الاستبدال، ولا يُسترد ثمنها بعد إتمام الشراء أو بدء التنزيل. الاشتراكات والتبرعات غير قابلة للإرجاع أيضًا.',
  en: 'Only printed books can be returned, within the stated window counted from the delivery date. The price actually paid after discount is refunded; the delivery fee is deducted outside the legal withdrawal period. E-books and electronic products cannot be returned or exchanged, and no refund is available after purchase or after download has started. Subscriptions and donations are also non-returnable.',
  fr: 'Seuls les livres papier peuvent être retournés, dans le délai indiqué à compter de la date de livraison. Le prix effectivement payé après remise est remboursé ; les frais de livraison sont déduits en dehors de la période de rétractation légale. Les livres numériques et produits électroniques ne sont ni retournables ni échangeables, et aucun remboursement n’est possible après l’achat ou le début du téléchargement. Les abonnements et dons ne sont pas retournables non plus.'
};

const DEFAULT_CONDITION_TEXT = {
  ar: 'يجب أن يصل الكتاب بحالته الأصلية، غير مستعمل وغير تالف. يفحص فريقنا كل إرجاع قبل الاسترداد.',
  en: 'The book must come back in its original condition, unused and undamaged. Our team inspects every return before refunding.',
  fr: 'Le livre doit revenir dans son état d’origine, non utilisé et non endommagé. Notre équipe inspecte chaque retour avant le remboursement.'
};

const DEFAULT_SETTINGS = {
  returnsEnabled: true,
  defaultReturnWindowDays: 30,
  legalWithdrawalDays: 14,
  applyLegalWithdrawalRules: true,
  deliveryDeductionMode: 'defined_fee',
  returnShippingPayer: 'customer',
  returnAddress: {},
  shipBackDeadlineDays: 14,
  refundDeadlineDays: 14,
  autoApproveRequests: false,
  autoRefundAfterAcceptance: false,
  requirePhotosForDefects: true,
  maxReturnsPerUserPerYear: null,
  defaultDeliveryEstimateDays: 7,
  reasons: DEFAULT_REASONS,
  policyText: DEFAULT_POLICY_TEXT,
  conditionText: DEFAULT_CONDITION_TEXT,
  emailTemplates: {}
};

function localizedValue(value, language = 'ar') {
  if (!value || typeof value !== 'object') return '';
  return value[language] || value.ar || value.en || value.fr || '';
}

/** Plain, defaulted settings object safe to send to the admin or the client site. */
function normalizeSettings(row) {
  const raw = row?.toJSON ? row.toJSON() : row || {};
  const reasons = Array.isArray(raw.reasons) && raw.reasons.length ? raw.reasons : DEFAULT_REASONS;
  return {
    ...DEFAULT_SETTINGS,
    ...Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== null)),
    reasons,
    policyText: { ...DEFAULT_POLICY_TEXT, ...(raw.policyText || {}) },
    conditionText: { ...DEFAULT_CONDITION_TEXT, ...(raw.conditionText || {}) },
    returnAddress: raw.returnAddress && typeof raw.returnAddress === 'object' ? raw.returnAddress : {},
    emailTemplates: raw.emailTemplates && typeof raw.emailTemplates === 'object' ? raw.emailTemplates : {},
    updatedAt: raw.updatedAt || null
  };
}

async function getReturnPolicy() {
  const [row] = await ReturnPolicySettings.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1 }
  });
  return normalizeSettings(row);
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + Math.max(0, Number(days) || 0) * DAY_MS);
}

function daysBetween(from, to) {
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.floor(diff / DAY_MS);
}

/**
 * Delivery date used to open the return window. The admin-entered deliveredAt wins,
 * then the shipping date plus the configured estimate. Never returns a future date.
 */
function resolveDeliveryDate({ deliveredAt, shippedAt, fallbackDays = 7, now = new Date() }) {
  if (deliveredAt) return { date: new Date(deliveredAt), source: 'delivered_at' };
  if (shippedAt) {
    const estimate = addDays(shippedAt, fallbackDays);
    return { date: estimate > now ? now : estimate, source: 'shipped_estimate' };
  }
  return { date: null, source: 'missing' };
}

function reasonByCode(settings, code) {
  return (settings.reasons || DEFAULT_REASONS).find((reason) => reason.code === code) || null;
}

function itemWindowDays(item, settings) {
  const snapshot = Number(item.returnWindowDays);
  if (Number.isFinite(snapshot) && snapshot > 0) return snapshot;
  const book = item.book || {};
  if (Number.isFinite(Number(book.returnWindowDays)) && Number(book.returnWindowDays) > 0) {
    return Number(book.returnWindowDays);
  }
  return Number(settings.defaultReturnWindowDays) || 30;
}

function itemLegalDays(item, settings) {
  const snapshot = Number(item.legalWithdrawalDays);
  if (Number.isFinite(snapshot) && snapshot > 0) return snapshot;
  return Number(settings.legalWithdrawalDays) || 14;
}

function formatReturnAddress(address, fallback = '') {
  if (!address || typeof address !== 'object') return fallback;
  return [
    address.name,
    address.company,
    address.line1,
    address.line2,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.country
  ].filter((part) => typeof part === 'string' && part.trim()).join('\n') || fallback;
}

const INSTRUCTIONS = {
  customer: {
    fr: 'Expédiez le colis avec un suivi, à vos frais, puis saisissez le numéro de suivi dans votre espace client.',
    en: 'Ship the parcel with a tracked service at your own expense, then enter the tracking number in your account.',
    ar: 'أرسل الطرد بخدمة تتبع وعلى نفقتك، ثم أدخل رقم التتبع في حسابك.'
  },
  prepaid_label: {
    fr: 'Nous couvrons les frais de retour : une étiquette prépayée vous est envoyée par e-mail avec l’adresse ci-dessus.',
    en: 'We cover the return shipping: a prepaid label is sent to you by email together with the address above.',
    ar: 'نتحمل نحن تكلفة الإرجاع: نرسل إليك بطاقة شحن مدفوعة مسبقًا مع العنوان أعلاه.'
  }
};

function returnInstructions(settings, language = 'ar', sellerFault = false) {
  if (sellerFault) {
    return {
      fr: 'Pour cet article défectueux, erroné ou perdu, les frais de retour sont à notre charge : une étiquette prépayée vous est envoyée.',
      en: 'For this defective, wrong or lost item we cover the return shipping: a prepaid label is sent to you.',
      ar: 'بالنسبة لهذا المنتج المعيب أو الخاطئ أو المفقود، نتحمل نحن تكلفة الإرجاع: نرسل إليك بطاقة شحن مدفوعة مسبقًا.'
    }[language] || INSTRUCTIONS.customer.fr;
  }
  const mode = settings.returnShippingPayer === 'prepaid_label' ? 'prepaid_label' : 'customer';
  return INSTRUCTIONS[mode][language] || INSTRUCTIONS[mode].fr;
}

module.exports = {
  DAY_MS,
  DEFAULT_REASONS,
  DEFAULT_POLICY_TEXT,
  DEFAULT_CONDITION_TEXT,
  DEFAULT_SETTINGS,
  normalizeSettings,
  getReturnPolicy,
  addDays,
  daysBetween,
  resolveDeliveryDate,
  reasonByCode,
  itemWindowDays,
  itemLegalDays,
  formatReturnAddress,
  returnInstructions,
  localizedValue
};
