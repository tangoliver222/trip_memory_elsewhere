# Competition recording visual audit

Date: 2026-07-20

Scope: recording-critical live-data routes at 390×844 and 430×932.

## Automated checks

- Imported the eight real Bangkok demo originals before visual inspection.
- Verified World Home, Bangkok City Home, Fragment Field, Fragment Lens,
  Discover Home, Discover Detail and Else Answer.
- Rejected mojibake, replacement glyphs, unresolved JavaScript values and
  horizontal page overflow.
- Required every page root and active overlay to remain inside the mobile app
  viewport.
- Required exactly one primary action on Discover Home and one Else Orb.
- Required the Discover Detail title to remain separated from its first
  evidence fragment.
- Measured World and City particle-group movement after scrolling and required
  it to follow the corresponding DOM anchor in the next animation frame.

## Fresh verification

```text
npm test
88 passed, 0 failed

npm run build
73 modules transformed; production build completed

npx playwright test --config playwright.recording.config.js
1 passed; 18 current screenshots and one continuous browser recording produced

COMPETITION_DEMO_URL=http://127.0.0.1:4174 \
  npx playwright test --config playwright.competition.config.js
1 passed; real import-to-discovery flow completed
```

## Manual comparison

The fresh screenshots were reviewed at both target sizes. The current baseline
keeps original media identifiable, preserves the single black/white/silver
visual language, removes the fixed decorative relation stripe from Fragment
Field, keeps Discover Home's entry action on-screen, and prevents the Discover
Detail title from covering its first evidence item.

The recording test writes disposable output under
`design-lab/prototypes-vanilla/artifacts/recording-visual/`. Curated accepted
frames are copied to the tracked `artifacts/screenshots/final/` baseline.
