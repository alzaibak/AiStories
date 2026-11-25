/** Formatting helpers shared by the returns service and its emails. */

function tokenFor(language) {
  return ['ar', 'en', 'fr'].includes(language) ? language : 'ar';
}

function getClientUrl() {
  return (process.env.CLIENT_APP_URL || process.env.CLIENT_URL || process.env.CLIENT_DOMAIN || 'http://localhost:8080')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
}

function returnActionUrl(requestId, language = 'ar') {
  return `${getClientUrl()}/${tokenFor(language)}/account/returns/${requestId}`;
}

function localeFor(language) {
  return { fr: 'fr-FR', en: 'en-GB', ar: 'ar' }[tokenFor(language)] || 'fr-FR';
}

function formatMoney(minor, currency = 'EUR', language = 'fr') {
  const amount = Number(minor) || 0;
  try {
    return new Intl.NumberFormat(localeFor(language), { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(date, language = 'fr') {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(localeFor(language), {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(date));
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

module.exports = { tokenFor, getClientUrl, returnActionUrl, formatMoney, formatDate };
