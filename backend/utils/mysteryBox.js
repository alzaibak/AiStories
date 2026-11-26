const { toMinorUnits } = require('./stripe');

const PHYSICAL_ITEM_TYPES = new Set(['printed_book', 'physical_object']);
const ITEM_TYPES = [
  'ebook', 'printed_book', 'physical_object', 'story_rental', 'premium_access_days',
  'badge', 'certificate', 'digital_extra', 'promo_coupon', 'sponsored_book_donation'
];
const REVEAL_MODES = ['hidden_until_purchase', 'teaser', 'full'];
const DEFAULT_DIGITAL_CONSENT = {
  ar: 'أوافق على تسليم المحتوى الرقمي فورًا، وأقرّ بفقدان حق الانسحاب بالنسبة للمحتوى الرقمي بعد تسليمه.',
  en: 'I agree that digital content is delivered immediately and I acknowledge that I lose my right of withdrawal for digital content once it is delivered.',
  fr: 'J’accepte que le contenu numérique soit livré immédiatement et je reconnais perdre mon droit de rétractation pour ce contenu une fois livré.'
};

function decimal(value) {
  return Number(value ?? 0);
}

function money(value) {
  const number = decimal(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function normalizeCountry(value) {
  return String(value || '').trim().toUpperCase();
}

function isPhysicalItem(item) {
  return PHYSICAL_ITEM_TYPES.has(item?.type);
}

function boxItemValue(item) {
  const unit = decimal(item?.estimatedValue);
  const quantity = Number.isSafeInteger(Number(item?.quantity)) ? Number(item.quantity) : 1;
  return unit * quantity;
}

function itemsValue(items = []) {
  return items.reduce((sum, item) => sum + boxItemValue(item), 0);
}

function remainingStock(box) {
  if (box?.stockLimit === null || box?.stockLimit === undefined) return null;
  return Math.max(0, Number(box.stockLimit) - Number(box.stockSold || 0) - Number(box.stockReserved || 0));
}

function isSoldOut(box, now = new Date()) {
  if (!box?.endAt || new Date(box.endAt) <= now) return false;
  const remaining = remainingStock(box);
  return remaining !== null && remaining <= 0;
}

function computeMysteryBoxState(box, now = new Date()) {
  const status = box?.status || 'draft';
  if (status === 'draft') return 'draft';
  if (status === 'archived') return 'archived';
  if (status === 'ended') return 'ended';
  const startAt = box.startAt ? new Date(box.startAt) : null;
  const endAt = box.endAt ? new Date(box.endAt) : null;
  if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return status === 'scheduled' ? 'scheduled' : 'draft';
  }
  if (now < startAt) return 'scheduled';
  if (now >= endAt) return 'ended';
  const remaining = remainingStock(box);
  if (remaining !== null && remaining <= 0) return 'sold_out';
  return 'active';
}

function isPurchasable(box, now = new Date()) {
  return computeMysteryBoxState(box, now) === 'active';
}

function effectivePrice(box, now = new Date()) {
  const standard = decimal(box?.price);
  if (!Number.isFinite(standard) || standard <= 0) {
    const error = new Error('This box does not have a valid price.');
    error.status = 409;
    error.code = 'BOX_PRICE_UNAVAILABLE';
    throw error;
  }
  const earlyPrice = decimal(box.earlyBirdPrice);
  const earlyEnds = box.earlyBirdEndsAt ? new Date(box.earlyBirdEndsAt) : null;
  const currency = String(box.currency || 'EUR').toUpperCase();
  const earlyIsActive = box.earlyBirdPrice !== null && box.earlyBirdPrice !== undefined &&
    Number.isFinite(earlyPrice) && earlyPrice > 0 && earlyPrice < standard &&
    earlyEnds && !Number.isNaN(earlyEnds.getTime()) && now < earlyEnds;
  const amount = earlyIsActive ? earlyPrice : standard;
  return {
    amount: money(amount),
    amountMinor: toMinorUnits(amount, currency),
    currency,
    tier: earlyIsActive ? 'early_bird' : 'standard',
    earlyBird: earlyIsActive ? {
      amount: money(earlyPrice),
      endsAt: earlyEnds.toISOString()
    } : null
  };
}

function savingsPercent(price, value) {
  const paid = decimal(price);
  const worth = decimal(value);
  if (!(worth > 0) || paid >= worth) return 0;
  return Math.round((1 - paid / worth) * 100);
}

function shippingFeeFor({ shipping, country, subtotal, currency = 'EUR' }) {
  if (!shipping) {
    return { amountMinor: 0, amount: '0.00', freeShipping: true, country: null };
  }
  const normalized = normalizeCountry(country);
  const allowed = (shipping.allowedCountries || []).map(normalizeCountry);
  if (!normalized || !allowed.includes(normalized)) {
    const error = new Error('Shipping is not available for the selected country.');
    error.status = 400;
    error.code = 'COUNTRY_NOT_ALLOWED';
    throw error;
  }
  const overrides = shipping.feeByCountry || {};
  const overrideKey = Object.keys(overrides).find((key) => normalizeCountry(key) === normalized);
  const baseFee = overrideKey ? overrides[overrideKey] : shipping.shippingFee;
  const fee = decimal(baseFee);
  if (!Number.isFinite(fee) || fee < 0) {
    const error = new Error('The configured shipping fee is invalid.');
    error.status = 503;
    error.code = 'SHIPPING_UNAVAILABLE';
    throw error;
  }
  const threshold = shipping.freeShippingThreshold === null || shipping.freeShippingThreshold === undefined
    ? null
    : decimal(shipping.freeShippingThreshold);
  const freeShipping = threshold !== null && Number.isFinite(threshold) && decimal(subtotal) >= threshold;
  const charged = freeShipping ? 0 : fee;
  const amountMinor = toMinorUnits(charged, currency, { allowZero: true });
  return {
    amountMinor,
    amount: money(charged),
    freeShipping,
    country: normalized
  };
}

function physicalCheckoutIssue({ items = [], box, shipping }) {
  if (!box?.requiresShipping && !items.some(isPhysicalItem)) return null;
  if (!shipping) {
    return {
      status: 409,
      code: 'SHIPPING_REQUIRED',
      message: 'Physical boxes require shipping settings.'
    };
  }
  if (!(Number.isInteger(Number(box?.stockLimit)) && Number(box.stockLimit) > 0)) {
    return {
      status: 409,
      code: 'STOCK_LIMIT_REQUIRED',
      message: 'Physical boxes require a positive stock limit.'
    };
  }
  return null;
}

function checkoutShippingCountries(shippingFee) {
  // The fee was computed for exactly one country. Letting Stripe collect any
  // other allowed country would charge the wrong shipping amount.
  return shippingFee?.country ? [shippingFee.country] : [];
}

function duplicateBoxFields(source, createdBy) {
  return {
    title: source.title,
    tagline: source.tagline,
    seasonLabel: source.seasonLabel,
    status: 'draft',
    timezone: source.timezone,
    priority: source.priority,
    price: source.price,
    earlyBirdPrice: source.earlyBirdPrice,
    currency: source.currency,
    compareAtValue: source.compareAtValue,
    stockLimit: source.stockLimit,
    perUserLimit: source.perUserLimit,
    revealMode: source.revealMode,
    description: source.description,
    promoBlocks: source.promoBlocks,
    digitalConsentText: source.digitalConsentText,
    faq: source.faq,
    termsText: source.termsText,
    translations: source.translations,
    requiresShipping: source.requiresShipping,
    allowRandomItems: source.allowRandomItems,
    createdBy
  };
}

function deliveryEstimate(language, shipping) {
  if (!shipping) return '';
  const min = Number(shipping.estimatedDeliveryMinDays);
  const max = Number(shipping.estimatedDeliveryMaxDays);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return '';
  if (language === 'en') return `${min}–${max} business days`;
  if (language === 'fr') return `${min} à ${max} jours ouvrés`;
  return `من ${min} إلى ${max} أيام عمل`;
}

function localizedBoxField(box, language, field) {
  if (!box) return '';
  if (language && language !== 'ar') {
    const translated = box.translations?.[language]?.[field];
    if (typeof translated === 'string' && translated.trim()) return translated;
    if (Array.isArray(translated) && translated.length) return translated;
  }
  return box[field] ?? '';
}

function localizedItemField(item, language, field) {
  if (!item) return '';
  if (language && language !== 'ar') {
    const translated = item.translations?.[language]?.[field];
    if (typeof translated === 'string' && translated.trim()) return translated;
  }
  return item[field] ?? '';
}

function localizedAppearanceField(appearance, language, field) {
  if (!appearance) return '';
  if (language && language !== 'ar') {
    const translated = appearance.translations?.[language]?.[field];
    if (typeof translated === 'string' && translated.trim()) return translated;
  }
  return appearance[field] ?? '';
}

function localizedShippingField(shipping, language, field) {
  if (!shipping) return '';
  if (language && language !== 'ar') {
    const translated = shipping.translations?.[language]?.[field];
    if (typeof translated === 'string' && translated.trim()) return translated;
  }
  return shipping[field] ?? '';
}

function publicItem(item, { language = 'ar', revealMode = 'teaser', revealed = false } = {}) {
  const full = {
    id: item.id,
    type: item.type,
    displayName: localizedItemField(item, language, 'displayName'),
    teaserText: localizedItemField(item, language, 'teaserText') || null,
    imageUrl: item.imageUrl || null,
    estimatedValue: item.estimatedValue === null ? null : money(item.estimatedValue),
    quantity: item.quantity,
    weightGrams: item.weightGrams,
    isPhysical: isPhysicalItem(item),
    isHidden: false
  };
  const hidden = Boolean(item.isHiddenBeforePurchase) && !revealed && revealMode !== 'full';
  if (!hidden) return full;
  return {
    id: item.id,
    type: revealMode === 'teaser' ? item.type : null,
    displayName: null,
    teaserText: localizedItemField(item, language, 'teaserText') || null,
    imageUrl: null,
    estimatedValue: null,
    quantity: item.quantity,
    weightGrams: null,
    isPhysical: isPhysicalItem(item),
    isHidden: true
  };
}

function publicItems(items = [], options = {}) {
  return [...items]
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.id) - Number(b.id))
    .map((item) => publicItem(item, options));
}

