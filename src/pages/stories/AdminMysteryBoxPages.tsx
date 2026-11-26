import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  CircleCheck,
  Coins,
  Download,
  ExternalLink,
  FileText,
  Gift,
  ImagePlus,
  Lightbulb,
  Loader2,
  Package,
  Palette,
  Plus,
  Printer,
  RefreshCw,
  Rocket,
  ScrollText,
  Sparkles,
  Trash2,
  Truck,
  UploadCloud,
  X
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { SiteLanguage } from '@/lib/localization';
import { ImageCropper, type CropRequest } from './StoryImagesEditor';
import { MysteryBoxCard, cardPalette, contrastRatio } from '@/components/mystery-box/MysteryBoxCard';
import type { ActiveMysteryBox } from '@/hooks/useMysteryBox';

type Language = SiteLanguage;
type CopyKey = keyof typeof copy.ar;

const copy = {
  ar: {
    listTitle: 'صناديق الغموض',
    listSubtitle: 'صناديق محدودة المحتوى والمخزون، تُفتح بعد الشراء. كل صندوق عرض مستقل بمواعيد حقيقية.',
    newBox: 'صندوق جديد',
    refresh: 'تحديث',
    search: 'ابحث بالاسم أو الموسم',
    allStates: 'كل الحالات',
    activeBoxes: 'صناديق نشطة',
    totalSales: 'المبيعات',
    totalRevenue: 'الإيراد',
    box: 'الصندوق',
    season: 'الموسم',
    state: 'الحالة',
    dates: 'المواعيد',
    price: 'السعر',
    stock: 'المخزون',
    sales: 'المبيعات',
    actions: 'الإجراءات',
    draft: 'مسودة',
    scheduled: 'مجدول',
    active: 'نشط',
    soldOut: 'نفد',
    ended: 'منتهي',
    archived: 'مؤرشف',
    edit: 'تعديل',
    purchases: 'المشتريات والشحن',
    duplicate: 'نسخ',
    activate: 'تفعيل',
    deactivate: 'إيقاف',
    archive: 'أرشفة',
    viewPublic: 'الصفحة العامة',
    delete: 'حذف',
    loading: 'جارٍ التحميل…',
    noBoxes: 'لا توجد صناديق غموض بعد.',
    noMatches: 'لا توجد نتائج مطابقة.',
    loadError: 'تعذر تحميل صناديق الغموض.',
    confirmArchive: 'أرشفة هذا الصندوق؟ لن يظهر للزوار.',
    confirmDelete: 'حذف هذه المسودة نهائيًا؟',
    duplicateSuccess: 'تم إنشاء نسخة جديدة من الصندوق.',
    actionSuccess: 'تم تحديث الصندوق.',
    actionError: 'تعذر تنفيذ الإجراء.',
    back: 'العودة إلى الصناديق',
    createTitle: 'إنشاء صندوق غموض',
    editTitle: 'تعديل صندوق الغموض',
    editorSubtitle: 'املأ المحتوى يدويًا بكل لغة. لا تُنشأ ترجمات تلقائية.',
    saveDraft: 'حفظ',
    saveAndStay: 'حفظ والبقاء',
    scheduleAction: 'جدولة',
    activateBox: 'تفعيل الآن',
    saved: 'تم حفظ الصندوق.',
    saveError: 'تعذر حفظ الصندوق.',
    tabGeneral: 'عام',
    tabSchedule: 'المواعيد',
    tabContents: 'المحتويات',
    tabPricing: 'السعر والمخزون',
    tabShipping: 'الشحن',
    tabAppearance: 'المظهر',
    tabDetails: 'التفاصيل',
    tabPublish: 'النشر',
    boxTitle: 'اسم الصندوق',
    tagline: 'السطر التعريفي',
    seasonLabel: 'الموسم',
    slug: 'الرابط المختصر',
    slugHint: 'أحرف لاتينية صغيرة وأرقام وشرطات. اتركه فارغًا ليُنشأ تلقائيًا.',
    returnPolicy: 'سياسة الإرجاع',
    returnPolicyHint: 'تطبق على العناصر المادية داخل الصندوق فقط. السياسة الافتراضية تلغي الإرجاع.',
    returnPolicyNone: 'غير قابل للإرجاع',
    returnPolicyStandard: 'يخضع لسياسة الإرجاع القياسية',
    priority: 'الأولوية',
    priorityHint: 'الأعلى يظهر أولًا عند وجود أكثر من صندوق.',
    arabic: 'العربية',
    english: 'English',
    french: 'Français',
    requiredArabic: 'العربية مطلوبة ويعود إليها الموقع عند غياب ترجمة.',
    generate: 'توليد من الاسم',
    timezone: 'المنطقة الزمنية',
    timezoneHint: 'تُفسَّر المواعيد المدخلة بهذه المنطقة الزمنية.',
    startsAt: 'البداية',
    endsAt: 'النهاية',
    scheduleHint: 'لن يظهر الصندوق قبل موعد البداية، وسيتوقف البيع عند النهاية.',
    overlapWarning: 'تنبيه: تتقاطع هذه المواعيد مع صندوق آخر. يمكن أن يعمل أكثر من صندوق، لكن راجع العرضين.',
    addItem: 'إضافة محتوى',
    noItems: 'أضف عنصرًا واحدًا على الأقل.',
    itemType: 'النوع',
    linkedContent: 'المحتوى المرتبط',
    selectContent: 'اختر…',
    quantity: 'الكمية',
    durationDays: 'عدد الأيام',
    displayName: 'الاسم الظاهر',
    teaser: 'نص التشويق',
    estimatedValue: 'القيمة التقديرية',
    hideBeforePurchase: 'إخفاء الاسم قبل الشراء',
    weightGrams: 'الوزن بالغرام',
    itemStock: 'مخزون هذا العنصر',
    sku: 'رمز التخزين',
    translations: 'الترجمات',
    remove: 'إزالة',
    moveUp: 'أعلى',
    moveDown: 'أسفل',
    contentsValue: 'قيمة المحتويات',
    savings: 'التوفير',
    contentsHint: 'المحتويات متطابقة لكل المشترين. الإخفاء للعرض فقط ولا يغيّر ما سيصل.',
    itemStockHint: 'مطلوب للعناصر المادية: يجب أن يغطي المخزون الكمية × حد المخزون.',
    typeEbook: 'كتاب إلكتروني',
    typePrinted: 'كتاب ورقي',
    typeRental: 'استعارة قصة',
    typeBadge: 'شارة',
    typeDonation: 'تبرع بكتاب',
    typePremium: 'أيام اشتراك مميز',
    typeCertificate: 'شهادة',
    typePhysical: 'عنصر مادي',
    itemNameRequired: 'أدخل اسمًا ظاهرًا لكل عنصر.',
    physicalTag: 'يتطلب شحنًا',
    digitalTag: 'رقمي',
    basePrice: 'سعر الصندوق',
    earlyBird: 'سعر مبكر',
    earlyBirdEndsAt: 'ينتهي السعر المبكر',
    currency: 'العملة',
    compareAtValue: 'القيمة المقارنة',
    compareHint: 'اتركها فارغة لاستخدام مجموع قيم المحتويات.',
    stockLimit: 'حد المخزون',
    stockHint: 'مطلوب للصناديق المادية. يحدد عدد الصناديق المتاحة.',
    perUserLimit: 'حد الشراء لكل مستخدم',
    revealMode: 'طريقة الكشف',
    revealHidden: 'مخفي حتى الشراء',
    revealTeaser: 'تشويق',
    revealFull: 'كشف كامل',
    priceSummary: 'ملخص القيمة',
    priceError: 'أدخل سعرًا أكبر من صفر.',
    shippingTitle: 'بيانات الشحن',
    physicalBox: 'الصندوق يُشحن فعليًا',
    physicalBoxHint: 'فعّل هذا الخيار إذا كان الصندوق نفسه أو محتواه سيُسلَّم بالبريد. تُضاف رسوم الشحن المحددة إلى الدفع عبر Stripe.',
    physicalLocked: 'مفروض لأن المحتويات تتضمن عنصرًا ماديًا.',
    shippingHint: 'تظهر هذه الحقول عندما يُشحن الصندوق فعليًا أو يحتوي عنصرًا ماديًا.',
    noShipping: 'هذا الصندوق غير مخصص للشحن الفعلي، لذا لن تُضاف رسوم توصيل.',
    shippingFee: 'رسوم الشحن',
    freeThreshold: 'حد الشحن المجاني',
    allowedCountries: 'الدول المسموح الشحن إليها',
    allowedHint: 'رموز ISO مفصولة بفواصل، مثل: FR,BE,NL. اتركها فارغة للسماح بكل الدول.',
    countryFees: 'رسوم حسب الدولة',
    addCountry: 'إضافة دولة',
    country: 'الدولة',
    fee: 'الرسوم',
    deliveryMin: 'أقل مدة توصيل (أيام)',
    deliveryMax: 'أقصى مدة توصيل (أيام)',
    carrier: 'شركة الشحن',
    shipsFrom: 'يُشحن من',
    shippingStart: 'بداية الشحن',
    shippingNote: 'ملاحظة الشحن',
    shippingNoteHint: 'نص واضح عن التغليف والتوصيل؛ لا وعود بمواعيد غير مضمونة.',
    appearance: 'مظهر الصندوق',
    headerLabel: 'نص الشريط',
    icon: 'الأيقونة',
    colorFrom: 'تدرج من',
    colorTo: 'تدرج إلى',
    accent: 'لون التمييز',
    animation: 'الحركة',
    animationNone: 'بلا حركة',
    animationShimmer: 'لمعان',
    animationPulse: 'نبض هادئ',
    animationSparkle: 'بريق',
    showCountdown: 'إظهار العدّاد في الشريط',
    almostSoldOut: 'تنبيه قرب النفاد عند بقاء',
    banner: 'صورة الصندوق',
    boxImageHint: 'تظهر أعلى بطاقة الصندوق في الصفحة الرئيسية. المقاس الموصى به 1200×800، بحد أقصى 5 ميغابايت.',
    uploadPhoto: 'رفع صورة',
    replacePhoto: 'استبدال الصورة',
    removePhoto: 'إزالة',
    photoFormats: 'JPG أو PNG أو WebP · حتى 5 م.ب',
    imageUrlLabel: 'أو رابط مباشر للصورة',
    pattern: 'نمط الخلفية',
    preview: 'معاينة حيّة',
    light: 'فاتح',
    dark: 'داكن',
    desktop: 'سطح المكتب',
    mobile: 'الهاتف',
    previewCaption: 'معاينة تقريبية من بيانات النموذج؛ الصفحة العامة تُطوَّر في المرحلة التالية.',
    promoTitle: 'محتوى ترويجي',
    promoHint: 'مقاطع نصية وصور تظهر أعلى صفحة الصندوق لتشرح قيمته. اكتب النص بالعربية، ثم ترجمه من ألسنة اللغة أعلاه.',
    addTextBlock: 'إضافة نص',
    addImageBlock: 'إضافة صورة',
    blockTitle: 'العنوان',
    blockBody: 'النص',
    imageAltLabel: 'وصف الصورة لقارئات الشاشة',
    removeBlock: 'حذف',
    promoEmpty: 'لا يوجد محتوى ترويجي بعد.',
    detailsTitle: 'نص التفاصيل',
    description: 'الوصف',
    descriptionHint: 'اشرح ما في الصندوق ومن يناسبه دون كشف عناصر مخفية.',
    faq: 'الأسئلة الشائعة',
    question: 'السؤال',
    answer: 'الجواب',
    addFaq: 'إضافة سؤال',
    terms: 'الشروط',
    digitalConsent: 'نص موافقة المحتوى الرقمي',
    digitalConsentHint: 'يُعرض عند الدفع للصناديق التي تحتوي محتوى رقميًا.',
    publish: 'النشر والجاهزية',
    checklist: 'قائمة الجاهزية',
    status: 'الحالة الحالية',
    salesCount: 'عدد المبيعات',
    ackSales: 'أفهم أن هذا الصندوق لديه مبيعات، وأريد حفظ تعديلات تجارية.',
    ackSalesHint: 'التعديلات التجارية على صندوق مباع تتطلب تأكيدًا صريحًا.',
    serverMissing: 'العناصر التي منعها الخادم:',
    ready: 'جاهز للتفعيل',
    notReady: 'أكمل العناصر الناقصة',
    saveFirst: 'احفظ الصندوق أولًا لفتح صفحة المشتريات.',
    scheduleHint2: 'الجدولة تتطلب موعد بداية في المستقبل.',
    activateHint: 'التفعيل يبدأ البيع فورًا حتى موعد النهاية.',
    purchasesTitle: 'مشتريات الصندوق',
    purchasesSubtitle: 'المدفوعات وعناوين الشحن والتتبع وقائمة التغليف.',
    toShip: 'بانتظار الشحن',
    shipped: 'تم الشحن',
    delivered: 'تم التسليم',
    all: 'الكل',
    buyer: 'المشتري',
    amount: 'المبلغ',
    orderDate: 'التاريخ',
    itemSummary: 'المحتويات',
    address: 'عنوان الشحن',
    tracking: 'رقم التتبع',
    markShipped: 'تسجيل الشحن',
    markDelivered: 'تسجيل التسليم',
    bulkTitle: 'شحن جماعي',
    bulkHint: 'اختر الطلبات ثم أدخل رقم تتبع مشتركًا. الطلبات المحددة تُعلَّم كمشحونة.',
    bulkTracking: 'رقم التتبع المشترك',
    bulkCarrier: 'شركة الشحن',
    shipSelected: 'شحن المحدد',
    selected: 'محدد',
    packingList: 'قائمة التغليف',
    exportCsv: 'تصدير CSV',
    noPurchases: 'لا توجد مشتريات في هذه الحالة.',
    shippedSuccess: 'تم تسجيل الشحن.',
    deliveredSuccess: 'تم تسجيل التسليم.',
    emailSkipped: 'تم الحفظ، لكن تعذر إرسال بريد الشحن.',
    statsSales: 'المبيعات',
    statsRevenue: 'الإيراد',
    statsItems: 'العناصر المباعة',
    statsRemaining: 'المتبقي',
    statsViews: 'المشاهدات',
    statsConversion: 'التحويل',
    shippingOnly: 'هذه الصفحة للصناديق المادية فقط.',
    printTitle: 'قائمة تغليف',
    yes: 'نعم',
    no: 'لا',
    optional: 'اختياري',
    save: 'حفظ التغييرات',
    cancel: 'إلغاء',
    required: 'مطلوب',
    order: 'الطلب',
    guideTitle: 'ابنِ صندوقك في ثلاث مراحل',
    guideSubtitle: 'مسار واضح: ابدأ بالفكرة، أضف القيمة، ثم راجع وانشر. لا تحتاج إلى حفظ كل الحقول دفعة واحدة.',
    guideStep1Title: 'حدّد العرض',
    guideStep1Body: 'الاسم والموسم والمواعيد والسعر. هذه أساسات الصندوق.',
    guideStep2Title: 'ابنِ المحتوى',
    guideStep2Body: 'أضف العناصر واربطها بالمكتبة، ثم اضبط الشحن إن كان ماديًا.',
    guideStep3Title: 'راجع وانشر',
    guideStep3Body: 'شاهد المعاينة، أكمل قائمة الجاهزية، ثم فعّل البيع.',
    guideStart: 'ابدأ أول صندوق',
    guideOpen: 'كيف يعمل؟',
    guideClose: 'إخفاء الدليل',
    progressTitle: 'تقدّم الإعداد',
    progressReady: 'كل المتطلبات مكتملة',
    progressRemaining: 'خطوات متبقية',
    stepLabel: 'الخطوة',
    stageLabel: 'المرحلة',
    stepComplete: 'مكتمل',
    stepInProgress: 'قيد الإعداد',
    stepPending: 'لم يبدأ',
    previousStep: 'السابق',
    nextStep: 'التالي',
    reviewPublish: 'مراجعة النشر',
    purposeGeneral: 'ابدأ بالاسم والموسم. هذه هوية الصندوق التي سيراها الزائر.',
    purposeSchedule: 'حدد متى يظهر الصندوق ومتى يتوقف البيع. المواعيد حقيقية وليست عدًّا تنازليًا مصطنعًا.',
    purposeContents: 'أضف ما سيصل للمشتري. المحتويات نفسها لكل شخص، ويمكن إخفاء الأسماء حتى الشراء.',
    purposePricing: 'اختر السعر وحدود المخزون. ستظهر لك القيمة والتوفير تلقائيًا.',
    purposeShipping: 'إن كان في الصندوق عنصر مادي، حدد الدول والرسوم ومدة التوصيل.',
    purposeAppearance: 'اختر شكل الشريط والألوان. المعاينة تتحدث معك مباشرة.',
    purposeDetails: 'اكتب الوصف والأسئلة والشروط. اشرح التجربة دون حرق المفاجأة.',
    purposePublish: 'راجع قائمة الجاهزية ثم احفظ أو جدول أو فعّل.',
    nextAction: 'الخطوة التالية',
    nextDraft: 'أكمل الإعداد',
    nextScheduled: 'راجع المواعيد',
    nextActive: 'تابع المبيعات',
    nextSoldOut: 'راجع الطلبات',
    nextEnded: 'راجع الصندوق',
    nextArchived: 'استعرض الصندوق',
    orderJourney: 'رحلة الطلب',
    journeyPaid: 'تم الدفع',
    journeyPrepare: 'جهّز الطرد',
    journeyTrack: 'أضف التتبع',
    journeyDelivered: 'تم التسليم',
    journeyHint: 'كل طلب ينتقل من الدفع إلى التغليف ثم الشحن ثم التسليم.',
    allShipped: 'لا توجد طلبات بانتظار الشحن حاليًا.'
  },
  en: {
    listTitle: 'Mystery boxes',
    listSubtitle: 'Boxes with fixed contents and limited stock, revealed after purchase. Each box has real dates.',
    newBox: 'New box',
    refresh: 'Refresh',
    search: 'Search by name or season',
    allStates: 'All states',
    activeBoxes: 'Active boxes',
    totalSales: 'Sales',
    totalRevenue: 'Revenue',
    box: 'Box',
    season: 'Season',
    state: 'State',
    dates: 'Dates',
    price: 'Price',
    stock: 'Stock',
    sales: 'Sales',
    actions: 'Actions',
    draft: 'Draft',
    scheduled: 'Scheduled',
    active: 'Active',
    soldOut: 'Sold out',
    ended: 'Ended',
    archived: 'Archived',
    edit: 'Edit',
    purchases: 'Purchases & shipping',
    duplicate: 'Duplicate',
    activate: 'Activate',
    deactivate: 'Deactivate',
    archive: 'Archive',
    viewPublic: 'Public page',
    delete: 'Delete',
    loading: 'Loading…',
    noBoxes: 'No mystery boxes yet.',
    noMatches: 'No matching results.',
    loadError: 'Could not load mystery boxes.',
    confirmArchive: 'Archive this box? It will no longer be visible to visitors.',
    confirmDelete: 'Permanently delete this draft?',
    duplicateSuccess: 'A copy of the box was created.',
    actionSuccess: 'The box was updated.',
    actionError: 'The action could not be completed.',
    back: 'Back to boxes',
    createTitle: 'Create a mystery box',
    editTitle: 'Edit mystery box',
    editorSubtitle: 'Enter every language manually. No automatic translations are created.',
    saveDraft: 'Save',
    saveAndStay: 'Save and stay',
    scheduleAction: 'Schedule',
    activateBox: 'Activate now',
    saved: 'The box was saved.',
    saveError: 'Could not save the box.',
    tabGeneral: 'General',
    tabSchedule: 'Schedule',
    tabContents: 'Contents',
    tabPricing: 'Pricing & stock',
    tabShipping: 'Shipping',
    tabAppearance: 'Appearance',
    tabDetails: 'Details',
    tabPublish: 'Publish',
    boxTitle: 'Box name',
    tagline: 'Tagline',
    seasonLabel: 'Season',
    slug: 'Slug',
    slugHint: 'Lowercase letters, numbers and hyphens. Leave empty to generate from the name.',
    returnPolicy: 'Return policy',
    returnPolicyHint: 'Applies to the physical items inside the box only. The default policy disables returns.',
    returnPolicyNone: 'Not returnable',
    returnPolicyStandard: 'Standard return policy applies',
    priority: 'Priority',
    priorityHint: 'Higher priority boxes are listed first.',
    arabic: 'العربية',
    english: 'English',
    french: 'Français',
    requiredArabic: 'Arabic is required and is the fallback when a translation is missing.',
    generate: 'Generate from name',
    timezone: 'Time zone',
    timezoneHint: 'Entered dates are interpreted in this time zone.',
    startsAt: 'Starts',
    endsAt: 'Ends',
    scheduleHint: 'The box stays hidden before the start and stops selling at the end.',
    overlapWarning: 'Warning: these dates overlap another box. Multiple boxes may run, but review both offers.',
    addItem: 'Add content',
    noItems: 'Add at least one item.',
    itemType: 'Type',
    linkedContent: 'Linked content',
    selectContent: 'Select…',
    quantity: 'Quantity',
    durationDays: 'Days',
    displayName: 'Display name',
    teaser: 'Teaser',
    estimatedValue: 'Estimated value',
    hideBeforePurchase: 'Hide the name before purchase',
    weightGrams: 'Weight (g)',
    itemStock: 'Item stock',
    sku: 'SKU',
    translations: 'Translations',
    remove: 'Remove',
    moveUp: 'Up',
    moveDown: 'Down',
    contentsValue: 'Contents value',
    savings: 'Savings',
    contentsHint: 'Every buyer receives the same contents. Hiding is presentational only.',
    itemStockHint: 'Required for physical items: stock must cover quantity × stock limit.',
    typeEbook: 'Ebook',
    typePrinted: 'Printed book',
    typeRental: 'Story rental',
    typeBadge: 'Badge',
    typeDonation: 'Book donation',
    typePremium: 'Premium days',
    typeCertificate: 'Certificate',
    typePhysical: 'Physical object',
    itemNameRequired: 'Enter a display name for every item.',
    physicalTag: 'Requires shipping',
    digitalTag: 'Digital',
    basePrice: 'Box price',
    earlyBird: 'Early-bird price',
    earlyBirdEndsAt: 'Early-bird ends',
    currency: 'Currency',
    compareAtValue: 'Compare-at value',
    compareHint: 'Leave empty to use the total item value.',
    stockLimit: 'Stock limit',
    stockHint: 'Required for physical boxes. Sets how many boxes are available.',
    perUserLimit: 'Purchase limit per user',
    revealMode: 'Reveal timing',
    revealHidden: 'Hidden until purchase',
    revealTeaser: 'Teaser',
    revealFull: 'Full reveal',
    priceSummary: 'Value summary',
    priceError: 'Enter a price greater than zero.',
    shippingTitle: 'Shipping details',
    physicalBox: 'This box ships physically',
    physicalBoxHint: 'Enable this when the box itself or its contents must be delivered by post. The selected shipping fee and country are added to Stripe Checkout.',
    physicalLocked: 'Required because the contents include a physical item.',
    shippingHint: 'These fields appear when the box ships physically or contains a physical item.',
    noShipping: 'This box does not ship physically, so no delivery fee will be added.',
    shippingFee: 'Shipping fee',
    freeThreshold: 'Free shipping threshold',
    allowedCountries: 'Allowed countries',
    allowedHint: 'Comma-separated ISO codes, e.g. FR,BE,NL. Leave empty to allow every country.',
    countryFees: 'Fees by country',
    addCountry: 'Add country',
    country: 'Country',
    fee: 'Fee',
    deliveryMin: 'Minimum delivery (days)',
    deliveryMax: 'Maximum delivery (days)',
    carrier: 'Carrier',
    shipsFrom: 'Ships from',
    shippingStart: 'Shipping start',
    shippingNote: 'Shipping note',
    shippingNoteHint: 'Be clear about packaging and delivery; do not promise guaranteed dates.',
    appearance: 'Box appearance',
    headerLabel: 'Header label',
    icon: 'Icon',
    colorFrom: 'Gradient from',
    colorTo: 'Gradient to',
    accent: 'Accent color',
    animation: 'Animation',
    animationNone: 'None',
    animationShimmer: 'Shimmer',
    animationPulse: 'Soft pulse',
    animationSparkle: 'Sparkle',
    showCountdown: 'Show countdown in header',
    almostSoldOut: 'Almost sold out when remaining reaches',
    banner: 'Mystery box photo',
    boxImageHint: 'Shown at the top of the mystery box card on the home page. Recommended 1200×800, up to 5 MB.',
    uploadPhoto: 'Upload photo',
    replacePhoto: 'Replace photo',
    removePhoto: 'Remove',
    photoFormats: 'JPG, PNG or WebP · up to 5 MB',
    imageUrlLabel: 'Or a direct image URL',
    pattern: 'Background pattern',
    preview: 'Live preview',
    light: 'Light',
    dark: 'Dark',
    desktop: 'Desktop',
    mobile: 'Mobile',
    previewCaption: 'Approximate preview from the form data; the public page is built in the next phase.',
    promoTitle: 'Promo content',
    promoHint: 'Texts and images shown at the top of the box page to sell it. Write the Arabic text, then translate it from the language tabs above.',
    addTextBlock: 'Add text',
    addImageBlock: 'Add image',
    blockTitle: 'Title',
    blockBody: 'Text',
    imageAltLabel: 'Image description for screen readers',
    removeBlock: 'Remove',
    promoEmpty: 'No promo content yet.',
    detailsTitle: 'Detail copy',
    description: 'Description',
    descriptionHint: 'Explain what is inside and who it is for without revealing hidden items.',
    faq: 'FAQ',
    question: 'Question',
    answer: 'Answer',
    addFaq: 'Add question',
    terms: 'Terms',
    digitalConsent: 'Digital content consent text',
    digitalConsentHint: 'Shown at checkout for boxes that contain digital content.',
    publish: 'Publishing & readiness',
    checklist: 'Readiness checklist',
    status: 'Current status',
    salesCount: 'Sales count',
    ackSales: 'I understand this box has sales and want to save commercial changes.',
    ackSalesHint: 'Commercial changes to a box with sales require explicit confirmation.',
    serverMissing: 'Requirements reported by the server:',
    ready: 'Ready to activate',
    notReady: 'Complete the missing items',
    saveFirst: 'Save the box first to open purchases.',
    scheduleHint2: 'Scheduling requires a start date in the future.',
    activateHint: 'Activation starts selling immediately until the end date.',
    purchasesTitle: 'Box purchases',
    purchasesSubtitle: 'Payments, shipping addresses, tracking and the packing list.',
    toShip: 'To ship',
    shipped: 'Shipped',
    delivered: 'Delivered',
    all: 'All',
    buyer: 'Buyer',
    amount: 'Amount',
    orderDate: 'Date',
    itemSummary: 'Contents',
    address: 'Shipping address',
    tracking: 'Tracking number',
    markShipped: 'Mark shipped',
    markDelivered: 'Mark delivered',
    bulkTitle: 'Bulk shipping',
    bulkHint: 'Select orders and enter one shared tracking number. Selected orders are marked shipped.',
    bulkTracking: 'Shared tracking number',
    bulkCarrier: 'Carrier',
    shipSelected: 'Ship selected',
    selected: 'selected',
    packingList: 'Packing list',
    exportCsv: 'Export CSV',
    noPurchases: 'No purchases in this state.',
    shippedSuccess: 'Shipment recorded.',
    deliveredSuccess: 'Delivery recorded.',
    emailSkipped: 'Saved, but the shipping email could not be sent.',
    statsSales: 'Sales',
    statsRevenue: 'Revenue',
    statsItems: 'Items sold',
    statsRemaining: 'Remaining',
    statsViews: 'Views',
    statsConversion: 'Conversion',
    shippingOnly: 'This page is for physical boxes only.',
    printTitle: 'Packing list',
    yes: 'Yes',
    no: 'No',
    optional: 'Optional',
    save: 'Save changes',
    cancel: 'Cancel',
    required: 'Required',
    order: 'Order',
    guideTitle: 'Build your box in three stages',
    guideSubtitle: 'A clear path: start with the idea, add the value, then review and publish. You do not need to fill every field at once.',
    guideStep1Title: 'Define the offer',
    guideStep1Body: 'Name, season, dates and price. These are the foundations.',
    guideStep2Title: 'Build the contents',
    guideStep2Body: 'Add items and link them to the library, then set shipping if physical.',
    guideStep3Title: 'Review and publish',
    guideStep3Body: 'Check the preview and readiness list, then start selling.',
    guideStart: 'Start the first box',
    guideOpen: 'How it works',
    guideClose: 'Hide guide',
    progressTitle: 'Setup progress',
    progressReady: 'All requirements complete',
    progressRemaining: 'steps remaining',
    stepLabel: 'Step',
    stageLabel: 'Stage',
    stepComplete: 'Complete',
    stepInProgress: 'In progress',
    stepPending: 'Not started',
    previousStep: 'Previous',
    nextStep: 'Next',
    reviewPublish: 'Review publishing',
    purposeGeneral: 'Start with the name and season. This is the box identity visitors will see.',
    purposeSchedule: 'Set when the box appears and when selling stops. These are real dates, not artificial countdowns.',
    purposeContents: 'Add what the buyer receives. Every buyer gets the same contents; names can stay hidden until purchase.',
    purposePricing: 'Choose the price and stock limits. Value and savings are calculated for you.',
    purposeShipping: 'If the box contains a physical item, set countries, fees and delivery estimates.',
    purposeAppearance: 'Choose the header and colours. The preview updates as you type.',
    purposeDetails: 'Write the description, FAQ and terms. Explain the experience without spoiling the surprise.',
    purposePublish: 'Review the readiness list, then save, schedule or activate.',
    nextAction: 'Next action',
    nextDraft: 'Finish setup',
    nextScheduled: 'Review schedule',
    nextActive: 'Track sales',
    nextSoldOut: 'Review orders',
    nextEnded: 'Review box',
    nextArchived: 'View box',
    orderJourney: 'Order journey',
    journeyPaid: 'Paid',
    journeyPrepare: 'Pack the parcel',
    journeyTrack: 'Add tracking',
    journeyDelivered: 'Delivered',
    journeyHint: 'Every order moves from payment to packing, shipping, then delivery.',
    allShipped: 'No orders are waiting to ship.'
  },
  fr: {
    listTitle: 'Boîtes mystère',
    listSubtitle: 'Des boîtes au contenu fixe et au stock limité, révélées après l’achat. Chaque boîte a de vraies dates.',
    newBox: 'Nouvelle boîte',
    refresh: 'Actualiser',
    search: 'Rechercher par nom ou saison',
    allStates: 'Tous les états',
    activeBoxes: 'Boîtes actives',
    totalSales: 'Ventes',
    totalRevenue: 'Revenu',
    box: 'Boîte',
    season: 'Saison',
    state: 'État',
    dates: 'Dates',
    price: 'Prix',
    stock: 'Stock',
    sales: 'Ventes',
    actions: 'Actions',
    draft: 'Brouillon',
    scheduled: 'Programmée',
    active: 'Active',
    soldOut: 'Épuisée',
    ended: 'Terminée',
    archived: 'Archivée',
    edit: 'Modifier',
    purchases: 'Achats et expédition',
    duplicate: 'Dupliquer',
    activate: 'Activer',
    deactivate: 'Désactiver',
    archive: 'Archiver',
    viewPublic: 'Page publique',
    delete: 'Supprimer',
    loading: 'Chargement…',
    noBoxes: 'Aucune boîte mystère pour le moment.',
    noMatches: 'Aucun résultat correspondant.',
    loadError: 'Impossible de charger les boîtes mystère.',
    confirmArchive: 'Archiver cette boîte ? Elle ne sera plus visible.',
    confirmDelete: 'Supprimer définitivement ce brouillon ?',
    duplicateSuccess: 'Une copie de la boîte a été créée.',
    actionSuccess: 'La boîte a été mise à jour.',
    actionError: 'L’action n’a pas pu être effectuée.',
    back: 'Retour aux boîtes',
    createTitle: 'Créer une boîte mystère',
    editTitle: 'Modifier la boîte mystère',
    editorSubtitle: 'Saisissez chaque langue manuellement. Aucune traduction automatique n’est créée.',
    saveDraft: 'Enregistrer',
    saveAndStay: 'Enregistrer et rester',
    scheduleAction: 'Programmer',
    activateBox: 'Activer maintenant',
    saved: 'La boîte a été enregistrée.',
    saveError: 'Impossible d’enregistrer la boîte.',
    tabGeneral: 'Général',
    tabSchedule: 'Calendrier',
    tabContents: 'Contenu',
    tabPricing: 'Prix et stock',
    tabShipping: 'Expédition',
    tabAppearance: 'Apparence',
    tabDetails: 'Détails',
    tabPublish: 'Publication',
    boxTitle: 'Nom de la boîte',
    tagline: 'Accroche',
    seasonLabel: 'Saison',
    slug: 'Identifiant',
    slugHint: 'Lettres minuscules, chiffres et tirets. Laissez vide pour générer depuis le nom.',
    returnPolicy: 'Politique de retour',
    returnPolicyHint: 'S’applique uniquement aux articles physiques de la box. La politique par défaut désactive les retours.',
    returnPolicyNone: 'Non retournable',
    returnPolicyStandard: 'Politique de retour standard',
    priority: 'Priorité',
    priorityHint: 'Les boîtes à priorité élevée apparaissent en premier.',
    arabic: 'العربية',
    english: 'English',
    french: 'Français',
    requiredArabic: 'L’arabe est requis et sert de repli si une traduction manque.',
    generate: 'Générer depuis le nom',
    timezone: 'Fuseau horaire',
    timezoneHint: 'Les dates saisies sont interprétées dans ce fuseau.',
    startsAt: 'Début',
    endsAt: 'Fin',
    scheduleHint: 'La boîte reste masquée avant le début et cesse la vente à la fin.',
    overlapWarning: 'Attention : ces dates chevauchent une autre boîte. Plusieurs boîtes peuvent coexister, mais vérifiez les deux offres.',
    addItem: 'Ajouter du contenu',
    noItems: 'Ajoutez au moins un élément.',
    itemType: 'Type',
    linkedContent: 'Contenu lié',
    selectContent: 'Choisir…',
    quantity: 'Quantité',
    durationDays: 'Jours',
    displayName: 'Nom affiché',
    teaser: 'Accroche',
    estimatedValue: 'Valeur estimée',
    hideBeforePurchase: 'Masquer le nom avant l’achat',
    weightGrams: 'Poids (g)',
    itemStock: 'Stock de l’élément',
    sku: 'Référence',
    translations: 'Traductions',
    remove: 'Retirer',
    moveUp: 'Monter',
    moveDown: 'Descendre',
    contentsValue: 'Valeur du contenu',
    savings: 'Économie',
    contentsHint: 'Tous les acheteurs reçoivent le même contenu. Le masquage est uniquement visuel.',
    itemStockHint: 'Requis pour les éléments physiques : le stock doit couvrir quantité × limite de stock.',
    typeEbook: 'Livre numérique',
    typePrinted: 'Livre imprimé',
    typeRental: 'Location d’histoire',
    typeBadge: 'Badge',
    typeDonation: 'Don de livre',
    typePremium: 'Jours premium',
    typeCertificate: 'Certificat',
    typePhysical: 'Objet physique',
    itemNameRequired: 'Saisissez un nom affiché pour chaque élément.',
    physicalTag: 'Expédition requise',
    digitalTag: 'Numérique',
    basePrice: 'Prix de la boîte',
    earlyBird: 'Prix de lancement',
    earlyBirdEndsAt: 'Fin du prix de lancement',
    currency: 'Devise',
    compareAtValue: 'Valeur de comparaison',
    compareHint: 'Laissez vide pour utiliser la valeur totale des éléments.',
    stockLimit: 'Limite de stock',
    stockHint: 'Requise pour les boîtes physiques. Définit le nombre de boîtes disponibles.',
    perUserLimit: 'Limite par utilisateur',
    revealMode: 'Moment de révélation',
    revealHidden: 'Masqué jusqu’à l’achat',
    revealTeaser: 'Aperçu',
    revealFull: 'Révélation complète',
    priceSummary: 'Résumé de la valeur',
    priceError: 'Saisissez un prix supérieur à zéro.',
    shippingTitle: 'Détails d’expédition',
    physicalBox: 'Cette boîte est expédiée physiquement',
    physicalBoxHint: 'Activez cette option si la boîte elle-même ou son contenu doit être livré par la poste. Les frais et le pays choisis sont ajoutés au paiement Stripe.',
    physicalLocked: 'Obligatoire car le contenu comprend un élément physique.',
    shippingHint: 'Ces champs apparaissent lorsque la boîte est expédiée physiquement ou contient un élément physique.',
    noShipping: 'Cette boîte n’est pas expédiée physiquement ; aucuns frais de livraison ne seront ajoutés.',
    shippingFee: 'Frais d’expédition',
    freeThreshold: 'Seuil de livraison gratuite',
    allowedCountries: 'Pays autorisés',
    allowedHint: 'Codes ISO séparés par des virgules, ex. FR,BE,NL. Laissez vide pour tous les pays.',
    countryFees: 'Frais par pays',
    addCountry: 'Ajouter un pays',
    country: 'Pays',
    fee: 'Frais',
    deliveryMin: 'Livraison min. (jours)',
    deliveryMax: 'Livraison max. (jours)',
    carrier: 'Transporteur',
    shipsFrom: 'Expédié depuis',
    shippingStart: 'Début d’expédition',
    shippingNote: 'Note d’expédition',
    shippingNoteHint: 'Soyez clair sur l’emballage et la livraison ; ne promettez pas de date garantie.',
    appearance: 'Apparence de la boîte',
    headerLabel: 'Libellé du bandeau',
    icon: 'Icône',
    colorFrom: 'Dégradé de',
    colorTo: 'Dégradé vers',
    accent: 'Couleur d’accent',
    animation: 'Animation',
    animationNone: 'Aucune',
    animationShimmer: 'Brillance',
    animationPulse: 'Pulsation douce',
    animationSparkle: 'Étincelles',
    showCountdown: 'Afficher le compte à rebours',
    almostSoldOut: 'Presque épuisé à partir de',
    banner: 'Photo du coffret',
    boxImageHint: 'Affichée en haut de la carte du coffret sur la page d’accueil. Format conseillé 1200×800, 5 Mo maximum.',
    uploadPhoto: 'Téléverser une photo',
    replacePhoto: 'Remplacer la photo',
    removePhoto: 'Retirer',
    photoFormats: 'JPG, PNG ou WebP · 5 Mo maximum',
    imageUrlLabel: 'Ou une URL d’image directe',
    pattern: 'Motif de fond',
    preview: 'Aperçu en direct',
    light: 'Clair',
    dark: 'Sombre',
    desktop: 'Bureau',
    mobile: 'Mobile',
    previewCaption: 'Aperçu approximatif depuis le formulaire ; la page publique sera créée à la prochaine phase.',
    promoTitle: 'Contenu promotionnel',
    promoHint: 'Textes et images affichés en haut de la page du coffret pour le vendre. Rédigez l’arabe, puis traduisez depuis les onglets de langue ci-dessus.',
    addTextBlock: 'Ajouter un texte',
    addImageBlock: 'Ajouter une image',
    blockTitle: 'Titre',
    blockBody: 'Texte',
    imageAltLabel: 'Description de l’image (alt)',
    removeBlock: 'Supprimer',
    promoEmpty: 'Aucun contenu promotionnel pour le moment.',
    detailsTitle: 'Texte des détails',
    description: 'Description',
    descriptionHint: 'Expliquez le contenu et le public sans révéler les éléments masqués.',
    faq: 'FAQ',
    question: 'Question',
    answer: 'Réponse',
    addFaq: 'Ajouter une question',
    terms: 'Conditions',
    digitalConsent: 'Texte de consentement numérique',
    digitalConsentHint: 'Affiché au paiement pour les boîtes contenant du contenu numérique.',
    publish: 'Publication et préparation',
    checklist: 'Liste de vérification',
    status: 'État actuel',
    salesCount: 'Nombre de ventes',
    ackSales: 'Je comprends que cette boîte a des ventes et je veux enregistrer des modifications commerciales.',
    ackSalesHint: 'Les modifications commerciales d’une boîte vendue exigent une confirmation explicite.',
    serverMissing: 'Exigences signalées par le serveur :',
    ready: 'Prête à être activée',
    notReady: 'Complétez les éléments manquants',
    saveFirst: 'Enregistrez d’abord la boîte pour ouvrir les achats.',
    scheduleHint2: 'La programmation exige une date de début future.',
    activateHint: 'L’activation commence la vente immédiatement jusqu’à la date de fin.',
    purchasesTitle: 'Achats de la boîte',
    purchasesSubtitle: 'Paiements, adresses, suivi et liste de colisage.',
    toShip: 'À expédier',
    shipped: 'Expédiées',
    delivered: 'Livrées',
    all: 'Toutes',
    buyer: 'Acheteur',
    amount: 'Montant',
    orderDate: 'Date',
    itemSummary: 'Contenu',
    address: 'Adresse d’expédition',
    tracking: 'Numéro de suivi',
    markShipped: 'Marquer expédiée',
    markDelivered: 'Marquer livrée',
    bulkTitle: 'Expédition groupée',
    bulkHint: 'Sélectionnez des commandes et saisissez un numéro de suivi commun. Elles seront marquées expédiées.',
    bulkTracking: 'Numéro de suivi commun',
    bulkCarrier: 'Transporteur',
    shipSelected: 'Expédier la sélection',
    selected: 'sélectionnée(s)',
    packingList: 'Liste de colisage',
    exportCsv: 'Exporter CSV',
    noPurchases: 'Aucun achat dans cet état.',
    shippedSuccess: 'Expédition enregistrée.',
    deliveredSuccess: 'Livraison enregistrée.',
    emailSkipped: 'Enregistré, mais l’e-mail d’expédition n’a pas pu être envoyé.',
    statsSales: 'Ventes',
    statsRevenue: 'Revenu',
    statsItems: 'Articles vendus',
    statsRemaining: 'Restant',
    statsViews: 'Vues',
    statsConversion: 'Conversion',
    shippingOnly: 'Cette page concerne les boîtes physiques.',
    printTitle: 'Liste de colisage',
    yes: 'Oui',
    no: 'Non',
    optional: 'Facultatif',
    save: 'Enregistrer les modifications',
    cancel: 'Annuler',
    required: 'Requis',
    order: 'Commande',
    guideTitle: 'Créez votre boîte en trois étapes',
    guideSubtitle: 'Un parcours clair : commencez par l’idée, ajoutez la valeur, puis vérifiez et publiez. Pas besoin de tout remplir d’un coup.',
    guideStep1Title: 'Définir l’offre',
    guideStep1Body: 'Nom, saison, dates et prix. Ce sont les fondations.',
    guideStep2Title: 'Construire le contenu',
    guideStep2Body: 'Ajoutez les éléments et liez-les à la bibliothèque, puis réglez l’expédition si nécessaire.',
    guideStep3Title: 'Vérifier et publier',
    guideStep3Body: 'Consultez l’aperçu et la liste de préparation, puis lancez la vente.',
    guideStart: 'Créer la première boîte',
    guideOpen: 'Comment ça marche',
    guideClose: 'Masquer le guide',
    progressTitle: 'Progression',
    progressReady: 'Toutes les exigences sont remplies',
    progressRemaining: 'étapes restantes',
    stepLabel: 'Étape',
    stageLabel: 'Phase',
    stepComplete: 'Terminé',
    stepInProgress: 'En cours',
    stepPending: 'Pas commencé',
    previousStep: 'Précédent',
    nextStep: 'Suivant',
    reviewPublish: 'Vérifier la publication',
    purposeGeneral: 'Commencez par le nom et la saison. C’est l’identité que verra le visiteur.',
    purposeSchedule: 'Définissez quand la boîte apparaît et quand la vente s’arrête. Ce sont de vraies dates, pas un compte à rebours artificiel.',
    purposeContents: 'Ajoutez ce que reçoit l’acheteur. Le contenu est identique pour tous ; les noms peuvent rester masqués jusqu’à l’achat.',
    purposePricing: 'Choisissez le prix et les limites de stock. La valeur et l’économie sont calculées automatiquement.',
    purposeShipping: 'Si la boîte contient un objet physique, définissez les pays, frais et délais de livraison.',
    purposeAppearance: 'Choisissez le bandeau et les couleurs. L’aperçu se met à jour pendant la saisie.',
    purposeDetails: 'Rédigez la description, la FAQ et les conditions. Expliquez l’expérience sans gâcher la surprise.',
    purposePublish: 'Vérifiez la liste de préparation, puis enregistrez, programmez ou activez.',
    nextAction: 'Prochaine action',
    nextDraft: 'Terminer la préparation',
    nextScheduled: 'Vérifier le calendrier',
    nextActive: 'Suivre les ventes',
    nextSoldOut: 'Vérifier les commandes',
    nextEnded: 'Vérifier la boîte',
    nextArchived: 'Voir la boîte',
    orderJourney: 'Parcours de la commande',
    journeyPaid: 'Payée',
    journeyPrepare: 'Préparer le colis',
    journeyTrack: 'Ajouter le suivi',
    journeyDelivered: 'Livrée',
    journeyHint: 'Chaque commande passe du paiement à l’emballage, à l’expédition, puis à la livraison.',
    allShipped: 'Aucune commande en attente d’expédition.'
  }
} as const;

