/**
 * Adds neutral, depiction-policy-safe covers to the first published stories so
 * the library, the story hero and the share card can be reviewed locally.
 * One story is intentionally left without a cover to exercise the fallback.
 *
 *   node scripts/seed-story-images.js [--force]
 */
const sharp = require('sharp');
const { sequelize, Story } = require('../models');
const { processStoryImage } = require('../utils/publicImages');

const palettes = [
  { from: '#0d3a2c', to: '#082019', accent: '#d8b36a' },
  { from: '#122a3a', to: '#08141d', accent: '#c99a5f' },
  { from: '#3a2a1b', to: '#1d140c', accent: '#ecd3a0' },
  { from: '#23332b', to: '#101a14', accent: '#d9bd80' },
  { from: '#2b1f33', to: '#150f1a', accent: '#c7b3d6' }
];

function coverSvg(index, palette) {
  const stars = Array.from({ length: 7 }, (_, star) => {
    const x = 120 + ((index * 137 + star * 211) % 660);
    const y = 160 + ((index * 97 + star * 173) % 880);
    const size = 10 + ((star * 7 + index) % 18);
    return `<path d="M${x} ${y - size} L${x + size * 0.28} ${y - size * 0.3} L${x + size} ${y - size * 0.2} L${x + size * 0.42} ${y + size * 0.24} L${x + size * 0.6} ${y + size} L${x} ${y + size * 0.5} L${x - size * 0.6} ${y + size} L${x - size * 0.42} ${y + size * 0.24} L${x - size} ${y - size * 0.2} L${x - size * 0.28} ${y - size * 0.3} Z" fill="none" stroke="${palette.accent}" stroke-opacity="0.4" stroke-width="1.4"/>`;
  }).join('');
  const arches = Array.from({ length: 8 }, (_, arch) => {
    const x = 80 + arch * 105;
    return `<path d="M${x} 1010 L${x} 780 Q${x + 42} 710 ${x + 84} 780 L${x + 84} 1010" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.4"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.from}"/>
        <stop offset="55%" stop-color="${palette.to}"/>
        <stop offset="100%" stop-color="${palette.from}"/>
      </linearGradient>
      <radialGradient id="glow" cx="78%" cy="14%" r="62%">
        <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="900" height="1200" fill="url(#bg)"/>
    <rect width="900" height="1200" fill="url(#glow)"/>
    <circle cx="${180 + index * 40}" cy="300" r="150" fill="none" stroke="${palette.accent}" stroke-opacity="0.25"/>
    <circle cx="${180 + index * 40}" cy="300" r="108" fill="none" stroke="${palette.accent}" stroke-opacity="0.18"/>
    ${stars}
    ${arches}
    <g fill="none" stroke="${palette.accent}" stroke-opacity="0.45">
      <path d="M450 500 L500 580 L450 660 L400 580 Z"/>
      <path d="M450 540 L472 580 L450 620 L428 580 Z" stroke-opacity="0.3"/>
    </g>
  </svg>`;
}

async function main() {
  const force = process.argv.includes('--force');
  const stories = await Story.findAll({ order: [['publishedAt', 'DESC'], ['id', 'ASC']], limit: 6 });
  if (!stories.length) {
    console.log('No stories found. Run the main seed first.');
    return;
  }
  let updated = 0;
  for (const [index, story] of stories.entries()) {
    if (index === stories.length - 1) {
      if (force || story.coverImage) {
        await story.update({ coverImage: null, heroImage: null, socialImage: null });
        console.log(`- ${story.title}: cover removed (fallback test).`);
      }
      continue;
    }
    if (story.coverImage && !force) {
      console.log(`= ${story.title}: already has a cover.`);
      continue;
    }
    const palette = palettes[index % palettes.length];
    const buffer = await sharp(Buffer.from(coverSvg(index, palette))).jpeg({ quality: 92 }).toBuffer();
    const image = await processStoryImage(buffer, { kind: 'cover' });
    const heroBuffer = await sharp(Buffer.from(coverSvg(index + 2, palette)))
      .resize({ width: 1600, height: 900, fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer();
    const hero = await processStoryImage(heroBuffer, { kind: 'hero' });
    await story.update({
      coverImage: image.url,
      coverVariants: image.variants,
      heroImage: hero.url,
      socialImage: image.socialImage,
      focalPoint: { x: 50, y: 42 },
      coverAlt: {
        ar: `غلاف زخرفي لحكاية ${story.title} بأقواس وخطوط هندسية`,
        en: `Decorative geometric cover for ${story.title}`,
        fr: `Couverture géométrique décorative pour ${story.title}`
      },
      imageCredit: 'Équipe éditoriale — illustration générée'
    });
    updated += 1;
    console.log(`+ ${story.title}: cover + hero + social image.`);
  }
  console.log(`Done. ${updated} story/stories updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
