# Card Agent Console

Operator console for the **card-agent** service (UAE discount-card validation agent). React 19 + Vite + Tailwind v4 + shadcn/ui, data via TanStack Query.

The console has no engine of its own. Every validation, run, threshold, card family and reference image comes from the card-agent FastAPI service over its REST API, and card images go only to that service.

## Pages

| Page | What it does |
|---|---|
| **Dashboard** | Live KPIs from `/v1/stats`: volume, auto-accept rate, agreement with human reviewers (wrong ACCEPTs), latency p50/p95. Also decisions over time, the stage where decisions are made, outcomes by family, top reason codes, agent × reviewer matrix and recent runs. **Run evaluation suite** runs the service's labelled test set. |
| **Validate a card** | Upload, drag-drop, paste or take a photo (or pick a labelled test image). Stages stream from `/v1/cards/validate/stream` as they run: quality checks, card detection, OCR tokens and orientation, family fusion table vs τ/δ with the closest reference images, variant scores, extracted fields over the normalised card, rule results, and the exact JSON envelope. The run is stored on the service. |
| **Runs & review** | Every run the service processed (from the capture system and from the console), with filters, search and paging. The review queue holds unreviewed REVIEW cases. A reviewer's ACCEPT/REJECT (with a note) is the ground truth for accuracy. **Enroll** adds a confirmed card to a variant's reference set. |
| **Card families** | Families loaded by the service, load errors, import and download YAML. |
| **Family editor** | YAML editor with live schema linting, form editor, field ROIs over a real reference card, reference images, server-side version history with restore, and delete. Saving PUTs the YAML; the service validates it, keeps the previous version and hot-reloads. |
| **Add card family** | Wizard: identity → variants → fields & layout → rules → reference photos → review YAML → create on the service and upload references. |
| **Reference cards** | Enrolled reference images per variant (upload, remove, nearest neighbours) and the service-computed variant separability matrix. |
| **Thresholds & settings** | Connection (service URL and API key), service info (versions, OCR languages, auth role, retention), live thresholds (admin), and a **what-if** evaluation of unsaved thresholds on the labelled set. |

## Run

Start the service (see the card-agent README), then:

```bash
npm install
CARD_AGENT_API=http://localhost:8080 npm run dev     # http://localhost:5173, /v1 proxied to the service
npm run build                                        # static build in dist/
```

If the service has `CARD_AGENT_API_KEY` set, enter the key in **Settings → Connection**. Operator keys can validate and review. Registry, reference, enrolment and threshold changes need the admin key.

## Deploy

The build is static, uses hash routing and relative paths, so it can be served from any internal host:

* **Same origin (recommended).** Serve `dist/` from the service with `CARD_AGENT_CONSOLE_DIR=/path/to/dist`, or put both behind one reverse proxy that routes `/v1` and `/health` to the service. Leave the service URL empty.
* **Separate origin.** Build with `VITE_CARD_AGENT_URL=https://card-agent.internal` (or set the URL in Settings), and add the console's origin to `CARD_AGENT_CORS_ORIGINS` on the service.

The API key lives in `sessionStorage` (this tab only) unless **Remember on this device** is ticked. Put the console behind the same internal gateway / SSO as the service.

## Layout

```
src/api/          client.ts (fetch + API key + NDJSON streaming), hooks.ts (react-query), types.ts (service contract)
src/hooks/        use-validation.ts (live stream), use-eval.ts (labelled-set evaluation)
src/lib/          schema.ts (zod schema of the family YAML, mirrors the service checks), color.ts
src/pages/        dashboard, validate, runs, families, family-editor, new-family, references, settings
src/components/   pipeline-trace, run-sheet, enroll-dialog, ref-gallery, family-form, yaml-editor, auth-image, ui/ (shadcn)
```
