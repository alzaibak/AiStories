# نظام التصميم — حكايات إسلامية

Public-site design system introduced in Phase 1. The admin dashboard is intentionally
outside its scope and keeps its existing styles.

- **Tokens / themes:** `src/styles/site.css`
- **Fonts:** `src/styles/fonts.css` + `public/fonts/*.woff2` (self-hosted, OFL)
- **Theme state:** `src/contexts/SiteThemeContext.tsx`
- **Components:** `src/components/ui/`
- **Living reference:** `/:locale/design` (also linked as “دليل التصميم” in the footer)
- **Reference captures:** `docs/screenshots/` (palette, typography, story card, quiz,
  source badges, mobile at 390px)

Run `npm run dev`, then open `http://localhost:8080/ar/design` (or `/en/design`,
`/fr/design`). Use the sun/book/moon menu in the header to switch appearance and
the globe menu to switch language. Every component section renders the same
sample in light, sepia and dark side by side.

## Visual direction

Warm, serene, premium storybook: cream paper, deep emerald, soft gold, dark ink.
Never corporate-dashboard, never childish. Ornament (eight-point stars, mihrab
arches, arabesque rules) is used at low opacity and never over body text.

## Themes

| Theme | Attribute | Canvas | Mood |
|---|---|---|---|
| Paper (default) | `data-site-theme="light"` | `#FBF7EF` | Warm daylight reading |
| Sepia | `data-site-theme="sepia"` | `#F2E5CD` | Aged paper, long reads |
| Night | `data-site-theme="dark"` | `#0B1A24` | Deep night blue, never pure black |

The theme attribute is set on `<html>` by `SiteThemeProvider`, persisted in
`localStorage` under `site-theme`, applied before first paint by an inline script
in `index.html`, and exposed through `useSiteTheme()` (`theme`, `setTheme`,
`cycleTheme`). Any subtree can preview a theme by setting `data-site-theme` on a
wrapper — this is how the style guide shows all three modes side by side.

Users can switch in the header (sun/book/moon menu) and in the footer.

## Colour tokens

All values are RGB triples so Tailwind opacity modifiers work
(`rgb(var(--ds-brand-rgb) / 0.5)`).

| Token | Role | Paper | Sepia | Night |
|---|---|---|---|---|
| `--ds-canvas` | page background | `251 247 239` | `242 229 205` | `11 26 36` |
| `--ds-surface` | cards, menus | `255 253 248` | `249 240 222` | `16 37 50` |
| `--ds-surface-soft` | quiet panels | `245 239 227` | `235 218 185` | `21 46 60` |
| `--ds-surface-sunken` | wells | `240 232 216` | `227 208 173` | `8 20 29` |
| `--ds-ink` | primary text | `26 38 33` | `56 44 30` | `234 240 235` |
| `--ds-ink-muted` | secondary text | `88 105 96` | `104 86 62` | `168 187 178` |
| `--ds-ink-faint` | metadata | `128 143 134` | `138 118 90` | `124 146 137` |
| `--ds-line` | hairlines | `232 223 205` | `219 200 165` | `34 60 73` |
| `--ds-brand` | primary actions | `16 82 60` | `45 85 66` | `96 196 160` |
| `--ds-brand-soft` | tonal fills | `226 241 232` | `223 231 214` | `21 55 49` |
| `--ds-gold` | accent | `197 162 90` | `173 130 60` | `230 202 145` |
| `--ds-gold-ink` | gold text | `122 86 24` | `108 74 18` | `240 214 160` |

Tailwind aliases: `paper`, `surface` (+`soft`, `sunken`), `ink` (+`muted`,
`faint`), `line` (+`strong`), `brand` (+`strong`, `soft`, `ink`, `on`), `gold`
(+`soft`, `ink`), `danger`, `success`.

### Measured contrast (WCAG)

| Pair | Paper | Sepia | Night |
|---|---|---|---|
| Ink on canvas | 14.6:1 | 10.9:1 | 15.3:1 |
| Muted ink on canvas | 5.4:1 | 5.6:1 | 8.8:1 |
| On-brand text on brand | 8.9:1 | 8.1:1 | 7.9:1 |
| Gold ink on gold-soft | 5.6:1 | 6.1:1 | 10.1:1 |
| Feedback text on feedback fill | 5.3:1 | — | 6.3:1 |

All pass AA for normal text; most pass AAA.

### Source classes (never mixed)

| Class | Value | Icon | Colour family |
|---|---|---|---|
| Quranic verse | `quran_verse` | `BookMarked` | emerald |
| Authentic hadith | `authentic_hadith` | `ScrollText` | amber |
| Historical source | `historical_source` | `Landmark` | slate blue |
| Inspired story | `inspired_story` | `Feather` | terracotta |

Each has explicit light/sepia/night triplets (`--ds-src-*-bg/ink/line`). The
`SourceBadge` always renders icon + label, never colour alone.

