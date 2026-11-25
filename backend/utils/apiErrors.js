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
  SLUG_CONFLICT: {
    ar: 'هذا الرابط المختصر مستخدم بالفعل. جرّب الرابط المقترح.',
    en: 'This slug is already in use. Try the suggested one.',
    fr: 'Ce slug est déjà utilisé. Essayez celui qui est proposé.'
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
  return value
    .split('.')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : segment))
    .join('.')
    .replace(/\.\[/g, '[');
}

function issueCode(issue) {
  const raw = String(issue?.code || issue?.validatorKey || issue?.type || '').toLowerCase();
  if (raw === 'invalid_type' && ['undefined', 'null'].includes(String(issue?.received))) return 'required';
  if (raw === 'too_small' && (issue?.type === 'string' || issue?.origin === 'string')) return 'required';
  if (raw === 'notnull violation' || raw.includes('notnull') || raw === 'not_null_violation') return 'required';
  if (raw.includes('unique')) return 'duplicate';
  if (raw === 'too_big' || raw === 'too_small' || raw === 'invalid_string' ||
    raw === 'invalid_format' || raw === 'invalid_enum_value' || raw === 'invalid_value' ||
    raw === 'invalid_union' || raw === 'invalid_type' || raw === 'custom') return 'invalid';
  return 'invalid';
}

function issueMessage(code, language) {
  return translate(validationMessages[code] || validationMessages.invalid, language);
}

function collectIssues(error, language) {
  const collected = [];
  const seen = new Set();
  const push = (rawField, code, message) => {
    const field = normalizeFieldName(rawField);
    if (field === 'form') return;
    const key = `${field}:${code}`;
    if (seen.has(key)) return;
    seen.add(key);
    collected.push({ field, code, message: message || issueMessage(code, language) });
  };

  const issues = error?.issues || error?.errors || error?.details;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      const path = issue?.path?.join?.('.') || issue?.path || issue?.field || issue?.validatorKey;
      push(path, issueCode(issue));
    }
  }

  if (Array.isArray(error?.fieldErrors)) {
    for (const entry of error.fieldErrors) {
      push(entry?.field, entry?.code || 'invalid', entry?.message);
    }
  }

  for (const [field, message] of Object.entries(error?.fields || {})) {
    push(field, 'invalid', typeof message === 'string' ? message : undefined);
  }

  return collected;
}

function fieldErrors(error, language) {
  const result = {};
  for (const issue of collectIssues(error, language)) {
    if (!result[issue.field]) result[issue.field] = issue.message;
  }
  return result;
}

function isValidationError(error, status) {
  return error?.name === 'SequelizeValidationError' || error?.name === 'ZodError' ||
    error?.code === 'VALIDATION_FAILED' || Boolean(error?.issues) ||
    status === 422 || (status === 400 && Boolean(error?.errors || error?.details));
}

function errorStatus(error) {
  if (error?.status) return error.status;
  if (error?.name === 'SequelizeUniqueConstraintError') return 409;
  if (isValidationError(error, 400)) return 422;
  return 500;
}

function apiErrorResponse(error, language = 'ar') {
  const status = errorStatus(error);
  const structured = collectIssues(error, language);
  const fields = fieldErrors(error, language);
  let code = error?.publicCode || error?.code;
  let message = error?.message;

  if (error?.name === 'SequelizeUniqueConstraintError') {
    code = 'UNIQUE_CONSTRAINT';
    message = translate(messages.UNIQUE_CONSTRAINT, language);
    const duplicateMessage = translate(validationMessages.duplicate, language);
    for (const field of Object.keys(fields)) fields[field] = duplicateMessage;
    for (const issue of structured) issue.message = duplicateMessage;
  } else if (error?.code === 'PART_NUMBER_CONFLICT') {
    code = error.code;
    message = translate(messages.PART_NUMBER_CONFLICT, language)
      .replace('{partNumber}', String(error.partNumber));
    const existingIssue = structured.find((issue) => issue.field === 'partNumber');
    if (existingIssue) {
      existingIssue.code = 'duplicate';
      existingIssue.message = message;
    } else {
      structured.push({ field: 'partNumber', code: 'duplicate', message });
    }
    fields.partNumber = message;
  } else if (error?.code === 'SLUG_CONFLICT') {
    code = 'SLUG_CONFLICT';
    message = translate(messages.SLUG_CONFLICT, language);
    if (!structured.some((issue) => issue.field === 'slug')) {
      structured.push({ field: 'slug', code: 'duplicate', message });
      fields.slug = message;
    }
  } else if (isValidationError(error, status)) {
    code = 'VALIDATION_FAILED';
    message = translate(messages.VALIDATION_FAILED, language);
  } else if (error?.code === 'STORAGE_NOT_CONFIGURED' || error?.code === 'UPLOAD_TOO_LARGE' ||
    error?.code === 'INVALID_UPLOAD') {
    message = translate(messages[error.code], language);
    if (error.code !== 'STORAGE_NOT_CONFIGURED') {
      fields.file = message;
      structured.push({ field: 'file', code: error.code.toLowerCase(), message });
    }
  } else if (error?.code === 'LIMIT_FILE_SIZE') {
    code = 'UPLOAD_TOO_LARGE';
    message = translate(messages.UPLOAD_TOO_LARGE, language);
    fields.file = message;
    structured.push({ field: 'file', code: 'too_large', message });
  } else if (status >= 500) {
    code = 'SERVER_ERROR';
    message = translate(messages.SERVER_ERROR, language);
  } else if (typeof message !== 'string' || !message.trim() || message === 'Validation error') {
    message = translate(messages.BAD_REQUEST, language);
  }

  const publicMessage = typeof message === 'string' && message.trim() && message !== 'Validation error'
    ? message
    : translate(messages.BAD_REQUEST, language);

  return {
    status,
    body: {
      message: publicMessage,
      ...(code ? { code } : {}),
      ...(Object.keys(fields).length ? { fields } : {}),
      ...(structured.length ? { errors: structured } : {}),
      ...(error?.suggestion ? { suggestion: error.suggestion } : {}),
      ...(error?.existingPart ? { existingPart: error.existingPart } : {}),
      ...(error?.missing ? { missing: error.missing } : {})
    }
  };
}

module.exports = { apiErrorResponse, requestLanguage, validationMessage: issueMessage };
