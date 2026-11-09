const {
  Collection,
  Story,
  StoryPart,
  StoryVideo,
  Quiz,
  Question,
  Book
} = require('../models');

const sampleStories = [
  {
    collection: { title: 'قصص الأنبياء', slug: 'prophets-stories', isFree: true, sortOrder: 1 },
    title: 'يونس عليه السلام',
    slug: 'yunus',
    summary: 'قصة قرآنية عن التوبة والرجوع إلى الله.',
    type: 'quran',
    sourceBadge: 'quran_verse',
    sourceReferences: [{ reference: 'القرآن الكريم، الأنبياء 21:87-88' }],
    isFree: true,
    partTitle: 'في بطن الحوت',
    partContent: 'يذكر القرآن الكريم دعاء يونس عليه السلام في الظلمات، ثم يذكر استجابة الله له ونجاته. تعرض هذه المادة الآيات ومعانيها الموثقة دون إضافة تفاصيل غير ثابتة.',
    endingHook: 'ما الدعاء الذي علّمنا الله إياه في هذه القصة؟',
    videoTitle: 'يونس عليه السلام — الحلقة الأولى',
    quizTitle: 'ماذا نتعلم من قصة يونس؟',
    questions: [
      {
        text: 'في أي سورة ورد ذكر نداء يونس عليه السلام في الظلمات؟',
        options: ['الأنبياء', 'البقرة', 'الفيل'],
        correctAnswer: 'الأنبياء',
        explanation: 'ورد النداء في سورة الأنبياء، الآية 87.',
        source: 'القرآن الكريم، الأنبياء 21:87'
      },
      {
        text: 'بماذا دعا يونس عليه السلام؟',
        options: ['لا إله إلا أنت سبحانك إني كنت من الظالمين', 'رب زدني علما', 'رب اشرح لي صدري'],
        correctAnswer: 'لا إله إلا أنت سبحانك إني كنت من الظالمين',
        explanation: 'هذا هو الدعاء المذكور في الآية.',
        source: 'القرآن الكريم، الأنبياء 21:87'
      },
      {
        text: 'ماذا يذكر القرآن بعد دعائه؟',
        options: ['أن الله استجاب له ونجّاه من الغم', 'أنه بنى سفينة', 'أنه عاد إلى مصر'],
        correctAnswer: 'أن الله استجاب له ونجّاه من الغم',
        explanation: 'تذكر الآية التالية استجابة الله له وإنجاءه.',
        source: 'القرآن الكريم، الأنبياء 21:88'
      }
    ]
  },
  {
    collection: { title: 'قصص الصحابة', slug: 'companions', isFree: false, sortOrder: 2 },
    title: 'معاني الصحبة في الغار',
    slug: 'companionship-in-the-cave',
    summary: 'وقفة تعليمية حول آية الغار ومعاني التوكل والطمأنينة.',
    type: 'history',
    sourceBadge: 'quran_verse',
    sourceReferences: [{ reference: 'القرآن الكريم، التوبة 9:40' }],
    isFree: false,
    partTitle: 'لا تحزن إن الله معنا',
    partContent: 'تذكر سورة التوبة موقف الغار بعبارات موجزة، وتعرض قول النبي لصاحبه: لا تحزن إن الله معنا. يركز هذا الجزء على النص القرآني ومعنى الثقة بالله.',
    endingHook: 'كيف يجتمع الأخذ بالأسباب مع التوكل؟',
    videoTitle: 'معاني الصحبة في الغار — الحلقة الأولى',
    quizTitle: 'آية الغار',
    questions: [
      {
        text: 'في أي سورة ورد ذكر الغار؟',
        options: ['التوبة', 'مريم', 'الرحمن'],
        correctAnswer: 'التوبة',
        explanation: 'وردت القصة في سورة التوبة، الآية 40.',
        source: 'القرآن الكريم، التوبة 9:40'
      },
      {
        text: 'ما العبارة المذكورة في الآية لصاحبه؟',
        options: ['لا تحزن إن الله معنا', 'إن مع العسر يسرا', 'فاذكروني أذكركم'],
        correctAnswer: 'لا تحزن إن الله معنا',
        explanation: 'هذه العبارة نص من الآية.',
        source: 'القرآن الكريم، التوبة 9:40'
      },
      {
        text: 'ما نوع المصدر الأساسي لهذا الجزء؟',
        options: ['آية قرآنية', 'قصة خيالية', 'رواية معاصرة'],
        correctAnswer: 'آية قرآنية',
        explanation: 'يعتمد هذا المحتوى على النص القرآني المشار إليه.',
        source: 'القرآن الكريم، التوبة 9:40'
      }
    ]
  },
  {
    collection: { title: 'حكايات تربوية جديدة', slug: 'new-stories', isFree: false, sortOrder: 3 },
    title: 'الأمانة في المكتبة',
    slug: 'honesty-in-the-library',
    summary: 'حكاية تعليمية متخيلة عن الأمانة ورد الحقوق.',
    type: 'new',
    sourceBadge: 'inspired_story',
    sourceReferences: [],
    isFree: false,
    partTitle: 'كتاب على المقعد',
    partContent: 'وجدت مريم كتابا في المكتبة بعد انتهاء الدرس. لم تعرف صاحبه، فقررت أن تسلمه إلى أمينة المكتبة حتى يعود إلى صاحبه. هذه حكاية تعليمية متخيلة وليست رواية تاريخية أو حديثا.',
    endingHook: 'كيف ستعرف مريم صاحبة الكتاب؟',
    videoTitle: 'الأمانة في المكتبة — الحلقة الأولى',
    quizTitle: 'قيمة الأمانة',
    questions: [
      {
        text: 'أين وجدت مريم الكتاب؟',
        options: ['في المكتبة', 'في الحديقة', 'في السوق'],
        correctAnswer: 'في المكتبة',
        explanation: 'تبدأ الحكاية بالعثور على الكتاب في المكتبة.',
        source: 'الحكاية التعليمية المتخيلة: الأمانة في المكتبة'
      },
      {
        text: 'ماذا فعلت مريم بالكتاب؟',
        options: ['سلمته إلى أمينة المكتبة', 'احتفظت به لنفسها', 'تركته خارجا'],
        correctAnswer: 'سلمته إلى أمينة المكتبة',
        explanation: 'اختارت مريم حفظ الكتاب حتى يعود إلى صاحبه.',
        source: 'الحكاية التعليمية المتخيلة: الأمانة في المكتبة'
      },
      {
        text: 'ما الشارة التي تصف مصدر الحكاية؟',
        options: ['قصة مستوحاة', 'آية قرآنية', 'حديث صحيح'],
        correctAnswer: 'قصة مستوحاة',
        explanation: 'الحكاية خيالية تعليمية ومعلّمة بوضوح بأنها قصة مستوحاة.',
        source: 'تصنيف تحريري: قصة مستوحاة'
      }
    ]
  }
];