## Typography

| Role | Font | Notes |
|---|---|---|
| Arabic UI | IBM Plex Sans Arabic 400/500/600/700 | headings, buttons, navigation |
| Arabic reading | Noto Naskh Arabic 400–700 (variable) | story text, quotes |
| Latin UI | Inter 400–700 (variable) | EN/FR interface |
| Latin reading | Lora 400–600 + italic | EN/FR story text |

Self-hosted in `public/fonts` (Arabic + Latin subsets only, ~476 KB total),
`font-display: swap`. The three heaviest faces used above the fold are preloaded.
`html[lang="ar"]` switches `--font-reading` to Noto Naskh. Reading text uses
`--text-reading` (17–19px) with `--leading-reading: 2.05` and a `36rem` measure.

Scale tokens: `--text-display`, `--text-h1`, `--text-h2`, `--text-h3`,
`--text-reading`. Utilities: `.ds-display`, `.ds-reading`, `.ds-prose`,
`.ds-eyebrow`, `.ds-measure`.

## Shape, depth, motion

- Radii: `8 / 12 / 16 / 22 / 28 / 36 / 999` px (`--radius-*`).
- Shadows: `--shadow-soft` (resting card), `--shadow-lift` (hover),
  `--shadow-glow` (primary CTA emphasis).
- Motion: `--duration-fast 140ms`, `--duration-base 240ms`,
  `--duration-slow 420ms`; easings `--ease-out`, `--ease-spring`.
- All motion collapses under `prefers-reduced-motion: reduce`.
- Section rhythm: `--space-section: clamp(3.5rem, 6vw, 6.5rem)`.

## Components (Phase 1)

| Component | File | Notes |
|---|---|---|
| Button / `buttonClasses` | `Button.tsx` | primary, gold, secondary, ghost, quiet; sm/md/lg; loading |
| StoryCard | `StoryCard.tsx` | grid + featured; source, access, reviewer, parts, minutes, progress |
| QuizQuestionCard | `QuizQuestionCard.tsx` | one question per screen, kids/teens/adults, timer, instant feedback, “Why?” |
| SourceBadge / SourceLegend | `SourceBadge.tsx` | four source classes |
| AccessBadge | `CoverArt.tsx` | free vs members |
| CoverArt | `CoverArt.tsx` | deterministic gradient + girih pattern + arch medallion; no faces |
| ProgressBar / ProgressRing | `Progress.tsx` | accessible `role="progressbar"` |
| ReviewerLine | `StoryCard.tsx` | “Scholarly review · name” |
| GeometricPattern / OrnamentDivider / EmptyStateArt | `Ornament.tsx` | decorative, `aria-hidden` |
| Skeleton | `.ds-skeleton` in `site.css` | shimmer, reduced-motion aware |
| Header | `StoryPlatform.tsx` | sticky, search dialog, language, appearance, profile |
| Footer | `StoryPlatform.tsx` | explore / trust / account, language + appearance |

Still to arrive with their phases: tabs, modal shell, toasts, leaderboard row,
price card, share card, book card, journey part list, badge/streak widgets.
They will be built on these tokens rather than as one-off styles.

## Rules

- **Mobile-first**, logical properties (`ps/pe/ms/me/start/end`), mirrored
  directional icons only (`ltr:rotate-180` for “next” arrows).
- **No depiction** of prophets' faces or bodies anywhere, including generated
  covers: gradients, geometry, architecture and objects only.
- Source badge + reviewer always visible on story surfaces.
- Touch targets ≥ 44px; visible `:focus-visible` ring on every control.
- Text lives in `src/lib/localization.ts`; Arabic is the reference. New keys
  for this phase are in `designEnglish` / `designFrench`.
- Images: `loading="lazy"`, `decoding="async"`, `sizes`, and an aspect-ratio box
  to prevent layout shift.

## Using the system

```tsx
import { StoryCard } from '@/components/ui/StoryCard';
import { Button } from '@/components/ui/Button';

<Button size="lg" trailingIcon={<ArrowLeft className="ltr:rotate-180" />}>
  ابدأ القراءة
</Button>

<StoryCard story={story} language="ar" progress={45} />
```

Tailwind example:

```tsx
<section className="ds-section bg-paper text-ink">
  <div className="ds-container">
    <p className="ds-eyebrow">حكاية الأسبوع</p>
    <h2 className="text-3xl font-bold">…</h2>
  </div>
</section>
```

## Compatibility note

Pages not yet redesigned (Phases 2–5) still use the legacy emerald utilities.
The public shell and new components use the tokens above; `site.css` includes a
small dark/sepia bridge for legacy `bg-white` / `text-emerald-950` classes so
those pages stay readable until their phase. The legacy palette in `index.css`
is untouched so the admin dashboard is unaffected.
