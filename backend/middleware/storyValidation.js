const { z } = require('zod');
const slugValue = z.string().trim().min(2).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const slug = slugValue.optional();
const httpUrl = z.string().url().max(1000).refine((value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, {
  message: 'Une URL HTTP ou HTTPS est requise.'
});
const embeddableVideoUrl = httpUrl.refine((value) => {
  try {
    const { hostname } = new URL(value);
    return hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com') ||
      hostname === 'vimeo.com' || hostname.endsWith('.vimeo.com');
  } catch {
    return false;
  }
}, { message: 'Utilisez un lien YouTube ou Vimeo autorisé.' });
const sourceReference = z.object({
  reference: z.string().trim().min(1).max(1000)
}).catchall(z.unknown());
const localizedText = (fields) => z.object(Object.fromEntries(fields.map((field) => [
  field,
  z.string().trim().min(1).max(field === 'content' ? 1000000 : 10000)
])));
const optionalLocalizedValue = (max = 5000) => z.object({
  ar: z.string().trim().max(max).optional().default(''),
  en: z.string().trim().max(max).optional().default(''),
  fr: z.string().trim().max(max).optional().default('')
});
const translationsSchema = (fields) => z.object({
  ar: localizedText(fields).partial().optional(),
  en: localizedText(fields).partial().optional(),
  fr: localizedText(fields).partial().optional()
}).optional();
const planTranslationsSchema = z.object(Object.fromEntries(['ar', 'en', 'fr'].map((language) => [
  language,
  z.object({
    name: z.string().trim().min(1).max(120),
    features: z.array(z.string().trim().min(1).max(500)).max(30)
  })
])));

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
  reviewChecklist: z.object({
    sourcesProvided: z.boolean().default(false),
    reviewedBy: z.string().trim().max(255).optional().default(''),
    reviewedAt: z.string().datetime().nullable().optional(),
    representationConfirmed: z.boolean().default(false)
  }).optional(),
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

const videoFieldsSchema = z.object({
  partId: z.number().int().positive().nullable().optional(),
  videoUrl: embeddableVideoUrl.nullable().optional(),
  mediaAssetId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).optional(),
  translations: z.object({
    ar: z.object({
      title: z.string().trim().min(1).max(255),
      description: z.string().trim().max(10000).optional().default('')
    }),
    en: z.object({
      title: z.string().trim().max(255).optional().default(''),
      description: z.string().trim().max(10000).optional().default('')
    }).optional(),
    fr: z.object({
      title: z.string().trim().max(255).optional().default(''),
      description: z.string().trim().max(10000).optional().default('')
    }).optional()
  }),
  subtitles: z.object({
    ar: httpUrl.optional(),
    en: httpUrl.optional(),
    fr: httpUrl.optional()
  }).optional(),
  durationSeconds: z.number().int().positive().max(3600).nullable().optional(),
  thumbnail: httpUrl.nullable().optional(),
  episodeNumber: z.number().int().positive(),
  isFree: z.boolean().optional(),
  status: z.enum(['draft', 'in_review', 'published', 'rejected', 'archived']).optional(),
  productionStatus: z.enum(['script_reviewed', 'storyboard', 'images', 'voice_over', 'music', 'montage', 'published']).optional(),
  productionCost: z.number().nonnegative().nullable().optional(),
  depictionPolicyConfirmed: z.literal(true)
});

const videoSchema = videoFieldsSchema.refine((value) => value.videoUrl || value.mediaAssetId, {
  message: 'Un fichier vidéo ou un lien YouTube/Vimeo est requis.',
  path: ['videoUrl']
});
const videoUpdateSchema = videoFieldsSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Au moins un champ doit être mis à jour.'
});

const quizSchema = z.object({
  partId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  slug: slugValue.optional(),
  description: z.string().trim().max(10000).optional().default(''),
  translations: z.object({
    ar: z.object({
      title: z.string().trim().min(1).max(255),
      description: z.string().trim().max(10000).optional().default('')
    }),
    en: z.object({
      title: z.string().trim().max(255).optional().default(''),
      description: z.string().trim().max(10000).optional().default('')
    }).optional(),
    fr: z.object({
      title: z.string().trim().max(255).optional().default(''),
      description: z.string().trim().max(10000).optional().default('')
    }).optional()
  }).optional(),
  difficulty: z.enum(['kids', 'teens', 'adults']),
  passingScore: z.number().int().min(0).max(100).default(60),
  maxAttempts: z.number().int().positive().max(100).nullable().optional(),
  timeLimitSeconds: z.number().int().positive().max(7200).nullable().optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleAnswers: z.boolean().optional(),
  showCorrectAnswersAfterSubmit: z.boolean().optional(),
  accessMode: z.enum(['follow_part', 'free', 'premium']).optional()
});

