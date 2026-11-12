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

  const translation = value.translations?.[language] || {};
  for (const field of fields) {
    const translatedValue = translation[field];
    if (typeof translatedValue === 'string' && translatedValue.trim()) {
      value[field] = translatedValue;
    } else if (requiredFields.includes(field) && (typeof value[field] !== 'string' || !value[field].trim())) {
      return null;
    }
  }
  delete value.translations;
  return value;
}

module.exports = { requestedLanguage, localizeFields };
