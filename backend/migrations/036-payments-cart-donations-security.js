/* Payment, cart, download and donation-plan foundation. */
async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function addColumnIfMissing(queryInterface, table, column, definition) {
  if (!await tableExists(queryInterface, table)) return false;
  const columns = await queryInterface.describeTable(table);
  if (columns[column]) return false;
  await queryInterface.addColumn(table, column, definition);
  return true;
}

async function indexIfMissing(queryInterface, table, name, fields, options = {}) {
  if (!await tableExists(queryInterface, table)) return;
  const indexes = await queryInterface.showIndex(table).catch(() => []);
  if (indexes.some((index) => index.name === name)) return;
  await queryInterface.addIndex(table, fields, { name, ...options });
}

async function up({ queryInterface, Sequelize }) {
  const { INTEGER, STRING, TEXT, DATE, DECIMAL, BOOLEAN, JSON: JSONTYPE } = Sequelize;
  const now = Sequelize.fn('NOW');

  if (await tableExists(queryInterface, 'store_orders')) {
    await addColumnIfMissing(queryInterface, 'store_orders', 'orderNumber', { type: STRING(32), allowNull: true, unique: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'customerEmail', { type: STRING(255), allowNull: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'subtotalMinor', { type: INTEGER, allowNull: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'discountMinor', { type: INTEGER, allowNull: false, defaultValue: 0 });
    await addColumnIfMissing(queryInterface, 'store_orders', 'shippingMinor', { type: INTEGER, allowNull: false, defaultValue: 0 });
    await addColumnIfMissing(queryInterface, 'store_orders', 'taxMinor', { type: INTEGER, allowNull: false, defaultValue: 0 });
    await addColumnIfMissing(queryInterface, 'store_orders', 'totalMinor', { type: INTEGER, allowNull: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'shippingAmount', { type: DECIMAL(10, 2), allowNull: false, defaultValue: 0 });
    await addColumnIfMissing(queryInterface, 'store_orders', 'idempotencyKey', { type: STRING(120), allowNull: true, unique: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'digitalConsentAt', { type: DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'paidAt', { type: DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'canceledAt', { type: DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'expiresAt', { type: DATE, allowNull: true });
    await addColumnIfMissing(queryInterface, 'store_orders', 'lastStripeSyncAt', { type: DATE, allowNull: true });
    await queryInterface.changeColumn('store_orders', 'status', {
      type: Sequelize.ENUM(
        'pending', 'pending_payment', 'paid', 'fulfilled', 'failed', 'expired',
        'canceled', 'cancelled', 'refunded', 'partially_refunded', 'amount_mismatch'
      ),
      allowNull: false,
      defaultValue: 'pending_payment'
    });
    await indexIfMissing(queryInterface, 'store_orders', 'store_orders_status_created', ['status', 'createdAt']);
    await indexIfMissing(queryInterface, 'store_orders', 'store_orders_number', ['orderNumber']);
  }

  if (await tableExists(queryInterface, 'store_order_items')) {
    await addColumnIfMissing(queryInterface, 'store_order_items', 'formatSnapshot', { type: STRING(16), allowNull: true });
    await addColumnIfMissing(queryInterface, 'store_order_items', 'lineTotalMinor', { type: INTEGER, allowNull: true });
  }

  if (await tableExists(queryInterface, 'books')) {
    await addColumnIfMissing(queryInterface, 'books', 'weightGrams', { type: INTEGER, allowNull: true });
    await addColumnIfMissing(queryInterface, 'books', 'isbn', { type: STRING(32), allowNull: true });
    await addColumnIfMissing(queryInterface, 'books', 'previewFileKey', { type: STRING(1024), allowNull: true });
    await addColumnIfMissing(queryInterface, 'books', 'coverAlt', { type: JSONTYPE, allowNull: true });
  }

  if (!await tableExists(queryInterface, 'store_order_events')) {
    await queryInterface.createTable('store_order_events', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: INTEGER, allowNull: false, references: { model: 'store_orders', key: 'id' }, onDelete: 'CASCADE' },
      type: { type: STRING(64), allowNull: false },
      fromStatus: { type: STRING(32), allowNull: true },
      toStatus: { type: STRING(32), allowNull: true },
      message: { type: TEXT, allowNull: true },
      metadata: { type: JSONTYPE, allowNull: false, defaultValue: {} },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
    await indexIfMissing(queryInterface, 'store_order_events', 'store_order_events_order', ['orderId', 'createdAt']);
  }

  if (!await tableExists(queryInterface, 'stripe_events')) {
    await queryInterface.createTable('stripe_events', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      stripeEventId: { type: STRING(255), allowNull: false, unique: true },
      type: { type: STRING(120), allowNull: false },
      payloadSummary: { type: JSONTYPE, allowNull: false, defaultValue: {} },
      status: { type: Sequelize.ENUM('received', 'processed', 'ignored', 'failed'), allowNull: false, defaultValue: 'received' },
      error: { type: TEXT, allowNull: true },
      receivedAt: { type: DATE, allowNull: false, defaultValue: now },
      processedAt: { type: DATE, allowNull: true },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
    await indexIfMissing(queryInterface, 'stripe_events', 'stripe_events_status', ['status', 'receivedAt']);
  }

  if (!await tableExists(queryInterface, 'download_tokens')) {
    await queryInterface.createTable('download_tokens', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      tokenHash: { type: STRING(64), allowNull: false, unique: true },
      userId: { type: INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      entitlementId: { type: INTEGER, allowNull: false, references: { model: 'entitlements', key: 'id' }, onDelete: 'CASCADE' },
      bookId: { type: INTEGER, allowNull: false, references: { model: 'books', key: 'id' }, onDelete: 'CASCADE' },
      expiresAt: { type: DATE, allowNull: false },
      usedAt: { type: DATE, allowNull: true },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
    await indexIfMissing(queryInterface, 'download_tokens', 'download_tokens_user', ['userId', 'expiresAt']);
  }

  if (!await tableExists(queryInterface, 'download_logs')) {
    await queryInterface.createTable('download_logs', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      bookId: { type: INTEGER, allowNull: false, references: { model: 'books', key: 'id' }, onDelete: 'CASCADE' },
      entitlementId: { type: INTEGER, allowNull: true, references: { model: 'entitlements', key: 'id' }, onDelete: 'SET NULL' },
      ip: { type: STRING(64), allowNull: true },
      userAgent: { type: STRING(512), allowNull: true },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
    await indexIfMissing(queryInterface, 'download_logs', 'download_logs_book', ['bookId', 'createdAt']);
  }

  if (!await tableExists(queryInterface, 'security_events')) {
    await queryInterface.createTable('security_events', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      ip: { type: STRING(64), allowNull: true },
      route: { type: STRING(255), allowNull: false },
      method: { type: STRING(10), allowNull: false },
      type: { type: STRING(80), allowNull: false },
      severity: { type: Sequelize.ENUM('info', 'warning', 'high', 'critical'), allowNull: false, defaultValue: 'warning' },
      reason: { type: STRING(1000), allowNull: false },
      metadata: { type: JSONTYPE, allowNull: false, defaultValue: {} },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
    await indexIfMissing(queryInterface, 'security_events', 'security_events_type', ['type', 'createdAt']);
    await indexIfMissing(queryInterface, 'security_events', 'security_events_user', ['userId', 'createdAt']);
  }

  if (await tableExists(queryInterface, 'donation_campaigns')) {
    const columns = {
      summary: { type: JSONTYPE, allowNull: true },
      coverImage: { type: STRING(1000), allowNull: true },
      bannerImage: { type: STRING(1000), allowNull: true },
      campaignType: { type: Sequelize.ENUM('amount_goal', 'items_goal', 'both'), allowNull: false, defaultValue: 'amount_goal' },
      targetUnits: { type: INTEGER, allowNull: true },
      unitName: { type: JSONTYPE, allowNull: true },
      costPerUnit: { type: DECIMAL(10, 2), allowNull: true },
      extraCosts: { type: DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      totalCost: { type: DECIMAL(10, 2), allowNull: true },
      raisedAmount: { type: DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      sponsoredUnits: { type: INTEGER, allowNull: false, defaultValue: 0 },
      donorCount: { type: INTEGER, allowNull: false, defaultValue: 0 },
      allowRecurring: { type: BOOLEAN, allowNull: false, defaultValue: true },
      allowAnonymous: { type: BOOLEAN, allowNull: false, defaultValue: true },
      allowCustomAmount: { type: BOOLEAN, allowNull: false, defaultValue: true },
      minAmount: { type: DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
      maxAmount: { type: DECIMAL(10, 2), allowNull: true },
      overfundingPolicy: { type: Sequelize.ENUM('close', 'continue', 'transfer'), allowNull: false, defaultValue: 'close' },
      taxReceiptsEnabled: { type: BOOLEAN, allowNull: false, defaultValue: false },
      linkedStoryId: { type: INTEGER, allowNull: true, references: { model: 'stories', key: 'id' }, onDelete: 'SET NULL' },
      linkedBookId: { type: INTEGER, allowNull: true, references: { model: 'books', key: 'id' }, onDelete: 'SET NULL' },
      linkedCollectionId: { type: INTEGER, allowNull: true, references: { model: 'collections', key: 'id' }, onDelete: 'SET NULL' },
      createdBy: { type: INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' }
    };
    for (const [column, definition] of Object.entries(columns)) {
      await addColumnIfMissing(queryInterface, 'donation_campaigns', column, definition);
    }
    await addColumnIfMissing(queryInterface, 'donation_campaigns', 'status', {
      type: Sequelize.ENUM('draft', 'scheduled', 'active', 'completed', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    });
  }

  if (await tableExists(queryInterface, 'donations')) {
    const columns = {
      unitsSponsored: { type: INTEGER, allowNull: false, defaultValue: 0 },
      isRecurring: { type: BOOLEAN, allowNull: false, defaultValue: false },
      isAnonymous: { type: BOOLEAN, allowNull: false, defaultValue: false },
      displayName: { type: STRING(120), allowNull: true },
      message: { type: TEXT, allowNull: true },
      source: { type: Sequelize.ENUM('stripe', 'manual_cash', 'manual_bank'), allowNull: false, defaultValue: 'stripe' },
      tierId: { type: INTEGER, allowNull: true },
      paidAt: { type: DATE, allowNull: true }
    };
    for (const [column, definition] of Object.entries(columns)) {
      await addColumnIfMissing(queryInterface, 'donations', column, definition);
    }
    const donationColumns = await queryInterface.describeTable('donations');
    if (donationColumns.campaignId) {
      await queryInterface.changeColumn('donations', 'campaignId', {
        type: INTEGER,
        allowNull: true
      }).catch(() => {});
    }
    await queryInterface.changeColumn('donations', 'status', {
      type: Sequelize.ENUM('pending', 'paid', 'failed', 'refunded', 'canceled', 'amount_mismatch'),
      allowNull: false,
      defaultValue: 'pending'
    });
  }

  if (!await tableExists(queryInterface, 'donation_tiers')) {
    await queryInterface.createTable('donation_tiers', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      campaignId: { type: INTEGER, allowNull: false, references: { model: 'donation_campaigns', key: 'id' }, onDelete: 'CASCADE' },
      amount: { type: DECIMAL(10, 2), allowNull: false },
      units: { type: INTEGER, allowNull: true },
      label: { type: JSONTYPE, allowNull: false, defaultValue: {} },
      sortOrder: { type: INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
    await indexIfMissing(queryInterface, 'donation_tiers', 'donation_tiers_campaign', ['campaignId', 'sortOrder']);
  }

  if (await tableExists(queryInterface, 'donations') && await tableExists(queryInterface, 'donation_tiers')) {
    await addColumnIfMissing(queryInterface, 'donations', 'tierId', {
      type: INTEGER,
      allowNull: true,
      references: { model: 'donation_tiers', key: 'id' },
      onDelete: 'SET NULL'
    });
  }

  if (!await tableExists(queryInterface, 'campaign_items')) {
    await queryInterface.createTable('campaign_items', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      campaignId: { type: INTEGER, allowNull: false, references: { model: 'donation_campaigns', key: 'id' }, onDelete: 'CASCADE' },
      bookId: { type: INTEGER, allowNull: true, references: { model: 'books', key: 'id' }, onDelete: 'SET NULL' },
      label: { type: JSONTYPE, allowNull: false, defaultValue: {} },
      quantityTarget: { type: INTEGER, allowNull: false, defaultValue: 0 },
      unitCost: { type: DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      quantitySponsored: { type: INTEGER, allowNull: false, defaultValue: 0 },
      quantityDistributed: { type: INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
  }

  if (!await tableExists(queryInterface, 'distribution_places')) {
    await queryInterface.createTable('distribution_places', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      campaignId: { type: INTEGER, allowNull: false, references: { model: 'donation_campaigns', key: 'id' }, onDelete: 'CASCADE' },
      name: { type: STRING(255), allowNull: false },
      type: { type: Sequelize.ENUM('school', 'mosque', 'association', 'orphanage', 'library', 'family', 'other'), allowNull: false, defaultValue: 'other' },
      city: { type: STRING(120), allowNull: true },
      country: { type: STRING(120), allowNull: true },
      plannedQuantity: { type: INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.ENUM('planned', 'shipped', 'distributed'), allowNull: false, defaultValue: 'planned' },
      distributionDate: { type: DATE, allowNull: true },
      notes: { type: TEXT, allowNull: true },
      reportText: { type: TEXT, allowNull: true },
      images: { type: JSONTYPE, allowNull: false, defaultValue: [] },
      consentConfirmed: { type: BOOLEAN, allowNull: false, defaultValue: false },
      isPublic: { type: BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
    await indexIfMissing(queryInterface, 'distribution_places', 'distribution_places_campaign', ['campaignId', 'status']);
  }

  if (!await tableExists(queryInterface, 'campaign_updates')) {
    await queryInterface.createTable('campaign_updates', {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      campaignId: { type: INTEGER, allowNull: false, references: { model: 'donation_campaigns', key: 'id' }, onDelete: 'CASCADE' },
      translations: { type: JSONTYPE, allowNull: false, defaultValue: {} },
      images: { type: JSONTYPE, allowNull: false, defaultValue: [] },
      publishedAt: { type: DATE, allowNull: true },
      createdAt: { type: DATE, allowNull: false, defaultValue: now },
      updatedAt: { type: DATE, allowNull: false, defaultValue: now }
    });
    await indexIfMissing(queryInterface, 'campaign_updates', 'campaign_updates_campaign', ['campaignId', 'publishedAt']);
  }
}

async function down({ queryInterface, Sequelize }) {
  for (const table of ['campaign_updates', 'distribution_places', 'campaign_items', 'donation_tiers', 'security_events', 'download_logs', 'download_tokens', 'stripe_events', 'store_order_events']) {
    if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
  }
  if (await tableExists(queryInterface, 'donations')) {
    const columns = await queryInterface.describeTable('donations');
    for (const column of ['paidAt', 'tierId', 'source', 'message', 'displayName', 'isAnonymous', 'isRecurring', 'unitsSponsored']) {
      if (columns[column]) await queryInterface.removeColumn('donations', column);
    }
  }
  if (await tableExists(queryInterface, 'books')) {
    const columns = await queryInterface.describeTable('books');
    for (const column of ['coverAlt', 'previewFileKey', 'isbn', 'weightGrams']) {
      if (columns[column]) await queryInterface.removeColumn('books', column);
    }
  }
  if (await tableExists(queryInterface, 'store_order_items')) {
    const columns = await queryInterface.describeTable('store_order_items');
    for (const column of ['lineTotalMinor', 'formatSnapshot']) {
      if (columns[column]) await queryInterface.removeColumn('store_order_items', column);
    }
  }
  if (await tableExists(queryInterface, 'store_orders')) {
    const columns = await queryInterface.describeTable('store_orders');
    for (const column of ['lastStripeSyncAt', 'expiresAt', 'canceledAt', 'paidAt', 'digitalConsentAt', 'idempotencyKey', 'shippingAmount', 'totalMinor', 'taxMinor', 'shippingMinor', 'discountMinor', 'subtotalMinor', 'customerEmail', 'orderNumber']) {
      if (columns[column]) await queryInterface.removeColumn('store_orders', column);
    }
    await queryInterface.changeColumn('store_orders', 'status', {
      type: Sequelize.ENUM('pending', 'paid', 'failed', 'refunded', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    }).catch(() => {});
  }
}

module.exports = { up, down };
