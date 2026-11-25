const { z } = require('zod');

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour.');
const countryCode = z.string().trim().length(2).transform((value) => value.toUpperCase());
const faqItem = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(5000)
});
const faqList = z.array(faqItem).max(30);

const itemTranslations = z.object({
  en: z.object({
    displayName: z.string().trim().max(255).optional().default(''),
    teaserText: z.string().trim().max(500).optional().default('')
  }).optional(),
  fr: z.object({
    displayName: z.string().trim().max(255).optional().default(''),
    teaserText: z.string().trim().max(500).optional().default('')
  }).optional()
}).optional();

const boxTranslations = z.object({
  en: z.object({
    title: z.string().trim().max(255).optional().default(''),
    tagline: z.string().trim().max(500).optional().default(''),
    description: z.string().trim().max(20000).optional().default(''),
    digitalConsentText: z.string().trim().max(5000).optional().default(''),
    termsText: z.string().trim().max(20000).optional().default(''),
    faq: faqList.optional()
  }).optional(),
  fr: z.object({
    title: z.string().trim().max(255).optional().default(''),
    tagline: z.string().trim().max(500).optional().default(''),
    description: z.string().trim().max(20000).optional().default(''),
    digitalConsentText: z.string().trim().max(5000).optional().default(''),
    termsText: z.string().trim().max(20000).optional().default(''),
    faq: faqList.optional()
  }).optional()
}).optional();

const itemSchema = z.object({
  type: z.enum([
    'ebook', 'printed_book', 'physical_object', 'story_rental', 'premium_access_days',
    'badge', 'certificate', 'digital_extra', 'promo_coupon', 'sponsored_book_donation'
  ]),
  referenceId: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().min(1).max(99).optional(),
  durationDays: z.number().int().min(1).max(3650).nullable().optional(),
  displayName: z.string().trim().min(1).max(255),
  teaserText: z.string().trim().max(500).nullable().optional(),
  translations: itemTranslations,
  estimatedValue: z.number().min(0).max(1000000).nullable().optional(),
  imageUrl: z.string().trim().max(1000).nullable().optional(),
  isHiddenBeforePurchase: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  weightGrams: z.number().int().min(0).max(100000).nullable().optional(),
  itemStock: z.number().int().min(0).max(1000000).nullable().optional(),
  sku: z.string().trim().max(120).nullable().optional()
});

const shippingSchema = z.object({
  shippingFee: z.number().min(0).max(10000).optional(),
  freeShippingThreshold: z.number().min(0).max(100000).nullable().optional(),
  allowedCountries: z.array(countryCode).min(1).max(60).optional(),
  feeByCountry: z.record(z.string(), z.number().min(0).max(10000)).optional(),
  estimatedDeliveryMinDays: z.number().int().min(1).max(365).optional(),
  estimatedDeliveryMaxDays: z.number().int().min(1).max(365).optional(),
  carrier: z.string().trim().max(120).nullable().optional(),
  shippingNote: z.string().trim().max(5000).nullable().optional(),
  translations: z.object({
    en: z.object({ shippingNote: z.string().trim().max(5000).optional().default('') }).optional(),
    fr: z.object({ shippingNote: z.string().trim().max(5000).optional().default('') }).optional()
  }).optional(),
  shipsFrom: z.string().trim().max(255).nullable().optional(),
  shippingStartDate: z.coerce.date().nullable().optional()
});

const appearanceSchema = z.object({
  headerLabel: z.string().trim().max(80).optional(),
  translations: z.object({
    en: z.object({ headerLabel: z.string().trim().max(80).optional().default('') }).optional(),
    fr: z.object({ headerLabel: z.string().trim().max(80).optional().default('') }).optional()
  }).optional(),
  icon: z.string().trim().max(255).optional(),
  colorFrom: hexColor.optional(),
  colorTo: hexColor.optional(),
  accentColor: hexColor.optional(),
  animationStyle: z.enum(['shimmer', 'pulse', 'sparkle', 'none']).optional(),
  showCountdownInHeader: z.boolean().optional(),
  almostSoldOutThreshold: z.number().int().min(0).max(100000).nullable().optional(),
  bannerImage: z.string().trim().max(1000).nullable().optional(),
  seasonPatternStyle: z.string().trim().max(40).optional()
});

const boxFieldsSchema = z.object({
  title: z.string().trim().min(1).max(255),
  tagline: z.string().trim().max(500).optional(),
  seasonLabel: z.string().trim().max(120).optional(),
  slug: z.string().trim().min(2).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  translations: boxTranslations,
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  price: z.number().min(0).max(1000000).nullable().optional(),
  earlyBirdPrice: z.number().min(0).max(1000000).nullable().optional(),
  earlyBirdEndsAt: z.coerce.date().nullable().optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  compareAtValue: z.number().min(0).max(1000000).nullable().optional(),
  stockLimit: z.number().int().min(1).max(1000000).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(50).optional(),
  revealMode: z.enum(['hidden_until_purchase', 'teaser', 'full']).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  digitalConsentText: z.string().trim().max(5000).nullable().optional(),
  faq: faqList.optional(),
  termsText: z.string().trim().max(20000).nullable().optional(),
  requiresShipping: z.boolean().optional(),
  returnPolicy: z.enum(['none', 'standard']).optional(),
  items: z.array(itemSchema).max(50).optional(),
  shipping: shippingSchema.optional(),
  appearance: appearanceSchema.optional()
});

const boxCreateSchema = boxFieldsSchema;

const boxUpdateSchema = boxFieldsSchema.partial().extend({
  acknowledgeSales: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required.'
});

const checkoutSchema = z.object({
  language: z.enum(['ar', 'en', 'fr']).default('ar'),
  country: countryCode.optional(),
  digitalContentConsent: z.boolean().optional().default(false),
  shippingAddress: z.object({
    name: z.string().trim().max(255).optional(),
    line1: z.string().trim().max(255).optional(),
    line2: z.string().trim().max(255).optional(),
    postalCode: z.string().trim().max(40).optional(),
    city: z.string().trim().max(120).optional(),
    country: countryCode.optional(),
    phone: z.string().trim().max(40).optional()
  }).optional()
});

const notifySchema = z.object({
  email: z.string().trim().email().max(255),
  language: z.enum(['en', 'fr']).optional()
});

const purchaseShippingSchema = z.object({
  trackingNumber: z.string().trim().min(3).max(255),
  carrier: z.string().trim().max(120).optional(),
  shippingStatus: z.enum(['shipped', 'delivered']).optional()
});

const trackSchema = z.object({
  event: z.enum(['view', 'header_click'])
});

module.exports = {
  boxCreateSchema,
  boxUpdateSchema,
  checkoutSchema,
  notifySchema,
  purchaseShippingSchema,
  trackSchema
};