function itemCounts(items = []) {
  const physical = items.filter(isPhysicalItem);
  return {
    itemCount: items.length,
    physicalItemCount: physical.length,
    digitalItemCount: items.length - physical.length
  };
}

function validateBoxForActivation({ box, items = [], shipping, appearance }) {
  const missing = [];
  const add = (code, field) => missing.push({ code, field });
  if (!String(box?.title || '').trim()) add('title_ar', 'title');
  if (!items.length) add('items', 'items');
  const price = decimal(box?.price);
  if (!(price > 0)) add('price', 'price');
  const currency = String(box?.currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    add('currency', 'currency');
  } else {
    try {
      toMinorUnits(price > 0 ? price : 1, currency);
    } catch {
      add('currency', 'currency');
    }
  }
  const startAt = box?.startAt ? new Date(box.startAt) : null;
  const endAt = box?.endAt ? new Date(box.endAt) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) add('start_at', 'startAt');
  if (!endAt || Number.isNaN(endAt.getTime())) add('end_at', 'endAt');
  if (startAt && endAt && !Number.isNaN(startAt.getTime()) && !Number.isNaN(endAt.getTime()) &&
    endAt <= startAt) {
    add('date_order', 'endAt');
  }
  if (box?.earlyBirdPrice !== null && box?.earlyBirdPrice !== undefined) {
    const early = decimal(box.earlyBirdPrice);
    const earlyEnds = box.earlyBirdEndsAt ? new Date(box.earlyBirdEndsAt) : null;
    if (!(early > 0) || !(early < price)) add('early_bird_price', 'earlyBirdPrice');
    if (!earlyEnds || Number.isNaN(earlyEnds.getTime())) {
      add('early_bird_end', 'earlyBirdEndsAt');
    } else {
      if (startAt && earlyEnds <= startAt) add('early_bird_end', 'earlyBirdEndsAt');
      if (endAt && earlyEnds >= endAt) add('early_bird_end', 'earlyBirdEndsAt');
    }
  }
  if (!appearance) {
    add('appearance', 'appearance');
  } else {
    if (!String(appearance.headerLabel || '').trim()) add('header_label', 'appearance.headerLabel');
    for (const field of ['colorFrom', 'colorTo', 'accentColor']) {
      if (!/^#[0-9a-fA-F]{6}$/.test(String(appearance[field] || ''))) add('appearance_color', `appearance.${field}`);
    }
  }

  const hasPhysical = Boolean(box?.requiresShipping) || items.some(isPhysicalItem);
  if (hasPhysical) {
    if (!Number.isInteger(Number(box?.stockLimit)) || Number(box.stockLimit) < 1) {
      add('stock_limit', 'stockLimit');
    } else if (Number(box.stockLimit) <= Number(box.stockSold || 0)) {
      add('stock_sold_out', 'stockLimit');
    }
    if (!shipping) {
      add('shipping', 'shipping');
    } else {
      if (!Array.isArray(shipping.allowedCountries) || !shipping.allowedCountries.length) {
        add('allowed_countries', 'shipping.allowedCountries');
      }
      if (decimal(shipping.shippingFee) < 0) add('shipping_fee', 'shipping.shippingFee');
      if (Number(shipping.estimatedDeliveryMaxDays) < Number(shipping.estimatedDeliveryMinDays)) {
        add('delivery_estimate', 'shipping.estimatedDeliveryMaxDays');
      }
    }
    if (Number.isInteger(Number(box?.stockLimit)) && Number(box.stockLimit) > 0) {
      for (const item of items.filter(isPhysicalItem)) {
        if (item.itemStock === null || item.itemStock === undefined) continue;
        const needed = Number(item.quantity || 1) * Number(box.stockLimit);
        if (Number(item.itemStock) < needed) {
          missing.push({ code: 'item_stock', field: 'items', itemId: item.id, needed });
        }
      }
    }
  }
  return { valid: missing.length === 0, missing };
}

