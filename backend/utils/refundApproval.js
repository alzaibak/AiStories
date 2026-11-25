/**
 * Four-eyes control for store-order refunds.
 *
 * A single administrator may refund small amounts. Above the threshold the
 * request only opens a pending approval: none of the Stripe side effects run
 * until a second administrator, distinct from the requester, approves it.
 *
 * The persistence layer is injected (`store`) so the route can use Sequelize
 * while the tests use an in-memory double, and the Stripe execution is passed
 * in as `execute` for the same reason.
 */

const DEFAULT_THRESHOLD = 100; // euros
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

function refundError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

/** Refund amount, in minor units, above which a second admin must approve. */
function approvalThresholdMinor(env = process.env) {
  const raw = env?.REFUND_APPROVAL_THRESHOLD;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return Math.round(DEFAULT_THRESHOLD * 100);
  }
  const parsed = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return Math.round(DEFAULT_THRESHOLD * 100);
  return Math.round(parsed * 100);
}

/** Fails closed: an unusable amount is treated as needing a second approval. */
function requiresSecondApproval(amountMinor, thresholdMinor = approvalThresholdMinor()) {
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount) || amount < 0) return true;
  return amount > Number(thresholdMinor);
}

function assertSecondApprover({ requestedByAdminId, approver }) {
  const approverId = Number(approver?.id);
  if (!Number.isSafeInteger(approverId) || approverId < 1) {
    throw refundError(403, 'A second administrator must approve this refund.', 'REFUND_APPROVER_REQUIRED');
  }
  if (!ADMIN_ROLES.includes(String(approver?.role || ''))) {
    throw refundError(403, 'Only an administrator can approve a refund.', 'REFUND_APPROVER_FORBIDDEN');
  }
  if (Number(requestedByAdminId) === approverId) {
    throw refundError(403, 'The administrator who requested the refund cannot approve it.', 'REFUND_SECOND_APPROVER_REQUIRED');
  }
}

/** Captured amount of a paid order, in minor units. */
function orderRefundableAmountMinor(order) {
  const paid = order?.paidAmount === null || order?.paidAmount === undefined ? order?.total : order.paidAmount;
  const value = Number(paid);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/**
 * Either allows the direct refund (below the threshold) or records a pending
 * approval and returns it. Never calls Stripe.
 */
async function requestRefundApproval({ store, order, amountMinor, currency, admin, env = process.env }) {
  const thresholdMinor = approvalThresholdMinor(env);
  if (!requiresSecondApproval(amountMinor, thresholdMinor)) {
    return { approvalRequired: false, thresholdMinor, approval: null };
  }
  const existing = await store.findPending(order.id);
  if (existing) {
    const error = refundError(409, 'A refund is already awaiting a second administrator.', 'REFUND_APPROVAL_PENDING');
    error.approvalId = existing.id;
    throw error;
  }
  const approval = await store.create({
    orderId: order.id,
    amount: (Number(amountMinor) / 100).toFixed(2),
    currency: currency || order.currency || 'EUR',
    requestedByAdminId: admin?.id || null
  });
  return { approvalRequired: true, thresholdMinor, approval };
}

async function approveRefundApproval({ store, approval, approver, execute }) {
  if (!approval || approval.status !== 'pending') {
    throw refundError(409, 'This refund is no longer awaiting approval.', 'REFUND_APPROVAL_NOT_PENDING');
  }
  assertSecondApprover({ requestedByAdminId: approval.requestedByAdminId, approver });
  const approved = await store.markApproved(approval, approver);
  try {
    const result = await execute(approved);
    await store.markExecuted(approved, result);
    return result;
  } catch (error) {
    // The approval stays pending so the second admin can retry the execution.
    await store.recordFailure(approved, error);
    throw error;
  }
}

async function rejectRefundApproval({ store, approval, approver, note }) {
  if (!approval || approval.status !== 'pending') {
    throw refundError(409, 'This refund is no longer awaiting approval.', 'REFUND_APPROVAL_NOT_PENDING');
  }
  assertSecondApprover({ requestedByAdminId: approval.requestedByAdminId, approver });
  await store.markRejected(approval, approver, note);
  return {
    id: approval.id,
    orderId: approval.orderId,
    status: 'rejected',
    approvedByAdminId: approver.id
  };
}

function serializeRefundApproval(approval) {
  if (!approval) return null;
  return {
    id: approval.id,
    orderId: approval.orderId,
    amount: approval.amount,
    currency: approval.currency,
    status: approval.status,
    requestedByAdminId: approval.requestedByAdminId,
    approvedByAdminId: approval.approvedByAdminId || null,
    requestedAt: approval.createdAt,
    approvedAt: approval.approvedAt || null,
    failureReason: approval.failureReason || null
  };
}

module.exports = {
  DEFAULT_THRESHOLD,
  approvalThresholdMinor,
  requiresSecondApproval,
  assertSecondApprover,
  orderRefundableAmountMinor,
  requestRefundApproval,
  approveRefundApproval,
  rejectRefundApproval,
  serializeRefundApproval,
  refundError
};
