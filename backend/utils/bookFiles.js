const BOOK_LANGUAGES = ['ar', 'en', 'fr'];

/**
 * An ebook can ship one PDF per language. `bookFiles` holds the private storage
 * keys (`{ ar: { key, name }, en: {...}, fr: {...} }`); a legacy single
 * `fileStorageKey` counts as the Arabic version.
 */
function normalizeBookFiles(book) {
  const files = book?.bookFiles && typeof book.bookFiles === 'object' && !Array.isArray(book.bookFiles)
    ? book.bookFiles
    : {};
  const normalized = {};
  for (const language of BOOK_LANGUAGES) {
    const entry = files[language];
    if (entry && typeof entry === 'string' && entry.trim()) {
      normalized[language] = { key: entry.trim(), name: null };
      continue;
    }
    if (entry && typeof entry === 'object' && typeof entry.key === 'string' && entry.key.trim()) {
      normalized[language] = {
        key: entry.key.trim(),
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null
      };
    }
  }
  if (!normalized.ar && book?.fileStorageKey) {
    normalized.ar = { key: String(book.fileStorageKey), name: null };
  }
  return normalized;
}

/** Languages a buyer may choose, in a stable order (Arabic first). */
function availableBookLanguages(book) {
  const files = normalizeBookFiles(book);
  return BOOK_LANGUAGES.filter((language) => Boolean(files[language]));
}

function isBookLanguage(language) {
  return BOOK_LANGUAGES.includes(language);
}

/**
 * The file a reader is allowed to download: exactly the language they bought.
 * An entitlement without a language (rental, subscription, legacy purchase)
 * falls back to any available version, Arabic first.
 */
function resolveBookFile(book, language) {
  const files = normalizeBookFiles(book);
  if (language && files[language]) return { ...files[language], language };
  if (!language) {
    const available = availableBookLanguages(book);
    if (!available.length) return null;
    return { ...files[available[0]], language: available[0] };
  }
  return null;
}

module.exports = {
  BOOK_LANGUAGES,
  normalizeBookFiles,
  availableBookLanguages,
  isBookLanguage,
  resolveBookFile
};