function serializeShipping(shipping, { language = 'ar', price, currency = 'EUR' } = {}) {
  if (!shipping) return null;
  const allowedCountries = (shipping.allowedCountries || []).map(normalizeCountry);
  const fees = {};
  for (const country of allowedCountries) {
    try {
      fees[country] = shippingFeeFor({ shipping, country, subtotal: price, currency });
    } catch {
      fees[country] = null;
    }
  }
  return {
    shippingFee: money(shipping.shippingFee),
    freeShippingThreshold: shipping.freeShippingThreshold === null ? null : money(shipping.freeShippingThreshold),
    allowedCountries,
    feeByCountry: shipping.feeByCountry || {},
    fees,
    estimatedDeliveryMinDays: shipping.estimatedDeliveryMinDays,
    estimatedDeliveryMaxDays: shipping.estimatedDeliveryMaxDays,
    deliveryEstimate: deliveryEstimate(language, shipping),
    carrier: shipping.carrier || null,
    shippingNote: localizedShippingField(shipping, language, 'shippingNote') || null,
    shipsFrom: shipping.shipsFrom || null,
    shippingStartDate: shipping.shippingStartDate || null
  };
}

/** Admin promo blocks, with the text of the requested language. */
function localizedPromoBlocks(box, language = 'ar') {
  const blocks = Array.isArray(box?.promoBlocks) ? box.promoBlocks : [];
  return blocks
    .map((block) => {
      const type = block?.type === 'image' ? 'image' : 'text';
      const pick = (field) => {
        const value = block?.[field];
        if (typeof value === 'string') return value.trim();
        if (!value || typeof value !== 'object') return '';
        const translated = language !== 'ar' ? value[language] : '';
        return String(translated || value.ar || '').trim();
      };
      return {
        type,
        title: pick('title'),
        body: pick('body'),
        imageUrl: block?.imageUrl ? String(block.imageUrl) : null,
        imageAlt: block?.imageAlt ? String(block.imageAlt) : null
      };
    })
    .filter((block) => (block.type === 'image' ? Boolean(block.imageUrl) : Boolean(block.title || block.body)));
}