async function seedStories() {
  for (const sample of sampleStories) {
    const [collection] = await Collection.findOrCreate({
      where: { slug: sample.collection.slug },
      defaults: sample.collection
    });
    const [story] = await Story.findOrCreate({
      where: { slug: sample.slug },
      defaults: {
        collectionId: collection.id,
        title: sample.title,
        slug: sample.slug,
        summary: sample.summary,
        type: sample.type,
        sourceBadge: sample.sourceBadge,
        sourceReferences: sample.sourceReferences,
        status: 'draft',
        isFree: sample.isFree,
        ageGroup: 'all'
      }
    });
    const [part] = await StoryPart.findOrCreate({
      where: { storyId: story.id, partNumber: 1 },
      defaults: {
        storyId: story.id,
        partNumber: 1,
        title: sample.partTitle,
        content: sample.partContent,
        estimatedReadingMinutes: 5,
        endingHook: sample.endingHook,
        isFree: sample.isFree
      }
    });
    const [quiz] = await Quiz.findOrCreate({
      where: { storyId: story.id, title: sample.quizTitle },
      defaults: {
        storyId: story.id,
        partId: part.id,
        title: sample.quizTitle,
        difficulty: 'kids',
        passingScore: 60,
        validationStatus: 'draft'
      }
    });
    for (let index = 0; index < sample.questions.length; index += 1) {
      const question = sample.questions[index];
      await Question.findOrCreate({
        where: { quizId: quiz.id, sortOrder: index + 1 },
        defaults: { quizId: quiz.id, sortOrder: index + 1, ...question }
      });
    }
    await StoryVideo.findOrCreate({
      where: { storyId: story.id, episodeNumber: 1 },
      defaults: {
        storyId: story.id,
        partId: part.id,
        episodeNumber: 1,
        productionStatus: 'script_reviewed',
        depictionPolicyConfirmed: false
      }
    });
  }

  await Book.findOrCreate({
    where: { slug: 'yunus-ebook' },
    defaults: {
      title: 'يونس عليه السلام — كتاب إلكتروني',
      slug: 'yunus-ebook',
      description: 'نسخة إلكترونية تجريبية غير منشورة.',
      format: 'ebook',
      price: '4.90',
      currency: 'EUR',
      isPublished: false
    }
  });
  await Book.findOrCreate({
    where: { slug: 'prophets-stories-print' },
    defaults: {
      title: 'قصص الأنبياء — نسخة مطبوعة',
      slug: 'prophets-stories-print',
      description: 'نسخة مطبوعة تجريبية غير منشورة.',
      format: 'print',
      price: '14.90',
      currency: 'EUR',
      stockQuantity: 0,
      isPublished: false
    }
  });
}

module.exports = { seedStories };
