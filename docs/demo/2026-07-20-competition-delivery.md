# Elsewhere competition delivery record

Date: 2026-07-20 (Asia/Bangkok)

## Public deliverables

- Product: <https://elsewhere-memory-tyx-2026.web.app>
- Demo video: <https://elsewhere-memory-tyx-2026.web.app/demo/elsewhere-competition-demo.mp4>
- Source repository: <https://github.com/tangoliver222/trip_memory_elsewhere>
- HyperFrames Studio: <http://localhost:3017/#project/demo-video-hf>
- Submission package: `/Users/tangyixuan/372`

The Hosting build is an anonymous, read-only judge experience. It does not claim that the public browser writes
private originals. The recording combines an actual local-file import flow with separately verified Google Cloud
evidence. The boundary is stated in the video and submission package.

## Video acceptance

```text
Duration: 278.166667 seconds (4m 38.2s)
Size: 34,336,499 bytes
Video: H.264, 1920x1080, 30 fps
Audio: AAC, 48 kHz, stereo
Public content type: video/mp4
Public content length: 34,336,499 bytes
```

Eight HyperFrames beat snapshots were manually checked before rendering. The video then received a dedicated
localization overlay stating that Thai, English and Chinese source artifacts remain intact rather than being
overwritten by translation.

## Fresh public verification

```text
npm run build
73 modules transformed; build completed

npx playwright test --config playwright.public.config.js
2 passed
  - stable recording-critical public routes
  - public video duration and 1920x1080 metadata

curl -sSIL https://elsewhere-memory-tyx-2026.web.app/demo/elsewhere-competition-demo.mp4
HTTP/2 200; content-type video/mp4; accept-ranges bytes
```

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