function serializePublicBox({ box, items = [], shipping, appearance, language = 'ar', revealed = false }) {
  const now = new Date();
  const state = computeMysteryBoxState(box, now);
  const price = effectivePrice(box, now);
  const counts = itemCounts(items);
  const value = itemsValue(items);
  const compareAt = box.compareAtValue !== null && box.compareAtValue !== undefined
    ? decimal(box.compareAtValue)
    : value;
  const publicAppearance = appearance ? {
    headerLabel: localizedAppearanceField(appearance, language, 'headerLabel'),
    icon: appearance.icon,
    colorFrom: appearance.colorFrom,
    colorTo: appearance.colorTo,
    accentColor: appearance.accentColor,
    animationStyle: appearance.animationStyle,
    showCountdownInHeader: appearance.showCountdownInHeader,
    almostSoldOutThreshold: appearance.almostSoldOutThreshold,
    bannerImage: appearance.bannerImage,
    seasonPatternStyle: appearance.seasonPatternStyle
  } : null;
  const remaining = remainingStock(box);
  const requiresShipping = Boolean(box.requiresShipping) || items.some(isPhysicalItem);
  return {
    id: box.id,
    slug: box.slug,
    title: localizedBoxField(box, language, 'title'),
    tagline: localizedBoxField(box, language, 'tagline'),
    seasonLabel: box.seasonLabel || '',
    state,
    soldOut: state === 'sold_out',
    startsAt: box.startAt,
    endsAt: box.endAt,
    serverTime: now.toISOString(),
    timezone: box.timezone,
    price: {
      ...price,
      savingsPercent: savingsPercent(price.amount, compareAt)
    },
    value: {
      amount: money(compareAt),
      itemsValue: money(value),
      savingsPercent: savingsPercent(price.amount, compareAt)
    },
    stock: {
      limit: box.stockLimit === null ? null : Number(box.stockLimit),
      sold: Number(box.stockSold || 0),
      remaining
    },
    perUserLimit: Number(box.perUserLimit || 1),
    revealMode: box.revealMode,
    revealed,
    description: localizedBoxField(box, language, 'description') || null,
    promo: localizedPromoBlocks(box, language),
    digitalConsentText: localizedBoxField(box, language, 'digitalConsentText') ||
      DEFAULT_DIGITAL_CONSENT[language] || DEFAULT_DIGITAL_CONSENT.ar,
    faq: localizedBoxField(box, language, 'faq') || [],
    termsText: localizedBoxField(box, language, 'termsText') || null,
    requiresShipping,
    ...counts,
    items: publicItems(items, { language, revealMode: box.revealMode, revealed }),
    appearance: publicAppearance,
    shipping: box.requiresShipping ? serializeShipping(shipping, { language, price: price.amount, currency: price.currency }) : null
  };
}

