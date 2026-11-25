const RETURNS_TABLES = ['return_events', 'return_refunds', 'return_items', 'return_requests', 'return_policy_settings'];

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

const templateRows = [
  ['return_requested', {
    ar: {
      subject: 'استلمنا طلب الإرجاع {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nاستلمنا طلب الإرجاع {{rmaNumber}} الخاص بالطلب {{orderId}}.\n\nالكتب المعنية: {{bookTitles}}\n\nيراجع فريقنا الطلب ويجيبك خلال يومَي عمل.\n\n{{actionUrl}}'
    },
    en: {
      subject: 'We received return request {{rmaNumber}}',
      body: 'Hello {{firstName}},\nWe received your return request {{rmaNumber}} for order {{orderId}}.\n\nBooks concerned: {{bookTitles}}\n\nOur team is reviewing it and will reply within two working days.\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Nous avons reçu votre demande de retour {{rmaNumber}}',
      body: 'Bonjour {{firstName}},\nNous avons bien reçu votre demande de retour {{rmaNumber}} pour la commande {{orderId}}.\n\nLivres concernés : {{bookTitles}}\n\nNotre équipe l’examine et vous répond sous deux jours ouvrés.\n\n{{actionUrl}}'
    }
  }],
  ['return_approved', {
    ar: {
      subject: 'تمت الموافقة على الإرجاع {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nتمت الموافقة على طلب الإرجاع {{rmaNumber}}.\n\nالكتب: {{bookTitles}}\nأرسل الطرد قبل {{shipBackDeadline}}.\n\nعنوان الإرجاع:\n{{returnAddress}}\n\n{{returnInstructions}}\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Return {{rmaNumber}} approved',
      body: 'Hello {{firstName}},\nYour return request {{rmaNumber}} is approved.\n\nBooks: {{bookTitles}}\nPlease ship the parcel before {{shipBackDeadline}}.\n\nReturn address:\n{{returnAddress}}\n\n{{returnInstructions}}\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Votre retour {{rmaNumber}} est approuvé',
      body: 'Bonjour {{firstName}},\nVotre demande de retour {{rmaNumber}} est approuvée.\n\nLivres : {{bookTitles}}\nMerci d’expédier le colis avant le {{shipBackDeadline}}.\n\nAdresse de retour :\n{{returnAddress}}\n\n{{returnInstructions}}\n\n{{actionUrl}}'
    }
  }],
  ['return_rejected', {
    ar: {
      subject: 'تم رفض طلب الإرجاع {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nلم نتمكن من قبول طلب الإرجاع {{rmaNumber}}.\n\nالسبب: {{reason}}\n\nإذا كنت تعتقد أن هذا خطأ، يمكنك الرد على هذه الرسالة.\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Return request {{rmaNumber}} was declined',
      body: 'Hello {{firstName}},\nWe could not accept return request {{rmaNumber}}.\n\nReason: {{reason}}\n\nIf you believe this is a mistake, simply reply to this email.\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Votre demande de retour {{rmaNumber}} a été refusée',
      body: 'Bonjour {{firstName}},\nNous n’avons pas pu accepter votre demande de retour {{rmaNumber}}.\n\nMotif : {{reason}}\n\nSi vous pensez qu’il s’agit d’une erreur, répondez simplement à cet e-mail.\n\n{{actionUrl}}'
    }
  }],
  ['return_ship_reminder', {
    ar: {
      subject: 'تذكير: أرسل الإرجاع {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nتذكير بسيط: يتبقى {{daysLeft}} يوم لإرسال الإرجاع {{rmaNumber}} قبل {{shipBackDeadline}}.\n\nعنوان الإرجاع:\n{{returnAddress}}\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Reminder: ship return {{rmaNumber}}',
      body: 'Hello {{firstName}},\nA quick reminder: you have {{daysLeft}} day(s) left to ship return {{rmaNumber}} before {{shipBackDeadline}}.\n\nReturn address:\n{{returnAddress}}\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Rappel : expédiez votre retour {{rmaNumber}}',
      body: 'Bonjour {{firstName}},\nPetit rappel : il vous reste {{daysLeft}} jour(s) pour expédier le retour {{rmaNumber}} avant le {{shipBackDeadline}}.\n\nAdresse de retour :\n{{returnAddress}}\n\n{{actionUrl}}'
    }
  }],
  ['return_received', {
    ar: {
      subject: 'استلمنا إرجاعك {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nاستلمنا إرجاعك {{rmaNumber}}. نفحص الكتاب ونبلغك بالنتيجة خلال يومَي عمل.\n\n{{actionUrl}}'
    },
    en: {
      subject: 'We received your return {{rmaNumber}}',
      body: 'Hello {{firstName}},\nWe received your return {{rmaNumber}}. We are inspecting the book and will let you know within two working days.\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Nous avons reçu votre retour {{rmaNumber}}',
      body: 'Bonjour {{firstName}},\nNous avons bien reçu votre retour {{rmaNumber}}. Nous inspectons le livre et vous informons sous deux jours ouvrés.\n\n{{actionUrl}}'
    }
  }],
  ['return_inspection_accepted', {
    ar: {
      subject: 'تم قبول إرجاعك {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nتم قبول إرجاعك {{rmaNumber}} بعد الفحص.\n\nمبلغ الاسترداد: {{refundAmount}}\nسيتم تحويله إلى وسيلة الدفع الأصلية خلال {{refundDeadlineDays}} يوم عمل.\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Your return {{rmaNumber}} is accepted',
      body: 'Hello {{firstName}},\nYour return {{rmaNumber}} was accepted after inspection.\n\nRefund amount: {{refundAmount}}\nIt will be sent to your original payment method within {{refundDeadlineDays}} working days.\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Votre retour {{rmaNumber}} est accepté',
      body: 'Bonjour {{firstName}},\nVotre retour {{rmaNumber}} a été accepté après inspection.\n\nMontant du remboursement : {{refundAmount}}\nIl sera envoyé sur votre moyen de paiement d’origine sous {{refundDeadlineDays}} jours ouvrés.\n\n{{actionUrl}}'
    }
  }],
  ['return_inspection_partial', {
    ar: {
      subject: 'اقتراح استرداد جزئي للطلب {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nبعد فحص إرجاعك {{rmaNumber}}، نقترح استردادًا جزئيًا بقيمة {{refundAmount}}.\n\nملاحظات الفحص: {{inspectionNotes}}\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Partial refund offered for return {{rmaNumber}}',
      body: 'Hello {{firstName}},\nAfter inspecting return {{rmaNumber}}, we can offer a partial refund of {{refundAmount}}.\n\nInspection notes: {{inspectionNotes}}\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Remboursement partiel proposé pour le retour {{rmaNumber}}',
      body: 'Bonjour {{firstName}},\nAprès inspection de votre retour {{rmaNumber}}, nous vous proposons un remboursement partiel de {{refundAmount}}.\n\nObservations : {{inspectionNotes}}\n\n{{actionUrl}}'
    }
  }],
  ['return_inspection_rejected', {
    ar: {
      subject: 'لم يتم قبول إرجاعك {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nبعد فحص إرجاعك {{rmaNumber}}، لا يمكننا استرداد المبلغ.\n\nالسبب: {{inspectionNotes}}\n\nيمكننا إعادة إرسال الكتاب إليك عند الطلب.\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Your return {{rmaNumber}} was not accepted',
      body: 'Hello {{firstName}},\nAfter inspecting return {{rmaNumber}}, we cannot issue a refund.\n\nReason: {{inspectionNotes}}\n\nWe can send the book back to you on request.\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Votre retour {{rmaNumber}} n’a pas été accepté',
      body: 'Bonjour {{firstName}},\nAprès inspection de votre retour {{rmaNumber}}, nous ne pouvons pas procéder au remboursement.\n\nMotif : {{inspectionNotes}}\n\nNous pouvons vous renvoyer le livre sur simple demande.\n\n{{actionUrl}}'
    }
  }],
  ['return_refunded', {
    ar: {
      subject: 'تم استرداد {{refundAmount}} للطلب {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nأرسلنا استردادًا بقيمة {{refundAmount}} إلى وسيلة الدفع الأصلية.\n\nتفاصيل الحساب:\n{{refundBreakdown}}\n\nقد يستغرق ظهوره في حسابك من {{bankDelay}} أيام عمل حسب البنك.\n\n{{actionUrl}}'
    },
    en: {
      subject: '{{refundAmount}} refunded for return {{rmaNumber}}',
      body: 'Hello {{firstName}},\nWe sent a refund of {{refundAmount}} to your original payment method.\n\nHow it was calculated:\n{{refundBreakdown}}\n\nYour bank usually shows it within {{bankDelay}} working days.\n\n{{actionUrl}}'
    },
    fr: {
      subject: '{{refundAmount}} remboursés pour le retour {{rmaNumber}}',
      body: 'Bonjour {{firstName}},\nNous avons envoyé un remboursement de {{refundAmount}} sur votre moyen de paiement d’origine.\n\nDétail du calcul :\n{{refundBreakdown}}\n\nVotre banque l’affiche généralement sous {{bankDelay}} jours ouvrés.\n\n{{actionUrl}}'
    }
  }],
  ['return_expired', {
    ar: {
      subject: 'انتهت مدة الإرجاع {{rmaNumber}}',
      body: 'مرحبًا {{firstName}}،\nانتهت مدة الإرجاع {{rmaNumber}} لأننا لم نستلم الكتاب قبل {{shipBackDeadline}}.\n\nإذا كنت قد أرسلته بالفعل، أرسل لنا رقم التتبع وسنواصل المعالجة.\n\n{{actionUrl}}'
    },
    en: {
      subject: 'Return {{rmaNumber}} has expired',
      body: 'Hello {{firstName}},\nReturn {{rmaNumber}} has expired because we did not receive the book before {{shipBackDeadline}}.\n\nIf you already shipped it, send us the tracking number and we will continue.\n\n{{actionUrl}}'
    },
    fr: {
      subject: 'Votre retour {{rmaNumber}} a expiré',
      body: 'Bonjour {{firstName}},\nVotre retour {{rmaNumber}} a expiré : nous n’avons pas reçu le livre avant le {{shipBackDeadline}}.\n\nSi vous l’avez déjà expédié, envoyez-nous le numéro de suivi et nous reprenons le traitement.\n\n{{actionUrl}}'
    }
  }]
];

