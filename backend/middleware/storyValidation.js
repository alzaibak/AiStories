const { z } = require('zod');

const slug = z.string().trim().min(1).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const httpUrl = z.string().url().max(1000).refine((value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, {
  message: 'Une URL HTTP ou HTTPS est requise.'
});
const sourceReference = z.object({
  reference: z.string().trim().min(1).max(1000)
}).catchall(z.unknown());
const localizedText = (fields) => z.object(Object.fromEntries(fields.map((field) => [
  field,
  z.string().trim().min(1).max(field === 'content' ? 1000000 : 10000)
])));
const translationsSchema = (fields) => z.object({
  ar: localizedText(fields).partial().optional(),
  en: localizedText(fields).partial().optional(),
  fr: localizedText(fields).partial().optional()
}).optional();

const collectionSchema = z.object({
  title: z.string().trim().min(1).max(255),
  slug,
  description: z.string().max(10000).nullable().optional(),
  cover: httpUrl.nullable().optional(),
  translations: translationsSchema(['title', 'description']),
  isFree: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});

const storySchema = z.object({
  collectionId: z.number().int().positive(),
  title: z.string().trim().min(1).max(255),
  slug,
  summary: z.string().trim().min(1).max(10000),
  cover: httpUrl.nullable().optional(),
  translations: translationsSchema(['title', 'summary']),
  type: z.enum(['quran', 'sunnah', 'history', 'new']),
  sourceBadge: z.enum(['quran_verse', 'authentic_hadith', 'historical_source', 'inspired_story']),
  sourceReferences: z.array(sourceReference).max(100).default([]),
  isFree: z.boolean().optional(),
  publishAt: z.string().datetime().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  ageGroup: z.enum(['kids', 'teens', 'adults', 'all']).optional(),
  isStoryOfTheWeek: z.boolean().optional()
});

const partSchema = z.object({
  partNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(255),
  content: z.string().trim().min(1).max(1000000),
  translations: translationsSchema(['title', 'content', 'endingHook']),
  estimatedReadingMinutes: z.number().int().min(1).max(120).default(5),
  endingHook: z.string().trim().min(1).max(2000),
  isFree: z.boolean().optional(),
  releaseAt: z.string().datetime().nullable().optional(),
  earlyAccessUntil: z.string().datetime().nullable().optional()
});

const videoSchema = z.object({
  partId: z.number().int().positive().nullable().optional(),
  videoUrl: httpUrl.nullable().optional(),
  durationSeconds: z.number().int().positive().max(3600).nullable().optional(),
  thumbnail: httpUrl.nullable().optional(),
  episodeNumber: z.number().int().positive(),
  isFree: z.boolean().optional(),
  productionStatus: z.enum(['script_reviewed', 'storyboard', 'images', 'voice_over', 'music', 'montage', 'published']).optional(),
  productionCost: z.number().nonnegative().nullable().optional(),
  depictionPolicyConfirmed: z.literal(true)
});

const quizSchema = z.object({
  partId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  difficulty: z.enum(['kids', 'teens', 'adults']),
  passingScore: z.number().int().min(0).max(100).default(60),
  timeLimitSeconds: z.number().int().positive().max(7200).nullable().optional()
});

const questionSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctAnswer: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(5000),
  source: z.string().trim().min(1).max(1000),
  sortOrder: z.number().int().positive().optional()
});

const quizReviewSchema = z.object({ validationStatus: z.literal('validated') });
const reviewSchema = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  comments: z.string().trim().min(1).max(10000)
});

const bookSchema = z.object({
  collectionId: z.number().int().positive().nullable().optional(),
  storyId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  slug,
  description: z.string().max(10000).nullable().optional(),
  cover: httpUrl.nullable().optional(),
  translations: translationsSchema(['title', 'description']),
  format: z.enum(['print', 'ebook']),
  price: z.number().nonnegative(),
  currency: z.string().trim().length(3).default('EUR'),
  stockQuantity: z.number().int().nonnegative().nullable().optional(),
  fileStorageKey: z.string().max(1024).nullable().optional(),
  isPublished: z.boolean().optional()
});

