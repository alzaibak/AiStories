function localizePlan(record, language) {
  const plan = typeof record?.toJSON === 'function' ? record.toJSON() : { ...record };
  const translation = plan.translations?.[language];
  if (language === 'ar') {
    plan.name = translation?.name || plan.name;
    plan.features = Array.isArray(translation?.features) ? translation.features : plan.features;
  } else if (typeof translation?.name === 'string' && Array.isArray(translation.features)) {
    plan.name = translation.name;
    plan.features = translation.features;
  } else {
    return null;
  }
  delete plan.translations;
  return plan;
}

module.exports = { localizePlan };
