const supportedLanguages = new Set(['ar', 'en', 'fr']);

function requestedLanguage(value) {
  return supportedLanguages.has(value) ? value : 'ar';
}

function localizeFields(record, language, fields, requiredFields = fields) {
  const value = typeof record?.toJSON === 'function' ? record.toJSON() : { ...record };
  if (language === 'ar') {
    delete value.translations;
    return value;
  }

  const translation = value.translations?.[language];
  if (!translation || requiredFields.some((field) => typeof translation[field] !== 'string' || !translation[field].trim())) {
    return null;
  }
  for (const field of fields) {
    if (typeof translation[field] === 'string') value[field] = translation[field];
  }
  delete value.translations;
  return value;
}

module.exports = { requestedLanguage, localizeFields };
