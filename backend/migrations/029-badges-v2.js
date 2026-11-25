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

const DEFAULT_LEVELS = [
  { level: 1, points: 0, names: { ar: 'مستكشف', en: 'Explorer', fr: 'Explorateur' } },
  { level: 2, points: 50, names: { ar: 'قارئ', en: 'Reader', fr: 'Lecteur' } },
  { level: 3, points: 150, names: { ar: 'رفيق الحكايات', en: 'Story companion', fr: 'Compagnon des récits' } },
  { level: 4, points: 300, names: { ar: 'طالب العلم', en: 'Seeker of knowledge', fr: 'Chercheur de savoir' } },
  { level: 5, points: 600, names: { ar: 'حارس الحكايات', en: 'Guardian of stories', fr: 'Gardien des récits' } },
  { level: 6, points: 1000, names: { ar: 'سراج المجتمع', en: 'Community luminary', fr: 'Lumière de la communauté' } }
];

const badgeRows = [
  {
    code: 'first-story',
    tier: 'bronze',
    category: 'reading',
    icon: 'book-open',
    points: 20,
    sortOrder: 10,
    criteria: { type: 'stories_completed', threshold: 1 },
    translations: {
      ar: { name: 'أول حكاية', description: 'أتممت قراءة أول حكاية كاملة.', howToEarn: 'أكمل قراءة حكاية واحدة من أول جزء إلى آخر جزء.', tier: 'برونزي', category: 'القراءة' },
      en: { name: 'First story', description: 'You finished your first complete story.', howToEarn: 'Finish reading one story from the first to the last part.', tier: 'Bronze', category: 'Reading' },
      fr: { name: 'Première histoire', description: 'Vous avez terminé votre première histoire complète.', howToEarn: 'Terminez la lecture d’une histoire du premier au dernier épisode.', tier: 'Bronze', category: 'Lecture' }
    }
  },
  {
    code: 'first-quiz',
    tier: 'bronze',
    category: 'quiz',
    icon: 'circle-help',
    points: 20,
    sortOrder: 20,
    criteria: { type: 'quizzes_completed', threshold: 1 },
    translations: {
      ar: { name: 'أول اختبار', description: 'نجحت في أول اختبار.', howToEarn: 'اجتز اختبارًا واحدًا بنجاح.', tier: 'برونزي', category: 'الاختبارات' },
      en: { name: 'First quiz', description: 'You passed your first quiz.', howToEarn: 'Pass one quiz.', tier: 'Bronze', category: 'Quizzes' },
      fr: { name: 'Premier quiz', description: 'Vous avez réussi votre premier quiz.', howToEarn: 'Réussissez un quiz.', tier: 'Bronze', category: 'Quiz' }
    }
  },
  {
    code: 'streak-3',
    tier: 'bronze',
    category: 'streak',
    icon: 'flame',
    points: 15,
    sortOrder: 30,
    criteria: { type: 'streak_days', threshold: 3 },
    translations: {
      ar: { name: 'ثلاثة أيام متتالية', description: 'قرأت ثلاثة أيام متتالية.', howToEarn: 'اقرأ أو أجب على اختبار ثلاثة أيام متتالية.', tier: 'برونزي', category: 'الاستمرارية' },
      en: { name: 'Three days in a row', description: 'You read three days in a row.', howToEarn: 'Read or answer a quiz three days in a row.', tier: 'Bronze', category: 'Streak' },
      fr: { name: 'Trois jours d’affilée', description: 'Vous avez lu trois jours de suite.', howToEarn: 'Lisez ou répondez à un quiz trois jours de suite.', tier: 'Bronze', category: 'Série' }
    }
  },
  {
    code: 'streak-7',
    tier: 'silver',
    category: 'streak',
    icon: 'flame',
    points: 40,
    sortOrder: 40,
    criteria: { type: 'streak_days', threshold: 7 },
    translations: {
      ar: { name: 'رفيق العلم', description: 'أسبوع كامل من القراءة المتواصلة.', howToEarn: 'حافظ على سلسلة قراءة سبعة أيام متتالية.', tier: 'فضي', category: 'الاستمرارية' },
      en: { name: 'Companion of knowledge', description: 'A full week of steady reading.', howToEarn: 'Keep a seven-day reading streak.', tier: 'Silver', category: 'Streak' },
      fr: { name: 'Compagnon du savoir', description: 'Une semaine de lecture régulière.', howToEarn: 'Maintenez une série de lecture de sept jours.', tier: 'Argent', category: 'Série' }
    }
  },
  {
    code: 'streak-30',
    tier: 'gold',
    category: 'streak',
    icon: 'flame',
    points: 120,
    sortOrder: 50,
    criteria: { type: 'streak_days', threshold: 30 },
    translations: {
      ar: { name: 'سراج المعرفة', description: 'شهر كامل من القراءة كل يوم.', howToEarn: 'حافظ على سلسلة قراءة ثلاثين يومًا متتالية.', tier: 'ذهبي', category: 'الاستمرارية' },
      en: { name: 'Lantern of knowledge', description: 'A full month of reading every day.', howToEarn: 'Keep a thirty-day reading streak.', tier: 'Gold', category: 'Streak' },
      fr: { name: 'Lanterne du savoir', description: 'Un mois entier de lecture quotidienne.', howToEarn: 'Maintenez une série de lecture de trente jours.', tier: 'Or', category: 'Série' }
    }
  },
  {
    code: 'quiz-master',
    tier: 'gold',
    category: 'quiz',
    icon: 'trophy',
    points: 100,
    sortOrder: 60,
    criteria: { type: 'quizzes_completed', threshold: 10 },
    translations: {
      ar: { name: 'خبير الاختبارات', description: 'نجحت في عشرة اختبارات.', howToEarn: 'اجتز عشرة اختبارات بنجاح.', tier: 'ذهبي', category: 'الاختبارات' },
      en: { name: 'Quiz master', description: 'You passed ten quizzes.', howToEarn: 'Pass ten quizzes.', tier: 'Gold', category: 'Quizzes' },
      fr: { name: 'Maître des quiz', description: 'Vous avez réussi dix quiz.', howToEarn: 'Réussissez dix quiz.', tier: 'Or', category: 'Quiz' }
    }
  },
  {
    code: 'perfect-score',
    tier: 'silver',
    category: 'quiz',
    icon: 'star',
    points: 50,
    sortOrder: 70,
    criteria: { type: 'perfect_quiz_scores', threshold: 1 },
    translations: {
      ar: { name: 'علامة كاملة', description: 'حصلت على 100% في اختبار.', howToEarn: 'أجب على كل أسئلة اختبار بشكل صحيح.', tier: 'فضي', category: 'الاختبارات' },
      en: { name: 'Perfect score', description: 'You scored 100% on a quiz.', howToEarn: 'Answer every question of a quiz correctly.', tier: 'Silver', category: 'Quizzes' },
      fr: { name: 'Score parfait', description: 'Vous avez obtenu 100 % à un quiz.', howToEarn: 'Répondez correctement à toutes les questions d’un quiz.', tier: 'Argent', category: 'Quiz' }
    }
  },
  {
    code: 'collection-complete',
    tier: 'gold',
    category: 'collection',
    icon: 'library',
    points: 90,
    sortOrder: 80,
    criteria: { type: 'collection_completed', collectionId: null },
    translations: {
      ar: { name: 'مجموعة كاملة', description: 'أكملت قراءة مجموعة كاملة.', howToEarn: 'اقرأ كل حكايات مجموعة واحدة حتى النهاية.', tier: 'ذهبي', category: 'المجموعات' },
      en: { name: 'Complete collection', description: 'You finished a whole collection.', howToEarn: 'Read every story of one collection to the end.', tier: 'Gold', category: 'Collections' },
      fr: { name: 'Collection complète', description: 'Vous avez terminé une collection entière.', howToEarn: 'Lisez toutes les histoires d’une collection jusqu’au bout.', tier: 'Or', category: 'Collections' }
    }
  },
  {
    code: 'story-master',
    tier: 'platinum',
    category: 'reading',
    icon: 'scroll',
    points: 150,
    sortOrder: 90,
    criteria: { type: 'stories_completed', threshold: 10 },
    translations: {
      ar: { name: 'قارئ متمكّن', description: 'أتممت عشر حكايات.', howToEarn: 'أكمل قراءة عشر حكايات.', tier: 'بلاتيني', category: 'القراءة' },
      en: { name: 'Story mastery', description: 'You completed ten stories.', howToEarn: 'Finish reading ten stories.', tier: 'Platinum', category: 'Reading' },
      fr: { name: 'Maîtrise des récits', description: 'Vous avez terminé dix histoires.', howToEarn: 'Terminez la lecture de dix histoires.', tier: 'Platine', category: 'Lecture' }
    }
  },
  {
    code: 'weekly-top10',
    tier: 'silver',
    category: 'competition',
    icon: 'compass',
    points: 60,
    sortOrder: 100,
    criteria: { type: 'weekly_challenge_rank', threshold: 10 },
    translations: {
      ar: { name: 'ضمن العشرة الأوائل', description: 'دخلت قائمة العشرة الأوائل في تحدي أسبوعي.', howToEarn: 'احصل على مركز ضمن العشرة الأوائل في تحدي أسبوعي.', tier: 'فضي', category: 'المسابقات' },
      en: { name: 'Top ten', description: 'You reached the top ten of a weekly challenge.', howToEarn: 'Finish in the top ten of a weekly challenge.', tier: 'Silver', category: 'Competitions' },
      fr: { name: 'Top dix', description: 'Vous avez atteint le top dix d’un défi hebdomadaire.', howToEarn: 'Terminez dans les dix premiers d’un défi hebdomadaire.', tier: 'Argent', category: 'Compétitions' }
    }
  },
  {
    code: 'team-player',
    tier: 'bronze',
    category: 'community',
    icon: 'users',
    points: 25,
    sortOrder: 110,
    criteria: { type: 'team_joined', threshold: 1 },
    translations: {
      ar: { name: 'روح الفريق', description: 'انضممت إلى فريق قراءة.', howToEarn: 'أنشئ فريقًا أو انضم إلى فريق.', tier: 'برونزي', category: 'المجتمع' },
      en: { name: 'Team player', description: 'You joined a reading team.', howToEarn: 'Create or join a reading team.', tier: 'Bronze', category: 'Community' },
      fr: { name: 'Esprit d’équipe', description: 'Vous avez rejoint une équipe de lecture.', howToEarn: 'Créez ou rejoignez une équipe de lecture.', tier: 'Bronze', category: 'Communauté' }
    }
  },
  {
    code: 'early-supporter',
    tier: 'special',
    category: 'supporter',
    icon: 'heart',
    points: 80,
    sortOrder: 120,
    isSecret: true,
    criteria: { type: 'early_supporter', threshold: 1 },
    translations: {
      ar: { name: 'داعم مبكر', description: 'دعمت المشروع في بدايته.', howToEarn: 'اشترك أو تبرع لدعم المشروع.', tier: 'خاص', category: 'الدعم' },
      en: { name: 'Early supporter', description: 'You supported the project early on.', howToEarn: 'Subscribe or donate to support the project.', tier: 'Special', category: 'Support' },
      fr: { name: 'Soutien de la première heure', description: 'Vous avez soutenu le projet dès ses débuts.', howToEarn: 'Abonnez-vous ou faites un don pour soutenir le projet.', tier: 'Spécial', category: 'Soutien' }
    }
  },
  {
    code: 'event-ramadan',
    tier: 'platinum',
    category: 'event',
    icon: 'crescent',
    points: 70,
    sortOrder: 130,
    eventTag: 'ramadan',
    criteria: { type: 'event_participation', eventTag: 'ramadan' },
    translations: {
      ar: { name: 'رفيق رمضان', description: 'شاركت في فعالية رمضان.', howToEarn: 'شارك في تحدي رمضان أو فعالية الموسم.', tier: 'بلاتيني', category: 'الفعاليات' },
      en: { name: 'Ramadan companion', description: 'You took part in the Ramadan event.', howToEarn: 'Join the Ramadan challenge or the seasonal event.', tier: 'Platinum', category: 'Events' },
      fr: { name: 'Compagnon du Ramadan', description: 'Vous avez participé à l’événement Ramadan.', howToEarn: 'Participez au défi Ramadan ou à l’événement de saison.', tier: 'Platine', category: 'Événements' }
    }
  }
];

