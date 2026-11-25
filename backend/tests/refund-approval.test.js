const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approvalThresholdMinor,
  requiresSecondApproval,
  assertSecondApprover,
  orderRefundableAmountMinor,
  requestRefundApproval,
  approveRefundApproval,
  rejectRefundApproval
} = require('../utils/refundApproval');

function memoryStore({ pending = null } = {}) {
  let current = pending;
  const calls = { created: [], approved: [], executed: [], failures: [], rejected: [] };
  return {
    calls,
    async findPending() {
      return current;
    },
    async create(values) {
      const approval = { id: 77, status: 'pending', createdAt: new Date('2026-11-01T10:00:00.000Z'), ...values };
      current = approval;
      calls.created.push(approval);
      return approval;
    },
    async markApproved(approval, approver) {
      calls.approved.push(approver.id);
      current = { ...approval, status: 'approved', approvedByAdminId: approver.id };
      return current;
    },
    async markExecuted(approval, result) {
      calls.executed.push({ approvalId: approval.id, result });
      return { ...approval, status: 'executed' };
    },
    async recordFailure(approval, error) {
      calls.failures.push(error.message);
      return approval;
    },
    async markRejected(approval, approver, note) {
      calls.rejected.push({ approverId: approver.id, note });
      return { ...approval, status: 'rejected' };
    }
  };
}

const admin = { id: 3, role: 'ADMIN' };
const otherAdmin = { id: 9, role: 'ADMIN' };
const order = { id: 42, currency: 'EUR', total: '150.00', paidAmount: '150.00' };

test('le seuil de double validation est lu dans l’environnement (100 € par défaut)', () => {
  assert.equal(approvalThresholdMinor({}), 10000);
  assert.equal(approvalThresholdMinor({ REFUND_APPROVAL_THRESHOLD: '' }), 10000);
  assert.equal(approvalThresholdMinor({ REFUND_APPROVAL_THRESHOLD: '250.50' }), 25050);
  assert.equal(approvalThresholdMinor({ REFUND_APPROVAL_THRESHOLD: '75,25' }), 7525);
  assert.equal(approvalThresholdMinor({ REFUND_APPROVAL_THRESHOLD: 'abc' }), 10000);
  assert.equal(approvalThresholdMinor({ REFUND_APPROVAL_THRESHOLD: '-5' }), 10000);
});

test('le seuil est strict : le montant égal est encore autorisé à un seul administrateur', () => {
  assert.equal(requiresSecondApproval(10000, 10000), false);
  assert.equal(requiresSecondApproval(10001, 10000), true);
  assert.equal(requiresSecondApproval(0, 0), false);
  assert.equal(requiresSecondApproval(Number.NaN, 10000), true, 'un montant inutilisable échoue en sécurité');
});

test('un remboursement sous le seuil ne crée aucune demande d’approbation', async () => {
  const store = memoryStore();
  const gate = await requestRefundApproval({
    store,
    order: { ...order, paidAmount: '40.00' },
    amountMinor: 4000,
    admin,
    env: { REFUND_APPROVAL_THRESHOLD: '100' }
  });
  assert.equal(gate.approvalRequired, false);
  assert.equal(store.calls.created.length, 0);
});

test('un remboursement au-dessus du seuil n’appelle pas Stripe et attend un second administrateur', async () => {
  const store = memoryStore();
  const gate = await requestRefundApproval({
    store,
    order,
    amountMinor: orderRefundableAmountMinor(order),
    admin,
    env: { REFUND_APPROVAL_THRESHOLD: '100' }
  });
  assert.equal(gate.approvalRequired, true);
  assert.equal(gate.thresholdMinor, 10000);
  assert.equal(store.calls.created.length, 1);
  assert.equal(store.calls.created[0].amount, '150.00');
  assert.equal(store.calls.created[0].requestedByAdminId, admin.id);
  assert.equal(store.calls.executed.length, 0, 'aucune execution avant approbation');
});

