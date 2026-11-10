const path = require('path');

const SAMPLE_EBOOK_STORAGE_KEY = 'builtin:sample-ebook-v1';
const SAMPLE_EBOOK_PATH = path.join(__dirname, '..', 'assets', 'sample-ebook.pdf');

module.exports = { SAMPLE_EBOOK_STORAGE_KEY, SAMPLE_EBOOK_PATH };
