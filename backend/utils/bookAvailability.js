const { availableBookLanguages } = require('./bookFiles');

/**
 * Availability rules for the store.
 *
 * `availabilityMode` says what the admin offers:
 *   both          printed copy (+ the e-book when a PDF exists)
 *   digital_only  e-book only
 *   print_only    printed copy only (PDF files are never sold)
 *
 * The historical `Book.format` column is kept as the "base" format: printed for
 * `both`, e-book for `digital_only`. The purchase format of an order line is
 * resolved here, never guessed from the book alone.
 */

const AVAILABILITY_MODES = ['both', 'digital_only', 'print_only'];

function availabilityModeOf(book) {
  const mode = book?.availabilityMode;
  return AVAILABILITY_MODES.includes(mode) ? mode : 'both';
}

/** Book format that matches the availability mode (keeps legacy code coherent). */
function baseFormatFor(availabilityMode) {
  return availabilityMode === 'digital_only' ? 'ebook' : 'print';
}

function hasPdfFiles(book) {
  return availableBookLanguages(book).length > 0;
}

/** An e-book is sold when it is the only offer, or when a PDF exists. */
function hasDigitalFormat(book) {
  const mode = availabilityModeOf(book);
  if (mode === 'print_only') return false;
  return mode === 'digital_only' || hasPdfFiles(book);
}

function printInStock(book) {
  return book?.stockQuantity === null || book?.stockQuantity === undefined || Number(book.stockQuantity) > 0;
}

/** Formats a reader can actually buy right now, in display order. */
function offeredFormats(book) {
  const mode = availabilityModeOf(book);
  const formats = [];
  if (mode !== 'digital_only' && printInStock(book)) formats.push('print');
  if (mode !== 'print_only' && hasPdfFiles(book)) formats.push('ebook');
  return formats;
}

/** Price of one format; the digital price falls back to the book price. */
function priceForFormat(book, format) {
  if (format === 'ebook') {
    const digital = book?.digitalPrice;
    if (digital === null || digital === undefined || digital === '') return Number(book?.price);
    return Number(digital);
  }
  return Number(book?.price);
}

function availabilityError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Picks the purchase format of a request and refuses impossible combinations.
 * `requested` may be omitted: the book's base format is used, which keeps old
 * clients (and merged guest carts) working.
 */
function resolvePurchaseFormat(book, requested) {
  const mode = availabilityModeOf(book);
  const digitalReady = hasPdfFiles(book);
  if (requested === 'print') {
    if (mode === 'digital_only') {
      throw availabilityError(409, 'This book is sold as an e-book only.', 'PRINT_UNAVAILABLE');
    }
    if (!printInStock(book)) {
      throw availabilityError(409, 'This printed book is out of stock.', 'OUT_OF_STOCK');
    }
    return 'print';
  }
  if (requested === 'ebook') {
    if (mode === 'print_only') {
      throw availabilityError(409, 'This book is sold as a printed copy only.', 'EBOOK_UNAVAILABLE');
    }
    if (!digitalReady) {
      throw availabilityError(409, 'No PDF file is available for this book.', 'EBOOK_FILE_MISSING');
    }
    return 'ebook';
  }
  if (mode !== 'digital_only' && printInStock(book)) return 'print';
  if (mode !== 'print_only' && digitalReady) return 'ebook';
  throw availabilityError(409, 'This book is not available right now.', 'BOOK_UNAVAILABLE');
}

/** Format of an existing cart line, downgraded safely if the offer changed. */
function cartFormatFor(book, stored) {
  const offered = offeredFormats(book);
  if (stored === 'print' && offered.includes('print')) return 'print';
  if (stored === 'ebook' && offered.includes('ebook')) return 'ebook';
  return offered[0] || null;
}

/** Public summary used by the store pages. */
function availabilitySummary(book) {
  const mode = availabilityModeOf(book);
  return {
    availabilityMode: mode,
    formats: offeredFormats(book),
    prices: {
      print: mode !== 'digital_only' ? Number(book?.price) : null,
      digital: mode !== 'print_only' && hasDigitalFormat(book) ? priceForFormat(book, 'ebook') : null
    },
    digitalPrice: book?.digitalPrice === null || book?.digitalPrice === undefined ? null : Number(book.digitalPrice)
  };
}

module.exports = {
  AVAILABILITY_MODES,
  availabilityModeOf,
  baseFormatFor,
  hasPdfFiles,
  hasDigitalFormat,
  offeredFormats,
  priceForFormat,
  resolvePurchaseFormat,
  cartFormatFor,
  availabilitySummary
};
