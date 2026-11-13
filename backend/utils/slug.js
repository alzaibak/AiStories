const arabicLetters = {
  ء: '', ا: 'a', أ: 'a', إ: 'i', آ: 'a', ٱ: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j',
  ح: 'h', خ: 'kh', د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's',
  ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l',
  م: 'm', ن: 'n', ه: 'h', و: 'w', ؤ: 'w', ي: 'y', ى: 'a', ئ: 'y', ة: 'h',
  پ: 'p', چ: 'ch', ژ: 'zh', گ: 'g', ک: 'k', ی: 'y', ڤ: 'v', ە: 'h'
};

function slugify(value) {
  const transliterated = Array.from(String(value || ''), (character) =>
    arabicLetters[character] || character
  ).join('');
  return transliterated.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255)
    .replace(/-+$/g, '');
}

function slugFromLocalized(title, translations = {}) {
  const english = translations?.en?.title;
  return slugify(english || title);
}

module.exports = { slugify, slugFromLocalized };