function serializeHeader(box, { items = [], appearance, language = 'ar', now = new Date() } = {}) {
  const state = computeMysteryBoxState(box, now);
  // Bars and cards also exist for a drop that starts soon, and a sold-out drop
  // stays visible with a disabled button instead of disappearing.
  if (!['active', 'scheduled', 'sold_out'].includes(state)) return null;
  let price;
  try {
    price = effectivePrice(box, now);
  } catch {
    return null;
  }
  const remaining = remainingStock(box);
  const configuredThreshold = Number(appearance?.almostSoldOutThreshold);
  const threshold = Number.isInteger(configuredThreshold) && configuredThreshold > 0 ? configuredThreshold : 5;
  return {
    state,
    slug: box.slug,
    label: localizedAppearanceField(appearance, language, 'headerLabel') ||
      localizedBoxField(box, language, 'title'),
    seasonLabel: box.seasonLabel || '',
    icon: appearance?.icon || '🎁',
    colorFrom: appearance?.colorFrom || '#10523C',
    colorTo: appearance?.colorTo || '#C5A25A',
    accentColor: appearance?.accentColor || '#F3E3B8',
    animationStyle: appearance?.animationStyle || 'shimmer',
    showCountdownInHeader: appearance?.showCountdownInHeader !== false,
    bannerImage: appearance?.bannerImage || null,
    startsAt: box.startAt,
    endsAt: box.endAt,
    serverTime: now.toISOString(),
    remaining,
    stockTotal: box.stockLimit === null || box.stockLimit === undefined ? null : Number(box.stockLimit),
    almostSoldOut: state === 'active' && remaining !== null && remaining <= threshold,
    price: { amount: price.amount, currency: price.currency, tier: price.tier, earlyBirdEndsAt: price.earlyBird?.endsAt || null },
    itemCount: items.length,
    perUserLimit: Math.max(1, Number(box.perUserLimit || 1)),
    requiresShipping: Boolean(box.requiresShipping) || items.some(isPhysicalItem),
    // Digital items require an explicit consent before checkout.
    needsDigitalConsent: items.some((item) => !isPhysicalItem(item))
  };
}

module.exports = {
  PHYSICAL_ITEM_TYPES,
  ITEM_TYPES,
  REVEAL_MODES,
  DEFAULT_DIGITAL_CONSENT,
  money,
  normalizeCountry,
  isPhysicalItem,
  boxItemValue,
  itemsValue,
  remainingStock,
  isSoldOut,
  computeMysteryBoxState,
  isPurchasable,
  effectivePrice,
  savingsPercent,
  shippingFeeFor,
  physicalCheckoutIssue,
  checkoutShippingCountries,
  duplicateBoxFields,
  deliveryEstimate,
  localizedBoxField,
  localizedItemField,
  localizedAppearanceField,
  localizedShippingField,
  localizedPromoBlocks,
  publicItem,
  publicItems,
  itemCounts,
  validateBoxForActivation,
  serializeShipping,
  serializePublicBox,
  serializeHeader
};
