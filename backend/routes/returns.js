const router = require('express').Router();
const { Op } = require('sequelize');
const {
  ReturnRequest,
  ReturnItem,
  ReturnPolicySettings,
  StoreOrder,
  MysteryBoxPurchase,
  User
} = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { validateBody } = require('../middleware/validation');
const schemas = require('../middleware/returnsValidation');
const service = require('../utils/returns/service');
const policy = require('../utils/returns/policy');
const { recordAudit } = require('../utils/audit');

const readers = [authenticate, allowRoles('READER')];
const admins = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN')];

/** French labels for the export: no raw status code leaves the admin screens. */
const RETURN_STATUS_LABELS_FR = {
  requested: 'Demandée',
  approved: 'Approuvée',
  awaiting_shipment: 'En attente d’expédition',
  shipped_back: 'Expédiée par le client',
  received: 'Reçue',
  inspected: 'Inspectée',
  refund_pending: 'Remboursement en cours',
  refunded: 'Remboursée',
  closed: 'Clôturée',
  cancelled: 'Annulée',
  rejected: 'Refusée',
  expired: 'Expirée'
};

function parseId(value, label = 'Identifiant') {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    const error = new Error(`${label} invalide.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function requestLanguage(req) {
  const requested = req.query.lang || req.body?.language || req.user?.language;
  return ['ar', 'en', 'fr'].includes(requested) ? requested : 'ar';
}

/* ------------------------------------------------------------------ */
/* Public policy                                                       */
/* ------------------------------------------------------------------ */

// Everything the storefront needs to describe the return policy before a
// purchase: wording, windows, who pays the return shipping and the reasons.
router.get('/returns/policy', async (req, res, next) => {
  try {
    const settings = await policy.getReturnPolicy();
    const language = requestLanguage(req);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      returnsEnabled: settings.returnsEnabled,
      defaultReturnWindowDays: settings.defaultReturnWindowDays,
      legalWithdrawalDays: settings.legalWithdrawalDays,
      applyLegalWithdrawalRules: settings.applyLegalWithdrawalRules,
      deliveryDeductionMode: settings.deliveryDeductionMode,
      returnShippingPayer: settings.returnShippingPayer,
      shipBackDeadlineDays: settings.shipBackDeadlineDays,
      refundDeadlineDays: settings.refundDeadlineDays,
      defaultDeliveryEstimateDays: settings.defaultDeliveryEstimateDays,
      returnAddress: settings.returnAddress,
      returnAddressText: policy.formatReturnAddress(settings.returnAddress),
      policyText: settings.policyText,
      conditionText: settings.conditionText,
      instructions: policy.returnInstructions(settings, language),
      reasons: (settings.reasons || []).map((reason) => ({
        code: reason.code,
        isSellerFault: reason.isSellerFault === true,
        requiresDetails: reason.requiresDetails === true,
        requiresPhotos: reason.requiresPhotos === true,
        label: reason.translations?.[language] || reason.translations?.ar || reason.code
      }))
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Reader API                                                          */
/* ------------------------------------------------------------------ */

router.get('/me/returns/reasons', ...readers, async (req, res, next) => {
  try {
    const settings = await policy.getReturnPolicy();
    const language = requestLanguage(req);
    res.set('Cache-Control', 'private, no-store');
    res.json({
      reasons: (settings.reasons || []).map((reason) => ({
        code: reason.code,
        isSellerFault: reason.isSellerFault === true,
        requiresDetails: reason.requiresDetails === true,
        requiresPhotos: reason.requiresPhotos === true,
        label: reason.translations?.[language] || reason.translations?.ar || reason.code
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me/orders/:id/returns/eligibility', ...readers, async (req, res, next) => {
  try {
    const quote = await service.orderReturnQuote({
      orderId: parseId(req.params.id, 'Commande'),
      userId: req.user.id,
      language: requestLanguage(req)
    });
    res.json(quote);
  } catch (error) {
    next(error);
  }
});

router.post('/me/returns/quote', ...readers, validateBody(schemas.quoteSchema), async (req, res, next) => {
  try {
    const payload = req.body;
    const quote = payload.mysteryBoxPurchaseId
      ? await service.boxReturnQuote({
        purchaseId: payload.mysteryBoxPurchaseId,
        userId: req.user.id,
        selection: payload.items,
        language: requestLanguage(req)
      })
      : await service.orderReturnQuote({
        orderId: payload.orderId,
        userId: req.user.id,
        selection: payload.items,
        language: requestLanguage(req)
      });
    res.json(quote);
  } catch (error) {
    next(error);
  }
});

router.post('/me/returns', ...readers, validateBody(schemas.createReturnSchema), async (req, res, next) => {
  try {
    const request = await service.createReturnRequest({
      userId: req.user.id,
      payload: { ...req.body, language: requestLanguage(req) }
    });
    await recordAudit(req, 'CREATE_RETURN_REQUEST', 'ReturnRequest', request.id, {
      rmaNumber: request.rmaNumber,
      orderId: request.orderId,
      mysteryBoxPurchaseId: request.mysteryBoxPurchaseId
    });
    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
});

router.get('/me/returns', ...readers, async (req, res, next) => {
  try {
    const requests = await service.listUserReturns(req.user.id);
    res.json(requests);
  } catch (error) {
    next(error);
  }
});

router.get('/me/returns/:id', ...readers, async (req, res, next) => {
  try {
    const request = await service.getReturnRequest(parseId(req.params.id, 'Retour'), {
      userId: req.user.id
    });
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/me/returns/:id/tracking', ...readers, validateBody(schemas.trackingSchema), async (req, res, next) => {
  try {
    const request = await service.addTracking({
      returnId: parseId(req.params.id, 'Retour'),
      userId: req.user.id,
      trackingNumber: req.body.trackingNumber,
      carrier: req.body.carrier
    });
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/me/returns/:id/cancel', ...readers, async (req, res, next) => {
  try {
    const request = await service.cancelReturn({
      returnId: parseId(req.params.id, 'Retour'),
      userId: req.user.id
    });
    res.json(request);
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Admin API                                                           */
/* ------------------------------------------------------------------ */

function adminReturnWhere(query) {
  const where = {};
  if (query.status) {
    const statuses = String(query.status).split(',').map((value) => value.trim()).filter(Boolean);
    if (statuses.length) where.status = { [Op.in]: statuses };
  }
  if (query.reason) where.reason = String(query.reason);
  if (query.sellerFault === 'true') where.isSellerFault = true;
  if (query.sellerFault === 'false') where.isSellerFault = false;
  if (query.from || query.to) {
    where.requestedAt = {};
    if (query.from) where.requestedAt[Op.gte] = new Date(String(query.from));
    if (query.to) where.requestedAt[Op.lte] = new Date(String(query.to));
  }
  const q = String(query.q || '').trim();
  if (q) {
    const search = [{ rmaNumber: { [Op.like]: `%${q}%` } }];
    if (/^\d+$/.test(q)) search.push({ orderId: Number(q) }, { mysteryBoxPurchaseId: Number(q) });
    where[Op.or] = search;
  }
  return where;
}

const adminReturnInclude = [
  { model: ReturnItem, as: 'items' },
  { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'language', 'returnsBlocked'] }
];

router.get('/admin/returns/settings', ...admins, async (req, res, next) => {
  try {
    res.json(await policy.getReturnPolicy());
  } catch (error) {
    next(error);
  }
});

router.put('/admin/returns/settings', ...admins, validateBody(schemas.settingsSchema), async (req, res, next) => {
  try {
    const [row] = await ReturnPolicySettings.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
    await row.update({ ...req.body, updatedBy: req.user.id });
    await recordAudit(req, 'UPDATE_RETURN_POLICY', 'ReturnPolicySettings', row.id, {
      defaultReturnWindowDays: req.body.defaultReturnWindowDays,
      deliveryDeductionMode: req.body.deliveryDeductionMode,
      applyLegalWithdrawalRules: req.body.applyLegalWithdrawalRules
    });
    res.json(policy.normalizeSettings(row));
  } catch (error) {
    next(error);
  }
});

router.get('/admin/returns/dashboard', ...admins, async (req, res, next) => {
  try {
    res.json(await service.returnsDashboard());
  } catch (error) {
    next(error);
  }
});

router.get('/admin/returns/export.csv', ...admins, async (req, res, next) => {
  try {
    const requests = await ReturnRequest.findAll({
      where: adminReturnWhere(req.query),
      include: adminReturnInclude,
      order: [['requestedAt', 'DESC']],
      limit: 5000
    });
    const rows = [[
      'RMA', 'Commande', 'Client', 'E-mail', 'Livres', 'Motif', 'Statut', 'Demandé le',
      'Date limite expédition', 'Montant remboursé', 'Devise', 'Suivi'
    ]];
    for (const request of requests) {
      rows.push([
        request.rmaNumber,
        request.orderId || (request.mysteryBoxPurchaseId ? `BOX-${request.mysteryBoxPurchaseId}` : ''),
        [request.user?.firstName, request.user?.lastName].filter(Boolean).join(' '),
        request.user?.email || '',
        (request.items || []).map((item) => `${item.titleSnapshot} ×${item.quantity}`).join(' | '),
        request.reason,
        RETURN_STATUS_LABELS_FR[request.status] || request.status,
        request.requestedAt ? new Date(request.requestedAt).toISOString() : '',
        request.shipBackDeadline ? new Date(request.shipBackDeadline).toISOString() : '',
        request.refundAmount || '',
        request.currency,
        request.trackingNumber || ''
      ]);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="returns-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${service.toCsv(rows)}`);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/returns', ...admins, async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where = adminReturnWhere(req.query);
    const { rows, count } = await ReturnRequest.findAndCountAll({
      where,
      include: adminReturnInclude,
      order: [['requestedAt', 'DESC']],
      limit,
      offset,
      distinct: true
    });
    res.json({ total: count, limit, offset, returns: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/returns/:id', ...admins, async (req, res, next) => {
  try {
    const request = await service.getReturnRequest(parseId(req.params.id, 'Retour'), { admin: true });
    const settings = await policy.getReturnPolicy();
    res.json({ ...request.toJSON(), policy: settings });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/returns/:id/notes', ...admins, validateBody(schemas.notesSchema), async (req, res, next) => {
  try {
    const request = await ReturnRequest.findByPk(parseId(req.params.id, 'Retour'));
    if (!request) return res.status(404).json({ message: 'Demande de retour introuvable.' });
    await request.update({ internalNotes: req.body.internalNotes });
    await recordAudit(req, 'UPDATE_RETURN_NOTES', 'ReturnRequest', request.id);
    res.json({ id: request.id, internalNotes: request.internalNotes });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/returns/:id/approve', ...admins, async (req, res, next) => {
  try {
    const request = await service.approveReturn({
      returnId: parseId(req.params.id, 'Retour'),
      admin: req.user
    });
    await recordAudit(req, 'APPROVE_RETURN', 'ReturnRequest', request.id);
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/returns/:id/reject', ...admins, validateBody(schemas.rejectSchema), async (req, res, next) => {
  try {
    const request = await service.rejectReturn({
      returnId: parseId(req.params.id, 'Retour'),
      admin: req.user,
      reason: req.body.reason
    });
    await recordAudit(req, 'REJECT_RETURN', 'ReturnRequest', request.id, { reason: req.body.reason });
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/returns/:id/received', ...admins, validateBody(schemas.closeSchema), async (req, res, next) => {
  try {
    const request = await service.markReceived({
      returnId: parseId(req.params.id, 'Retour'),
      admin: req.user,
      note: req.body.note || null
    });
    await recordAudit(req, 'RECEIVE_RETURN', 'ReturnRequest', request.id);
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/returns/:id/inspect', ...admins, validateBody(schemas.inspectSchema), async (req, res, next) => {
  try {
    const request = await service.inspectReturn({
      returnId: parseId(req.params.id, 'Retour'),
      admin: req.user,
      result: req.body.result,
      notes: req.body.notes,
      refundAmount: req.body.refundAmount ?? null
    });
    await recordAudit(req, 'INSPECT_RETURN', 'ReturnRequest', request.id, {
      result: req.body.result,
      refundAmount: request.refundAmount
    });
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/returns/:id/refund', ...admins, async (req, res, next) => {
  try {
    const request = await service.issueRefund({
      returnId: parseId(req.params.id, 'Retour'),
      admin: req.user
    });
    await recordAudit(req, 'ISSUE_RETURN_REFUND', 'ReturnRequest', request.id, {
      refundAmount: request.refundAmount
    });
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/returns/:id/close', ...admins, validateBody(schemas.closeSchema), async (req, res, next) => {
  try {
    const request = await service.closeReturn({
      returnId: parseId(req.params.id, 'Retour'),
      admin: req.user,
      note: req.body.note || null
    });
    await recordAudit(req, 'CLOSE_RETURN', 'ReturnRequest', request.id);
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/returns/:id/override', ...admins, validateBody(schemas.overrideSchema), async (req, res, next) => {
  try {
    const request = await service.overrideReturn({
      returnId: parseId(req.params.id, 'Retour'),
      admin: req.user,
      note: req.body.note,
      status: req.body.status || null,
      refundAmount: req.body.refundAmount ?? null,
      windowStartAt: req.body.windowStartAt || null
    });
    await recordAudit(req, 'OVERRIDE_RETURN', 'ReturnRequest', request.id, { note: req.body.note });
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/orders/:id/delivery-date', ...admins, validateBody(schemas.deliveryDateSchema), async (req, res, next) => {
  try {
    const order = await service.overrideDeliveryDate({
      orderId: parseId(req.params.id, 'Commande'),
      admin: req.user,
      deliveredAt: req.body.deliveredAt,
      note: req.body.note
    });
    res.json({
      id: order.id,
      deliveredAt: order.deliveredAt,
      fulfillmentStatus: order.fulfillmentStatus
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/readers/:id/returns-flag', ...admins, validateBody(schemas.customerFlagSchema), async (req, res, next) => {
  try {
    const reader = await User.findByPk(parseId(req.params.id, 'Client'));
    if (!reader) return res.status(404).json({ message: 'Client introuvable.' });
    await reader.update({
      returnsBlocked: req.body.blocked,
      returnsBlockedReason: req.body.blocked ? req.body.reason : null
    });
    await recordAudit(req, 'UPDATE_RETURNS_FLAG', 'User', reader.id, {
      blocked: req.body.blocked,
      reason: req.body.reason || null
    });
    res.json({
      id: reader.id,
      returnsBlocked: reader.returnsBlocked,
      returnsBlockedReason: reader.returnsBlockedReason
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
