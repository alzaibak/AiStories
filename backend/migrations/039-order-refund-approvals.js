/* Four-eyes approval of store-order refunds above the configured threshold. */
async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

module.exports = {
  async up({ queryInterface, Sequelize }) {
    const { INTEGER, STRING, TEXT, DATE, DECIMAL, ENUM } = Sequelize;
    if (await tableExists(queryInterface, 'order_refund_approvals')) return;
    await queryInterface.createTable('order_refund_approvals', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      orderId: {
        type: INTEGER,
        allowNull: false,
        references: { model: 'store_orders', key: 'id' },
        onDelete: 'CASCADE'
      },
      amount: { type: DECIMAL(10, 2), allowNull: false },
      currency: { type: STRING(3), allowNull: false, defaultValue: 'EUR' },
      status: {
        type: ENUM('pending', 'approved', 'rejected', 'executed', 'failed'),
        allowNull: false,
        defaultValue: 'pending'
      },
      requestedByAdminId: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      approvedByAdminId: {
        type: INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      approvedAt: { type: DATE, allowNull: true },
      rejectedAt: { type: DATE, allowNull: true },
      executedAt: { type: DATE, allowNull: true },
      stripeRefundId: { type: STRING(255), allowNull: true },
      failureReason: { type: TEXT, allowNull: true },
      note: { type: TEXT, allowNull: true },
      createdAt: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('order_refund_approvals', ['orderId', 'status'], {
      name: 'order_refund_approvals_order_status'
    });
  },

  async down({ queryInterface }) {
    if (!await tableExists(queryInterface, 'order_refund_approvals')) return;
    await queryInterface.dropTable('order_refund_approvals');
  }
};
