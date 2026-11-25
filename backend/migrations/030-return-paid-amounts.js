/*
 * 030 - Refund correctness on discounted orders.
 *
 * Before this migration `store_order_items.pricePaidAfterDiscount` stored the
 * GROSS price and the refund cap trusted `store_orders.total`. A discounted
 * order could therefore refund more than Stripe captured, and percentage
 * coupons (which Stripe also applies to shipping) made the cap wrong by design.
 *
 * This migration:
 *  - stores the amount Stripe captured on the order (`paidAmount`);
 *  - recomputes every item's paid value from the real discount, allocated with
 *    the same largest-remainder rule the API uses;
 *  - fixes the shipping-fee snapshots, which were derived as total - subtotal
 *    and therefore understated shipping on discounted orders.
 */

async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

function toMinor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function allocateDiscount(grossAmounts, discountMinor) {
  const gross = grossAmounts.map((value) => Math.max(0, Math.round(Number(value) || 0)));
  const totalGross = gross.reduce((sum, value) => sum + value, 0);
  const discount = Math.min(Math.max(0, Math.round(Number(discountMinor) || 0)), totalGross);
  if (!totalGross || !discount) return gross;
  const shares = gross.map((value) => (value * discount) / totalGross);
  const floors = shares.map((value) => Math.floor(value));
  let remainder = discount - floors.reduce((sum, value) => sum + value, 0);
  const order = shares
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || b.index - a.index);
  const perLine = floors.slice();
  for (let index = 0; remainder > 0 && index < order.length; index += 1) {
    perLine[order[index].index] += 1;
    remainder -= 1;
  }
  return gross.map((value, index) => Math.max(0, value - perLine[index]));
}

async function up({ queryInterface, Sequelize }) {
  if (!await tableExists(queryInterface, 'store_orders')) return;
  const columns = await queryInterface.describeTable('store_orders');
  if (!columns.paidAmount) {
    await queryInterface.addColumn('store_orders', 'paidAmount', {
      type: Sequelize.DECIMAL(10, 2), allowNull: true
    });
  }

  const [orders] = await queryInterface.sequelize.query(
    'SELECT id, subtotal, discountAmount, total FROM store_orders'
  );
  for (const order of orders) {
    const subtotal = Math.max(0, toMinor(order.subtotal));
    const total = Math.max(0, toMinor(order.total));
    const discount = Math.min(subtotal, Math.max(0, toMinor(order.discountAmount)));

    const [items] = await queryInterface.sequelize.query(
      'SELECT id, unitPrice, quantity, pricePaidAfterDiscount FROM store_order_items WHERE orderId = ?',
      { replacements: [order.id] }
    );
    const net = allocateDiscount(
      items.map((item) => toMinor(item.unitPrice) * Math.max(0, Number(item.quantity) || 0)),
      discount
    );
    for (let index = 0; index < items.length; index += 1) {
      // Re-runnable: a line already corrected (or carrying a lower manual
      // adjustment) is left untouched. Only missing or still-gross values are
      // rewritten, so restarting a partially migrated database is safe.
      const current = items[index].pricePaidAfterDiscount;
      const hasValue = current !== null && current !== undefined;
      if (hasValue && toMinor(current) <= net[index]) continue;
      await queryInterface.sequelize.query(
        'UPDATE store_order_items SET pricePaidAfterDiscount = ? WHERE id = ?',
        { replacements: [(net[index] / 100).toFixed(2), items[index].id] }
      );
    }

    const shipping = Math.max(0, total - (subtotal - discount));
    if (shipping > 0) {
      await queryInterface.sequelize.query(`
        UPDATE store_order_items oi
        JOIN books b ON b.id = oi.bookId
        SET oi.definedShippingFee = COALESCE(oi.definedShippingFee, ?),
            oi.shippingFeeCharged = COALESCE(oi.shippingFeeCharged, ?)
        WHERE oi.orderId = ? AND b.format = 'print'
      `, { replacements: [(shipping / 100).toFixed(2), (shipping / 100).toFixed(2), order.id] });
    }

    await queryInterface.sequelize.query(
      'UPDATE store_orders SET paidAmount = COALESCE(paidAmount, ?) WHERE id = ?',
      { replacements: [((subtotal - discount + shipping) / 100).toFixed(2), order.id] }
    );
  }
}

async function down({ queryInterface }) {
  if (!await tableExists(queryInterface, 'store_orders')) return;
  const columns = await queryInterface.describeTable('store_orders');
  if (columns.paidAmount) await queryInterface.removeColumn('store_orders', 'paidAmount');
}

module.exports = { up, down };