const questionSchema = z.object({
  id: z.number().int().positive().optional(),
  type: z.enum(['single_choice', 'multiple_choice', 'true_false']).default('single_choice'),
  text: z.string().trim().min(1).max(5000),
  translations: z.object({
    ar: z.object({ text: z.string().trim().min(1).max(5000) }),
    en: z.object({ text: z.string().trim().max(5000).optional().default('') }).optional(),
    fr: z.object({ text: z.string().trim().max(5000).optional().default('') }).optional()
  }).optional(),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(10).optional(),
  correctAnswer: z.string().trim().max(500).optional(),
  answerOptions: z.array(z.object({
    id: z.number().int().positive().optional(),
    text: z.string().trim().min(1).max(500),
    translations: optionalLocalizedValue(500),
    isCorrect: z.boolean().default(false),
    sortOrder: z.number().int().min(0).optional()
  })).min(2).max(10).optional(),
  points: z.number().int().positive().max(1000).default(1),
  explanation: z.string().trim().max(5000).optional().default(''),
  explanationTranslations: optionalLocalizedValue().optional().default({}),
  source: z.string().trim().max(1000).optional().default(''),
  sourceTranslations: optionalLocalizedValue(1000).optional().default({}),
  sortOrder: z.number().int().min(0).optional()
}).superRefine((value, context) => {
  const correctCount = value.answerOptions
    ? value.answerOptions.filter((option) => option.isCorrect).length
    : value.options?.filter((option) => option === value.correctAnswer).length || 0;
  if (!correctCount) {
    context.addIssue({ code: 'custom', path: ['answerOptions'], message: 'Au moins une bonne réponse est obligatoire.' });
  }
  if (value.type === 'single_choice' && correctCount !== 1) {
    context.addIssue({ code: 'custom', path: ['answerOptions'], message: 'Une seule bonne réponse est requise.' });
  }
});

const quizContentSchema = quizSchema.extend({
  storyId: z.number().int().positive(),
  questions: z.array(questionSchema).min(1).max(100)
});

const quizReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'return_to_draft']),
  comments: z.string().trim().max(10000).optional().default('')
}).refine((value) => value.decision !== 'rejected' || value.comments.length > 0, {
  message: 'Un commentaire est obligatoire pour rejeter un quiz.',
  path: ['comments']
});
const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'return_to_draft', 'changes_requested']),
  comments: z.string().trim().max(10000).optional().default('')
}).refine((value) => value.decision !== 'rejected' || value.comments.length > 0, {
  message: 'Un commentaire est obligatoire pour rejeter une histoire.',
  path: ['comments']
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
  mediaType: z.enum(['image', 'audio', 'video', 'ebook', 'cover', 'thumbnail']),
  fileName: z.string().trim().min(1).max(255),
  storageKey: z.string().trim().min(1).max(1024).nullable().optional(),
  externalUrl: httpUrl.nullable().optional(),
  mimeType: z.string().max(150).nullable().optional(),
  depictionPolicyConfirmed: z.literal(true),
  metadata: z.record(z.string(), z.unknown()).optional()
}).refine((value) => value.storageKey || value.externalUrl, {
  message: 'Un fichier doit être associé à une clé de stockage ou à une URL externe.'
});

const mediaUploadSchema = z.object({
  storyId: z.number().int().positive().nullable().optional(),
  partId: z.number().int().positive().nullable().optional(),
  bookId: z.number().int().positive().nullable().optional(),
  mediaType: z.enum(['image', 'video', 'ebook', 'cover', 'thumbnail']),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm']),
  depictionPolicyConfirmed: z.literal(true),
  altText: optionalLocalizedValue(1000).optional()

}).refine((value) =>
  value.mediaType === 'ebook'
    ? value.mimeType === 'application/pdf'
    : value.mediaType === 'video'
      ? value.mimeType.startsWith('video/')
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
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())]))
});

const readingProgressSchema = z.object({
  completedParts: z.array(z.number().int().positive()).max(500).default([]),
  lastPartId: z.number().int().positive().nullable().optional()
});

const bookCheckoutSchema = z.object({
  language: z.enum(['ar', 'en', 'fr']).default('ar'),
  promoCode: z.string().trim().min(2).max(64).optional(),
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
  promoCode: z.string().trim().min(2).max(64).optional(),
  language: z.enum(['ar', 'en', 'fr']).default('ar')
});

const planSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugValue,
  price: z.number().positive().max(99999999.99),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).default('EUR'),
  interval: z.enum(['month', 'year']),
  features: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  translations: planTranslationsSchema,
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
  translations: planTranslationsSchema.optional(),
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

const communityEventFieldsSchema = z.object({
  slug: slugValue,
  translations: z.object({
    ar: z.object({ title: z.string().trim().min(1).max(255), rules: z.string().trim().min(1).max(10000) }),
    en: z.object({ title: z.string().trim().max(255).optional().default(''), rules: z.string().trim().max(10000).optional().default('') }).optional(),
    fr: z.object({ title: z.string().trim().max(255).optional().default(''), rules: z.string().trim().max(10000).optional().default('') }).optional()
  }),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  winnerDisplayName: z.string().trim().max(120).nullable().optional(),
  winnerAnnouncement: z.object({
    ar: z.string().trim().min(1).max(5000),
    en: z.string().trim().max(5000).optional().default(''),
    fr: z.string().trim().max(5000).optional().default('')
  }).nullable().optional(),
  quizId: z.number().int().positive().nullable().optional(),
  status: z.enum(['draft', 'published', 'completed', 'cancelled']).optional()
});

