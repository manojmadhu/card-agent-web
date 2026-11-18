# Card Agent Console

Web platform for the **card-agent** MVP (UAE discount-card validation agent). React + Vite + Tailwind v4 + shadcn/ui (Radix, new-york-v4).

It follows `card-agent/ARCHITECTURE.md` (not the enterprise build): one YAML per card family, 3-signal family fusion with τ/δ, variant → fields → rules, and ACCEPT / REVIEW / REJECT.

## Pages

| Page | What it does |
|---|---|
| **Dashboard** | KPIs (volume, auto-accept rate, decision accuracy, wrong ACCEPTs, p50/p95), decisions over time, where decisions are made (exit stage), outcomes by family, top reason codes, confusion matrix, recent runs. "Run evaluation suite" / "Simulate a week" push the labelled samples through the pipeline. |
| **Validate a card** | Pick a labelled sample or upload a photo, then watch the pipeline run step by step: `Ingest → Quality → Normalise → OCR → Embed card → Linear search → Family → Variant → Fields → Rules → Decision`. Each step shows its evidence (quality checks, OCR tokens, the embedding, top-k reference matches with thumbnails, the fusion table against τ/δ, variant scores, extracted fields with ROI overlay, rule results) plus the JSON result. Example: *Embed card → Linear search · not matching → Family · unknown card → REJECT*. |
| **Runs & review** | Every run with its trace. A review queue for REVIEW cases (Accept / Reject), and **Enroll** to add a confirmed image to a variant's reference set (the governance loop). |
| **Card families** | List, import or download YAML, and add a family. |
| **Family editor** | A **YAML editor** (CodeMirror, live schema linting with line numbers), a **form editor** (keywords, weights, variants with colour pickers, fields with ROIs and regexes, rules), a live template preview with ROIs, the family's reference cards, version history with restore, and delete. Saving hot-reloads the registry index. |
| **Add card family** | Six-step wizard: identity → variants → fields & layout → rules → reference images → review YAML → create. You can start from the layout of an existing family. |
| **Reference cards** | Every enrolled reference ("training") image grouped by family and variant, with upload and remove. Shows the index stats and a **variant separability matrix**. Clicking a reference shows its nearest neighbours and how often it was the top-1 match. |
| **Thresholds & settings** | τ/δ for family and variant, quality gate, search floor and ceiling, unknown-card action, VLM fallback, and the engine mode. **What-if** re-evaluates the labelled set with the current thresholds. |

## Two engine modes

* **Browser engine** (default, for demos and training). The full pipeline runs in TypeScript in the browser (`src/engine/`) and mirrors the MVP's stage order, scoring and decision policy. It uses real pixel maths for quality, normalisation, the colour (Lab) score and the embedding + linear cosine search. **OCR is simulated.** For labelled samples it reads the renderer's text layer, degraded by blur and glare. For uploads, an operator can type the printed text.
* **card-agent API**. The console calls your on-prem FastAPI service (`/v1/cards/validate`, `/v1/registry`, `/v1/registry/reload`). Set the base URL in Settings, or use the Vite dev proxy (`CARD_AGENT_API=http://host:8080 npm run dev`). Family saves also `PUT` the YAML. To enable that, mount `backend/admin_api.py` on the service:

  ```python
  from admin_api import make_admin_router
  app.include_router(make_admin_router(Path("registry"), reload_fn=registry.reload))
  ```
  It validates the YAML, writes it atomically with a `.bak`, stores reference uploads under `registry/refs/<family>/<variant>/`, and triggers the hot reload.

  The MVP returns only the final envelope, so in API mode the step timeline is rebuilt from the result JSON. For true per-stage streaming, add an SSE endpoint to the service that yields the same `StepState` objects as `src/engine/pipeline.ts`.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static build in dist/ (hash routing, relative paths — can be served from any internal host)
```

Engine regression check (headless Chrome, all 13 labelled scenarios):
```bash
npx vite --port 5199 &  node dev/run-test.mjs http://localhost:5199/dev/engine-test.html
```

## Layout

```
src/engine/       schema.ts (zod schema of the YAML)  seed.ts (fazaa/esaad from the MVP)
                  pipeline.ts (stages + decision)  vision.ts  embed.ts  ocr.ts  rules.ts
                  render.ts (synthetic cards)  samples.ts (labelled cases)  registry.ts (index)  api.ts
src/pages/        dashboard, validate, runs, families, family-editor, new-family, references, settings
src/components/   pipeline-trace (flow strip + timeline + evidence), family-form, yaml-editor, ref-gallery, ui/ (shadcn)
backend/          admin_api.py — FastAPI router for YAML + reference management
```

State (YAML, history, settings) is kept in localStorage. Uploads and run history are kept in IndexedDB, so the console works offline and sends nothing anywhere unless API mode is on.

## Caveats

* Card layouts, colours and number formats are the MVP's **synthetic placeholders**. Calibrate them with real, consented cards.
* The browser embedder (`classic-hsv-grid-hog-108`) is a model-free stand-in. Production uses the service's own embedder.
* Decision accuracy on the dashboard is measured on synthetic samples. Measure real accuracy on a labelled set of real photos.
