const { toMinorUnits } = require('./stripe');

/**
 * Printed books can be shipped to the countries chosen by the admin, each with
 * its own delivery fee (same model as the mystery boxes). Books saved before
 * this feature keep using BOOK_SHIPPING_FEE through the fallback.
 */

function normalizeCountry(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function shippingError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function shippingForBooks({ items = [], country, currency, subtotalMinor = 0, fallbackMinor = null }) {
  const printItems = items.filter((item) => item.format === 'print');
  if (!printItems.length) return 0;

  const destination = normalizeCountry(country);
  if (!destination) {
    throw shippingError(400, 'Le pays de livraison est requis pour les livres papier.', 'SHIPPING_COUNTRY_REQUIRED');
  }

  let configured = false;
  let feeMinor = 0;
  for (const item of printItems) {
    const book = item.book || {};
    const countries = (Array.isArray(book.shippingCountries) ? book.shippingCountries : [])
      .map(normalizeCountry)
      .filter(Boolean);
    if (!countries.length) continue;
    configured = true;
    if (!countries.includes(destination)) {
      throw shippingError(409, `La livraison de « ${book.title} » n’est pas disponible dans ce pays (${destination}).`, 'COUNTRY_NOT_ALLOWED');
    }
    const fees = book.shippingFees && typeof book.shippingFees === 'object' ? book.shippingFees : {};
    const key = Object.keys(fees).find((entry) => normalizeCountry(entry) === destination);
    const fee = key ? Number(fees[key]) : NaN;
    if (!Number.isFinite(fee) || fee < 0) {
      throw shippingError(503, 'Les frais de livraison configurés sont invalides.', 'SHIPPING_UNAVAILABLE');
    }
    const threshold = book.shippingFreeOver === null || book.shippingFreeOver === undefined
      ? null
      : Number(book.shippingFreeOver);
    const free = threshold !== null && Number.isFinite(threshold) &&
      subtotalMinor >= toMinorUnits(threshold, currency, { allowZero: true });
    const itemFee = free ? 0 : toMinorUnits(fee, currency, { allowZero: true });
    // Several printed books in one parcel: the destination's highest fee applies.
    feeMinor = Math.max(feeMinor, itemFee);
  }

  if (configured) return feeMinor;
  if (typeof fallbackMinor === 'function') return fallbackMinor();
  return Number.isFinite(fallbackMinor) ? fallbackMinor : 0;
}

/**
 * Countries and fees offered by a set of printed cart lines. A country is only
 * offered when every configured book ships there; the fee is the highest of
 * the books (one parcel). Books without any configuration keep the legacy fee.
 */
function shippingMatrixForLines(lines, { currency, subtotalMinor = 0 }) {
  const configured = lines.filter((line) =>
    Array.isArray(line.book?.shippingCountries) && line.book.shippingCountries.length > 0);
  if (!configured.length) {
    return { legacy: true, countries: [], fees: {}, allowed: true, feeMinor: null };
  }
  let allowed = new Set(configured[0].book.shippingCountries.map(normalizeCountry).filter(Boolean));
  for (const line of configured.slice(1)) {
    const codes = new Set(line.book.shippingCountries.map(normalizeCountry).filter(Boolean));
    allowed = new Set([...allowed].filter((code) => codes.has(code)));
  }
  const fees = {};
  for (const code of [...allowed]) {
    // A destination without a fee for any of the books is not offered: it would
    // otherwise be shipped for free by mistake.
    if (configured.some((line) => shippingCountriesWithoutFee(line.book).includes(code))) {
      allowed.delete(code);
      continue;
    }
    let feeMinor = 0;
    for (const line of configured) {
      const book = line.book;
      const raw = Number(book.shippingFees?.[code]);
      if (!Number.isFinite(raw) || raw < 0) continue;
      const threshold = book.shippingFreeOver === null || book.shippingFreeOver === undefined
        ? null
        : Number(book.shippingFreeOver);
      const free = threshold !== null && Number.isFinite(threshold) &&
        subtotalMinor >= toMinorUnits(threshold, currency, { allowZero: true });
      feeMinor = Math.max(feeMinor, free ? 0 : toMinorUnits(raw, currency, { allowZero: true }));
    }
    fees[code] = feeMinor;
  }
  return { legacy: false, countries: [...allowed].sort(), fees, allowed: false, feeMinor: null };
}

/** Countries served by a book but saved without a delivery fee. */
function shippingCountriesWithoutFee(book) {
  if (!book || book.availabilityMode === 'digital_only') return [];
  const countries = (Array.isArray(book.shippingCountries) ? book.shippingCountries : [])
    .map(normalizeCountry)
    .filter(Boolean);
  const fees = book.shippingFees && typeof book.shippingFees === 'object' ? book.shippingFees : {};
  return countries.filter((code) => {
    const raw = fees[code];
    return raw === undefined || raw === null || raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0;
  });
}

function shippingMatrixForCountry(lines, { country, currency, subtotalMinor = 0 }) {
  const matrix = shippingMatrixForLines(lines, { currency, subtotalMinor });
  if (matrix.legacy) return matrix;
  const destination = normalizeCountry(country);
  const allowed = Boolean(destination) && matrix.countries.includes(destination);
  return {
    ...matrix,
    country: destination || null,
    allowed,
    feeMinor: allowed ? matrix.fees[destination] : 0
  };
}

module.exports = { shippingForBooks, shippingMatrixForCountry, shippingCountriesWithoutFee, normalizeCountry };
