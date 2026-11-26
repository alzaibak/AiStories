const MAX_BLOCKS = 40;
const MAX_IMAGES = 12;
const LANGUAGES = ['ar', 'en', 'fr'];
const BLOCK_TYPES = new Set(['text', 'image', 'quote']);
const LAYOUTS = new Set(['full', 'wide']);
const FILE_PATTERN = /^[0-9a-f-]{36}-\d+\.(webp|jpg|jpeg|png)$/i;

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    // control characters except newline and tab
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
}

function localizedObject(value, max = 20000) {
  const source = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const language of LANGUAGES) {
    result[language] = cleanText(source[language]).slice(0, max);
  }
  return result;
}

function localizedValue(value, language) {
  if (!value || typeof value !== 'object') return '';
  const preferred = cleanText(value[language]);
  if (preferred) return preferred;
  // Arabic is the master text; captions and alts may only exist in one language.
  for (const fallback of ['ar', 'en', 'fr']) {
    const candidate = cleanText(value[fallback]);
    if (candidate) return candidate;
  }
  return '';
}

/** Plain text, blank lines between paragraphs. */
function splitParagraphs(value) {
  const text = cleanText(value);
  if (!text) return [];
  return text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

function textFromBlocks(blocks, language = 'ar') {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((block) => block && block.type === 'text')
    .map((block) => localizedValue(block.text, language) || (language !== 'ar' ? localizedValue(block.text, 'ar') : ''))
    .filter(Boolean)
    .join('\n\n');
}

function imageOf(block) {
  const image = block?.image && typeof block.image === 'object' ? block.image : null;
  if (!image) return null;
  const url = String(image.url || '').trim();
  if (!url) return null;
  return {
    url,
    thumbUrl: String(image.thumbUrl || '').trim(),
    width: Number(image.width) || 0,
    height: Number(image.height) || 0,
    placeholder: String(image.placeholder || '')
  };
}

function sanitizeBlock(block, index) {
  const type = BLOCK_TYPES.has(block?.type) ? block.type : 'text';
  const position = Number.isSafeInteger(index) ? index + 1 : 1;
  if (type === 'image') {
    const image = imageOf(block);
    if (!image) return null;
    return {
      position,
      type,
      text: null,
      image,
      alt: localizedObject(block.alt, 300),
      caption: localizedObject(block.caption, 500),
      reference: null,
      credit: cleanText(block.credit).slice(0, 300),
      layout: LAYOUTS.has(block.layout) ? block.layout : 'full',
      decorative: Boolean(block.decorative)
    };
  }
  if (type === 'quote') {
    const text = localizedObject(block.text, 4000);
    if (!text.ar) return null;
    return {
      position,
      type,
      text,
      image: null,
      alt: null,
      caption: null,
      reference: localizedObject(block.reference, 300),
      credit: '',
      layout: 'full',
      decorative: false
    };
  }
  const text = localizedObject(block.text, 20000);
  if (!text.ar) return null;
  return {
    position,
    type: 'text',
    text,
    image: null,
    alt: null,
    caption: null,
    reference: null,
    credit: '',
    layout: 'full',
    decorative: false
  };
}

/**
 * Normalises an incoming block list: ordered, trimmed, capped and with empty
 * blocks dropped. Returns null when the payload is not a block list at all.
 */
function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;
  const cleaned = blocks
    .slice(0, MAX_BLOCKS)
    .map((block, index) => sanitizeBlock(block, index))
    .filter(Boolean)
    .map((block, index) => ({ ...block, position: index + 1 }));
  const images = cleaned.filter((block) => block.type === 'image').length;
  if (images > MAX_IMAGES) {
    const error = new Error(`Une partie ne peut pas contenir plus de ${MAX_IMAGES} images.`);
    error.status = 422;
    error.code = 'TOO_MANY_IMAGES';
    throw error;
  }
  return cleaned;
}

/** Public shape for the reader, already resolved to one language. */
function localizeBlocks(rows, language) {
  if (!Array.isArray(rows)) return [];
  return rows
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((row) => {
      const block = typeof row.toJSON === 'function' ? row.toJSON() : row;
      if (block.type === 'image') {
        return {
          id: block.id,
          position: block.position,
          type: 'image',
          image: imageOf(block),
          alt: localizedValue(block.alt, language),
          caption: localizedValue(block.caption, language),
          credit: block.credit || '',
          layout: LAYOUTS.has(block.layout) ? block.layout : 'full',
          decorative: Boolean(block.decorative)
        };
      }
      if (block.type === 'quote') {
        return {
          id: block.id,
          position: block.position,
          type: 'quote',
          text: localizedValue(block.text, language),
          reference: localizedValue(block.reference, language)
        };
      }
      return {
        id: block.id,
        position: block.position,
        type: 'text',
        text: localizedValue(block.text, language)
      };
    })
    .filter((block) => block.type === 'image' ? Boolean(block.image) : Boolean(block.text));
}

/** Backward compatibility: a part without blocks renders its old content. */
function fallbackBlocks(part) {
  const paragraphs = splitParagraphs(part?.content);
  if (!paragraphs.length) return [];
  return [{
    id: `content-${part.id}`,
    position: 1,
    type: 'text',
    text: paragraphs.join('\n\n')
  }];
}

function blockImageUrls(block) {
  const image = block && typeof block.toJSON === 'function' ? block.toJSON().image : block?.image;
  if (!image || typeof image !== 'object') return [];
  return [image.url, image.thumbUrl]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

module.exports = {
  MAX_BLOCKS,
  MAX_IMAGES,
  LANGUAGES,
  FILE_PATTERN,
  cleanText,
  splitParagraphs,
  textFromBlocks,
  sanitizeBlocks,
  localizeBlocks,
  fallbackBlocks,
  blockImageUrls,
  localizedValue
};