const itemTypes = [
  'ebook',
  'printed_book',
  'story_rental',
  'badge',
  'sponsored_book_donation',
  'premium_access_days',
  'certificate',
  'physical_object'
] as const;
type ItemType = (typeof itemTypes)[number];

const physicalTypes: ItemType[] = ['printed_book', 'physical_object'];
const referenceTypes: ItemType[] = ['ebook', 'printed_book', 'story_rental', 'badge', 'sponsored_book_donation'];

type BoxState = 'draft' | 'scheduled' | 'active' | 'sold_out' | 'ended' | 'archived';
type EditorTab = 'general' | 'schedule' | 'contents' | 'pricing' | 'shipping' | 'appearance' | 'details' | 'publish';
type LanguageText = { title: string; tagline: string; description: string; digitalConsentText: string; termsText: string; faq: Array<{ question: string; answer: string }> };
type ItemDraft = {
  key: string;
  type: ItemType;
  referenceId: string;
  quantity: string;
  durationDays: string;
  displayName: string;
  teaserText: string;
  enName: string;
  enTeaser: string;
  frName: string;
  frTeaser: string;
  estimatedValue: string;
  imageUrl: string;
  isHiddenBeforePurchase: boolean;
  weightGrams: string;
  itemStock: string;
  sku: string;
};
type ShippingDraft = {
  shippingFee: string;
  freeShippingThreshold: string;
  allowedCountries: string;
  feeByCountry: Array<{ country: string; fee: string }>;
  deliveryMinDays: string;
  deliveryMaxDays: string;
  carrier: string;
  shipsFrom: string;
  shippingStartDate: string;
  note: Record<Language, string>;
};
type PromoDraft = {
  key: string;
  type: 'text' | 'image';
  imageUrl: string;
  imageAlt: string;
  title: Record<Language, string>;
  body: Record<Language, string>;
};
type AppearanceDraft = {
  headerLabel: Record<Language, string>;
  icon: string;
  colorFrom: string;
  colorTo: string;
  accentColor: string;
  animationStyle: 'none' | 'shimmer' | 'pulse' | 'sparkle';
  showCountdownInHeader: boolean;
  almostSoldOutThreshold: string;
  bannerImageUrl: string;
  seasonPatternStyle: string;
};
type BoxForm = {
  seasonLabel: string;
  timezone: string;
  priority: string;
  startAt: string;
  endAt: string;
  price: string;
  earlyBirdPrice: string;
  earlyBirdEndsAt: string;
  currency: string;
  compareAtValue: string;
  stockLimit: string;
  perUserLimit: string;
  revealMode: 'hidden_until_purchase' | 'teaser' | 'full';
  requiresShipping: boolean;
  returnPolicy: 'none' | 'standard';
  text: Record<Language, LanguageText>;
  promo: PromoDraft[];
  items: ItemDraft[];
  shipping: ShippingDraft;
  appearance: AppearanceDraft;
};
type AdminBoxItem = {
  id?: number; type: string; referenceId?: number | null; quantity?: number; durationDays?: number | null;
  displayName?: string; teaserText?: string | null; translations?: Record<string, { displayName?: string; teaserText?: string }>;
  estimatedValue?: string | number | null; imageUrl?: string | null; isHiddenBeforePurchase?: boolean;
  weightGrams?: number | null; itemStock?: number | null; sku?: string | null; sortOrder?: number;
};
type AdminBox = {
  id: number; slug: string; title: string; tagline?: string | null; seasonLabel?: string | null; status: BoxState;
  state: BoxState; startAt?: string | null; endAt?: string | null; timezone?: string | null; priority?: number;
  price: string | number; earlyBirdPrice?: string | number | null; earlyBirdEndsAt?: string | null;
  currency: string; compareAtValue?: string | number | null; stockLimit?: number | null; stockSold?: number;
  stockReserved?: number; remainingStock?: number | null; perUserLimit?: number | null;
  revealMode?: 'hidden_until_purchase' | 'teaser' | 'full'; salesCount?: number; revenue?: string | number;
  requiresShipping?: boolean; returnPolicy?: 'none' | 'standard'; translations?: Record<string, Partial<LanguageText>>; items?: AdminBoxItem[]; shipping?: Record<string, any> | null;
  appearance?: Record<string, any> | null; digitalConsentText?: string | null; description?: string | null; termsText?: string | null;
  faq?: Array<{ question: string; answer: string }> | null;
  promoBlocks?: Array<{ type?: string; title?: Record<string, string> | string | null; body?: Record<string, string> | string | null; imageUrl?: string | null; imageAlt?: string | null }> | null;
};
type BoxList = { items: AdminBox[]; total: number; page: number; limit: number };
type Purchase = {
  id: number; status: string; amountItems: string; amountShipping: string; amountTotal: string; currency: string;
  items: Array<{ id: number; type: string; displayName: string | null; teaserText?: string | null; quantity: number; isPhysical: boolean; fulfillmentStatus: string }>;
  itemCount: number; shippingAddress: Record<string, string> | null; shippingStatus: string;
  trackingNumber: string | null; carrier: string | null; createdAt: string;
  user: { id: number; name: string; email: string } | null;
};
type BoxStats = {
  sales: number; revenue: string; shippingRevenue?: string; itemsSold: number;
  stock: { limit: number | null; sold: number; reserved: number; remaining: number | null };
  detailViews: number; headerClicks: number;
  conversion: { headerClickToView: number; viewToPurchase: number };
};
type RefBook = { id: number; title: string; format?: string };
type RefStory = { id: number; title: string };
type RefBadge = { id: number; name: string; code?: string };
type RefCampaign = { id: number; title?: string; slug?: string; translations?: Record<string, { title?: string }> };

