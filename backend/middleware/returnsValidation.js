const { z } = require('zod');

const language = z.enum(['ar', 'en', 'fr']);

const selectionSchema = z.object({
  orderItemId: z.number().int().positive().optional(),
  mysteryBoxItemId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).max(99).default(1)
}).refine((value) => value.orderItemId || value.mysteryBoxItemId, {
  message: 'Chaque ligne doit référencer un article de commande ou une box.'
});

const orderOrBox = z.object({
  orderId: z.number().int().positive().optional(),
  mysteryBoxPurchaseId: z.number().int().positive().optional()
}).refine((value) => Boolean(value.orderId) !== Boolean(value.mysteryBoxPurchaseId), {
  message: 'Indiquez soit une commande, soit une Mystery Box.'
});

const createReturnSchema = orderOrBox.and(z.object({
  items: z.array(selectionSchema).min(1).max(50),
  reason: z.string().trim().min(2).max(80),
  reasonDetails: z.string().trim().max(4000).optional(),
  photos: z.array(z.string().trim().min(3).max(1000)).max(8).optional(),
  language: language.optional(),
  sellerFault: z.boolean().optional(),
  overrideReason: z.string().trim().max(2000).optional()
}));

const quoteSchema = orderOrBox.and(z.object({
  items: z.array(selectionSchema).max(50).optional(),
  language: language.optional()
}));

const trackingSchema = z.object({
  trackingNumber: z.string().trim().min(4).max(255),
  carrier: z.string().trim().max(120).optional()
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(2000)
});

const inspectSchema = z.object({
  result: z.enum(['accepted', 'partial', 'rejected']),
  notes: z.string().trim().max(4000).optional(),
  refundAmount: z.number().positive().max(100000).optional(),
  language: language.optional()
});

const closeSchema = z.object({
  note: z.string().trim().max(4000).optional()
});

const overrideSchema = z.object({
  note: z.string().trim().min(10).max(4000),
  status: z.enum([
    'requested', 'approved', 'rejected', 'awaiting_shipment', 'shipped_back', 'received',
    'inspected', 'refund_pending', 'refunded', 'closed', 'cancelled', 'expired'
  ]).optional(),
  refundAmount: z.number().min(0).max(100000).optional(),
  windowStartAt: z.string().datetime({ offset: true }).optional()
});

const reasonSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/),
  isSellerFault: z.boolean().optional(),
  requiresDetails: z.boolean().optional(),
  requiresPhotos: z.boolean().optional(),
  translations: z.object({
    ar: z.string().trim().min(1).max(300),
    en: z.string().trim().min(1).max(300),
    fr: z.string().trim().min(1).max(300)
  })
});

const localizedTextSchema = z.object({
  ar: z.string().trim().max(20000).optional(),
  en: z.string().trim().max(20000).optional(),
  fr: z.string().trim().max(20000).optional()
});

const templateOverrideSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(20000)
});

const settingsSchema = z.object({
  returnsEnabled: z.boolean(),
  defaultReturnWindowDays: z.union([z.literal(30), z.literal(60)]),
  legalWithdrawalDays: z.number().int().min(0).max(60),
  applyLegalWithdrawalRules: z.boolean(),
  deliveryDeductionMode: z.enum(['defined_fee', 'fee_paid']),
  returnShippingPayer: z.enum(['customer', 'prepaid_label']),
  returnAddress: z.object({
    name: z.string().trim().max(200).optional(),
    company: z.string().trim().max(200).optional(),
    line1: z.string().trim().max(300).optional(),
    line2: z.string().trim().max(300).optional(),
    postalCode: z.string().trim().max(40).optional(),
    city: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional()
  }).default({}),
  shipBackDeadlineDays: z.number().int().min(1).max(90),
  refundDeadlineDays: z.number().int().min(1).max(60),
  autoApproveRequests: z.boolean(),
  autoRefundAfterAcceptance: z.boolean(),
  requirePhotosForDefects: z.boolean(),
  maxReturnsPerUserPerYear: z.number().int().min(0).max(1000).nullable().optional(),
  defaultDeliveryEstimateDays: z.number().int().min(1).max(60),
  reasons: z.array(reasonSchema).max(20),
  policyText: localizedTextSchema,
  conditionText: localizedTextSchema,
  emailTemplates: z.record(z.enum(['ar', 'en', 'fr']), templateOverrideSchema).optional()
});

const notesSchema = z.object({
  internalNotes: z.string().trim().max(5000).nullable()
});

const deliveryDateSchema = z.object({
  deliveredAt: z.string().datetime({ offset: true }).nullable(),
  note: z.string().trim().min(10).max(2000)
});

const customerFlagSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(500).optional()
}).refine((value) => value.blocked === false || Boolean(value.reason && value.reason.trim()), {
  message: 'Un motif est requis pour bloquer les retours d’un client.'
});

module.exports = {
  createReturnSchema,
  quoteSchema,
  trackingSchema,
  rejectSchema,
  inspectSchema,
  closeSchema,
  overrideSchema,
  settingsSchema,
  notesSchema,
  deliveryDateSchema,
  customerFlagSchema
};