test('une demande déjà en attente ne peut pas être dupliquée', async () => {
  const store = memoryStore({ pending: { id: 12, status: 'pending', requestedByAdminId: admin.id } });
  await assert.rejects(
    requestRefundApproval({ store, order, amountMinor: 15000, admin, env: { REFUND_APPROVAL_THRESHOLD: '100' } }),
    (error) => error.code === 'REFUND_APPROVAL_PENDING' && error.approvalId === 12
  );
});

test('l’administrateur qui a demandé le remboursement ne peut pas l’approuver', async () => {
  const store = memoryStore();
  let executed = 0;
  await assert.rejects(
    approveRefundApproval({
      store,
      approval: { id: 77, status: 'pending', requestedByAdminId: admin.id },
      approver: admin,
      execute: async () => { executed += 1; }
    }),
    (error) => error.code === 'REFUND_SECOND_APPROVER_REQUIRED' && error.status === 403
  );
  assert.equal(executed, 0);
});

test('un rôle non administrateur est refusé comme approbateur', async () => {
  const store = memoryStore();
  assert.throws(
    () => assertSecondApprover({ requestedByAdminId: admin.id, approver: { id: 9, role: 'EDITOR' } }),
    (error) => error.code === 'REFUND_APPROVER_FORBIDDEN'
  );
  await assert.rejects(
    approveRefundApproval({
      store,
      approval: { id: 77, status: 'pending', requestedByAdminId: admin.id },
      approver: null,
      execute: async () => {}
    }),
    (error) => error.code === 'REFUND_APPROVER_REQUIRED'
  );
});

test('un second administrateur approuve et le remboursement est exécuté une seule fois', async () => {
  const store = memoryStore();
  const executed = [];
  const result = await approveRefundApproval({
    store,
    approval: { id: 77, status: 'pending', requestedByAdminId: admin.id, amount: '150.00' },
    approver: otherAdmin,
    execute: async (approved) => {
      executed.push(approved.id);
      return { id: order.id, status: 'refunded', refundId: 're_123' };
    }
  });
  assert.equal(executed.length, 1);
  assert.equal(result.refundId, 're_123');
  assert.deepEqual(store.calls.approved, [otherAdmin.id]);
  assert.equal(store.calls.executed.length, 1);
  assert.equal(store.calls.executed[0].result.refundId, 're_123');
});

test('une exécution Stripe en échec laisse la demande en attente pour une nouvelle tentative', async () => {
  const store = memoryStore();
  await assert.rejects(
    approveRefundApproval({
      store,
      approval: { id: 77, status: 'pending', requestedByAdminId: admin.id },
      approver: otherAdmin,
      execute: async () => { throw new Error('Stripe indisponible'); }
    }),
    /Stripe indisponible/
  );
  assert.deepEqual(store.calls.failures, ['Stripe indisponible']);
  assert.equal(store.calls.executed.length, 0);
});

test('une demande déjà traitée ne peut plus être approuvée', async () => {
  const store = memoryStore();
  await assert.rejects(
    approveRefundApproval({
      store,
      approval: { id: 77, status: 'executed', requestedByAdminId: admin.id },
      approver: otherAdmin,
      execute: async () => {}
    }),
    (error) => error.code === 'REFUND_APPROVAL_NOT_PENDING'
  );
});

test('un second administrateur peut rejeter la demande sans appeler Stripe', async () => {
  const store = memoryStore();
  const result = await rejectRefundApproval({
    store,
    approval: { id: 77, status: 'pending', requestedByAdminId: admin.id },
    approver: otherAdmin,
    note: 'Montant contesté'
  });
  assert.equal(result.status, 'rejected');
  assert.deepEqual(store.calls.rejected, [{ approverId: otherAdmin.id, note: 'Montant contesté' }]);
});

test('le montant remboursable suit le montant encaissé puis le total', () => {
  assert.equal(orderRefundableAmountMinor({ paidAmount: '150.00', total: '199.00' }), 15000);
  assert.equal(orderRefundableAmountMinor({ paidAmount: null, total: '24.90' }), 2490);
  assert.equal(orderRefundableAmountMinor({ paidAmount: '0.00', total: '0.00' }), null);
});