const blankText = (): LanguageText => ({ title: '', tagline: '', description: '', digitalConsentText: '', termsText: '', faq: [] });
const newItem = (): ItemDraft => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'ebook', referenceId: '', quantity: '1', durationDays: '',
  displayName: '', teaserText: '', enName: '', enTeaser: '', frName: '', frTeaser: '',
  estimatedValue: '', imageUrl: '', isHiddenBeforePurchase: true, weightGrams: '', itemStock: '', sku: ''
});
const emptyShipping = (): ShippingDraft => ({
  shippingFee: '0', freeShippingThreshold: '', allowedCountries: '', feeByCountry: [],
  deliveryMinDays: '', deliveryMaxDays: '', carrier: '', shipsFrom: '', shippingStartDate: '',
  note: { ar: '', en: '', fr: '' }
});
const emptyAppearance = (): AppearanceDraft => ({
  headerLabel: { ar: '', en: '', fr: '' }, icon: '🎁', colorFrom: '#064e3b', colorTo: '#b45309',
  accentColor: '#fbbf24', animationStyle: 'shimmer', showCountdownInHeader: true,
  almostSoldOutThreshold: '10', bannerImageUrl: '', seasonPatternStyle: 'none'
});
const emptyForm = (): BoxForm => ({
  seasonLabel: '', timezone: 'Europe/Paris', priority: '0', startAt: '', endAt: '',
  price: '', earlyBirdPrice: '', earlyBirdEndsAt: '', currency: 'EUR', compareAtValue: '',
  stockLimit: '', perUserLimit: '1', revealMode: 'hidden_until_purchase', requiresShipping: false, returnPolicy: 'none',
  text: { ar: blankText(), en: blankText(), fr: blankText() },
  promo: [],
  items: [], shipping: emptyShipping(), appearance: emptyAppearance()
});
const newPromoBlock = (type: PromoDraft['type']): PromoDraft => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type,
  imageUrl: '',
  imageAlt: '',
  title: { ar: '', en: '', fr: '' },
  body: { ar: '', en: '', fr: '' }
});

function stageFor(tab: EditorTab): { index: number; label: CopyKey } {
  if (tab === 'publish') return { index: 3, label: 'guideStep3Title' };
  if (['contents', 'pricing', 'shipping', 'appearance', 'details'].includes(tab)) return { index: 2, label: 'guideStep2Title' };
  return { index: 1, label: 'guideStep1Title' };
}

const editorSteps: Array<{ id: EditorTab; label: CopyKey; purpose: CopyKey; icon: typeof Gift }> = [
  { id: 'general', label: 'tabGeneral', purpose: 'purposeGeneral', icon: FileText },
  { id: 'schedule', label: 'tabSchedule', purpose: 'purposeSchedule', icon: CalendarDays },
  { id: 'contents', label: 'tabContents', purpose: 'purposeContents', icon: Package },
  { id: 'pricing', label: 'tabPricing', purpose: 'purposePricing', icon: Coins },
  { id: 'shipping', label: 'tabShipping', purpose: 'purposeShipping', icon: Truck },
  { id: 'appearance', label: 'tabAppearance', purpose: 'purposeAppearance', icon: Palette },
  { id: 'details', label: 'tabDetails', purpose: 'purposeDetails', icon: ScrollText },
  { id: 'publish', label: 'tabPublish', purpose: 'purposePublish', icon: Rocket }
];

function useAdminLanguage(): Language {
  const { locale = 'ar' } = useParams();
  return (['ar', 'en', 'fr'].includes(locale) ? locale : 'ar') as Language;
}