const communityEventSchema = communityEventFieldsSchema.extend({
  status: z.enum(['draft', 'published', 'completed', 'cancelled']).default('draft')
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
  path: ['endsAt'],
  message: 'La fin doit être postérieure au début.'
});
const communityEventUpdateSchema = communityEventFieldsSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Au moins un champ doit être mis à jour.'
});

const promoCodeFieldsSchema = z.object({
  code: z.string().trim().min(2).max(64).regex(/^[A-Z0-9][A-Z0-9_-]*$/).transform((value) => value.toUpperCase()),
  kind: z.enum(['percentage', 'fixed', 'gift']),
  appliesTo: z.enum(['all', 'books', 'plans']).optional(),
  value: z.number().nonnegative().max(99999999.99),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().max(100).optional(),
  applicableBookIds: z.array(z.number().int().positive()).max(100).optional(),
  applicablePlanIds: z.array(z.number().int().positive()).max(100).optional(),
  giftPlanId: z.number().int().positive().nullable().optional(),
  giftDurationDays: z.number().int().positive().max(3650).nullable().optional(),
  isActive: z.boolean().optional()
});

function validatePromoCode(value, context) {
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: 'custom', path: ['endsAt'], message: 'La date de fin doit être postérieure à la date de début.' });
  }
  if (value.kind === 'percentage' && (value.value <= 0 || value.value > 100)) {
    context.addIssue({ code: 'custom', path: ['value'], message: 'Le pourcentage doit être supérieur à 0 et inférieur ou égal à 100.' });
  }
  if (value.kind === 'fixed' && value.value <= 0) {
    context.addIssue({ code: 'custom', path: ['value'], message: 'La remise fixe doit être supérieure à zéro.' });
  }
  if (value.kind === 'gift' && (!value.giftPlanId || !value.giftDurationDays)) {
    context.addIssue({ code: 'custom', path: ['giftPlanId'], message: 'Une offre et une durée sont requises pour un code cadeau.' });
  }
}

const promoCodeSchema = promoCodeFieldsSchema.superRefine(validatePromoCode);
const promoCodeUpdateSchema = promoCodeFieldsSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Au moins un champ doit être mis à jour.'
});
const giftCodeRedemptionSchema = z.object({
  code: z.string().trim().min(2).max(64).transform((value) => value.toUpperCase())
});

const donationCampaignSchema = z.object({
  slug: slugValue,
  translations: z.object({
    ar: z.object({ title: z.string().trim().min(1).max(255), description: z.string().trim().min(1).max(10000) }),
    en: z.object({ title: z.string().trim().max(255).optional().default(''), description: z.string().trim().max(10000).optional().default('') }).optional(),
    fr: z.object({ title: z.string().trim().max(255).optional().default(''), description: z.string().trim().max(10000).optional().default('') }).optional()
  }),
  goalAmount: z.number().positive().max(99999999.99),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).default('EUR'),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).default('draft')
});

const donationCheckoutSchema = z.object({
  amount: z.number().positive().max(999999.99),
  language: z.enum(['ar', 'en', 'fr']).default('ar'),
  recurring: z.boolean().default(false)
});

const emailTemplateSchema = z.object({
  code: z.string().trim().min(2).max(100).regex(/^[a-z0-9_-]+$/),
  translations: z.object({
    ar: z.object({ subject: z.string().trim().min(1).max(255), body: z.string().trim().min(1).max(20000) }),
    en: z.object({ subject: z.string().trim().max(255).optional().default(''), body: z.string().trim().max(20000).optional().default('') }).optional(),
    fr: z.object({ subject: z.string().trim().max(255).optional().default(''), body: z.string().trim().max(20000).optional().default('') }).optional()
  }),
  isActive: z.boolean().default(true)
});

const policyPageSchema = z.object({
  translations: z.object({
    ar: z.object({ title: z.string().trim().min(1).max(255), body: z.string().trim().min(1).max(30000) }),
    en: z.object({ title: z.string().trim().max(255).optional().default(''), body: z.string().trim().max(30000).optional().default('') }).optional(),
    fr: z.object({ title: z.string().trim().max(255).optional().default(''), body: z.string().trim().max(30000).optional().default('') }).optional()
  })
});

module.exports = {
  collectionSchema,
  storySchema,
  partSchema,
  videoSchema,
  videoUpdateSchema,
  quizSchema,
  quizContentSchema,
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
  adminOrderUpdateSchema,
  communityEventSchema,
  communityEventUpdateSchema,
  promoCodeSchema,
  promoCodeUpdateSchema,
  giftCodeRedemptionSchema,
  donationCampaignSchema,
  donationCheckoutSchema,
  emailTemplateSchema,
  policyPageSchema
};