async function up({ queryInterface, Sequelize }) {
  const id = { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true };
  const timestamps = {
    createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
  };

  await addColumnIfMissing(queryInterface, 'badge_types', 'howToEarn', {
    type: Sequelize.JSON, allowNull: false, defaultValue: {}
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'iconType', {
    type: Sequelize.ENUM('library', 'upload'), allowNull: false, defaultValue: 'library'
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'iconKey', {
    type: Sequelize.STRING(120), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'imageUrl', {
    type: Sequelize.TEXT, allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'tier', {
    type: Sequelize.ENUM('bronze', 'silver', 'gold', 'platinum', 'special'),
    allowNull: false,
    defaultValue: 'bronze'
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'category', {
    type: Sequelize.ENUM('reading', 'quiz', 'streak', 'collection', 'competition', 'community', 'supporter', 'event'),
    allowNull: false,
    defaultValue: 'reading'
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'colorTheme', {
    type: Sequelize.JSON, allowNull: false, defaultValue: {}
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'points', {
    type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'isSecret', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'sortOrder', {
    type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
  });
  await addColumnIfMissing(queryInterface, 'badge_types', 'eventTag', {
    type: Sequelize.STRING(120), allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'badge_awards', 'progressSnapshot', {
    type: Sequelize.JSON, allowNull: false, defaultValue: {}
  });
  await addColumnIfMissing(queryInterface, 'badge_awards', 'isFeatured', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
  await addColumnIfMissing(queryInterface, 'badge_awards', 'reason', {
    type: Sequelize.TEXT, allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'badge_awards', 'awardedBy', {
    type: Sequelize.INTEGER, allowNull: true
  });
  await addColumnIfMissing(queryInterface, 'users', 'avatarUrl', {
    type: Sequelize.STRING(1000), allowNull: true
  });

  if (!await tableExists(queryInterface, 'badge_settings')) {
    await queryInterface.createTable('badge_settings', {
      id,
      levels: { type: Sequelize.JSON, allowNull: false },
      certificateSettings: { type: Sequelize.JSON, allowNull: false },
      updatedBy: { type: Sequelize.INTEGER, allowNull: true },
      ...timestamps
    });
  }

  if (!await tableExists(queryInterface, 'notifications')) {
    await queryInterface.createTable('notifications', {
      id,
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      type: { type: Sequelize.STRING(60), allowNull: false },
      title: { type: Sequelize.STRING(255), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: true },
      data: { type: Sequelize.JSON, allowNull: false },
      readAt: { type: Sequelize.DATE, allowNull: true },
      ...timestamps
    });
    await queryInterface.addIndex('notifications', ['userId', 'readAt']);
  }

  if (await tableExists(queryInterface, 'badge_settings')) {
    const [existing] = await queryInterface.sequelize.query('SELECT id FROM badge_settings LIMIT 1');
    if (!existing.length) {
      const now = new Date();
      await queryInterface.bulkInsert('badge_settings', [{
        levels: JSON.stringify(DEFAULT_LEVELS),
        certificateSettings: JSON.stringify({ enabled: true, collections: {} }),
        createdAt: now,
        updatedAt: now
      }]);
    }
  }

  if (await tableExists(queryInterface, 'badge_types')) {
    const [existing] = await queryInterface.sequelize.query('SELECT code FROM badge_types');
    const codes = new Set(existing.map((row) => row.code));
    const now = new Date();
    const rows = badgeRows
      .filter((badge) => !codes.has(badge.code))
      .map((badge) => ({
        code: badge.code,
        name: badge.translations.ar.name,
        description: badge.translations.ar.description,
        translations: JSON.stringify(badge.translations),
        icon: badge.icon,
        iconType: 'library',
        iconKey: badge.icon,
        tier: badge.tier,
        category: badge.category,
        colorTheme: JSON.stringify({}),
        criteria: JSON.stringify(badge.criteria),
        points: badge.points,
        isSecret: Boolean(badge.isSecret),
        sortOrder: badge.sortOrder,
        eventTag: badge.eventTag || null,
        howToEarn: JSON.stringify(Object.fromEntries(
          Object.entries(badge.translations).map(([language, value]) => [language, value.howToEarn])
        )),
        isActive: true,
        createdAt: now,
        updatedAt: now
      }));
    if (rows.length) await queryInterface.bulkInsert('badge_types', rows);
  }
}

async function down({ queryInterface }) {
  if (await tableExists(queryInterface, 'notifications')) await queryInterface.dropTable('notifications');
  if (await tableExists(queryInterface, 'badge_settings')) await queryInterface.dropTable('badge_settings');
  const removals = [
    ['users', ['avatarUrl']],
    ['badge_awards', ['progressSnapshot', 'isFeatured', 'reason', 'awardedBy']],
    ['badge_types', ['howToEarn', 'iconType', 'iconKey', 'imageUrl', 'tier', 'category', 'colorTheme', 'points', 'isSecret', 'sortOrder', 'eventTag']]
  ];
  for (const [table, columns] of removals) {
    if (!await tableExists(queryInterface, table)) continue;
    const description = await queryInterface.describeTable(table);
    for (const column of columns) {
      if (description[column]) await queryInterface.removeColumn(table, column);
    }
  }
}

module.exports = { up, down, DEFAULT_LEVELS };
