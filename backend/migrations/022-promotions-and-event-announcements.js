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

async function up({ queryInterface, Sequelize }) {
  const id = { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true };
  const timestamps = {
    createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
  };
  await addColumnIfMissing(queryInterface, 'store_orders', 'discountAmount', {
    type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0
  });
  await addColumnIfMissing(queryInterface, 'community_events', 'winnerDisplayName', {
    type: Sequelize.STRING(120), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'community_events', 'winnerAnnouncement', {
    type: Sequelize.JSON, allowNull: false, defaultValue: {}
  });
  await addColumnIfMissing(queryInterface, 'promo_codes', 'appliesTo', {
    type: Sequelize.ENUM('all', 'books', 'plans'), allowNull: false, defaultValue: 'all'
  });

  if (!await tableExists(queryInterface, 'promo_codes')) {
    await queryInterface.createTable('promo_codes', {
      id,
      code: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      kind: { type: Sequelize.ENUM('percentage', 'fixed', 'gift'), allowNull: false },
      appliesTo: { type: Sequelize.ENUM('all', 'books', 'plans'), allowNull: false, defaultValue: 'all' },
      value: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'EUR' },
      startsAt: { type: Sequelize.DATE, allowNull: true },
      endsAt: { type: Sequelize.DATE, allowNull: true },
      maxUses: { type: Sequelize.INTEGER, allowNull: true },
      usedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      perUserLimit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      applicableBookIds: { type: Sequelize.JSON, allowNull: false, defaultValue: [] },
      applicablePlanIds: { type: Sequelize.JSON, allowNull: false, defaultValue: [] },
      giftPlanId: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'plans', key: 'id' }, onDelete: 'SET NULL'
      },
      giftDurationDays: { type: Sequelize.INTEGER, allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps
    });
  }

  if (!await tableExists(queryInterface, 'promo_code_redemptions')) {
    await queryInterface.createTable('promo_code_redemptions', {
      id,
      promoCodeId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'promo_codes', key: 'id' }, onDelete: 'RESTRICT'
      },
      userId: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE'
      },
      orderId: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'store_orders', key: 'id' }, onDelete: 'SET NULL'
      },
      subscriptionId: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'subscriptions', key: 'id' }, onDelete: 'SET NULL'
      },
      status: { type: Sequelize.ENUM('pending', 'redeemed', 'released'), allowNull: false, defaultValue: 'pending' },
      amountDiscounted: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      stripeCheckoutSessionId: { type: Sequelize.STRING(255), allowNull: true, unique: true },
      ...timestamps
    });
  }

  const templateRows = [
    ['verification_code', {
      ar: { subject: 'رمز التحقق الخاص بك', body: 'رمز التحقق: {{code}}\n{{actionUrl}}' },
      en: { subject: 'Your verification code', body: 'Your verification code is {{code}}.\n{{actionUrl}}' },
      fr: { subject: 'Votre code de vérification', body: 'Votre code de vérification est {{code}}.\n{{actionUrl}}' }
    }],
    ['password_reset', {
      ar: { subject: 'إعادة تعيين كلمة المرور', body: 'رمز إعادة التعيين: {{code}}\n{{actionUrl}}' },
      en: { subject: 'Reset your password', body: 'Your password reset code is {{code}}.\n{{actionUrl}}' },
      fr: { subject: 'Réinitialiser votre mot de passe', body: 'Votre code de réinitialisation est {{code}}.\n{{actionUrl}}' }
    }],
    ['admin_login', {
      ar: { subject: 'رمز تسجيل دخول الإدارة', body: 'رمز تسجيل الدخول: {{code}}\n{{actionUrl}}' },
      en: { subject: 'Admin sign-in code', body: 'Your sign-in code is {{code}}.\n{{actionUrl}}' },
      fr: { subject: 'Code de connexion administrateur', body: 'Votre code de connexion est {{code}}.\n{{actionUrl}}' }
    }],
    ['admin_invitation', {
      ar: { subject: 'دعوة إلى لوحة الإدارة', body: 'رمز الدعوة: {{code}}\n{{actionUrl}}' },
      en: { subject: 'Invitation to the admin portal', body: 'Your invitation code is {{code}}.\n{{actionUrl}}' },
      fr: { subject: 'Invitation au portail administrateur', body: 'Votre code d’invitation est {{code}}.\n{{actionUrl}}' }
    }],
    ['order_confirmation', {
      ar: { subject: 'تأكيد الطلب {{orderId}}', body: 'شكرًا لطلبك، {{firstName}}.\nرقم الطلب: {{orderId}}\nالإجمالي: {{total}} {{currency}}' },
      en: { subject: 'Order {{orderId}} confirmed', body: 'Thank you for your order, {{firstName}}.\nOrder: {{orderId}}\nTotal: {{total}} {{currency}}' },
      fr: { subject: 'Commande {{orderId}} confirmée', body: 'Merci pour votre commande, {{firstName}}.\nCommande : {{orderId}}\nTotal : {{total}} {{currency}}' }
    }],
    ['subscription_renewal', {
      ar: { subject: 'تم تجديد اشتراكك', body: 'مرحبًا {{firstName}}، تم تأكيد دفعة اشتراكك.' },
      en: { subject: 'Your subscription renewed', body: 'Hello {{firstName}}, your subscription payment was confirmed.' },
      fr: { subject: 'Votre abonnement est renouvelé', body: 'Bonjour {{firstName}}, le paiement de votre abonnement est confirmé.' }
    }],
    ['quiz_result', {
      ar: { subject: 'نتيجة الاختبار: {{score}}%', body: 'أحسنت {{firstName}}، نتيجتك في {{quizTitle}} هي {{score}}%.' },
      en: { subject: 'Quiz result: {{score}}%', body: 'Well done, {{firstName}}. Your score for {{quizTitle}} is {{score}}%.' },
      fr: { subject: 'Résultat du quiz : {{score}} %', body: 'Bravo {{firstName}}, votre résultat pour {{quizTitle}} est de {{score}} %.' }
    }],
    ['story_published', {
      ar: { subject: 'قصة جديدة: {{storyTitle}}', body: 'أصبحت قصة {{storyTitle}} متاحة للقراءة.' },
      en: { subject: 'A new story: {{storyTitle}}', body: '{{storyTitle}} is now available to read.' },
      fr: { subject: 'Nouvelle histoire : {{storyTitle}}', body: '{{storyTitle}} est maintenant disponible.' }
    }],
    ['donation_receipt', {
      ar: { subject: 'إيصال تبرعك', body: 'شكرًا {{firstName}} على دعمك بمبلغ {{amount}} {{currency}}.\n{{actionUrl}}' },
      en: { subject: 'Your donation receipt', body: 'Thank you, {{firstName}}, for your donation of {{amount}} {{currency}}.\n{{actionUrl}}' },
      fr: { subject: 'Reçu de votre don', body: 'Merci {{firstName}} pour votre don de {{amount}} {{currency}}.\n{{actionUrl}}' }
    }],
    ['continue_reading', {
      ar: { subject: 'تابع القراءة يا {{firstName}}', body: 'قصتك التالية في انتظارك: {{storyTitle}}\n{{actionUrl}}' },
      en: { subject: 'Continue reading, {{firstName}}', body: 'Your next story is waiting: {{storyTitle}}\n{{actionUrl}}' },
      fr: { subject: 'Reprenez votre lecture, {{firstName}}', body: 'Votre prochaine histoire vous attend : {{storyTitle}}\n{{actionUrl}}' }
    }]
  ];
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
  for (const [table, column] of [
    ['community_events', 'winnerAnnouncement'],
    ['community_events', 'winnerDisplayName'],
    ['store_orders', 'discountAmount']
  ]) {
    if (!await tableExists(queryInterface, table)) continue;
    const columns = await queryInterface.describeTable(table);
    if (columns[column]) await queryInterface.removeColumn(table, column);
  }
  for (const table of ['promo_code_redemptions', 'promo_codes']) {
    if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
  }
}

module.exports = { up, down };
