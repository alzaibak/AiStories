# Language consistency audit

## Method

- `src/lib/localization.ts` holds three dictionaries (`english`, `french`) keyed
  by Arabic source strings; `translateTree` walks JSX text nodes and attributes
  on every public page, and `translateText` covers strings built in code.
- New public strings added by this work were inserted in both dictionaries:
  new/updated labels, part/next labels, quiz and share cards, filters, related
  stories, reminder prompt, image credit, reviewer fallback.
- Remaining hard-coded Arabic found by inspection is limited to the admin area
  (Arabic-first editor copy such as the publish checklist and image guidance)
  and long-form marketing copy on the home page. Those pages are translated
  through `translateTree`, so an English/French key is needed to avoid falling
  back to Arabic.

## Fixed in this pass

| Area | Problem | Fix |
| --- | --- | --- |
| Story page | `راجَعها:` and generic reviewer label | `t('راجَعها:')`; generic “Administration Plateforme” replaced by “Scientific review committee” |
| Story page | `N أجزاء` even for 1 | ICU plural helper (`pluralParts`) in ar/en/fr |
| Story page | Hard-coded Arabic CTAs, quiz/video/share cards | moved to `t()` keys added to EN/FR dictionaries |
| Library | `recommended.parts.length + أجزاء` | `pluralParts` + `pluralMinutes` |
| Library | No EN/FR strings for filters/new this week | keys added |
| Story cards | “1 parts” | ICU plural helper |
| Reader | Saved-progress message, share part, next part | `t()` + dictionary keys |
| Admin | Breadcrumb/page labels already use `localizedText`; navigation unchanged | verified |

## Known gaps

- Some admin-only helper text is Arabic-first (publish checklist, pricing hints,
  image guidelines) and has no EN/FR entries yet.
- Long marketing sections of the home page still depend on `translateTree`
  keys that were not exhaustively enumerated; any key absent from the
  dictionaries falls back to Arabic by design.
- Pluralization for badge and competition counters outside the story
  experience still uses plain concatenation.
