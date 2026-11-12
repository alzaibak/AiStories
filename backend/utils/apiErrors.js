const languages = new Set(['ar', 'en', 'fr']);

const messages = {
  STORAGE_NOT_CONFIGURED: {
    ar: 'التخزين الخاص غير مهيأ. اضبط STORAGE_DRIVER=local أو أكمِل إعداد S3_BUCKET.',
    en: 'Private file storage is not configured. Set STORAGE_DRIVER=local or configure S3_BUCKET.',
    fr: 'Le stockage privé n’est pas configuré. Définissez STORAGE_DRIVER=local ou configurez S3_BUCKET.'
  },
  UPLOAD_TOO_LARGE: {
    ar: 'حجم الملف يتجاوز الحد المسموح.',
    en: 'The file exceeds the maximum allowed size.',
    fr: 'Le fichier dépasse la taille maximale autorisée.'
  },
  INVALID_UPLOAD: {
    ar: 'تعذر التحقق من نوع الملف. ارفع PDF أو صورة مدعومة.',
    en: 'The file type could not be verified. Upload a PDF or supported image.',
    fr: 'Le type de fichier n’a pas pu être vérifié. Envoyez un PDF ou une image prise en charge.'
  },
  PART_NUMBER_CONFLICT: {
    ar: 'الجزء {partNumber} موجود بالفعل في هذه القصة. عدّل الجزء الموجود أو اختر رقمًا آخر.',
    en: 'Part {partNumber} already exists for this story. Edit it or choose another number.',
    fr: 'La partie {partNumber} existe déjà pour cette histoire. Modifiez-la ou choisissez un autre numéro.'
  },
  VALIDATION_FAILED: {
    ar: 'يرجى تصحيح الحقول المحددة ثم إعادة المحاولة.',
    en: 'Please correct the highlighted fields and try again.',
    fr: 'Corrigez les champs signalés puis réessayez.'
  },
  UNIQUE_CONSTRAINT: {
    ar: 'توجد قيمة مماثلة بالفعل. اختر قيمة أخرى.',
    en: 'A record with the same value already exists. Choose a different value.',
    fr: 'Une valeur identique existe déjà. Choisissez-en une autre.'
  },
  SERVER_ERROR: {
    ar: 'حدث خطأ في الخادم. يرجى المحاولة لاحقًا.',
    en: 'A server error occurred. Please try again later.',
    fr: 'Une erreur serveur est survenue. Veuillez réessayer plus tard.'
  },
  BAD_REQUEST: {
    ar: 'تعذر معالجة الطلب. تحقق من البيانات المدخلة.',
    en: 'The request could not be processed. Check the submitted information.',
    fr: 'La demande n’a pas pu être traitée. Vérifiez les informations saisies.'
  }
};

const validationMessages = {
  required: {
    ar: 'هذا الحقل مطلوب.',
    en: 'This field is required.',
    fr: 'Ce champ est obligatoire.'
  },
  invalid: {
    ar: 'القيمة المدخلة غير صالحة.',
    en: 'This value is invalid.',
    fr: 'Cette valeur est invalide.'
  },
  duplicate: {
    ar: 'هذه القيمة مستخدمة بالفعل.',
    en: 'This value is already in use.',
    fr: 'Cette valeur est déjà utilisée.'
  }
};

function requestLanguage(req) {
  const queryLanguage = req.query?.lang;
  if (languages.has(queryLanguage)) return queryLanguage;
  const acceptedLanguage = req.headers?.['accept-language']
    ?.split(',')[0]
    ?.split('-')[0]
    ?.toLowerCase();
  if (languages.has(acceptedLanguage)) return acceptedLanguage;
  if (languages.has(req.user?.language)) return req.user.language;
  return 'ar';
}

function translate(dictionary, language) {
  return dictionary[language] || dictionary.ar;
}

function normalizeFieldName(value) {
  if (typeof value !== 'string' || !value) return 'form';
  return value.split('.').filter(Boolean).join('.');
}

function validationMessage(error, language) {
  const message = String(error?.message || '').toLowerCase();
  const validator = String(error?.validatorKey || error?.type || error?.code || '').toLowerCase();
  if (validator.includes('notnull') || validator.includes('required') ||
    message.includes('cannot be null') || message.includes('required')) {
    return translate(validationMessages.required, language);
  }
  if (error?.name === 'SequelizeUniqueConstraintError' || validator.includes('unique') ||
    message.includes('must be unique')) {
    return translate(validationMessages.duplicate, language);
  }
  return translate(validationMessages.invalid, language);
}

function fieldErrors(error, language) {
  const result = {};
  const issues = error?.issues || error?.errors || error?.details;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      const field = normalizeFieldName(issue?.path?.join?.('.') || issue?.path || issue?.field || issue?.validatorKey);
      if (field !== 'form' && !result[field]) result[field] = validationMessage(issue, language);
    }
  }
  Object.assign(result, error?.fields || {});
  return result;
}

function apiErrorResponse(error, language) {
  const status = error.status ||
    (error.name === 'SequelizeUniqueConstraintError' ? 409 :
      error.name === 'SequelizeValidationError' || error.name === 'ZodError' ? 400 : 500);
  const fields = fieldErrors(error, language);
  let code = error.publicCode || error.code;
  let message = error.message;

  if (error.name === 'SequelizeUniqueConstraintError') {
    code = 'UNIQUE_CONSTRAINT';
    message = translate(messages.UNIQUE_CONSTRAINT, language);
    for (const issue of error.errors || []) {
      const field = normalizeFieldName(issue.path);
      if (field !== 'form') fields[field] = validationMessage({ ...issue, name: error.name }, language);
    }
  } else if (error.code === 'PART_NUMBER_CONFLICT') {
    code = error.code;
    message = translate(messages.PART_NUMBER_CONFLICT, language)
      .replace('{partNumber}', String(error.partNumber));
    fields.partNumber = message;
  } else if (error.name === 'SequelizeValidationError' || error.name === 'ZodError' || status === 400 &&
    (error.issues || error.errors || error.details)) {
    code = 'VALIDATION_FAILED';
    message = translate(messages.VALIDATION_FAILED, language);
  } else if (error.code === 'STORAGE_NOT_CONFIGURED' || error.code === 'UPLOAD_TOO_LARGE' ||
    error.code === 'INVALID_UPLOAD') {
    message = translate(messages[error.code], language);
    if (error.code !== 'STORAGE_NOT_CONFIGURED') fields.file = message;
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    code = 'UPLOAD_TOO_LARGE';
    message = translate(messages.UPLOAD_TOO_LARGE, language);
    fields.file = message;
  } else if (status >= 500) {
    code = 'SERVER_ERROR';
    message = translate(messages.SERVER_ERROR, language);
  } else if (typeof message !== 'string' || !message.trim() || message === 'Validation error') {
    message = translate(messages.BAD_REQUEST, language);
  }

  return {
    status,
    body: {
      message: message || translate(messages.BAD_REQUEST, language),
      ...(code ? { code } : {}),
      ...(Object.keys(fields).length ? { fields } : {}),
      ...(error.existingPart ? { existingPart: error.existingPart } : {})
    }
  };
}

module.exports = { apiErrorResponse, requestLanguage, validationMessage };
