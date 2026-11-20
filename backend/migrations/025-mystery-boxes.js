const { removeForeignKeysForColumn } = require('./003-remove-commerce-schema');

async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function addColumnIfMissing(queryInterface, table, column, definition) {
  if (!await tableExists(queryInterface, table)) return;
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) await queryInterface.addColumn(table, column, definition);
}

async function addForeignKeyIfMissing(queryInterface, table, column, targetTable) {
  if (!await tableExists(queryInterface, table) || !await tableExists(queryInterface, targetTable)) return;
  const references = await queryInterface.getForeignKeyReferencesForTable(table);
  if (references.some((reference) =>
    String(reference.columnName).toLowerCase() === column.toLowerCase())) return;
  await queryInterface.addConstraint(table, {
    fields: [column],
    type: 'FOREIGN KEY',
    name: `${table}_${column}_fk`,
    references: { table: targetTable, field: 'id' },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });
}

const templateRows = [
  ['mystery_box_purchase', {
    ar: {
      subject: 'تم تأكيد صندوقك: {{boxTitle}}',
      body: 'مرحبًا {{firstName}}،\nتم تأكيد طلبك لصندوق «{{boxTitle}}».\n\nالمحتوى:\n{{items}}\n\nالإجمالي: {{total}} {{currency}}\nالتوصيل المتوقع: {{deliveryEstimate}}\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Your box is confirmed: {{boxTitle}}',
      body: 'Hello {{firstName}},\nYour order for “{{boxTitle}}” is confirmed.\n\nInside:\n{{items}}\n\nTotal: {{total}} {{currency}}\nEstimated delivery: {{deliveryEstimate}}\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Votre box est confirmée : {{boxTitle}}',
      body: 'Bonjour {{firstName}},\nVotre commande « {{boxTitle}} » est confirmée.\n\nContenu :\n{{items}}\n\nTotal : {{total}} {{currency}}\nLivraison estimée : {{deliveryEstimate}}\n\n{{actionUrl}}'
    }
  }],
  ['mystery_box_shipping', {
    ar: {
      subject: 'تم شحن صندوقك: {{boxTitle}}',
      body: 'مرحبًا {{firstName}}،\nصندوق «{{boxTitle}}» في الطريق إليك.\nشركة الشحن: {{carrier}}\nرقم التتبع: {{trackingNumber}}\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Your box has shipped: {{boxTitle}}',
      body: 'Hello {{firstName}},\n“{{boxTitle}}” is on its way.\nCarrier: {{carrier}}\nTracking number: {{trackingNumber}}\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Votre box a été expédiée : {{boxTitle}}',
      body: 'Bonjour {{firstName}},\n« {{boxTitle}} » est en route.\nTransporteur : {{carrier}}\nNuméro de suivi : {{trackingNumber}}\n\n{{actionUrl}}'
    }
  }]
];

async function up({ queryInterface, Sequelize }) {
  const models = require('../models');
  for (const name of [
    'MysteryBox',
    'MysteryBoxItem',
    'MysteryBoxShipping',
    'MysteryBoxAppearance',
    'MysteryBoxPurchase',
    'MysteryBoxNotifyRequest'
  ]) {
    await models[name].sync();
  }

  await queryInterface.changeColumn('entitlements', 'resourceType', {
    type: Sequelize.ENUM('collection', 'story', 'part', 'video', 'ebook', 'book', 'premium'),
    allowNull: false
  });
  await queryInterface.changeColumn('entitlements', 'source', {
    type: Sequelize.ENUM('subscription', 'purchase', 'rental', 'promo', 'gift', 'event', 'admin', 'mystery_box'),
    allowNull: false
  });
  await addColumnIfMissing(queryInterface, 'entitlements', 'mysteryBoxPurchaseId', {
    type: Sequelize.INTEGER,
    allowNull: true
  });
  await addForeignKeyIfMissing(queryInterface, 'entitlements', 'mysteryBoxPurchaseId', 'mystery_box_purchases');
  await addColumnIfMissing(queryInterface, 'donation_campaigns', 'sponsoredBooksCount', {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0
  });

  if (await tableExists(queryInterface, 'email_templates')) {
    const [existing] = await queryInterface.sequelize.query('SELECT code FROM email_templates');
    const codes = new Set(existing.map((row) => row.code));
    const now = new Date();
    const missing = templateRows
      .filter(([code]) => !codes.has(code))
      .map(([code, translations]) => ({
        code,
        translations: JSON.stringify(translations),
        isActive: true,
        createdAt: now,
        updatedAt: now
      }));
    if (missing.length) await queryInterface.bulkInsert('email_templates', missing);
  }
}

async function down({ queryInterface, Sequelize }) {
  if (await tableExists(queryInterface, 'entitlements')) {
    await queryInterface.sequelize.query("DELETE FROM entitlements WHERE resourceType = 'premium'");
    await queryInterface.sequelize.query("UPDATE entitlements SET source = 'purchase' WHERE source = 'mystery_box'");
    await removeForeignKeysForColumn(queryInterface, 'entitlements', 'mysteryBoxPurchaseId');
    const columns = await queryInterface.describeTable('entitlements');
    if (columns.mysteryBoxPurchaseId) await queryInterface.removeColumn('entitlements', 'mysteryBoxPurchaseId');
    await queryInterface.changeColumn('entitlements', 'resourceType', {
      type: Sequelize.ENUM('collection', 'story', 'part', 'video', 'ebook', 'book'),
      allowNull: false
    });
    await queryInterface.changeColumn('entitlements', 'source', {
      type: Sequelize.ENUM('subscription', 'purchase', 'rental', 'promo', 'gift', 'event', 'admin'),
      allowNull: false
    });
  }
  if (await tableExists(queryInterface, 'donation_campaigns')) {
    const columns = await queryInterface.describeTable('donation_campaigns');
    if (columns.sponsoredBooksCount) {
      await queryInterface.removeColumn('donation_campaigns', 'sponsoredBooksCount');
    }
  }
  for (const table of [
    'mystery_box_notify_requests',
    'mystery_box_purchases',
    'mystery_box_appearance',
    'mystery_box_shipping',
    'mystery_box_items',
    'mystery_boxes'
  ]) {
    if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
  }
}

module.exports = { up, down };
