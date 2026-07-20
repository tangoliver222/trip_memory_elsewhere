# Elsewhere competition delivery record

Date: 2026-07-20 (Asia/Bangkok)

## Public deliverables

- Product: <https://elsewhere-memory-tyx-2026.web.app>
- Stable product walkthrough: <https://elsewhere-memory-tyx-2026.web.app/demo/elsewhere-competition-demo.mp4>
- Narrated architecture presentation: <https://elsewhere-memory-tyx-2026.web.app/demo/elsewhere-competition-demo-narrated.mp4>
- Source repository: <https://github.com/tangoliver222/trip_memory_elsewhere>
- HyperFrames Studio: <http://localhost:3017/#project/demo-video-hf>
- Submission package: `/Users/tangyixuan/372`

The Hosting build is an anonymous, read-only judge experience. It does not claim that the public browser writes
private originals. The primary recording uses the frozen competition fixture and captures the real route, search,
Lens, discovery and Else interactions in the browser. The longer narrated presentation remains available separately
and combines an actual local-file import flow with separately verified Google Cloud evidence.

## Video acceptance

```text
Duration: 127.72 seconds (2m 7.7s)
Size: 4,923,609 bytes
Video: H.264, 368x800, 25 fps
Audio: none
Public content type: video/mp4
Public content length: 4,923,609 bytes
```

The walkthrough was recorded only after the two mobile viewport suites passed. It includes World, City, Fragment
Field search, Fragment Lens, Discover Home, Discover Detail and Else Answer. The 4m38 narrated architecture video
is preserved at the secondary URL above.

## Fresh public verification

```text
npm run build
73 modules transformed; build completed

npx playwright test --config playwright.public.config.js
3 passed
  - public entry reaches world and import
  - stable recording-critical public routes
  - public video duration and 368x800 metadata

curl -sSIL https://elsewhere-memory-tyx-2026.web.app/demo/elsewhere-competition-demo.mp4
HTTP/2 200; content-type video/mp4; accept-ranges bytes
```

## Frontend stability release

The public Hosting release was rebuilt and redeployed after a full 390px visual audit. The release fixes three
recording-visible defects without changing the frozen World/City composition:

- non-photo artifacts no longer render a second caption/type layer over their own receipt, ticket, menu or map copy;
- Discover Home reserves a complete mobile evidence field before the conclusion copy begins;
- Fragment Field city labels use data-order slots, so a new or hyphenated city slug cannot fall back to `(0, 0)`.

Fresh verification executed immediately before and after deployment:

```text
npm test
89 passed

npx playwright test tests/e2e/routes.spec.js tests/e2e/performance.spec.js \
  --project=mobile-390 --project=mobile-430
60 passed

npx playwright test --config playwright.recording.config.js
1 passed (both 390x844 and 430x932 paths)

npm run build
73 modules transformed

npx firebase-tools deploy --project elsewhere-memory-tyx-2026 \
  --config firebase/firebase.json --only hosting
Deploy complete

ELSEWHERE_PUBLIC_URL=https://elsewhere-memory-tyx-2026.web.app \
  npx playwright test --config playwright.public.config.js
3 passed
```

## Production data-path release

The backend shared image `3a2af7e` is deployed to three isolated Cloud Run composition roots. The
API includes reviewed authenticated `GET /v1/memory-snapshot` and budgeted `POST /v1/else/ask`
boundaries; it does not expose demo reset or manual finalize routes. A fresh real-cloud smoke completed
an actual receipt upload and verified:

```text
authenticated_api=passed
owner_memory_snapshot=passed
storage_eventarc_routing_tasks=passed
document_ai_result=completed
vertex_else_answer=sourced
else_query_budget=passed
test_owner_cleanup=passed
```

Backend verification after release: 627 ordinary tests with 618 pass, 9 expected Emulator-only
skips and 0 failures; Firebase Emulator suite 71/71. Frontend unit tests are 90/90 and the production
build remains successful.

## Submission collector status

The official `vibe-submission-collector` rendered all numbered documents and technical evidence. The remaining
validation errors are personal or contestant declarations that cannot be inferred from the repository:

1. certificate name;
2. mobile number;
3. individual/team mode (and certificate names if team);
4. whether the work existed before the contest;
5. work newly created during the contest;
6. originality confirmation;
7. consent for judges to access and test the work.

Optional warnings remain for track, email or WeChat, Xiaohongshu URL, external local-user testing and gift shipping.
No credentials, App Check debug tokens, processor identifiers or real-user private data are included.