const mediaSchema = z.object({
  storyId: z.number().int().positive().nullable().optional(),
  partId: z.number().int().positive().nullable().optional(),
  bookId: z.number().int().positive().nullable().optional(),
  mediaType: z.enum(['image', 'video', 'ebook', 'cover', 'thumbnail']),
  fileName: z.string().trim().min(1).max(255),
  storageKey: z.string().trim().min(1).max(1024).nullable().optional(),
  externalUrl: httpUrl.nullable().optional(),
  mimeType: z.string().max(150).nullable().optional(),
  depictionPolicyConfirmed: z.literal(true),
  metadata: z.record(z.string(), z.unknown()).optional()
}).refine((value) => value.storageKey || value.externalUrl, {
  message: 'Un fichier doit être associé à une clé de stockage ou à une URL externe.'
}).refine((value) => value.storyId || value.partId || value.bookId, {
  message: 'Le média doit être associé à une histoire, une partie ou un livre.'
});

const mediaUploadSchema = z.object({
  storyId: z.number().int().positive().nullable().optional(),
  partId: z.number().int().positive().nullable().optional(),
  bookId: z.number().int().positive().nullable().optional(),
  mediaType: z.enum(['image', 'ebook', 'cover', 'thumbnail']),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  depictionPolicyConfirmed: z.literal(true)
}).refine((value) => value.storyId || value.partId || value.bookId, {
  message: 'Le média doit être associé à une histoire, une partie ou un livre.'
}).refine((value) =>
  value.mediaType === 'ebook'
    ? value.mimeType === 'application/pdf'
    : value.mimeType.startsWith('image/'), {
  message: 'Le type de fichier ne correspond pas au type de média.'
});

const styleGuideSchema = z.object({
  title: z.string().trim().min(1).max(255),
  notes: z.string().trim().min(1).max(20000),
  referenceImages: z.array(httpUrl).max(100).optional(),
  isActive: z.boolean().optional()
});

const quizAnswersSchema = z.object({
  attemptId: z.number().int().positive(),
  answers: z.record(z.string(), z.string())
});

const readingProgressSchema = z.object({
  completedParts: z.array(z.number().int().positive()).max(500).default([]),
  lastPartId: z.number().int().positive().nullable().optional()
});

const bookCheckoutSchema = z.object({
  language: z.enum(['ar', 'en', 'fr']).default('ar'),
  items: z.array(z.object({
    bookId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(20)
  })).min(1).max(10).superRefine((items, context) => {
    if (new Set(items.map((item) => item.bookId)).size !== items.length) {
      context.addIssue({ code: 'custom', message: 'Chaque livre ne peut apparaître qu’une seule fois.' });
    }
  }),
  shippingAddress: z.object({
    name: z.string().trim().min(1).max(255),
    line1: z.string().trim().min(1).max(255),
    line2: z.string().trim().max(255).optional().default(''),
    city: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().min(1).max(32),
    country: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
    phone: z.string().trim().min(5).max(40)
  }).optional()
});

const subscriptionCheckoutSchema = z.object({
  planId: z.number().int().positive(),
  language: z.enum(['ar', 'en', 'fr']).default('ar')
});

const planSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug,
  price: z.number().positive().max(99999999.99),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).default('EUR'),
  interval: z.enum(['month', 'year']),
  features: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  isFamily: z.boolean().default(false),
  isActive: z.boolean().default(true)
});
const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug,
  price: z.number().positive().max(99999999.99),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  interval: z.enum(['month', 'year']),
  features: z.array(z.string().trim().min(1).max(500)).max(30),
  isFamily: z.boolean(),
  isActive: z.boolean()
}).partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Au moins un champ doit être mis à jour.'
});

const adminSubscriptionUpdateSchema = z.object({
  status: z.enum(['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'expired']).optional(),
  startedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  gracePeriodEndsAt: z.string().datetime().nullable().optional(),
  cancelAtPeriodEnd: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Au moins un champ doit être mis à jour.'
});

const adminOrderUpdateSchema = z.object({
  fulfillmentStatus: z.enum(['processing', 'shipped', 'delivered']).optional(),
  trackingNumber: z.string().trim().max(255).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Au moins un champ doit être mis à jour.'
});

module.exports = {
  collectionSchema,
  storySchema,
  partSchema,
  videoSchema,
  quizSchema,
  questionSchema,
  quizReviewSchema,
  reviewSchema,
  bookSchema,
  mediaSchema,
  mediaUploadSchema,
  styleGuideSchema,
  quizAnswersSchema,
  readingProgressSchema,
  bookCheckoutSchema,
  subscriptionCheckoutSchema,
  planSchema,
  planUpdateSchema,
  adminSubscriptionUpdateSchema,
  adminOrderUpdateSchema
};
