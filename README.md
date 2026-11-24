# Card Agent Console — enterprise edition

Web console for the **card-agent-enterprise** API (branch `feature/qdrant-platform`, API v1). It gives operations, review and platform teams a screen for every operation the service exposes. Those operations are validating cards (with a live step-by-step trace), managing card programmes and their reference images, the human review queue, run history, statistics, runtime decision thresholds, accuracy evaluations, Git registry sync, and health.

It is a thin, typed client: every decision is made by the server. Nothing is simulated in the browser.

![Live validation](docs/screenshots/validate-live.jpg)

| Documentation | |
|---|---|
| [docs/PLATFORM.md](docs/PLATFORM.md) | How the console was built and verified, the architecture, how each API endpoint maps to a screen, the operating procedures, and the security model |
| Backend API reference | `docs/API.md` in card-agent-enterprise, and OpenAPI at `/docs` on the server |

## What it covers

| Area | Screens | API |
|---|---|---|
| Validation | Live validation (SSE timeline, straightened card with field regions, JSON), batch validation | `POST /v1/cards/validate`, `/validate/stream`, `GET /v1/pipeline/steps` |
| Card programmes | List; detail with YAML editor (live schema lint), form editor, **field-layout editor drawn on a real reference image**, reference images, delete; onboarding wizard; YAML import | `/v1/cards…` (GET, PUT JSON/YAML, DELETE, references upload/list/image/delete, `force` for Git-owned cards) |
| Registry | Loaded version and counts, Git sync (prune / re-embed), reload | `/v1/registry`, `/sync`, `/reload` |
| Review | Review queue with keyboard navigation; accept/reject with corrected identification and fields; enrol the photo as a reference | `GET /v1/review`, `POST /v1/runs/{id}/review` |
| Runs | History with filters and cursor paging; run detail (photo, result, review, JSON); re-validate with current settings; delete; prune | `/v1/runs…` |
| Overview | KPIs, decisions per day, outcomes by programme, top reasons, review load, platform state | `GET /v1/stats`, `/health/ready` |
| Decision settings | Every tunable threshold/weight with defaults and overrides, a merge-patch diff, **what-if evaluation before applying**, reset per section or all | `GET/PATCH/DELETE /v1/settings` |
| Evaluations | Sets (zip upload or built from reviewed runs), runs with live progress, report (gate, precision, agreement, field accuracy, confusion matrix, per-photo rows), comparison with an earlier run | `/v1/evaluation-sets…`, `/v1/evaluations…` |
| System | Readiness, connection, pipeline definition, Prometheus metrics | `/health/live`, `/health/ready`, `/metrics` |

## Quick start (development)

```bash
npm ci
CARD_AGENT_API=http://127.0.0.1:8080 npm run dev     # Vite proxies /v1, /health, /metrics → API (same origin, no CORS)
```
Open http://localhost:5173. Validation works without credentials. Click **Sign in** and enter the server's `CARDAGENT_API__ADMIN_TOKEN` for everything else.

Running the backend locally with demo data:
```bash
# in card-agent-enterprise (feature/qdrant-platform), see its README
export CARDAGENT_EMBEDDER__KIND=classic CARDAGENT_API__ADMIN_TOKEN=dev-admin-token CARDAGENT_QDRANT__PATH=./data/qdrant
python -m uvicorn cardagent.api.app:app --port 8080
# in this repo: two synthetic programmes, references, sample photos, runs, reviews, an evaluation set
python3 scripts/seed_demo.py --enterprise ../card-agent-enterprise --token dev-admin-token --out samples
```
`seed_demo.py` uses the backend's own synthetic test cards. Never point it at production.

## Production deployment

```bash
docker build -f deploy/Dockerfile -t card-agent-console .
docker run -p 8081:8080 -e CARD_AGENT_API=http://card-agent:8080 card-agent-console
```
The image serves the static build with nginx and reverse-proxies the API on the same origin (`deploy/nginx.conf.template`):

- Server-Sent Events are not buffered on `/v1/cards/validate/stream`.
- Uploads up to 520 MB are accepted (evaluation zips).
- Responses carry a strict Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff` and `no-referrer`.
- `/console-health` is the container health check.

If a screen says **"The API address returned a web page instead of the card-agent API"**, the host serving the console is not forwarding `/v1`, `/health` and `/metrics` to the API (for example a plain static host). Use the image above, `npm run dev`, or set the API base URL explicitly.

To serve the console from a different origin than the API instead, set the API base URL in the sign-in dialog and add the console origin to `api.cors_origins` on the server.

## Quality gates

```bash
npm run typecheck   # TypeScript, strict
npm run lint        # oxlint
npm test            # vitest: SSE parser, card schema mirror, PII masking, error mapping, metrics parser
npm run build
CONSOLE_URL=http://localhost:5173 ADMIN_TOKEN=... SAMPLES=samples npm run e2e   # 23 end-to-end steps, real browser + real API
```

## Project layout

```
src/api/          client.ts (fetch, token, errors, SSE POST) · sse.ts · endpoints.ts (one fn per operation) · queries.ts (TanStack Query) · types.ts
src/auth/         connection.tsx — base URL, admin token storage, role detection, preferences
src/components/   app-shell (nav, health, Ctrl K palette) · pipeline (live trace) · card-editor (YAML / form / ROI editor) · reference-manager · review-panel · result-view · common · ui/ (shadcn/ui, Radix)
src/lib/          card-schema.ts (zod mirror of registry/models.py) · format.ts · use-validation-stream.ts · use-save-card.ts
src/pages/        overview, validate, review, runs, run-detail, cards, card-detail, card-new, registry, settings, evaluations, evaluation-set, evaluation-detail, system
deploy/           Dockerfile, nginx.conf.template
e2e/              console.e2e.mjs (Playwright, real API)
scripts/          seed_demo.py
docs/             PLATFORM.md, screenshots/
```

Tech stack: React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui (Radix) · TanStack Query · React Router · CodeMirror 6 · Recharts · zod.