function useCopy(language: Language) {
  return (key: CopyKey) => copy[language][key] || copy.ar[key];
}

function money(value: string | number | null | undefined, currency = 'EUR', language: Language = 'ar') {
  const number = Number(value || 0);
  return new Intl.NumberFormat(language === 'ar' ? 'ar-MA' : language === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency', currency, maximumFractionDigits: 2
  }).format(Number.isFinite(number) ? number : 0);
}

function countdownLabel(endAt: string) {
  if (!endAt) return '—';
  const remaining = new Date(endAt).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return '00:00:00';
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}

function dateText(value: string | null | undefined, language: Language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(language === 'ar' ? 'ar-MA' : language === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isPhysical(type: string) {
  return physicalTypes.includes(type as ItemType);
}

function stateColor(state: string) {
  if (state === 'active') return 'bg-emerald-100 text-emerald-800';
  if (state === 'scheduled') return 'bg-sky-100 text-sky-800';
  if (state === 'sold_out') return 'bg-red-100 text-red-800';
  if (state === 'ended') return 'bg-slate-100 text-slate-700';
  if (state === 'archived') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-700';
}

function isoToWallTime(value: string | null | undefined, timeZone: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return value.slice(0, 16);
  }
}

function wallTimeToIso(value: string, timeZone: string) {
  if (!value) return null;
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(utcGuess)).map((part) => [part.type, part.value]));
    const zoneAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return new Date(utcGuess - (zoneAsUtc - utcGuess)).toISOString();
  } catch {
    return new Date(utcGuess).toISOString();
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

function statusLabel(state: string, t: (key: CopyKey) => string) {
  if (state === 'scheduled') return t('scheduled');
  if (state === 'active') return t('active');
  if (state === 'sold_out') return t('soldOut');
  if (state === 'ended') return t('ended');
  if (state === 'archived') return t('archived');
  return t('draft');
}

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{children}</span>;
}

function Loading() {
  return <div className="rounded-2xl border border-emerald-950/10 bg-white p-8 text-center text-sm text-slate-500">…</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-emerald-950/15 bg-white p-10 text-center text-sm text-slate-500">{children}</div>;
}

