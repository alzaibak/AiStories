# Story experience — manual QA checklist

Automated checks live in `backend/tests/validation-errors.test.js`,
`backend/tests/public-images.test.js`, `src/test/plural.test.ts` and
`src/test/story-detail-journey.test.tsx`. The items below need a running API,
database, media storage and a browser.

## 0. Setup

```bash
cd backend
npm run migrate                 # applies 032-story-images (re-runnable)
node scripts/seed.js            # base content, if the database is empty
node scripts/seed-story-images.js [--force]
cd ..
npm run dev                     # client on 127.0.0.1
```

`seed-story-images.js` writes neutral geometric covers for five stories and
leaves the last one without a cover to test the fallback.

## 1. Quiz validation (the reported bug)

1. Admin → Content → Quizzes → Create.
2. Leave the slug empty, type an Arabic title, pick a story, then save.
   - Expected: the quiz is saved as a draft; the slug is generated and shown
     after reopening.
3. Add a question, leave option 2 empty, open the **Français** tab and type a
   French title only.
4. Click **Save draft**.
   - Expected: the French tab shows a red error count, the tab opens
     automatically when the first error is French, the main title/option fields
     are outlined in red, and the summary lists every problem. Clicking a
     summary item scrolls to and focuses the field.
5. Switch languages and confirm the banner never appears without a
   corresponding highlighted field.
6. Click **Send for review** with an empty explanation/source.
   - Expected: the publish checklist lists “Explanation is required before
     publication / Source is required”, no request is sent, and the fields are
     focused in turn.
7. Save again and navigate away with unsaved changes → browser warning.
8. Double-click Save → only one request (button disabled while busy).
9. Create a second quiz with the same slug → field `slug` is highlighted and a
   suggested available slug is offered.

## 2. Story cover upload

1. Admin → Stories → open a story → **Images** tab.
2. Try uploading without the depiction-policy checkbox → blocked with a clear
   message.
3. Upload a JPG/PNG/WebP under 5 MB, at least 600×600.
   - Expected: responsive WebP variants (320/640/960/1600 max), a blur
     placeholder and a 1200×630 social image are created under
     `backend/public_uploads/covers`.
4. Move the focal-point sliders and verify the card, hero and share previews
   follow the crop, in light and dark preview modes.
5. Fill AR/EN/FR alt text and save; reload → values persist.
6. Upload a PDF or a 200×200 image → explicit rejection, no 500.
7. Admin → Stories list → thumbnail column appears; filter **Missing image**.
8. Open the story without a cover on the public site → elegant gradient +
   geometric pattern + title fallback, never an empty box.
9. Public story page → devtools → OG image uses the social/cover image.

## 3. Story page

1. New reader: primary action is “Start reading”.
2. Reader with one completed part: “Continue reading · Part N” points to the
   next unread accessible part; the chevron points forward in LTR and in RTL.
3. Finish every part: no “continue” CTA, progress shows 100 %/completed, and
   three next steps appear (quiz, next story, video).
4. Locked premium part: teaser + membership link; content is not present in
   the API response.
5. Reviewer line shows the real reviewer or “Scientific review committee”, never
   “Administration Plateforme”.
6. Parts show done/current/locked states and a teaser line.
7. Under the parts: quiz card, video, matching ebook with price, related
   stories, “Suggest a story”, share card with quote and working copy/share.
8. No mixed language in header/footer/breadcrumb when switching to EN/FR.
9. Open Graph/description meta update per story.

## 4. Responsive, RTL and themes

At 360 px width, in Arabic RTL then French LTR, in light, sepia and dark:

- Cards keep a 3:4 cover, no layout shift while images load.
- Chevrons/arrows point in the reading direction.
- Summary banners, quiz options and image previews stay usable.
- Footer language switch keeps the current page.

## 5. Retention

- Completing a part shows the saved-progress confirmation and the gentle
  reminder opt-in (only when reminders are off).
- “New”, “Updated”, “Story of the week”, “New this week” labels use real dates.
- No invented reader/completion counters are shown.

## Known limits

- Collections/parts image alt fields and cropper UI are not exposed yet; the
  API accepts collection cover/banner and part illustration fields.
- Server-side focal-point cropping is not applied to derivatives; the focal
  point is used by CSS `object-position` on cards, hero and share previews.
- S3 deployments must serve `public_uploads` through `PUBLIC_MEDIA_BASE_URL`;
  local storage is served by Express at `/uploads/public`.
