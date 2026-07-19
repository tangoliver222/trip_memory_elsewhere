# Elsewhere

The production application is the independent vanilla project at [`design-lab/prototypes-vanilla`](./design-lab/prototypes-vanilla/README.md).

```bash
cd design-lab/prototypes-vanilla
npm install
npm run dev
```

The root React/Vite project is an imported preview workbench. `design-lab/elsewhere-frontend-v1` is archived reference code and is not a second runnable product.

## Competition demo

The isolated local competition path uses real selected bytes, Firebase Auth/Firestore/Storage Emulators, the
production deterministic processor and the live visual data graph. It does not register demo routes in the
production API composition.

```bash
node scripts/run-competition-demo.mjs
```

Open `http://127.0.0.1:4174/#/world/import` and select the staged files under
`demo-data/bangkok/originals/`. Use `--verify` to start the same stack and run the deterministic Playwright gate.
Gemini remains an explicit separate recording gate; see
[`docs/demo/2026-07-19-recording-runbook.md`](./docs/demo/2026-07-19-recording-runbook.md).