async function up({ queryInterface, Sequelize }) {
  const id = { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true };
  const timestamps = {
    createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
  };
  const fk = (table, onDelete = 'CASCADE') => ({
    type: Sequelize.INTEGER,
    allowNull: false,
    references: { model: table, key: 'id' },
    onDelete
  });
  const optionalFk = (table, onDelete = 'SET NULL') => ({
    type: Sequelize.INTEGER,
    allowNull: true,
    references: { model: table, key: 'id' },
    onDelete
  });
  const money = () => ({ type: Sequelize.DECIMAL(10, 2), allowNull: true });

  if (!await tableExists(queryInterface, 'return_policy_settings')) {
    await queryInterface.createTable('return_policy_settings', {
      id,
      returnsEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      defaultReturnWindowDays: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      legalWithdrawalDays: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 14 },
      applyLegalWithdrawalRules: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      deliveryDeductionMode: {
        type: Sequelize.ENUM('defined_fee', 'fee_paid'),
        allowNull: false,
        defaultValue: 'defined_fee'
      },
      returnShippingPayer: {
        type: Sequelize.ENUM('customer', 'prepaid_label'),
        allowNull: false,
        defaultValue: 'customer'
      },
      returnAddress: { type: Sequelize.JSON, allowNull: false },
      shipBackDeadlineDays: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 14 },
      refundDeadlineDays: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 14 },
      autoApproveRequests: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      autoRefundAfterAcceptance: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      requirePhotosForDefects: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      maxReturnsPerUserPerYear: { type: Sequelize.INTEGER, allowNull: true },
      defaultDeliveryEstimateDays: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 7 },
      reasons: { type: Sequelize.JSON, allowNull: false },
      policyText: { type: Sequelize.JSON, allowNull: false },
      conditionText: { type: Sequelize.JSON, allowNull: false },
      emailTemplates: { type: Sequelize.JSON, allowNull: false },
      updatedBy: optionalFk('users'),
      ...timestamps
    });
  }

  if (!await tableExists(queryInterface, 'return_requests')) {
    await queryInterface.createTable('return_requests', {
      id,
      rmaNumber: { type: Sequelize.STRING(32), allowNull: false, unique: true },
      orderId: optionalFk('store_orders', 'CASCADE'),
      mysteryBoxPurchaseId: optionalFk('mystery_box_purchases'),
      userId: fk('users', 'RESTRICT'),
      reason: { type: Sequelize.STRING(80), allowNull: false },
      reasonDetails: { type: Sequelize.TEXT, allowNull: true },
      isSellerFault: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: {
        type: Sequelize.ENUM(
          'requested', 'approved', 'rejected', 'awaiting_shipment', 'shipped_back', 'received',
          'inspected', 'refund_pending', 'refunded', 'closed', 'cancelled', 'expired'
        ),
        allowNull: false,
        defaultValue: 'requested'
      },
      requestedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      windowStartAt: { type: Sequelize.DATE, allowNull: true },
      windowEndAt: { type: Sequelize.DATE, allowNull: true },
      approvedAt: { type: Sequelize.DATE, allowNull: true },
      rejectedAt: { type: Sequelize.DATE, allowNull: true },
      rejectionReason: { type: Sequelize.TEXT, allowNull: true },
      shipBackDeadline: { type: Sequelize.DATE, allowNull: true },
      trackingNumber: { type: Sequelize.STRING(255), allowNull: true },
      carrier: { type: Sequelize.STRING(120), allowNull: true },
      shippedBackAt: { type: Sequelize.DATE, allowNull: true },
      receivedAt: { type: Sequelize.DATE, allowNull: true },
      inspectedAt: { type: Sequelize.DATE, allowNull: true },
      inspectionResult: { type: Sequelize.ENUM('accepted', 'partial', 'rejected'), allowNull: true },
      inspectionNotes: { type: Sequelize.TEXT, allowNull: true },
      photos: { type: Sequelize.JSON, allowNull: false },
      refundAmount: money(),
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'EUR' },
      refundedAt: { type: Sequelize.DATE, allowNull: true },
      closedAt: { type: Sequelize.DATE, allowNull: true },
      cancelledAt: { type: Sequelize.DATE, allowNull: true },
      expiredAt: { type: Sequelize.DATE, allowNull: true },
      internalNotes: { type: Sequelize.TEXT, allowNull: true },
      createdByAdminId: optionalFk('users'),
      ...timestamps
    });
    await queryInterface.addIndex('return_requests', ['userId', 'status']);
    await queryInterface.addIndex('return_requests', ['status', 'shipBackDeadline']);
  }

  if (!await tableExists(queryInterface, 'return_items')) {
    await queryInterface.createTable('return_items', {
      id,
      returnRequestId: fk('return_requests'),
      sourceType: {
        type: Sequelize.ENUM('order_item', 'mystery_box_item'),
        allowNull: false,
        defaultValue: 'order_item'
      },
      orderItemId: optionalFk('store_order_items'),
      mysteryBoxItemId: { type: Sequelize.INTEGER, allowNull: true },
      titleSnapshot: { type: Sequelize.STRING(255), allowNull: false },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      itemPricePaid: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      deliveryFeeDeduction: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      refundAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      calculationBreakdown: { type: Sequelize.JSON, allowNull: false },
      ...timestamps
    });
    await queryInterface.addIndex('return_items', ['returnRequestId']);
  }

  if (!await tableExists(queryInterface, 'return_refunds')) {
    await queryInterface.createTable('return_refunds', {
      id,
      returnRequestId: fk('return_requests'),
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'EUR' },
      paymentIntentId: { type: Sequelize.STRING(255), allowNull: true },
      stripeRefundId: { type: Sequelize.STRING(255), allowNull: true },
      idempotencyKey: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      status: {
        type: Sequelize.ENUM('pending', 'succeeded', 'failed'),
        allowNull: false,
        defaultValue: 'pending'
      },
      issuedAt: { type: Sequelize.DATE, allowNull: true },
      failureReason: { type: Sequelize.TEXT, allowNull: true },
      createdByAdminId: optionalFk('users'),
      ...timestamps
    });
    await queryInterface.addIndex('return_refunds', ['returnRequestId']);
  }

  if (!await tableExists(queryInterface, 'return_events')) {
    await queryInterface.createTable('return_events', {
      id,
      returnRequestId: fk('return_requests'),
      actorType: { type: Sequelize.ENUM('customer', 'admin', 'system'), allowNull: false },
      actorId: optionalFk('users'),
      eventType: { type: Sequelize.STRING(80), allowNull: false },
      note: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('return_events', ['returnRequestId']);
  }

  await addColumnIfMissing(queryInterface, 'books', 'isReturnable', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true
  });
  await addColumnIfMissing(queryInterface, 'books', 'returnWindowDays', {
    type: Sequelize.INTEGER, allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'store_orders', 'shippedAt', {
    type: Sequelize.DATE, allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'store_orders', 'deliveredAt', {
    type: Sequelize.DATE, allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'store_orders', 'returnStatus', {
    type: Sequelize.ENUM('none', 'requested', 'partial', 'completed'),
    allowNull: false,
    defaultValue: 'none'
  });
  await addColumnIfMissing(queryInterface, 'store_order_items', 'isReturnable', {
    type: Sequelize.BOOLEAN, allowNull: true
  });
  for (const column of ['returnWindowDays', 'legalWithdrawalDays']) {
    await addColumnIfMissing(queryInterface, 'store_order_items', column, {
      type: Sequelize.INTEGER, allowNull: true
    });
  }
  await addColumnIfMissing(queryInterface, 'store_order_items', 'shippingFeeCharged', money());
  await addColumnIfMissing(queryInterface, 'store_order_items', 'definedShippingFee', money());
  await addColumnIfMissing(queryInterface, 'store_order_items', 'pricePaidAfterDiscount', money());
  await addColumnIfMissing(queryInterface, 'mystery_boxes', 'returnPolicy', {
    type: Sequelize.ENUM('none', 'standard'), allowNull: false, defaultValue: 'none'
  });
  await addColumnIfMissing(queryInterface, 'mystery_box_purchases', 'deliveredAt', {
    type: Sequelize.DATE, allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'mystery_box_purchases', 'returnPolicySnapshot', {
    type: Sequelize.ENUM('none', 'standard'), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'users', 'returnsBlocked', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
  await addColumnIfMissing(queryInterface, 'users', 'returnsBlockedReason', {
    type: Sequelize.STRING(500), allowNull: true
  });

  // Existing items keep a deterministic snapshot: the policy in force when this
  // migration runs, which is the safest baseline for orders created before it.
  if (await tableExists(queryInterface, 'store_order_items')) {
    await queryInterface.sequelize.query(`
      UPDATE store_order_items oi
      JOIN store_orders o ON o.id = oi.orderId
      JOIN books b ON b.id = oi.bookId
      SET oi.isReturnable = (b.format = 'print'),
          oi.returnWindowDays = 30,
          oi.legalWithdrawalDays = 14,
          oi.definedShippingFee = GREATEST(o.total - o.subtotal, 0),
          oi.shippingFeeCharged = GREATEST(o.total - o.subtotal, 0),
          oi.pricePaidAfterDiscount = ROUND(
            oi.unitPrice * oi.quantity *
            CASE WHEN o.subtotal > 0 THEN (o.subtotal - o.discountAmount) / o.subtotal ELSE 1 END, 2)
      WHERE oi.isReturnable IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE store_orders SET deliveredAt = updatedAt
      WHERE fulfillmentStatus = 'delivered' AND deliveredAt IS NULL
    `);
  }

  if (await tableExists(queryInterface, 'return_policy_settings')) {
    const [existing] = await queryInterface.sequelize.query('SELECT id FROM return_policy_settings LIMIT 1');
    if (!existing.length) {
      const now = new Date();
      await queryInterface.bulkInsert('return_policy_settings', [{
        returnsEnabled: true,
        defaultReturnWindowDays: 30,
        legalWithdrawalDays: 14,
        applyLegalWithdrawalRules: true,
        deliveryDeductionMode: 'defined_fee',
        returnShippingPayer: 'customer',
        returnAddress: JSON.stringify({}),
        shipBackDeadlineDays: 14,
        refundDeadlineDays: 14,
        autoApproveRequests: false,
        autoRefundAfterAcceptance: false,
        requirePhotosForDefects: true,
        defaultDeliveryEstimateDays: 7,
        reasons: JSON.stringify([]),
        policyText: JSON.stringify({}),
        conditionText: JSON.stringify({}),
        emailTemplates: JSON.stringify({}),
        createdAt: now,
        updatedAt: now
      }]);
    }
  }

  if (await tableExists(queryInterface, 'email_templates')) {
    const [existing] = await queryInterface.sequelize.query('SELECT code FROM email_templates');
    const codes = new Set(existing.map((row) => row.code));
    const now = new Date();
    const missing = templateRows.filter(([code]) => !codes.has(code)).map(([code, translations]) => ({
      code,
      translations: JSON.stringify(translations),
      isActive: true,
      createdAt: now,
      updatedAt: now
    }));
    if (missing.length) await queryInterface.bulkInsert('email_templates', missing);
  }
}

async function down({ queryInterface }) {
  for (const table of RETURNS_TABLES) {
    if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
  }
  const removals = [
    ['books', ['isReturnable', 'returnWindowDays']],
    ['store_orders', ['shippedAt', 'deliveredAt', 'returnStatus']],
    ['store_order_items', ['isReturnable', 'returnWindowDays', 'legalWithdrawalDays', 'definedShippingFee', 'shippingFeeCharged', 'pricePaidAfterDiscount']],
    ['mystery_boxes', ['returnPolicy']],
    ['mystery_box_purchases', ['deliveredAt', 'returnPolicySnapshot']],
    ['users', ['returnsBlocked', 'returnsBlockedReason']]
  ];
  for (const [table, columns] of removals) {
    if (!await tableExists(queryInterface, table)) continue;
    const description = await queryInterface.describeTable(table);
    for (const column of columns) {
      if (description[column]) await queryInterface.removeColumn(table, column);
    }
  }
  if (await tableExists(queryInterface, 'email_templates')) {
    const codes = templateRows.map(([code]) => code);
    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE code IN (${codes.map(() => '?').join(', ')})`,
      { replacements: codes }
    );
  }
}

module.exports = { up, down };