function ErrorBox({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{children}</div>;
}

function LanguageTabs({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return <div className="inline-flex rounded-xl border border-emerald-950/10 bg-[#f7f6f0] p-1">
    {(['ar', 'en', 'fr'] as Language[]).map((code) => <button key={code} type="button" onClick={() => onChange(code)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${language === code ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-500'}`}>{code.toUpperCase()}</button>)}
  </div>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">
    <span>{label}{required && <span className="text-red-600"> *</span>}</span>
    {children}
    {hint && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{hint}</span>}
  </label>;
}

const inputClass = 'mt-1.5 w-full rounded-xl border border-emerald-950/15 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-700';
const selectClass = inputClass;
const cardClass = 'rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-full border border-emerald-950/15 px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50';

function GuidePanel({ t, onCreate, onClose }: { t: (key: CopyKey) => string; onCreate: () => void; onClose?: () => void }) {
  const steps: Array<{ title: CopyKey; body: CopyKey }> = [
    { title: 'guideStep1Title', body: 'guideStep1Body' },
    { title: 'guideStep2Title', body: 'guideStep2Body' },
    { title: 'guideStep3Title', body: 'guideStep3Body' }
  ];
  return <section className="relative overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-gradient-to-br from-[#f7f6f0] via-white to-emerald-50/70 p-6 shadow-sm sm:p-8">
    <div className="pointer-events-none absolute -left-12 -top-16 h-48 w-48 rounded-full border border-emerald-900/10" aria-hidden="true" />
    <div className="pointer-events-none absolute -bottom-24 -right-10 h-56 w-56 rounded-full border border-amber-700/10" aria-hidden="true" />
    <div className="relative flex flex-wrap items-start justify-between gap-4">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-900"><Sparkles size={21} /></span>
        <div><h2 className="text-xl font-black text-emerald-950">{t('guideTitle')}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{t('guideSubtitle')}</p></div>
      </div>
      {onClose && <button type="button" onClick={onClose} className="rounded-full border border-emerald-950/15 bg-white/70 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white">{t('guideClose')}</button>}
    </div>
    <div className="relative mt-5 grid gap-3 md:grid-cols-3">
      {steps.map((step, index) => <div key={step.title} className="rounded-2xl border border-emerald-950/10 bg-white/80 p-4">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-900 text-xs font-black text-white">{index + 1}</span>
        <h3 className="mt-3 text-sm font-black text-emerald-950">{t(step.title)}</h3>
        <p className="mt-1 text-xs leading-6 text-slate-500">{t(step.body)}</p>
      </div>)}
    </div>
    <button type="button" onClick={onCreate} className={`${primaryButton} relative mt-5`}><Plus size={16} /> {t('guideStart')}</button>
  </section>;
}

function nextActionFor(box: AdminBox, language: Language): { label: CopyKey; to: string } {
  const base = `/${language}/admin/shop/mystery-boxes/${box.id}`;
  if (box.state === 'scheduled') return { label: 'nextScheduled', to: `${base}/edit?tab=schedule` };
  if (box.state === 'active' || box.state === 'sold_out') return { label: box.state === 'active' ? 'nextActive' : 'nextSoldOut', to: `${base}/purchases` };
  if (box.state === 'ended') return { label: 'nextEnded', to: `${base}/edit` };
  if (box.state === 'archived') return { label: 'nextArchived', to: `${base}/edit` };
  return { label: 'nextDraft', to: `${base}/edit` };
}

export function AdminMysteryBoxesPage() {
  const language = useAdminLanguage();
  const t = useCopy(language);
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState<AdminBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get<BoxList>('/admin/mystery-boxes?limit=100')
      .then((result) => { if (active) setBoxes(result.items || []); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : t('loadError')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const filtered = useMemo(() => boxes.filter((box) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${box.title} ${box.slug} ${box.seasonLabel || ''}`.toLowerCase().includes(query);
    return matchesSearch && (!state || box.state === state);
  }), [boxes, search, state]);

  const totalSales = boxes.reduce((sum, box) => sum + Number(box.salesCount || 0), 0);
  const totalRevenue = boxes.reduce((sum, box) => sum + Number(box.revenue || 0), 0);
  const activeCount = boxes.filter((box) => box.state === 'active').length;

  async function act(box: AdminBox, action: 'activate' | 'deactivate' | 'archive' | 'duplicate' | 'delete') {
    if (action === 'archive' && !window.confirm(t('confirmArchive'))) return;
    if (action === 'delete' && !window.confirm(t('confirmDelete'))) return;
    setBusy(box.id);
    setError(null);
    setNotice(null);
    try {
      if (action === 'delete') await api.delete(`/admin/mystery-boxes/${box.id}`);
      else if (action === 'duplicate') {
        const result = await api.post<{ box: AdminBox }>(`/admin/mystery-boxes/${box.id}/duplicate`, {});
        setNotice(t('duplicateSuccess'));
        navigate(`/${language}/admin/shop/mystery-boxes/${result.box.id}/edit`);
        return;
      } else {
        await api.post(`/admin/mystery-boxes/${box.id}/${action}`, {});
      }
      setNotice(t('actionSuccess'));
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setBusy(null);
    }
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Gift size={24} /></span>
        <div>
          <h1 className="text-2xl font-black text-emerald-950">{t('listTitle')}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{t('listSubtitle')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setGuideOpen((value) => !value)} className={secondaryButton} aria-expanded={guideOpen}><Lightbulb size={15} /> {t('guideOpen')}</button>
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className={secondaryButton}><RefreshCw size={15} /> {t('refresh')}</button>
        <Link to={`/${language}/admin/shop/mystery-boxes/new`} className={primaryButton}><Plus size={16} /> {t('newBox')}</Link>
      </div>
    </div>

    {error && <ErrorBox>{error}</ErrorBox>}
    {notice && <div role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div>}

    <div className="grid gap-4 sm:grid-cols-3">
      <div className={cardClass}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('activeBoxes')}</p><p className="mt-2 text-2xl font-black text-emerald-950">{activeCount}</p></div>
      <div className={cardClass}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('totalSales')}</p><p className="mt-2 text-2xl font-black text-emerald-950">{totalSales}</p></div>
      <div className={cardClass}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('totalRevenue')}</p><p className="mt-2 text-2xl font-black text-emerald-950">{money(totalRevenue, 'EUR', language)}</p></div>
    </div>

    {guideOpen && !!boxes.length && <GuidePanel t={t} onCreate={() => navigate(`/${language}/admin/shop/mystery-boxes/new`)} onClose={() => setGuideOpen(false)} />}

    <section className={cardClass}>
      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search')} aria-label={t('search')} className="min-w-56 flex-1 rounded-xl border border-emerald-950/15 px-3 py-2.5 text-sm" />
        <select value={state} onChange={(event) => setState(event.target.value)} aria-label={t('state')} className="rounded-xl border border-emerald-950/15 px-3 py-2.5 text-sm">
          <option value="">{t('allStates')}</option>
          {(['draft', 'scheduled', 'active', 'sold_out', 'ended', 'archived'] as BoxState[]).map((value) => <option key={value} value={value}>{statusLabel(value, t)}</option>)}
        </select>
      </div>

      {loading ? <div className="mt-5"><Loading /></div> : !filtered.length ? (boxes.length ? <div className="mt-5"><Empty>{t('noMatches')}</Empty></div> : <div className="mt-5"><GuidePanel t={t} onCreate={() => navigate(`/${language}/admin/shop/mystery-boxes/new`)} /></div>) : <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] text-start text-sm">
          <thead className="border-b border-emerald-950/10 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">{t('box')}</th><th className="px-3 py-3">{t('state')}</th><th className="px-3 py-3">{t('dates')}</th>
              <th className="px-3 py-3">{t('price')}</th><th className="px-3 py-3">{t('stock')}</th><th className="px-3 py-3">{t('sales')}</th><th className="px-3 py-3">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-950/5">
            {filtered.map((box) => <tr key={box.id} className="align-top">
              <td className="px-3 py-4"><Link to={`/${language}/admin/shop/mystery-boxes/${box.id}/edit`} className="font-bold text-emerald-950 hover:underline">{box.title}</Link><p className="mt-1 text-xs text-slate-500">{box.seasonLabel || '—'} · {box.slug}</p>{(() => { const next = nextActionFor(box, language); return <p className="mt-2 inline-flex flex-wrap items-center gap-1 rounded-full bg-[#f7f6f0] px-2.5 py-1 text-[11px] text-slate-500"><span>{t('nextAction')}:</span><Link to={next.to} className="font-bold text-emerald-800 hover:underline">{t(next.label)}</Link></p>; })()}</td>
              <td className="px-3 py-4"><Badge tone={stateColor(box.state)}>{statusLabel(box.state, t)}</Badge></td>
              <td className="px-3 py-4 text-xs leading-6 text-slate-600">{dateText(box.startAt, language)}<br />{dateText(box.endAt, language)}</td>
              <td className="px-3 py-4 font-bold text-emerald-950">{money(box.price, box.currency, language)}</td>
              <td className="px-3 py-4 text-xs text-slate-600">{box.remainingStock === null || box.remainingStock === undefined ? '—' : `${box.remainingStock} / ${box.stockLimit ?? '∞'}`}</td>
              <td className="px-3 py-4"><p className="font-bold">{Number(box.salesCount || 0)}</p><p className="text-xs text-slate-500">{money(box.revenue || 0, box.currency, language)}</p></td>
              <td className="px-3 py-4">
                <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-bold">
                  <Link to={`/${language}/admin/shop/mystery-boxes/${box.id}/edit`} className="text-emerald-800 hover:underline">{t('edit')}</Link>
                  <Link to={`/${language}/admin/shop/mystery-boxes/${box.id}/purchases`} className="text-emerald-800 hover:underline">{t('purchases')}</Link>
                  {box.state === 'draft' || box.state === 'scheduled' ? <button type="button" disabled={busy === box.id} onClick={() => void act(box, 'activate')} className="text-emerald-800 hover:underline disabled:opacity-50">{t('activate')}</button> : null}
                  {box.state === 'active' ? <button type="button" disabled={busy === box.id} onClick={() => void act(box, 'deactivate')} className="text-amber-800 hover:underline disabled:opacity-50">{t('deactivate')}</button> : null}
                  <button type="button" disabled={busy === box.id} onClick={() => void act(box, 'duplicate')} className="text-slate-600 hover:underline disabled:opacity-50">{t('duplicate')}</button>
                  {box.state !== 'archived' && <button type="button" disabled={busy === box.id} onClick={() => void act(box, 'archive')} className="text-slate-600 hover:underline disabled:opacity-50">{t('archive')}</button>}
                  <a href={`/${language}/mystery-box/${box.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:underline">{t('viewPublic')}<ExternalLink size={12} /></a>
                  {box.state === 'draft' && <button type="button" disabled={busy === box.id} onClick={() => void act(box, 'delete')} className="text-red-700 hover:underline disabled:opacity-50">{t('delete')}</button>}
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
  </div>;
}

export function AdminMysteryBoxEditorPage() {
  const language = useAdminLanguage();
  const t = useCopy(language);
  const navigate = useNavigate();
  const { boxId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as EditorTab | null;
  const initialTab: EditorTab = editorSteps.some((step) => step.id === requestedTab) ? requestedTab! : 'general';
  const isNew = !boxId;
  const [form, setForm] = useState<BoxForm>(emptyForm);
  const [box, setBox] = useState<AdminBox | null>(null);
  const [allBoxes, setAllBoxes] = useState<AdminBox[]>([]);
  const [books, setBooks] = useState<RefBook[]>([]);
  const [stories, setStories] = useState<RefStory[]>([]);
  const [badges, setBadges] = useState<RefBadge[]>([]);
  const [campaigns, setCampaigns] = useState<RefCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [contentLanguage, setContentLanguage] = useState<Language>('ar');
  const [previewDark, setPreviewDark] = useState(false);
  const [previewMobile, setPreviewMobile] = useState(false);
  const [ackSales, setAckSales] = useState(false);
  const [serverMissing, setServerMissing] = useState<Array<{ code: string; field?: string; itemId?: number; needed?: number }>>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      !isNew ? api.get<{ box: AdminBox }>(`/admin/mystery-boxes/${boxId}`) : Promise.resolve(null),
      api.get<BoxList>('/admin/mystery-boxes?limit=100').catch(() => ({ items: [], total: 0, page: 1, limit: 100 })),
      api.get<RefBook[]>('/admin/content/books').catch(() => []),
      api.get<RefStory[]>('/admin/content/stories').catch(() => []),
      api.get<RefBadge[]>('/admin/community/badges').catch(() => []),
      api.get<{ items: RefCampaign[] }>('/admin/money/donation-campaigns?limit=100').catch(() => ({ items: [] }))
    ]).then(([boxResult, list, bookList, storyList, badgeList, campaignList]) => {
      if (!active) return;
      setAllBoxes(list.items || []);
      setBooks(bookList || []);
      setStories(storyList || []);
      setBadges(badgeList || []);
      setCampaigns(campaignList?.items || []);
      if (boxResult?.box) {
        setBox(boxResult.box);
        setForm(formFromBox(boxResult.box, language));
      }
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : t('loadError'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxId, isNew]);

  const hasPhysical = form.requiresShipping || form.items.some((item) => isPhysical(item.type));
  const itemValue = form.items.reduce((sum, item) => sum + Number(item.estimatedValue || 0) * Math.max(1, Number(item.quantity || 1)), 0);
  const price = Number(form.price || 0);
  const savings = itemValue > 0 && price > 0 ? Math.round((1 - price / itemValue) * 100) : 0;
  const checklist = buildChecklist(form, hasPhysical, t);
  const ready = checklist.every((item) => item.ok);
  const completedSteps = editorSteps.filter((step) => stepDone(step.id)).length;
  const progress = Math.round((completedSteps / editorSteps.length) * 100);
  const sales = Number(box?.salesCount || 0);
  const overlap = findOverlap(form, allBoxes, boxId);
  const stepIndex = Math.max(0, editorSteps.findIndex((step) => step.id === tab));
  const currentStep = editorSteps[stepIndex];
  const currentStage = stageFor(tab);
  const nextStep = editorSteps[stepIndex + 1];

  function stepDone(id: EditorTab) {
    if (id === 'general') return Boolean(form.text.ar.title.trim());
    if (id === 'schedule') return Boolean(form.startAt && form.endAt && new Date(form.endAt) > new Date(form.startAt));
    if (id === 'contents') return form.items.length > 0 && form.items.every((item) => item.displayName.trim());
    if (id === 'pricing') return Number(form.price || 0) > 0 && (!hasPhysical || Number(form.stockLimit || 0) > 0);
    if (id === 'shipping') return !hasPhysical || Boolean(form.shipping.allowedCountries.trim());
    if (id === 'appearance') return Boolean(form.appearance.headerLabel.ar.trim());
    if (id === 'details') return Boolean(form.text.ar.description.trim());
    return ready;
  }

  function goToStep(id: EditorTab) {
    setTab(id);
  }

  function update(patch: Partial<BoxForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateText(patch: Partial<LanguageText>) {
    setForm((current) => ({ ...current, text: { ...current.text, [contentLanguage]: { ...current.text[contentLanguage], ...patch } } }));
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setForm((current) => ({ ...current, items: current.items.map((item) => item.key === key ? { ...item, ...patch } : item) }));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const next = [...form.items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update({ items: next });
  }

  function addItem() {
    update({ items: [...form.items, newItem()] });
  }

  async function save(action: 'draft' | 'schedule' | 'activate' = 'draft') {
    if (sales > 0 && !ackSales && action === 'draft') {
      setError(t('ackSalesHint'));
      return;
    }
    if (!form.text.ar.title.trim()) {
      setError(t('boxTitle'));
      return;
    }
    if (form.items.some((item) => !item.displayName.trim())) {
      setError(t('itemNameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setServerMissing([]);
    try {
      const payload = buildPayload(form, sales > 0 ? ackSales : false);
      let currentId: number | null = boxId ? Number(boxId) : null;
      if (currentId) await api.patch(`/admin/mystery-boxes/${currentId}`, payload);
      else {
        const created = await api.post<{ box: AdminBox }>('/admin/mystery-boxes', payload);
        currentId = created.box.id;
      }
      if (action === 'schedule') await api.post(`/admin/mystery-boxes/${currentId}/schedule`, {});
      if (action === 'activate') await api.post(`/admin/mystery-boxes/${currentId}/activate`, {});
      setNotice(t('saved'));
      if (!boxId) {
        navigate(`/${language}/admin/shop/mystery-boxes/${currentId}/edit`, { replace: true });
      } else {
        const refreshed = await api.get<{ box: AdminBox }>(`/admin/mystery-boxes/${currentId}`);
        setBox(refreshed.box);
        setForm(formFromBox(refreshed.box, language));
      }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : t('saveError');
      if (caught instanceof ApiError && caught.missing?.length) setServerMissing(caught.missing);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-7xl"><Loading /></div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Gift size={24} /></span>
        <div>
          <Link to={`/${language}/admin/shop/mystery-boxes`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-800"><ArrowLeft size={15} /> {t('back')}</Link>
          <h1 className="mt-1 text-2xl font-black text-emerald-950">{isNew ? t('createTitle') : t('editTitle')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{t('editorSubtitle')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {box && <Badge tone={stateColor(box.state)}>{statusLabel(box.state, t)}</Badge>}
        {!isNew && <button type="button" onClick={() => navigate(`/${language}/admin/shop/mystery-boxes/${boxId}/purchases`)} className={secondaryButton}><Truck size={15} /> {t('purchases')}</button>}
        <button type="button" disabled={busy} onClick={() => void save('draft')} className={primaryButton}>{busy ? '…' : t('saveDraft')}</button>
      </div>
    </div>

    {error && <ErrorBox>{error}</ErrorBox>}
    {notice && <div role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div>}

    <div className="grid items-start gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="space-y-3 xl:sticky xl:top-24">
        <div className="rounded-3xl bg-emerald-950 p-4 text-white shadow-sm">
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-emerald-100">{t('progressTitle')}</p><span className="text-xs font-black text-amber-200">{completedSteps}/{editorSteps.length}</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-amber-300 transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 flex items-center gap-1.5 text-xs leading-5 text-emerald-100/80">{ready ? <><CircleCheck size={14} /> {t('progressReady')}</> : `${editorSteps.length - completedSteps} ${t('progressRemaining')}`}</p>
          {tab !== 'publish' && <button type="button" onClick={() => goToStep('publish')} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-200 underline decoration-amber-200/40 underline-offset-4">{t('reviewPublish')} <ArrowLeft size={13} /></button>}
        </div>

        <nav role="tablist" className="flex gap-2 overflow-x-auto pb-2 xl:flex-col xl:overflow-visible xl:pb-0" aria-label={t('editTitle')}>
          {editorSteps.map((step, index) => {
            const Icon = step.icon;
            const done = stepDone(step.id);
            const active = tab === step.id;
            return <button key={step.id} type="button" role="tab" aria-selected={active} aria-current={active ? 'step' : undefined} title={t(step.purpose)} onClick={() => goToStep(step.id)} className={`flex min-w-[178px] items-center gap-3 rounded-2xl border p-3 text-start transition xl:w-full ${active ? 'border-emerald-900 bg-emerald-900 text-white shadow-sm' : 'border-emerald-950/10 bg-white text-slate-600 hover:border-emerald-900/25 hover:bg-emerald-50/50'}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${done ? 'bg-emerald-100 text-emerald-800' : active ? 'bg-white/15 text-white' : 'bg-[#f7f6f0] text-slate-500'}`}>{done ? <Check size={14} /> : index + 1}</span>
              <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-bold"><Icon size={13} className={active ? 'text-amber-200' : 'text-emerald-700'} />{t(step.label)}</span><span className={`mt-0.5 block text-[10px] ${active ? 'text-emerald-100/70' : 'text-slate-400'}`}>{done ? t('stepComplete') : active ? t('stepInProgress') : t('stepPending')}</span></span>
            </button>;
          })}
        </nav>
      </aside>

      <div className={`${cardClass} min-w-0`}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-emerald-950/10 pb-4">
          <div className="max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">{t('stageLabel')} {currentStage.index} · {t(currentStage.label)} <span className="mx-1 text-emerald-950/30">/</span> {t('stepLabel')} {stepIndex + 1} / {editorSteps.length}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(currentStep.purpose)}</p>
          </div>
          <Badge tone={stepDone(tab) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}>{stepDone(tab) ? t('stepComplete') : t('stepInProgress')}</Badge>
        </div>
        {tab === 'general' && <GeneralTab form={form} update={update} contentLanguage={contentLanguage} setContentLanguage={setContentLanguage} t={t} />}
        {tab === 'schedule' && <ScheduleTab form={form} update={update} overlap={overlap} t={t} />}
        {tab === 'contents' && <ContentsTab form={form} update={update} updateItem={updateItem} moveItem={moveItem} addItem={addItem} books={books} stories={stories} badges={badges} campaigns={campaigns} itemValue={itemValue} savings={savings} t={t} />}
        {tab === 'pricing' && <PricingTab form={form} update={update} itemValue={itemValue} savings={savings} hasPhysical={hasPhysical} t={t} />}
        {tab === 'shipping' && <ShippingTab form={form} update={update} hasPhysical={hasPhysical} contentLanguage={contentLanguage} setContentLanguage={setContentLanguage} t={t} />}
        {tab === 'appearance' && <AppearanceTab form={form} update={update} itemValue={itemValue} contentLanguage={contentLanguage} setContentLanguage={setContentLanguage} previewDark={previewDark} setPreviewDark={setPreviewDark} previewMobile={previewMobile} setPreviewMobile={setPreviewMobile} t={t} />}
        {tab === 'details' && <DetailsTab form={form} update={update} updateText={updateText} contentLanguage={contentLanguage} setContentLanguage={setContentLanguage} t={t} />}
        {tab === 'publish' && <PublishTab box={box} form={form} checklist={checklist} ready={ready} sales={sales} serverMissing={serverMissing} ackSales={ackSales} setAckSales={setAckSales} busy={busy} onSave={save} language={language} t={t} />}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-950/10 pt-4">
          <button type="button" disabled={stepIndex === 0} onClick={() => stepIndex > 0 && goToStep(editorSteps[stepIndex - 1].id)} className={secondaryButton}>{t('previousStep')}</button>
          {nextStep ? <button type="button" onClick={() => goToStep(nextStep.id)} className={primaryButton}>{t('nextStep')}: {t(nextStep.label)} {language === 'ar' ? '←' : '→'}</button> : <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{t('reviewPublish')}</span>}
        </div>
      </div>
    </div>
  </div>;
}

function GeneralTab({ form, update, contentLanguage, setContentLanguage, t }: { form: BoxForm; update: (patch: Partial<BoxForm>) => void; contentLanguage: Language; setContentLanguage: (language: Language) => void; t: (key: CopyKey) => string }) {
  const text = form.text[contentLanguage];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black text-emerald-950">{t('tabGeneral')}</h2><LanguageTabs language={contentLanguage} onChange={setContentLanguage} /></div>
    <p className="rounded-xl bg-[#f7f6f0] p-3 text-xs leading-6 text-slate-600">{t('requiredArabic')}</p>
    <Field label={t('boxTitle')} required={contentLanguage === 'ar'}>
      <input dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} required={contentLanguage === 'ar'} value={text.title} onChange={(event) => setFormText(update, form, contentLanguage, { title: event.target.value })} className={inputClass} />
    </Field>
    <Field label={t('tagline')}><input dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={text.tagline} onChange={(event) => setFormText(update, form, contentLanguage, { tagline: event.target.value })} className={inputClass} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('seasonLabel')}><input value={form.seasonLabel} onChange={(event) => update({ seasonLabel: event.target.value })} className={inputClass} placeholder="رمضان 1448" /></Field>
      <Field label={t('priority')} hint={t('priorityHint')}><input type="number" value={form.priority} onChange={(event) => update({ priority: event.target.value })} className={inputClass} /></Field>
    </div>
    <Field label={t('returnPolicy')} hint={t('returnPolicyHint')}>
      <select value={form.returnPolicy} onChange={(event) => update({ returnPolicy: event.target.value === 'standard' ? 'standard' : 'none' })} className={inputClass}>
        <option value="none">{t('returnPolicyNone')}</option>
        <option value="standard">{t('returnPolicyStandard')}</option>
      </select>
    </Field>
  </div>;
}

function setFormText(update: (patch: Partial<BoxForm>) => void, form: BoxForm, language: Language, patch: Partial<LanguageText>) {
  update({ text: { ...form.text, [language]: { ...form.text[language], ...patch } } });
}

function ScheduleTab({ form, update, overlap, t }: { form: BoxForm; update: (patch: Partial<BoxForm>) => void; overlap: AdminBox | null; t: (key: CopyKey) => string }) {
  return <div className="space-y-5">
    <h2 className="text-lg font-black text-emerald-950">{t('tabSchedule')}</h2>
    <p className="rounded-xl bg-[#f7f6f0] p-3 text-xs leading-6 text-slate-600">{t('scheduleHint')}</p>
    <Field label={t('timezone')} hint={t('timezoneHint')}><input dir="ltr" value={form.timezone} onChange={(event) => update({ timezone: event.target.value })} className={`${inputClass} text-left`} placeholder="Europe/Paris" /></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('startsAt')}><input type="datetime-local" value={form.startAt} onChange={(event) => update({ startAt: event.target.value })} className={inputClass} /></Field>
      <Field label={t('endsAt')}><input type="datetime-local" value={form.endAt} onChange={(event) => update({ endAt: event.target.value })} className={inputClass} /></Field>
    </div>
    {overlap && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">{t('overlapWarning')} <span className="font-normal">({overlap.title})</span></div>}
    <div className="rounded-xl border border-emerald-950/10 p-4 text-sm text-slate-600">{form.startAt && form.endAt && new Date(form.startAt) >= new Date(form.endAt) ? <span className="font-bold text-red-700">{t('notReady')}</span> : t('scheduleHint2')}</div>
  </div>;
}

function ContentsTab({ form, update, updateItem, moveItem, addItem, books, stories, badges, campaigns, itemValue, savings, t }: {
  form: BoxForm; update: (patch: Partial<BoxForm>) => void; updateItem: (key: string, patch: Partial<ItemDraft>) => void;
  moveItem: (index: number, direction: -1 | 1) => void; addItem: () => void; books: RefBook[]; stories: RefStory[];
  badges: RefBadge[]; campaigns: RefCampaign[]; itemValue: number; savings: number; t: (key: CopyKey) => string;
}) {
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black text-emerald-950">{t('tabContents')}</h2><button type="button" onClick={addItem} className={primaryButton}><Plus size={15} /> {t('addItem')}</button></div>
    <p className="rounded-xl bg-[#f7f6f0] p-3 text-xs leading-6 text-slate-600">{t('contentsHint')}</p>
    {!form.items.length && <Empty>{t('noItems')}</Empty>}
    <div className="space-y-4">{form.items.map((item, index) => <article key={item.key} className="rounded-2xl border border-emerald-950/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-800">{index + 1}</span><Badge tone={isPhysical(item.type) ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}>{isPhysical(item.type) ? t('physicalTag') : t('digitalTag')}</Badge></div>
        <div className="flex gap-2">
          <button type="button" aria-label={t('moveUp')} onClick={() => moveItem(index, -1)} disabled={index === 0} className="rounded-lg border p-1.5 disabled:opacity-30"><ArrowUp size={14} /></button>
          <button type="button" aria-label={t('moveDown')} onClick={() => moveItem(index, 1)} disabled={index === form.items.length - 1} className="rounded-lg border p-1.5 disabled:opacity-30"><ArrowDown size={14} /></button>
          <button type="button" onClick={() => update({ items: form.items.filter((entry) => entry.key !== item.key) })} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-xs font-bold text-red-700"><Trash2 size={13} /> {t('remove')}</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t('itemType')}><select value={item.type} onChange={(event) => updateItem(item.key, { type: event.target.value as ItemType, referenceId: '' })} className={selectClass}>
          {itemTypes.map((type) => <option key={type} value={type}>{typeLabel(type, t)}</option>)}
        </select></Field>
        {referenceTypes.includes(item.type) ? <Field label={t('linkedContent')}><select value={item.referenceId} onChange={(event) => updateItem(item.key, { referenceId: event.target.value })} className={selectClass}>
          <option value="">{t('selectContent')}</option>
          {referenceOptions(item.type, books, stories, badges, campaigns).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></Field> : <div className="rounded-xl bg-[#f7f6f0] p-3 text-xs leading-6 text-slate-500">{t('optional')}</div>}
        <Field label={t('displayName')}><input dir="rtl" value={item.displayName} onChange={(event) => updateItem(item.key, { displayName: event.target.value })} className={inputClass} /></Field>
        <Field label={t('estimatedValue')}><input type="number" min="0" step="0.01" value={item.estimatedValue} onChange={(event) => updateItem(item.key, { estimatedValue: event.target.value })} className={inputClass} /></Field>
        <Field label={t('quantity')}><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} className={inputClass} /></Field>
        {(item.type === 'story_rental' || item.type === 'premium_access_days') && <Field label={t('durationDays')}><input type="number" min="1" value={item.durationDays} onChange={(event) => updateItem(item.key, { durationDays: event.target.value })} className={inputClass} /></Field>}
      </div>
      <div className="mt-3"><Field label={t('teaser')}><textarea rows={2} dir="rtl" value={item.teaserText} onChange={(event) => updateItem(item.key, { teaserText: event.target.value })} className={inputClass} /></Field></div>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={item.isHiddenBeforePurchase} onChange={(event) => updateItem(item.key, { isHiddenBeforePurchase: event.target.checked })} /> {t('hideBeforePurchase')}</label>
      <details className="mt-3 rounded-xl bg-[#f7f6f0] p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-700">{t('translations')}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t('english')}><input dir="ltr" value={item.enName} onChange={(event) => updateItem(item.key, { enName: event.target.value })} className={inputClass} /></Field>
          <Field label={t('english') + ' — ' + t('teaser')}><input dir="ltr" value={item.enTeaser} onChange={(event) => updateItem(item.key, { enTeaser: event.target.value })} className={inputClass} /></Field>
          <Field label={t('french')}><input dir="ltr" value={item.frName} onChange={(event) => updateItem(item.key, { frName: event.target.value })} className={inputClass} /></Field>
          <Field label={t('french') + ' — ' + t('teaser')}><input dir="ltr" value={item.frTeaser} onChange={(event) => updateItem(item.key, { frTeaser: event.target.value })} className={inputClass} /></Field>
        </div>
      </details>
      {isPhysical(item.type) && <div className="mt-3 grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 sm:grid-cols-3">
        <Field label={t('weightGrams')}><input type="number" min="1" value={item.weightGrams} onChange={(event) => updateItem(item.key, { weightGrams: event.target.value })} className={inputClass} /></Field>
        <Field label={t('itemStock')} hint={t('itemStockHint')}><input type="number" min="0" value={item.itemStock} onChange={(event) => updateItem(item.key, { itemStock: event.target.value })} className={inputClass} /></Field>
        <Field label={t('sku')}><input dir="ltr" value={item.sku} onChange={(event) => updateItem(item.key, { sku: event.target.value })} className={`${inputClass} text-left`} /></Field>
      </div>}
    </article>)}</div>
    <div className="grid gap-3 rounded-2xl bg-emerald-950 p-4 text-white sm:grid-cols-3">
      <div><p className="text-xs text-emerald-200">{t('contentsValue')}</p><p className="mt-1 text-xl font-black">{money(itemValue, form.currency)}</p></div>
      <div><p className="text-xs text-emerald-200">{t('price')}</p><p className="mt-1 text-xl font-black">{money(form.price, form.currency)}</p></div>
      <div><p className="text-xs text-emerald-200">{t('savings')}</p><p className="mt-1 text-xl font-black">{savings > 0 ? `${savings}%` : '—'}</p></div>
    </div>
  </div>;
}

function typeLabel(type: ItemType, t: (key: CopyKey) => string) {
  return ({
    ebook: t('typeEbook'), printed_book: t('typePrinted'), story_rental: t('typeRental'), badge: t('typeBadge'),
    sponsored_book_donation: t('typeDonation'),     premium_access_days: t('typePremium'), certificate: t('typeCertificate'), physical_object: t('typePhysical')
  })[type];
}

function referenceOptions(type: ItemType, books: RefBook[], stories: RefStory[], badges: RefBadge[], campaigns: RefCampaign[]) {
  if (type === 'ebook' || type === 'printed_book') return books.map((book) => ({ id: book.id, label: `${book.title}${book.format ? ` (${book.format})` : ''}` }));
  if (type === 'story_rental') return stories.map((story) => ({ id: story.id, label: story.title }));
  if (type === 'badge') return badges.map((badge) => ({ id: badge.id, label: `${badge.name}${badge.code ? ` · ${badge.code}` : ''}` }));
  if (type === 'sponsored_book_donation') return campaigns.map((campaign) => ({ id: campaign.id, label: campaign.translations?.ar?.title || campaign.title || campaign.slug || `#${campaign.id}` }));
  return [];
}

function PricingTab({ form, update, itemValue, savings, hasPhysical, t }: { form: BoxForm; update: (patch: Partial<BoxForm>) => void; itemValue: number; savings: number; hasPhysical: boolean; t: (key: CopyKey) => string }) {
  return <div className="space-y-5">
    <h2 className="text-lg font-black text-emerald-950">{t('tabPricing')}</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('basePrice')} required><input type="number" min="0" step="0.01" value={form.price} onChange={(event) => update({ price: event.target.value })} className={inputClass} />{Number(form.price || 0) <= 0 && <span className="mt-1 block text-xs font-bold text-red-700">{t('priceError')}</span>}</Field>
      <Field label={t('currency')}><select value={form.currency} onChange={(event) => update({ currency: event.target.value })} className={selectClass}><option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option></select></Field>
      <Field label={t('earlyBird')}><input type="number" min="0" step="0.01" value={form.earlyBirdPrice} onChange={(event) => update({ earlyBirdPrice: event.target.value })} className={inputClass} /></Field>
      <Field label={t('earlyBirdEndsAt')}><input type="datetime-local" value={form.earlyBirdEndsAt} onChange={(event) => update({ earlyBirdEndsAt: event.target.value })} className={inputClass} /></Field>
      <Field label={t('compareAtValue')} hint={t('compareHint')}><input type="number" min="0" step="0.01" value={form.compareAtValue} onChange={(event) => update({ compareAtValue: event.target.value })} className={inputClass} /></Field>
      <Field label={t('revealMode')}><select value={form.revealMode} onChange={(event) => update({ revealMode: event.target.value as BoxForm['revealMode'] })} className={selectClass}><option value="hidden_until_purchase">{t('revealHidden')}</option><option value="teaser">{t('revealTeaser')}</option><option value="full">{t('revealFull')}</option></select></Field>
      <Field label={t('stockLimit')} hint={t('stockHint')} required={hasPhysical}><input type="number" min="0" value={form.stockLimit} onChange={(event) => update({ stockLimit: event.target.value })} className={inputClass} /></Field>
      <Field label={t('perUserLimit')}><input type="number" min="1" value={form.perUserLimit} onChange={(event) => update({ perUserLimit: event.target.value })} className={inputClass} /></Field>
    </div>
    <div className="rounded-2xl bg-[#f7f6f0] p-4">
      <h3 className="text-sm font-black text-emerald-950">{t('priceSummary')}</h3>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><p>{t('contentsValue')}: <strong>{money(itemValue, form.currency)}</strong></p><p>{t('price')}: <strong>{money(form.price, form.currency)}</strong></p><p>{t('savings')}: <strong>{savings > 0 ? `${savings}%` : '—'}</strong></p></div>
    </div>
  </div>;
}

function ShippingTab({ form, update, hasPhysical, contentLanguage, setContentLanguage, t }: {
  form: BoxForm; update: (patch: Partial<BoxForm>) => void; hasPhysical: boolean; contentLanguage: Language;
  setContentLanguage: (language: Language) => void; t: (key: CopyKey) => string;
}) {
  const shipping = form.shipping;
  const hasPhysicalItems = form.items.some((item) => isPhysical(item.type));
  const setShipping = (patch: Partial<ShippingDraft>) => update({ shipping: { ...shipping, ...patch } });
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black text-emerald-950">{t('tabShipping')}</h2><LanguageTabs language={contentLanguage} onChange={setContentLanguage} /></div>
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-950/10 bg-white p-4">
      <input
        type="checkbox"
        checked={hasPhysical}
        disabled={hasPhysicalItems}
        onChange={(event) => update({ requiresShipping: event.target.checked })}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-black text-emerald-950">{t('physicalBox')}</span>
        <span className="mt-1 block text-xs leading-6 text-slate-500">{t('physicalBoxHint')}</span>
        {hasPhysicalItems && <span className="mt-1 block text-xs font-bold text-amber-800">{t('physicalLocked')}</span>}
      </span>
    </label>
    {!hasPhysical ? <div className="rounded-xl border border-emerald-950/10 bg-[#f7f6f0] p-4 text-sm text-slate-600">{t('noShipping')}</div> : <>
      <p className="rounded-xl bg-[#f7f6f0] p-3 text-xs leading-6 text-slate-600">{t('shippingHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('shippingFee')}><input type="number" min="0" step="0.01" value={shipping.shippingFee} onChange={(event) => setShipping({ shippingFee: event.target.value })} className={inputClass} /></Field>
        <Field label={t('freeThreshold')}><input type="number" min="0" step="0.01" value={shipping.freeShippingThreshold} onChange={(event) => setShipping({ freeShippingThreshold: event.target.value })} className={inputClass} /></Field>
        <Field label={t('deliveryMin')}><input type="number" min="1" value={shipping.deliveryMinDays} onChange={(event) => setShipping({ deliveryMinDays: event.target.value })} className={inputClass} /></Field>
        <Field label={t('deliveryMax')}><input type="number" min="1" value={shipping.deliveryMaxDays} onChange={(event) => setShipping({ deliveryMaxDays: event.target.value })} className={inputClass} /></Field>
        <Field label={t('carrier')}><input value={shipping.carrier} onChange={(event) => setShipping({ carrier: event.target.value })} className={inputClass} /></Field>
        <Field label={t('shipsFrom')}><input value={shipping.shipsFrom} onChange={(event) => setShipping({ shipsFrom: event.target.value })} className={inputClass} /></Field>
        <Field label={t('shippingStart')}><input type="datetime-local" value={shipping.shippingStartDate} onChange={(event) => setShipping({ shippingStartDate: event.target.value })} className={inputClass} /></Field>
        <Field label={t('allowedCountries')} hint={t('allowedHint')}><input dir="ltr" value={shipping.allowedCountries} onChange={(event) => setShipping({ allowedCountries: event.target.value.toUpperCase() })} className={`${inputClass} text-left`} placeholder="FR,BE,NL" /></Field>
      </div>
      <div>
        <div className="flex items-center justify-between"><h3 className="text-sm font-black text-emerald-950">{t('countryFees')}</h3><button type="button" onClick={() => setShipping({ feeByCountry: [...shipping.feeByCountry, { country: '', fee: '' }] })} className={secondaryButton}><Plus size={14} /> {t('addCountry')}</button></div>
        <div className="mt-3 space-y-2">{shipping.feeByCountry.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input aria-label={t('country')} placeholder={t('country')} value={row.country} onChange={(event) => setShipping({ feeByCountry: shipping.feeByCountry.map((entry, entryIndex) => entryIndex === index ? { ...entry, country: event.target.value.toUpperCase() } : entry) })} className={inputClass} />
          <input aria-label={t('fee')} placeholder={t('fee')} type="number" min="0" step="0.01" value={row.fee} onChange={(event) => setShipping({ feeByCountry: shipping.feeByCountry.map((entry, entryIndex) => entryIndex === index ? { ...entry, fee: event.target.value } : entry) })} className={inputClass} />
          <button type="button" aria-label={t('remove')} onClick={() => setShipping({ feeByCountry: shipping.feeByCountry.filter((_, entryIndex) => entryIndex !== index) })} className="rounded-xl border border-red-200 px-3 text-red-700"><X size={15} /></button>
        </div>)}</div>
      </div>
      <Field label={t('shippingNote')} hint={t('shippingNoteHint')}><textarea rows={3} dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={shipping.note[contentLanguage]} onChange={(event) => setShipping({ note: { ...shipping.note, [contentLanguage]: event.target.value } })} className={inputClass} /></Field>
    </>}
  </div>;
}

function AppearanceTab({ form, update, itemValue, contentLanguage, setContentLanguage, previewDark, setPreviewDark, previewMobile, setPreviewMobile, t }: {
  form: BoxForm; update: (patch: Partial<BoxForm>) => void; itemValue: number; contentLanguage: Language; setContentLanguage: (language: Language) => void;
  previewDark: boolean; setPreviewDark: (value: boolean) => void; previewMobile: boolean; setPreviewMobile: (value: boolean) => void; t: (key: CopyKey) => string;
}) {
  const appearance = form.appearance;
  const setAppearance = (patch: Partial<AppearanceDraft>) => update({ appearance: { ...appearance, ...patch } });
  const imageInput = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const [cropRequest, setCropRequest] = useState<CropRequest | null>(null);

  async function uploadImage(file: File | null) {
    if (!file) return;
    setImageError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError(t('photoFormats'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError(t('photoFormats'));
      return;
    }
    setImageBusy(true);
    try {
      const uploaded = await api.uploadFile<{ url: string }>('/admin/content/images', file, { role: 'cover' });
      if (!uploaded?.url) throw new Error(t('photoFormats'));
      setAppearance({ bannerImageUrl: uploaded.url });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : t('photoFormats'));
    } finally {
      setImageBusy(false);
      if (imageInput.current) imageInput.current.value = '';
    }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black text-emerald-950">{t('tabAppearance')}</h2><LanguageTabs language={contentLanguage} onChange={setContentLanguage} /></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <Field label={t('headerLabel')}><input dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={appearance.headerLabel[contentLanguage]} onChange={(event) => setAppearance({ headerLabel: { ...appearance.headerLabel, [contentLanguage]: event.target.value } })} className={inputClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('icon')}><input value={appearance.icon} onChange={(event) => setAppearance({ icon: event.target.value })} className={inputClass} /></Field>
          <Field label={t('animation')}><select value={appearance.animationStyle} onChange={(event) => setAppearance({ animationStyle: event.target.value as AppearanceDraft['animationStyle'] })} className={selectClass}><option value="none">{t('animationNone')}</option><option value="shimmer">{t('animationShimmer')}</option><option value="pulse">{t('animationPulse')}</option><option value="sparkle">{t('animationSparkle')}</option></select></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('colorFrom')}><input type="color" value={appearance.colorFrom} onChange={(event) => setAppearance({ colorFrom: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border" /><input dir="ltr" value={appearance.colorFrom} onChange={(event) => setAppearance({ colorFrom: event.target.value })} className={`${inputClass} text-left`} /></Field>
          <Field label={t('colorTo')}><input type="color" value={appearance.colorTo} onChange={(event) => setAppearance({ colorTo: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border" /><input dir="ltr" value={appearance.colorTo} onChange={(event) => setAppearance({ colorTo: event.target.value })} className={`${inputClass} text-left`} /></Field>
          <Field label={t('accent')}><input type="color" value={appearance.accentColor} onChange={(event) => setAppearance({ accentColor: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border" /><input dir="ltr" value={appearance.accentColor} onChange={(event) => setAppearance({ accentColor: event.target.value })} className={`${inputClass} text-left`} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('almostSoldOut')}><input type="number" min="1" value={appearance.almostSoldOutThreshold} onChange={(event) => setAppearance({ almostSoldOutThreshold: event.target.value })} className={inputClass} /></Field>
          <Field label={t('pattern')}><select value={appearance.seasonPatternStyle} onChange={(event) => setAppearance({ seasonPatternStyle: event.target.value })} className={selectClass}>{['none', 'stars', 'geometric', 'confetti'].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
        </div>
        <Field label={t('banner')} hint={t('boxImageHint')}>
          <div className="overflow-hidden rounded-xl border border-emerald-950/10 bg-[#FBF7EF]">
            <div className="relative aspect-[3/2] bg-[#123B30]">
              <div className="absolute inset-0 grid place-items-center text-[#D8C08A]/60" aria-hidden="true"><Gift size={30} strokeWidth={1.2} /></div>
              {appearance.bannerImageUrl && (
                <img src={appearance.bannerImageUrl} alt={t('banner')} className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-emerald-950/10 p-3">
              <button type="button" onClick={() => imageInput.current?.click()} disabled={imageBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                {imageBusy ? <Loader2 size={14} className="animate-spin" /> : appearance.bannerImageUrl ? <ImagePlus size={14} /> : <UploadCloud size={14} />}
                {appearance.bannerImageUrl ? t('replacePhoto') : t('uploadPhoto')}
              </button>
              {appearance.bannerImageUrl && (
                <button type="button" onClick={() => { setImageError(''); setAppearance({ bannerImageUrl: '' }); }} disabled={imageBusy} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-60">
                  <Trash2 size={13} /> {t('removePhoto')}
                </button>
              )}
              <span className="text-[11px] text-slate-500">{t('photoFormats')}</span>
              <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0] || null;
                event.currentTarget.value = '';
                if (!file) return;
                setImageError('');
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                  setImageError(t('photoFormats'));
                  return;
                }
                setCropRequest({ file, role: 'cover', ratio: '3:2' });
              }} />
            </div>
          </div>
          {imageError && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{imageError}</p>}
          {cropRequest && <ImageCropper
            request={cropRequest}
            language={contentLanguage}
            busy={imageBusy}
            onCancel={() => setCropRequest(null)}
            onConfirm={async (file) => { await uploadImage(file); setCropRequest(null); }}
          />}
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            {t('imageUrlLabel')}
            <input dir="ltr" value={appearance.bannerImageUrl} onChange={(event) => setAppearance({ bannerImageUrl: event.target.value })} className={`${inputClass} text-left`} placeholder="https://…" />
          </label>
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={appearance.showCountdownInHeader} onChange={(event) => setAppearance({ showCountdownInHeader: event.target.checked })} /> {t('showCountdown')}</label>
      </div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-emerald-950">{t('preview')}</h3>
          <div className="flex gap-1 rounded-xl border p-1 text-xs font-bold">
            <button type="button" onClick={() => setPreviewDark(false)} className={`rounded-lg px-2 py-1 ${!previewDark ? 'bg-emerald-900 text-white' : 'text-slate-600'}`}>{t('light')}</button>
            <button type="button" onClick={() => setPreviewDark(true)} className={`rounded-lg px-2 py-1 ${previewDark ? 'bg-emerald-900 text-white' : 'text-slate-600'}`}>{t('dark')}</button>
            <button type="button" onClick={() => setPreviewMobile(false)} className={`rounded-lg px-2 py-1 ${!previewMobile ? 'bg-emerald-900 text-white' : 'text-slate-600'}`}>{t('desktop')}</button>
            <button type="button" onClick={() => setPreviewMobile(true)} className={`rounded-lg px-2 py-1 ${previewMobile ? 'bg-emerald-900 text-white' : 'text-slate-600'}`}>{t('mobile')}</button>
          </div>
        </div>
        <div className={`mt-3 overflow-hidden rounded-2xl border ${previewDark ? 'border-slate-700 bg-slate-950 text-white' : 'border-emerald-950/10 bg-[#FBF7EF] text-emerald-950'} ${previewMobile ? 'mx-auto max-w-[360px]' : ''}`}>
          <div className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${previewDark ? 'border-white/10' : 'border-emerald-950/10'}`}><span className="text-xs font-black">حكايات إسلامية</span><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: appearance.accentColor, color: '#1f2937' }}>{t('preview')}</span></div>
          <div className="p-4">
            {appearance.bannerImageUrl && <div className="mb-3 aspect-[3/2] overflow-hidden rounded-xl border border-emerald-950/10 bg-[#123B30]"><img src={appearance.bannerImageUrl} alt="" className="h-full w-full object-cover" /></div>}
            <div className="relative overflow-hidden rounded-xl p-4 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${appearance.colorFrom}, ${appearance.colorTo})` }}>
              {appearance.seasonPatternStyle !== 'none' && <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden="true">{appearance.seasonPatternStyle === 'stars' ? '✦ ✧ ✦ ✧ ✦ ✧ ✦ ✧' : appearance.seasonPatternStyle === 'confetti' ? '● ▲ ■ ● ▲ ■ ● ▲' : '◇ ◇ ◇ ◇ ◇ ◇ ◇ ◇'}</div>}
              <div className="relative flex items-center gap-2 text-xs font-bold"><span>{appearance.icon || '🎁'}</span><span>{appearance.headerLabel[contentLanguage] || form.text[contentLanguage].title || t('newBox')}</span>{appearance.showCountdownInHeader && <span className="mr-auto rounded-full bg-black/20 px-2 py-0.5 text-[10px]">{countdownLabel(form.endAt)}</span>}</div>
            </div>
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">{form.seasonLabel || t('season')}</p>
              <h4 className="mt-1 text-lg font-black leading-7">{form.text[contentLanguage].title || t('boxTitle')}</h4>
              <p className="mt-1 text-xs leading-5 opacity-70">{form.text[contentLanguage].tagline || t('tagline')}</p>
              <div className="mt-3 flex items-center gap-2"><span className="text-lg font-black">{money(form.price || 0, form.currency)}</span>{itemValue > Number(form.price || 0) && <span className="text-xs line-through opacity-50">{money(itemValue, form.currency)}</span>}</div>
              <div className="mt-3 rounded-lg px-3 py-2 text-center text-xs font-bold" style={{ backgroundColor: appearance.accentColor, color: '#1f2937' }}>{t('viewPublic')}</div>
            </div>
          </div>
        </div>
        <div className="mt-4">
          {(() => {
            const previewBox: ActiveMysteryBox = {
              slug: 'preview',
              state: 'active',
              label: form.text[contentLanguage].title || 'Mystery box',
              seasonLabel: form.seasonLabel || '',
              icon: appearance.icon || '🎁',
              colorFrom: appearance.colorFrom || '#064e3b',
              colorTo: appearance.colorTo || '#b45309',
              accentColor: appearance.accentColor || '#fbbf24',
              animationStyle: appearance.animationStyle || 'shimmer',
              showCountdownInHeader: appearance.showCountdownInHeader,
              bannerImage: appearance.bannerImageUrl || null,
              startsAt: new Date().toISOString(),
              endsAt: form.endAt ? new Date(form.endAt).toISOString() : new Date(Date.now() + 604_800_000).toISOString(),
              serverTime: new Date().toISOString(),
              remaining: null,
              stockTotal: null,
              almostSoldOut: false,
              price: { amount: String(form.price || 0), currency: form.currency || 'EUR', tier: 'standard' },
              itemCount: form.items.filter((item) => item.type).length,
              perUserLimit: Math.max(1, Number(form.perUserLimit) || 1),
              requiresShipping: form.requiresShipping,
              needsDigitalConsent: true
            };
            const palette = cardPalette(previewBox);
            const ratio = contrastRatio(palette.accent, palette.ground);
            return (
              <div className={`mx-auto ${previewMobile ? 'max-w-[360px]' : 'max-w-[420px]'}`}>
                <MysteryBoxCard box={previewBox} language={contentLanguage} onBuy={() => {}} />
                <p className={`mt-2 rounded-xl p-3 text-xs font-bold leading-6 ${ratio >= 4.5 ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-800'}`}>
                  {ratio >= 4.5
                    ? `معاينة البطاقة الفعلية. تباين اللون المميز ${ratio.toFixed(1)}:1 (AA). ألوانك تُستخدم كإضاءة فقط على خلفية خضراء داكنة.`
                    : `تحذير تباين: اللون المميز ${ratio.toFixed(1)}:1 أقل من 4.5:1، لذا ستظهر النصوص والزر بالذهبي تلقائيًا.`}
                </p>
              </div>
            );
          })()}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">{t('previewCaption')}</p>
      </div>
    </div>
  </div>;
}

function promoText(value: Record<string, string> | string | null | undefined, language: Language) {
  if (typeof value === 'string') return language === 'ar' ? value : '';
  if (!value || typeof value !== 'object') return '';
  return value[language] || '';
}

function PromoEditor({ form, update, contentLanguage, t }: {
  form: BoxForm; update: (patch: Partial<BoxForm>) => void; contentLanguage: Language; t: (key: CopyKey) => string;
}) {
  const promo = form.promo;
  // One file input per image block: a single shared ref made every upload land
  // in the last block of the list.
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const patchBlock = (key: string, patch: Partial<PromoDraft>) =>
    update({ promo: promo.map((block) => block.key === key ? { ...block, ...patch } : block) });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= promo.length) return;
    const next = [...promo];
    [next[index], next[target]] = [next[target], next[index]];
    update({ promo: next });
  };
  async function upload(key: string, file: File | null) {
    if (!file) return;
    setUploadError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setUploadError(t('photoFormats'));
      return;
    }
    setBusyKey(key);
    try {
      const uploaded = await api.uploadFile<{ url: string }>('/admin/content/images', file, { role: 'cover' });
      if (!uploaded?.url) throw new Error(t('photoFormats'));
      patchBlock(key, { imageUrl: uploaded.url });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t('photoFormats'));
    } finally {
      setBusyKey(null);
      const field = inputs.current[key];
      if (field) field.value = '';
    }
  }
  return <div className="rounded-2xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-black text-emerald-950">{t('promoTitle')}</h3>
        <p className="mt-1 text-xs leading-6 text-slate-600">{t('promoHint')}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => update({ promo: [...promo, newPromoBlock('text')] })} className={secondaryButton}><FileText size={14} /> {t('addTextBlock')}</button>
        <button type="button" onClick={() => update({ promo: [...promo, newPromoBlock('image')] })} className={secondaryButton}><ImagePlus size={14} /> {t('addImageBlock')}</button>
      </div>
    </div>
    {uploadError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">{uploadError}</p>}
    {promo.length === 0 && <p className="mt-3 text-xs text-slate-500">{t('promoEmpty')}</p>}
    <div className="mt-3 space-y-3">
      {promo.map((block, index) => (
        <div key={block.key} className="rounded-xl border bg-[#FBF7EF] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-emerald-900">
              {block.type === 'image' ? <ImagePlus size={12} /> : <FileText size={12} />}
              {block.type === 'image' ? t('addImageBlock') : t('addTextBlock')}
            </span>
            <div className="flex gap-1">
              <button type="button" aria-label={t('moveUp')} onClick={() => move(index, -1)} disabled={index === 0} className="rounded-lg border bg-white p-1.5 text-slate-700 disabled:opacity-40"><ArrowUp size={13} /></button>
              <button type="button" aria-label={t('moveDown')} onClick={() => move(index, 1)} disabled={index === promo.length - 1} className="rounded-lg border bg-white p-1.5 text-slate-700 disabled:opacity-40"><ArrowDown size={13} /></button>
              <button type="button" aria-label={t('removeBlock')} onClick={() => update({ promo: promo.filter((item) => item.key !== block.key) })} className="rounded-lg border border-red-200 bg-white p-1.5 text-red-700"><Trash2 size={13} /></button>
            </div>
          </div>
          {block.type === 'image' && (
            <div className="mt-3 space-y-2">
              {block.imageUrl && <img src={block.imageUrl} alt={block.imageAlt} className="aspect-[16/9] w-full rounded-lg border object-cover" />}
              <div className="flex flex-wrap items-center gap-2">
                <input ref={(element) => { inputs.current[block.key] = element; }} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label={t('uploadPhoto')} onChange={(event) => void upload(block.key, event.target.files?.[0] || null)} />
                <button type="button" onClick={() => inputs.current[block.key]?.click()} disabled={busyKey === block.key} className={secondaryButton}>
                  {busyKey === block.key ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} {block.imageUrl ? t('replacePhoto') : t('uploadPhoto')}
                </button>
                <input dir="ltr" value={block.imageUrl} onChange={(event) => patchBlock(block.key, { imageUrl: event.target.value })} placeholder={t('imageUrlLabel')} className={`${inputClass} flex-1 text-left`} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={block.imageAlt} onChange={(event) => patchBlock(block.key, { imageAlt: event.target.value })} placeholder={t('imageAltLabel')} className={inputClass} />
                <input dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={block.title[contentLanguage]} onChange={(event) => patchBlock(block.key, { title: { ...block.title, [contentLanguage]: event.target.value } })} placeholder={t('blockTitle')} className={inputClass} />
              </div>
            </div>
          )}
          <div className="mt-3 grid gap-2">
            {block.type === 'text' && (
              <input dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={block.title[contentLanguage]} onChange={(event) => patchBlock(block.key, { title: { ...block.title, [contentLanguage]: event.target.value } })} placeholder={t('blockTitle')} className={inputClass} />
            )}
            <textarea rows={block.type === 'image' ? 2 : 4} dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={block.body[contentLanguage]} onChange={(event) => patchBlock(block.key, { body: { ...block.body, [contentLanguage]: event.target.value } })} placeholder={t('blockBody')} className={inputClass} />
          </div>
        </div>
      ))}
    </div>
  </div>;
}

function DetailsTab({ form, update, updateText, contentLanguage, setContentLanguage, t }: {
  form: BoxForm; update: (patch: Partial<BoxForm>) => void; updateText: (patch: Partial<LanguageText>) => void; contentLanguage: Language;
  setContentLanguage: (language: Language) => void; t: (key: CopyKey) => string;
}) {
  const text = form.text[contentLanguage];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black text-emerald-950">{t('tabDetails')}</h2><LanguageTabs language={contentLanguage} onChange={setContentLanguage} /></div>
    <Field label={t('description')} hint={t('descriptionHint')}><textarea rows={7} dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={text.description} onChange={(event) => updateText({ description: event.target.value })} className={inputClass} /></Field>
    <Field label={t('digitalConsent')} hint={t('digitalConsentHint')}><textarea rows={3} dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={text.digitalConsentText} onChange={(event) => updateText({ digitalConsentText: event.target.value })} className={inputClass} /></Field>
    <div>
      <div className="flex items-center justify-between"><h3 className="text-sm font-black text-emerald-950">{t('faq')}</h3><button type="button" onClick={() => updateText({ faq: [...text.faq, { question: '', answer: '' }] })} className={secondaryButton}><Plus size={14} /> {t('addFaq')}</button></div>
      <div className="mt-3 space-y-3">{text.faq.map((entry, index) => <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]">
        <input aria-label={t('question')} placeholder={t('question')} dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={entry.question} onChange={(event) => updateText({ faq: text.faq.map((item, itemIndex) => itemIndex === index ? { ...item, question: event.target.value } : item) })} className={inputClass} />
        <input aria-label={t('answer')} placeholder={t('answer')} dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={entry.answer} onChange={(event) => updateText({ faq: text.faq.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item) })} className={inputClass} />
        <button type="button" aria-label={t('remove')} onClick={() => updateText({ faq: text.faq.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-xl border border-red-200 px-3 text-red-700"><Trash2 size={15} /></button>
      </div>)}</div>
    </div>
    <Field label={t('terms')}><textarea rows={4} dir={contentLanguage === 'ar' ? 'rtl' : 'ltr'} value={text.termsText} onChange={(event) => updateText({ termsText: event.target.value })} className={inputClass} /></Field>
    <PromoEditor form={form} update={update} contentLanguage={contentLanguage} t={t} />
  </div>;
}

function PublishTab({ box, form, checklist, ready, sales, serverMissing, ackSales, setAckSales, busy, onSave, language, t }: {
  box: AdminBox | null; form: BoxForm; checklist: Array<{ label: string; ok: boolean }>; ready: boolean; sales: number;
  serverMissing: Array<{ code: string; field?: string; itemId?: number; needed?: number }>;
  ackSales: boolean; setAckSales: (value: boolean) => void; busy: boolean; onSave: (action: 'draft' | 'schedule' | 'activate') => Promise<void>;
  language: Language; t: (key: CopyKey) => string;
}) {
  return <div className="space-y-5">
    <h2 className="text-lg font-black text-emerald-950">{t('publish')}</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-[#f7f6f0] p-4"><p className="text-xs text-slate-500">{t('status')}</p><p className="mt-1 font-black">{box ? statusLabel(box.state, t) : t('draft')}</p></div>
      <div className="rounded-xl bg-[#f7f6f0] p-4"><p className="text-xs text-slate-500">{t('salesCount')}</p><p className="mt-1 font-black">{sales}</p></div>
      <div className="rounded-xl bg-[#f7f6f0] p-4"><p className="text-xs text-slate-500">{t('price')}</p><p className="mt-1 font-black">{money(form.price, form.currency, language)}</p></div>
    </div>
    <div>
      <div className="flex items-center justify-between"><h3 className="text-sm font-black text-emerald-950">{t('checklist')}</h3><Badge tone={ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}>{ready ? t('ready') : t('notReady')}</Badge></div>
      <ul className="mt-3 space-y-2">{checklist.map((item) => <li key={item.label} className="flex items-start gap-2 text-sm"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${item.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{item.ok ? <Check size={12} /> : <X size={12} />}</span><span className={item.ok ? 'text-slate-600' : 'font-semibold text-amber-900'}>{item.label}</span></li>)}</ul>
    </div>
    {!!serverMissing.length && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">{t('serverMissing')}</p><ul className="mt-2 list-inside list-disc space-y-1 font-mono text-xs">{serverMissing.map((item) => <li key={`${item.code}-${item.field || ''}-${item.itemId || ''}`}>{item.code}{item.field ? ` · ${item.field}` : ''}{item.itemId ? ` · #${item.itemId}` : ''}{item.needed ? ` · ${item.needed}` : ''}</li>)}</ul></div>}
    {sales > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><label className="flex items-start gap-2 text-sm font-semibold text-amber-950"><input type="checkbox" checked={ackSales} onChange={(event) => setAckSales(event.target.checked)} className="mt-1" /><span>{t('ackSales')}<span className="mt-1 block text-xs font-normal">{t('ackSalesHint')}</span></span></label></div>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || (sales > 0 && !ackSales)} onClick={() => void onSave('draft')} className={primaryButton}>{busy ? '…' : t('save')}</button>
      <button type="button" disabled={busy || !ready || (sales > 0 && !ackSales)} onClick={() => void onSave('schedule')} className={secondaryButton}>{t('scheduleAction')}</button>
      <button type="button" disabled={busy || !ready || (sales > 0 && !ackSales)} onClick={() => void onSave('activate')} className={secondaryButton}>{t('activateBox')}</button>
    </div>
    <p className="text-xs leading-6 text-slate-500">{t('scheduleHint2')} {t('activateHint')}</p>
    {box && <Link to={`/${language}/admin/shop/mystery-boxes/${box.id}/purchases`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-800 underline"><Truck size={14} /> {t('purchases')}</Link>}
  </div>;
}

function buildChecklist(form: BoxForm, hasPhysical: boolean, t: (key: CopyKey) => string) {
  const start = form.startAt ? new Date(form.startAt).getTime() : 0;
  const end = form.endAt ? new Date(form.endAt).getTime() : 0;
  const physicalItemsReady = !hasPhysical || form.items.filter((item) => isPhysical(item.type)).every((item) => Number(item.itemStock || 0) >= Number(item.quantity || 1) * Math.max(1, Number(form.stockLimit || 0)));
  return [
    { label: `${t('boxTitle')} (${t('arabic')})`, ok: Boolean(form.text.ar.title.trim()) },
    { label: t('noItems'), ok: form.items.length > 0 },
    { label: `${t('price')} > 0`, ok: Number(form.price || 0) > 0 },
    { label: t('dates'), ok: Boolean(form.startAt && form.endAt && end > start) },
    { label: `${t('headerLabel')} (${t('arabic')})`, ok: Boolean(form.appearance.headerLabel.ar.trim()) },
    { label: t('earlyBird'), ok: !form.earlyBirdPrice || (Number(form.earlyBirdPrice) > 0 && Number(form.earlyBirdPrice) < Number(form.price) && Boolean(form.earlyBirdEndsAt)) },
    { label: t('shippingTitle'), ok: !hasPhysical || (Number(form.stockLimit || 0) > 0 && physicalItemsReady) },
    { label: t('allowedCountries'), ok: !hasPhysical || Boolean(form.shipping.allowedCountries.trim()) }
  ];
}

function findOverlap(form: BoxForm, boxes: AdminBox[], currentId?: string) {
  if (!form.startAt || !form.endAt) return null;
  const start = new Date(form.startAt).getTime();
  const end = new Date(form.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return boxes.find((box) => {
    if (String(box.id) === String(currentId) || !box.startAt || !box.endAt || box.state === 'archived' || box.state === 'ended') return false;
    const otherStart = new Date(box.startAt).getTime();
    const otherEnd = new Date(box.endAt).getTime();
    return start < otherEnd && end > otherStart;
  }) || null;
}

function formFromBox(box: AdminBox, language: Language): BoxForm {
  const timezone = box.timezone || 'Europe/Paris';
  const baseText = (code: Language): LanguageText => {
    const translation = box.translations?.[code] || {};
    return {
      title: code === 'ar' ? box.title || '' : translation.title || '',
      tagline: code === 'ar' ? box.tagline || '' : translation.tagline || '',
      description: code === 'ar' ? box.description || '' : translation.description || '',
      digitalConsentText: code === 'ar' ? box.digitalConsentText || '' : translation.digitalConsentText || '',
      termsText: code === 'ar' ? box.termsText || '' : translation.termsText || '',
      faq: (code === 'ar' ? box.faq : translation.faq) || []
    };
  };
  const shipping: Record<string, any> = box.shipping || {};
  const appearance: Record<string, any> = box.appearance || {};
  return {
    seasonLabel: box.seasonLabel || '',
    timezone,
    priority: String(box.priority ?? 0),
    startAt: isoToWallTime(box.startAt, timezone),
    endAt: isoToWallTime(box.endAt, timezone),
    price: box.price === null || box.price === undefined ? '' : String(box.price),
    earlyBirdPrice: box.earlyBirdPrice ? String(box.earlyBirdPrice) : '',
    earlyBirdEndsAt: isoToWallTime(box.earlyBirdEndsAt, timezone),
    currency: box.currency || 'EUR',
    compareAtValue: box.compareAtValue ? String(box.compareAtValue) : '',
    stockLimit: box.stockLimit === null || box.stockLimit === undefined ? '' : String(box.stockLimit),
    perUserLimit: box.perUserLimit ? String(box.perUserLimit) : '1',
    revealMode: box.revealMode || 'hidden_until_purchase',
    requiresShipping: Boolean(box.requiresShipping) || (box.items || []).some((item) => isPhysical(item.type)),
    returnPolicy: box.returnPolicy === 'standard' ? 'standard' : 'none',
    text: { ar: baseText('ar'), en: baseText('en'), fr: baseText('fr') },
    promo: (box.promoBlocks || []).map((block, index) => ({
      key: `promo-${index}`,
      type: block.type === 'image' ? 'image' as const : 'text' as const,
      imageUrl: block.imageUrl || '',
      imageAlt: block.imageAlt || '',
      title: { ar: promoText(block.title, 'ar'), en: promoText(block.title, 'en'), fr: promoText(block.title, 'fr') },
      body: { ar: promoText(block.body, 'ar'), en: promoText(block.body, 'en'), fr: promoText(block.body, 'fr') }
    })),
    items: (box.items || []).map((item) => ({
      key: String(item.id || `${Date.now()}-${Math.random()}`),
      type: (item.type || 'ebook') as ItemType,
      referenceId: item.referenceId ? String(item.referenceId) : '',
      quantity: String(item.quantity ?? 1),
      durationDays: item.durationDays ? String(item.durationDays) : '',
      displayName: item.displayName || '',
      teaserText: item.teaserText || '',
      enName: item.translations?.en?.displayName || '',
      enTeaser: item.translations?.en?.teaserText || '',
      frName: item.translations?.fr?.displayName || '',
      frTeaser: item.translations?.fr?.teaserText || '',
      estimatedValue: item.estimatedValue ? String(item.estimatedValue) : '',
      imageUrl: item.imageUrl || '',
      isHiddenBeforePurchase: item.isHiddenBeforePurchase !== false,
      weightGrams: item.weightGrams ? String(item.weightGrams) : '',
      itemStock: item.itemStock === null || item.itemStock === undefined ? '' : String(item.itemStock),
      sku: item.sku || ''
    })),
    shipping: {
      shippingFee: shipping.shippingFee ? String(shipping.shippingFee) : '0',
      freeShippingThreshold: shipping.freeShippingThreshold ? String(shipping.freeShippingThreshold) : '',
      allowedCountries: Array.isArray(shipping.allowedCountries) ? shipping.allowedCountries.join(',') : '',
      feeByCountry: shipping.feeByCountry && typeof shipping.feeByCountry === 'object' ? Object.entries(shipping.feeByCountry).map(([country, fee]) => ({ country, fee: String(fee) })) : [],
      deliveryMinDays: shipping.estimatedDeliveryMinDays ? String(shipping.estimatedDeliveryMinDays) : '',
      deliveryMaxDays: shipping.estimatedDeliveryMaxDays ? String(shipping.estimatedDeliveryMaxDays) : '',
      carrier: shipping.carrier || '',
      shipsFrom: shipping.shipsFrom || '',
      shippingStartDate: isoToWallTime(shipping.shippingStartDate, timezone),
      note: {
        ar: shipping.shippingNote || shipping.translations?.ar?.shippingNote || '',
        en: shipping.translations?.en?.shippingNote || '',
        fr: shipping.translations?.fr?.shippingNote || ''
      }
    },
    appearance: {
      headerLabel: {
        ar: appearance.headerLabel || '',
        en: appearance.translations?.en?.headerLabel || '',
        fr: appearance.translations?.fr?.headerLabel || ''
      },
      icon: appearance.icon || '🎁',
      colorFrom: appearance.colorFrom || '#064e3b',
      colorTo: appearance.colorTo || '#b45309',
      accentColor: appearance.accentColor || '#fbbf24',
      animationStyle: appearance.animationStyle || 'shimmer',
      showCountdownInHeader: appearance.showCountdownInHeader !== false,
      almostSoldOutThreshold: String(appearance.almostSoldOutThreshold ?? 10),
      bannerImageUrl: appearance.bannerImage || '',
      seasonPatternStyle: appearance.seasonPatternStyle || 'none'
    }
  };
}

function buildPayload(form: BoxForm, acknowledgeSales: boolean) {
  const translations = Object.fromEntries((['en', 'fr'] as Language[]).map((code) => {
    const text = form.text[code];
    return [code, {
      title: text.title || undefined,
      tagline: text.tagline || undefined,
      description: text.description || undefined,
      digitalConsentText: text.digitalConsentText || undefined,
      termsText: text.termsText || undefined,
      faq: text.faq.filter((entry) => entry.question.trim() && entry.answer.trim())
    }];
  }));
  return {
    title: form.text.ar.title,
    tagline: form.text.ar.tagline || null,
    seasonLabel: form.seasonLabel || null,
    priority: Number(form.priority || 0),
    startAt: wallTimeToIso(form.startAt, form.timezone),
    endAt: wallTimeToIso(form.endAt, form.timezone),
    timezone: form.timezone,
    price: Number(form.price || 0),
    earlyBirdPrice: form.earlyBirdPrice ? Number(form.earlyBirdPrice) : null,
    earlyBirdEndsAt: wallTimeToIso(form.earlyBirdEndsAt, form.timezone),
    currency: form.currency,
    compareAtValue: form.compareAtValue ? Number(form.compareAtValue) : null,
    stockLimit: form.stockLimit ? Number(form.stockLimit) : null,
    perUserLimit: Number(form.perUserLimit || 1),
    revealMode: form.revealMode,
    requiresShipping: form.requiresShipping || form.items.some((item) => isPhysical(item.type)),
    returnPolicy: form.returnPolicy,
    description: form.text.ar.description || null,
    digitalConsentText: form.text.ar.digitalConsentText || null,
    termsText: form.text.ar.termsText || null,
    faq: form.text.ar.faq.filter((entry) => entry.question.trim() && entry.answer.trim()),
    promoBlocks: form.promo
      .map((block) => ({
        type: block.type,
        imageUrl: block.imageUrl.trim() || null,
        imageAlt: block.imageAlt.trim() || null,
        title: { ar: block.title.ar.trim(), en: block.title.en.trim(), fr: block.title.fr.trim() },
        body: { ar: block.body.ar.trim(), en: block.body.en.trim(), fr: block.body.fr.trim() }
      }))
      .filter((block) => block.type === 'image'
        ? Boolean(block.imageUrl)
        : Boolean(block.title.ar || block.body.ar || block.title.en || block.title.fr)),
    translations,
    items: form.items.map((item, index) => ({
      type: item.type,
      referenceId: item.referenceId ? Number(item.referenceId) : null,
      quantity: Math.max(1, Number(item.quantity || 1)),
      durationDays: item.durationDays ? Number(item.durationDays) : null,
      displayName: item.displayName,
      teaserText: item.teaserText || null,
      translations: {
        en: { displayName: item.enName || undefined, teaserText: item.enTeaser || undefined },
        fr: { displayName: item.frName || undefined, teaserText: item.frTeaser || undefined }
      },
      estimatedValue: item.estimatedValue ? Number(item.estimatedValue) : null,
      imageUrl: item.imageUrl || null,
      isHiddenBeforePurchase: item.isHiddenBeforePurchase,
      sortOrder: index,
      weightGrams: item.weightGrams ? Number(item.weightGrams) : null,
      itemStock: item.itemStock === '' ? null : Number(item.itemStock),
      sku: item.sku || null
    })),
    shipping: {
      shippingFee: Number(form.shipping.shippingFee || 0),
      freeShippingThreshold: form.shipping.freeShippingThreshold ? Number(form.shipping.freeShippingThreshold) : null,
      ...(form.shipping.allowedCountries.trim() ? { allowedCountries: form.shipping.allowedCountries.split(',').map((code) => code.trim().toUpperCase()).filter(Boolean) } : {}),
      feeByCountry: Object.fromEntries(form.shipping.feeByCountry.filter((row) => row.country.trim()).map((row) => [row.country.trim().toUpperCase(), Number(row.fee || 0)])),
      estimatedDeliveryMinDays: form.shipping.deliveryMinDays ? Number(form.shipping.deliveryMinDays) : undefined,
      estimatedDeliveryMaxDays: form.shipping.deliveryMaxDays ? Number(form.shipping.deliveryMaxDays) : undefined,
      carrier: form.shipping.carrier || null,
      shipsFrom: form.shipping.shipsFrom || null,
      shippingStartDate: wallTimeToIso(form.shipping.shippingStartDate, form.timezone),
      shippingNote: form.shipping.note.ar || null,
      translations: {
        en: { shippingNote: form.shipping.note.en || undefined },
        fr: { shippingNote: form.shipping.note.fr || undefined }
      }
    },
    appearance: {
      headerLabel: form.appearance.headerLabel.ar,
      icon: form.appearance.icon,
      colorFrom: form.appearance.colorFrom,
      colorTo: form.appearance.colorTo,
      accentColor: form.appearance.accentColor,
      animationStyle: form.appearance.animationStyle,
      showCountdownInHeader: form.appearance.showCountdownInHeader,
      almostSoldOutThreshold: Number(form.appearance.almostSoldOutThreshold || 10),
      bannerImage: form.appearance.bannerImageUrl || null,
      seasonPatternStyle: form.appearance.seasonPatternStyle,
      translations: {
        en: { headerLabel: form.appearance.headerLabel.en || undefined },
        fr: { headerLabel: form.appearance.headerLabel.fr || undefined }
      }
    },
    ...(acknowledgeSales ? { acknowledgeSales: true } : {})
  };
}

export function AdminMysteryBoxPurchasesPage() {
  const language = useAdminLanguage();
  const t = useCopy(language);
  const { boxId } = useParams();
  const [box, setBox] = useState<AdminBox | null>(null);
  const [stats, setStats] = useState<BoxStats | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [tab, setTab] = useState<'to_ship' | 'shipped' | 'delivered' | 'all'>('to_ship');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { trackingNumber: string; carrier: string }>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkTracking, setBulkTracking] = useState('');
  const [bulkCarrier, setBulkCarrier] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<{ box: AdminBox }>(`/admin/mystery-boxes/${boxId}`),
      api.get<BoxStats>(`/admin/mystery-boxes/${boxId}/stats`),
      api.get<{ items: Purchase[]; total: number }>(`/admin/mystery-boxes/${boxId}/purchases`)
    ]).then(([boxResult, statsResult, purchasesResult]) => {
      if (!active) return;
      setBox(boxResult.box);
      setStats(statsResult);
      setPurchases(purchasesResult.items || []);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : t('loadError'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [boxId, reloadKey]);

  const paidPurchases = purchases.filter((purchase) => ['paid', 'fulfilled', 'partially_fulfilled'].includes(purchase.status));
  const filtered = paidPurchases.filter((purchase) => tab === 'all' || purchase.shippingStatus === tab);
  const toShip = paidPurchases.filter((purchase) => purchase.shippingStatus === 'to_ship');
  const selectedToShip = selected.filter((id) => toShip.some((purchase) => purchase.id === id));
  const physical = Boolean(box?.requiresShipping) || Boolean(box?.items?.some((item) => isPhysical(item.type)));

  async function ship(purchase: Purchase, status: 'shipped' | 'delivered') {
    const draft = drafts[purchase.id] || { trackingNumber: purchase.trackingNumber || '', carrier: purchase.carrier || '' };
    const trackingNumber = (draft.trackingNumber || purchase.trackingNumber || '').trim();
    if (trackingNumber.length < 3) {
      setError(t('tracking'));
      return;
    }
    setBusyId(purchase.id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.patch<{ emailSent: boolean }>(`/admin/mystery-boxes/purchases/${purchase.id}/shipping`, {
        trackingNumber,
        carrier: draft.carrier || undefined,
        shippingStatus: status
      });
      setNotice(result.emailSent ? (status === 'shipped' ? t('shippedSuccess') : t('deliveredSuccess')) : t('emailSkipped'));
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setBusyId(null);
    }
  }

  async function shipSelected() {
    if (!bulkTracking.trim() || !selectedToShip.length) return;
    setBusyId(-1);
    setError(null);
    setNotice(null);
    try {
      for (const id of selectedToShip) {
        await api.patch(`/admin/mystery-boxes/purchases/${id}/shipping`, {
          trackingNumber: bulkTracking.trim(),
          carrier: bulkCarrier.trim() || undefined,
          shippingStatus: 'shipped'
        });
      }
      setNotice(t('shippedSuccess'));
      setSelected([]);
      setBulkTracking('');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    } finally {
      setBusyId(null);
    }
  }

  async function exportCsv() {
    try {
      const blob = await api.getBlob(`/admin/mystery-boxes/${boxId}/export.csv`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mystery-box-${boxId}-purchases.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionError'));
    }
  }

  function printPacking(purchase: Purchase) {
    const popup = window.open('', '_blank', 'width=820,height=920');
    if (!popup) return;
    const address = purchase.shippingAddress || {};
    popup.document.write(`<!doctype html><html dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escapeHtml(t('printTitle'))} #${purchase.id}</title><style>body{font-family:system-ui,sans-serif;padding:36px;color:#111}header{border-bottom:2px solid #064e3b;padding-bottom:12px;margin-bottom:20px}h1{font-size:22px;margin:0 0 4px}ul{padding-inline-start:20px;line-height:1.9}.address{background:#f7f6f0;padding:14px;border-radius:10px;margin:16px 0;line-height:1.8}small{color:#555}@media print{button{display:none}}</style></head><body><header><h1>${escapeHtml(t('printTitle'))}</h1><small>${escapeHtml(t('order'))} #${purchase.id} · ${escapeHtml(dateText(purchase.createdAt, language))}</small></header><h2>${escapeHtml(t('itemSummary'))}</h2><ul>${purchase.items.map((item) => `<li>${escapeHtml(item.displayName || item.type)} × ${item.quantity}${item.isPhysical ? ' — ' + escapeHtml(t('physicalTag')) : ''}</li>`).join('')}</ul><div class="address"><strong>${escapeHtml(t('address'))}</strong><br>${escapeHtml(address.name)} · ${escapeHtml(address.phone)}<br>${escapeHtml(address.line1)}${address.line2 ? '، ' + escapeHtml(address.line2) : ''}<br>${escapeHtml(address.postalCode)} ${escapeHtml(address.city)}، ${escapeHtml(address.country)}</div><p><small>${escapeHtml(purchase.user?.email || '')}</small></p><button onclick="window.print()">${escapeHtml(t('printTitle'))}</button></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  if (loading) return <div className="mx-auto max-w-7xl"><Loading /></div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Truck size={24} /></span>
        <div>
          <Link to={`/${language}/admin/shop/mystery-boxes`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-800"><ArrowLeft size={15} /> {t('back')}</Link>
          <h1 className="mt-1 text-2xl font-black text-emerald-950">{t('purchasesTitle')}{box ? ` · ${box.title}` : ''}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('purchasesSubtitle')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className={secondaryButton}><RefreshCw size={15} /> {t('refresh')}</button>
        <button type="button" onClick={() => void exportCsv()} className={secondaryButton}><Download size={15} /> {t('exportCsv')}</button>
      </div>
    </div>
    {error && <ErrorBox>{error}</ErrorBox>}
    {notice && <div role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div>}

    <section className="rounded-3xl border border-emerald-950/10 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black text-emerald-950">{t('orderJourney')}</h2><p className="text-xs leading-5 text-slate-500">{t('journeyHint')}</p></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {[
          { label: t('journeyPaid'), count: paidPurchases.length, icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-800' },
          { label: t('journeyPrepare'), count: toShip.length, icon: Package, tone: 'bg-amber-50 text-amber-900' },
          { label: t('journeyTrack'), count: paidPurchases.filter((purchase) => purchase.shippingStatus === 'shipped').length, icon: Truck, tone: 'bg-sky-50 text-sky-800' },
          { label: t('journeyDelivered'), count: paidPurchases.filter((purchase) => purchase.shippingStatus === 'delivered').length, icon: Check, tone: 'bg-emerald-50 text-emerald-800' }
        ].map((step, index) => {
          const Icon = step.icon;
          return <div key={step.label} className="flex items-center gap-3 rounded-2xl border border-emerald-950/10 p-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${step.tone}`}><Icon size={16} /></span>
            <div className="min-w-0"><p className="text-xs font-bold text-slate-500">{index + 1}. {step.label}</p><p className="mt-0.5 text-lg font-black text-emerald-950">{step.count}</p></div>
          </div>;
        })}
      </div>
    </section>

    {stats && <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label={t('statsSales')} value={String(stats.sales)} />
      <Stat label={t('statsRevenue')} value={money(stats.revenue, box?.currency || 'EUR', language)} />
      <Stat label={t('statsItems')} value={String(stats.itemsSold)} />
      <Stat label={t('statsRemaining')} value={stats.stock.remaining === null ? '∞' : String(stats.stock.remaining)} />
      <Stat label={t('statsViews')} value={String(stats.detailViews)} />
      <Stat label={t('statsConversion')} value={`${stats.conversion.viewToPurchase}%`} />
    </div>}

    <section className={cardClass}>
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-[#f7f6f0] p-1.5">
        {(['to_ship', 'shipped', 'delivered', 'all'] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${tab === value ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-600 hover:text-emerald-800'}`}>
          {value === 'to_ship' ? t('toShip') : value === 'shipped' ? t('shipped') : value === 'delivered' ? t('delivered') : t('all')}
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === value ? 'bg-emerald-100 text-emerald-800' : 'bg-white/70 text-slate-500'}`}>{value === 'all' ? paidPurchases.length : paidPurchases.filter((purchase) => purchase.shippingStatus === value).length}</span>
        </button>)}
      </div>

      {!physical && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('shippingOnly')}</div>}

      {tab === 'to_ship' && !!toShip.length && <div className="mt-4 rounded-2xl border border-emerald-950/10 bg-[#f7f6f0] p-4">
        <h2 className="text-sm font-black text-emerald-950">{t('bulkTitle')}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t('bulkHint')}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-slate-600">{t('bulkTracking')}<input value={bulkTracking} onChange={(event) => setBulkTracking(event.target.value)} className="mt-1 block min-w-52 rounded-xl border px-3 py-2 text-sm" /></label>
          <label className="text-xs font-bold text-slate-600">{t('bulkCarrier')}<input value={bulkCarrier} onChange={(event) => setBulkCarrier(event.target.value)} className="mt-1 block min-w-40 rounded-xl border px-3 py-2 text-sm" /></label>
          <button type="button" disabled={busyId === -1 || !bulkTracking.trim() || !selectedToShip.length} onClick={() => void shipSelected()} className={primaryButton}><Truck size={15} /> {t('shipSelected')} ({selectedToShip.length} {t('selected')})</button>
        </div>
      </div>}

      {!filtered.length ? <div className="mt-4"><Empty>{tab === 'to_ship' && paidPurchases.length ? t('allShipped') : t('noPurchases')}</Empty></div> : <div className="mt-4 space-y-3">
        {filtered.map((purchase) => {
          const draft = drafts[purchase.id] || { trackingNumber: purchase.trackingNumber || '', carrier: purchase.carrier || '' };
          const address = purchase.shippingAddress || {};
          return <article key={purchase.id} className="rounded-2xl border border-emerald-950/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {purchase.shippingStatus === 'to_ship' && <input type="checkbox" aria-label={`${t('order')} ${purchase.id}`} checked={selected.includes(purchase.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, purchase.id] : current.filter((id) => id !== purchase.id))} className="mt-1" />}
                <div>
                  <p className="font-black text-emerald-950">#{purchase.id} · {money(purchase.amountTotal, purchase.currency, language)}</p>
                  <p className="mt-1 text-sm text-slate-600">{purchase.user?.name || '—'} · {purchase.user?.email || '—'}</p>
                  <p className="mt-1 text-xs text-slate-500">{dateText(purchase.createdAt, language)} · {purchase.shippingStatus}</p>
                </div>
              </div>
              <Badge tone={purchase.shippingStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' : purchase.shippingStatus === 'shipped' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'}>{purchase.shippingStatus === 'delivered' ? t('delivered') : purchase.shippingStatus === 'shipped' ? t('shipped') : t('toShip')}</Badge>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl bg-[#f7f6f0] p-3 text-sm leading-6 text-slate-700">
                <p className="font-bold text-emerald-950">{t('address')}</p>
                {purchase.shippingAddress ? <><p>{address.name} · {address.phone}</p><p>{address.line1}{address.line2 ? `، ${address.line2}` : ''}</p><p>{address.postalCode} {address.city}، {address.country}</p></> : <p>—</p>}
              </div>
              <div className="rounded-xl border border-emerald-950/10 p-3 text-sm">
                <p className="font-bold text-emerald-950">{t('itemSummary')}</p>
                <ul className="mt-1 list-inside list-disc text-slate-600">{purchase.items.map((item) => <li key={item.id}>{item.displayName || item.type} × {item.quantity}{item.isPhysical ? ` · ${t('physicalTag')}` : ''}</li>)}</ul>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-slate-600">{t('tracking')}<input value={draft.trackingNumber} onChange={(event) => setDrafts((current) => ({ ...current, [purchase.id]: { ...draft, trackingNumber: event.target.value } }))} className="mt-1 block min-w-44 rounded-xl border px-3 py-2 text-sm" /></label>
              <label className="text-xs font-bold text-slate-600">{t('carrier')}<input value={draft.carrier} onChange={(event) => setDrafts((current) => ({ ...current, [purchase.id]: { ...draft, carrier: event.target.value } }))} className="mt-1 block min-w-36 rounded-xl border px-3 py-2 text-sm" /></label>
              {purchase.shippingStatus !== 'delivered' && <button type="button" disabled={busyId === purchase.id} onClick={() => void ship(purchase, 'shipped')} className={primaryButton}>{t('markShipped')}</button>}
              {purchase.shippingStatus === 'shipped' && <button type="button" disabled={busyId === purchase.id} onClick={() => void ship(purchase, 'delivered')} className={secondaryButton}>{t('markDelivered')}</button>}
              <button type="button" onClick={() => printPacking(purchase)} className={secondaryButton}><Printer size={15} /> {t('packingList')}</button>
            </div>
          </article>;
        })}
      </div>}
    </section>
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className={cardClass}><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-emerald-950">{value}</p></div>;
}
