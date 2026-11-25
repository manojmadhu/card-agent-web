# Card Agent Console — platform and process documentation

Version 2.1.0 · branch `feature/two-sided-console` · targets card-agent-enterprise `feature/two-sided-cards` (API v1, result schema 2.1, commit `df010d4`). It stays compatible with `feature/qdrant-platform` (schema 2.0, commit `31daeb0`).

1. [Purpose and scope](#1-purpose-and-scope)
2. [How the console was built](#2-how-the-console-was-built)
3. [Architecture](#3-architecture)
4. [API coverage: every endpoint, every screen](#4-api-coverage)
5. [Operating procedures](#5-operating-procedures)
6. [Security and privacy](#6-security-and-privacy)
7. [UX principles applied](#7-ux-principles-applied)
8. [Verification](#8-verification)
9. [Deployment and configuration](#9-deployment-and-configuration)
10. [Known limitations and next steps](#10-known-limitations-and-next-steps)
11. [Two-sided cards (schema 2.1)](#11-two-sided-cards-schema-21)

---

## 1. Purpose and scope

card-agent-enterprise identifies GCC discount/membership cards from a photo (programme → variant), extracts the printed fields, validates them, and returns `ACCEPT`, `REVIEW` or `REJECT`. It runs entirely offline, with Qdrant as its only store.

The console is the operating interface for that service. Its users are:

| Role | Uses the console to |
|---|---|
| Front-line operator | Validate a card and see why it was decided (no credentials needed) |
| Reviewer | Settle REVIEW cases, correct identification and fields, enrol good photos as references |
| Card onboarding / registry owner | Add and maintain programmes, variants, field regions, rules and reference images |
| Risk / quality owner | Watch automation and review rates, tune thresholds safely, and run evaluations with a pass/fail gate |
| Platform engineer | Check readiness, metrics and registry version, sync from Git, reload |

Scope rule: the console implements **every operation in `docs/API.md`**, and only what the API supports. It holds no business logic of its own. Client-side checks (card schema, weights summing to 1) only give faster feedback; the server validates again.

## 2. How the console was built

The work followed seven steps. Each step's output was the input of the next.

1. **Study the backend.** We read every router (`api/routes/*.py`), the card model (`registry/models.py`), the result contract (`schemas.py`), the stream trace (`pipeline/trace.py`), runtime settings, the run store, evaluation stores and `config/settings.yaml`.
2. **Run the real backend locally.** We installed the service and ran its test suite (**43/43 passed**). We then started it with embedded Qdrant (`CARDAGENT_QDRANT__PATH`) and the model-free `classic` matcher, and seeded it with `scripts/seed_demo.py`. That script uses the backend's own synthetic test cards: 2 programmes, 3 variants, 9 references, sample photos, runs, reviews and an evaluation set.
3. **Record real responses.** We captured every endpoint's response, including a full SSE stream (`snapshot → 18 × step → image → result`). The TypeScript types in `src/api/types.ts` were written from these recordings, not from assumptions.
4. **Write the API layer first.** `client.ts` owns the base URL, the token, timeouts and error normalisation. `endpoints.ts` has one function per operation. `queries.ts` holds the caching, polling and invalidation rules. `sse.ts` reads the stream from a `fetch` body (EventSource cannot POST).
5. **Build the screens.** Each screen is built around one operator task (section 7), using shadcn/ui on Radix primitives.
6. **Verify.** We ran type-checking, lint and unit tests, then a 23-step browser test against the real API. We ran it first on the dev server, then on the **production build behind the production nginx config with its strict CSP**. That second run caught a real defect, which was fixed: re-validation read a `blob:` URL that the CSP blocks.
7. **Document.** This file and the README. Screenshots in `docs/screenshots` come from the verification run.

## 3. Architecture

```
 Browser (React SPA)                         nginx (deploy/)                      card-agent API (FastAPI)
┌──────────────────────────────┐   same     ┌──────────────────────┐            ┌──────────────────────────┐
│ pages/*  ─ one per task      │  origin    │ static dist/         │            │ /v1/cards/validate[/stream]
│ components/ (shadcn + Radix) │ ─────────▶ │ /v1 /health /metrics │ ─────────▶ │ /v1/cards… /v1/registry…  │
│ api/queries (TanStack Query) │            │  → proxy_pass         │            │ /v1/runs… /v1/review      │
│ api/client  (fetch + token)  │ ◀── SSE ── │ stream: no buffering │ ◀── SSE ── │ /v1/stats /v1/settings    │
│ auth/connection (role)       │            │ CSP, X-Frame, nosniff│            │ /v1/evaluation…  Qdrant   │
└──────────────────────────────┘            └──────────────────────┘            └──────────────────────────┘
```

Key decisions:

| Decision | Why |
|---|---|
| Same-origin reverse proxy by default | No CORS to configure. The admin token never crosses origins. CSP `connect-src 'self'` stays strict. |
| TanStack Query for all server state | Caching, de-duplication, background refresh and targeted invalidation. Polling is on only while needed: evaluations in progress, the review queue, health. |
| Retry policy | 503 (Qdrant unavailable) and network errors retry with backoff, honouring `Retry-After`. 4xx errors never retry. |
| SSE over `fetch` | The stream endpoint is a multipart POST, so the console parses the body with a spec-compliant parser. It handles chunk splits, CRLF, comments and multi-line data, and is unit-tested. |
| Admin images fetched as blobs | `<img src>` cannot send `X-Admin-Token`. Run photos and reference images are fetched with the header and shown as object URLs, which are revoked on unmount. |
| Client schema mirror (zod) | Instant line-level feedback in the YAML editor. Server 422 paths are mapped back to YAML lines. |
| Lazy routes and vendor chunks | The first load is about 115 KB gzipped. The editor (CodeMirror) and charts load only on the screens that need them. |
| Hash routing, relative base | The static build runs under any path prefix without server rewrites. |

## 4. API coverage

Every endpoint in `docs/API.md`, and where it lives in the console.

| Endpoint | Access | Screen → action |
|---|---|---|
| `POST /v1/cards/validate` (`image` · `front`/`back` · `images`) | open | Validate › Batch (front/back pairing); Run detail › Re-validate now (`store=false`, same photo roles) |
| `POST /v1/cards/validate/stream` (same photo fields) | open | Validate › Live, step by step (`mode=delta`, `store` toggle, request id; One photo / Front and back / Sides unknown) |
| `GET /v1/pipeline/steps` | open | Health & metrics › Pipeline |
| `GET /v1/cards` | open | Card programmes; command palette; filters everywhere |
| `GET /v1/cards/{id}` (+ `?format=yaml`) | open | Programme › Overview / Definition (YAML) |
| `PUT /v1/cards/{id}` (JSON or YAML, `?force`) | admin | Programme › Save; Add programme wizard; Import YAML; 409 → force confirmation |
| `DELETE /v1/cards/{id}` (`?force`) | admin | Programme › Delete (type the id to confirm) |
| `GET /v1/cards/{id}/references` | admin | Programme › Reference images (grouped by side); Field layout background per side |
| `POST /v1/cards/{id}/variants/{v}/references` (`detect_card`, `side`) | admin | Reference images › Upload front / Upload back (per-file created / exists / rejected); wizard last step |
| `GET /v1/cards/{id}/references/{ref}/image` | admin | Reference thumbnails; stream search step; layout editor |
| `DELETE /v1/cards/{id}/references/{ref}` (`?force`) | admin | Reference viewer › Delete |
| `GET /v1/registry` | open | Registry & sync; sidebar footer |
| `POST /v1/registry/sync` (`prune`, `reembed`) | admin | Registry & sync › Run sync |
| `POST /v1/registry/reload` | admin | Registry & sync › Reload now |
| `GET /v1/runs` (filters, `before` cursor) | admin | Run history (filters live in the URL, so a view can be shared) |
| `GET /v1/runs/{id}` | admin | Run detail; Review queue detail |
| `GET /v1/runs/{id}/image` (`side`, `photo`) | admin | Run detail photos; queue thumbnails; per-photo panel; re-validate |
| `DELETE /v1/runs/{id}` | admin | Run detail › Delete |
| `POST /v1/runs/{id}/review` (`photo_sides`) | admin | Review queue / Run detail › Accept / Reject (+ corrections, enrol with a side per photo) |
| `GET /v1/review` | admin | Review queue; sidebar badge |
| `POST /v1/runs/prune` | admin | Run history › Prune old runs |
| `GET /v1/stats` | admin | Overview (range, custom dates, programme filter) |
| `GET /v1/settings` | open | Decision settings (read-only without admin) |
| `PATCH /v1/settings` | admin | Decision settings › Apply to live traffic (merge-patch of changes only) |
| `DELETE /v1/settings` (`?section`) | admin | Decision settings › Reset section / Reset all |
| `POST /v1/evaluation-sets` | admin | Evaluations › Upload zip |
| `POST /v1/evaluation-sets/from-runs` | admin | Evaluations › From reviewed runs |
| `GET /v1/evaluation-sets`, `GET/DELETE …/{id}` | admin | Evaluations; Evaluation set page |
| `POST /v1/evaluations` (`settings`, `today`) | admin | Run evaluation dialog; Decision settings › What-if evaluate |
| `GET /v1/evaluations`, `GET/DELETE …/{id}` (`rows`) | admin | Evaluations; Evaluation report (live progress, comparison) |
| `GET /health/live`, `/health/ready` | open | Header status pill, unreachable banner, Health & metrics |
| `GET /metrics` | open | Health & metrics › Prometheus metrics |

Error semantics, applied the same way everywhere:

| Status | Console behaviour |
|---|---|
| `401` | The token was rejected or rotated. The sign-in dialog opens and the admin role is dropped. |
| `403` | Admin endpoints are disabled on the server. A banner says so and admin screens explain why. |
| `404` | "Not found" state with a way back. |
| `409` | Ownership conflict on a Git-owned programme. A confirmation explains the hand-over to API ownership, then retries with `force=true`. |
| `413` / `415` | Checked in the browser before upload (8 MB, JPEG/PNG/WebP). The server's message is shown if it still rejects. |
| `422` on a photo field (2.0 server) | A 2.0 server does not know `front`/`back`/`images`. The validate screen explains that the server predates two-sided cards and suggests **One photo**. |
| `422` | Pydantic details are shown per field. In the YAML editor they are mapped to line numbers. |
| `503` | Automatic retry honouring `Retry-After`, plus a top banner while the API is unavailable. |

## 5. Operating procedures

### 5.1 Onboard a new card programme
1. **Add programme**. Optionally start by copying an existing programme's layout: its keywords become negative keywords.
2. **Identity**: id `cc.name` (it cannot change later), country, issuer, English and Arabic keywords, negative keywords for look-alikes.
3. **Variants**: body colour, tier words, card-number prefix.
4. **Fields and layout**: open a clean, flat photo (it stays in the browser) and drag each field's region. Set the regex (Python `re`, full match), normalisation, anchor and script.
5. **Rules**: mark `critical` only where a failure must reject (e.g. `not_expired`). `date_order` and `length` take parameters.
6. **Review and create**: the YAML is shown for a last edit, then `PUT /v1/cards/{id}`.
7. **Reference images**: 3–20 clean, consented images per variant. Keep "Find and straighten the card" on for photos and off for flat scans. Rejected files are listed with the reason.
8. **Measure** before trusting ACCEPTs: run an evaluation set that contains the new programme (5.4).

### 5.2 Daily review
1. Open the **Review queue**. The sidebar badge shows the pending count, and the queue refreshes every 15 s.
2. For each card, compare the photo with what the agent read. Navigate with <kbd>J</kbd> / <kbd>K</kbd>.
3. If needed, correct the programme or variant, and edit only the fields the agent read wrong.
4. **Accept** or **Reject**. Tick **Enrol this photo as a reference** when an accepted card shows a design the agent struggled with. The queue moves on automatically.
5. Reviewer verdicts are the ground truth for evaluation sets built "from reviewed runs".

### 5.3 Change a threshold safely
1. **Decision settings**: edit values. Edited fields are highlighted, and weights show their sum (it must be 1).
2. **What-if evaluate**: choose a labelled set. The evaluation runs with the changes applied to that evaluation only; live traffic is unaffected.
3. In the report, compare with the previous evaluation of the same set (the Δ shows in percentage points). Check the gate, wrong ACCEPTs, and the automation rate.
4. **Apply to live traffic**. The confirmation lists every change (old → new). Changes reach all replicas within `qdrant.refresh_seconds`.
5. Roll back with **Reset section** or **Reset all overrides**.

### 5.4 Release gate with evaluations
- Sets come from an uploaded zip (`manifest.json` + photos) or from reviewed runs (accepted → expected ACCEPT, with the reviewer's identification and corrections; rejected → expected REJECT).
- Set **Evaluate as of** a fixed date so that expiry rules give reproducible results.
- The gate passes when ACCEPT precision ≥ `evaluation.min_accept_precision` (0.99) and status agreement ≥ `evaluation.min_status_agreement` (0.90). Run the same check in CI with `tools/evaluate.py` in the backend.

### 5.5 Git-managed programmes
- Programmes under `registry/cards` with images in `registry/refs` are imported by **Registry & sync › Run sync**. Prune is optional; re-embed is needed only after changing the matcher.
- In the console they carry a **Git registry** badge. Editing or deleting one requires an explicit *force*, after which the API owns it and later syncs leave it alone.

### 5.6 Incidents
| Symptom | Where to look | Action |
|---|---|---|
| Red "API unavailable" banner | Health & metrics › Readiness | Qdrant or the API is down. The console retries automatically. |
| "The API address returned a web page instead of the card-agent API" | Connection settings; reverse proxy | The console is reaching a web server that is not the API — usually a static host or `vite preview` with no proxy for `/v1`, `/health`, `/metrics`, or a wrong API base URL. Use the nginx image, `npm run dev` with `CARD_AGENT_API`, or set the API base URL (and `api.cors_origins` on the server). |
| Review rate rising | Overview › Top reason codes, Outcomes by programme | A new card design (enrol references) or degraded photos (quality reasons) |
| Wrong ACCEPT reported | Run detail › Review › Reject | Then build a set from reviewed runs and evaluate before changing thresholds |
| Settings changed unexpectedly | Header tooltip "settings overridden"; Decision settings banner | Every admin change is audit-logged by the server (`cardagent.audit`) |

## 6. Security and privacy

- **Admin token**: sent only as `X-Admin-Token`, and only to the configured API. By default it is kept in `sessionStorage` and forgotten when the tab closes. "Remember on this device" (`localStorage`) is opt-in and labelled as unsafe for shared computers. **Sign out** removes it and clears all cached data.
- **Least privilege in the UI**: without a valid token the console makes no admin calls at all. Admin screens show why they are locked, so there are no failed requests and no noisy 401s.
- **Personal data**: runs contain names, card numbers and Emirates ID numbers. Masking is **on by default** in every result view (last 4 characters, name initials). The eye icon in the header reveals the data per session. Review corrections never pre-fill masked values.
- **Destructive actions** always ask for confirmation. Deleting a programme requires typing its id. Deletes, prunes, Git-owned overrides and live settings changes all spell out the consequences first.
- **Transport and browser hardening** (nginx): CSP `default-src 'self'` with `connect-src 'self'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, and a Permissions-Policy that disables camera, microphone and location. The app needs no inline scripts.
- **Retention**: the console never stores runs or photos. Pruning follows `runs.retention_days` (UAE PDPL), and the console exposes manual pruning.

## 7. UX principles applied

1. **Task-first navigation.** Operations, Card registry, Quality and System groups follow who does what, not how the API is laid out. <kbd>Ctrl</kbd>+<kbd>K</kbd> jumps to any page, programme or run id.
2. **Explain every decision.** The validation timeline shows each stage's evidence: quality checks, OCR tokens, shortlisted and geometrically verified references, signal fusion against τ/δ, variant scores, fields with regions, and rules. Reason codes are shown with plain-language labels.
3. **Safe by default.** What-if comes before Apply. Diffs are shown before saving. Removing a variant warns that its references will be deleted, and ROI changes warn that keypoints will be re-extracted.
4. **Progressive disclosure.** The summary comes first, evidence opens on demand, and the raw JSON is one tab away.
5. **State is always visible.** Health pill, registry version, override banner, review badge, live progress for streams and evaluations, and an unsaved-changes bar.
6. **Shareable views.** Run filters and the programme tab live in the URL.
7. **Accessible.** Radix primitives (focus management, ARIA), labelled inputs, keyboard row navigation, icons that do not rely on colour alone, and a dark theme.
8. **Consistent visual language.** ACCEPT green, REVIEW amber and REJECT red are used everywhere. Numbers use tabular figures.

## 8. Verification

The 2.0.0 checks ran on 2026-11-24/25 against a real card-agent-enterprise server (`feature/qdrant-platform`, embedded Qdrant, classic matcher, Tesseract 5.3.4). The 2.1.0 checks ran on 2026-11-26 against two real servers side by side: `feature/two-sided-cards` (`df010d4`) and `feature/qdrant-platform` (`31daeb0`).

| Check | Result |
|---|---|
| Backend test suite (`pytest`) | 43 / 43 passed |
| `tsc -b` (strict) | 0 errors |
| `oxlint` | 0 errors (style warnings only) |
| `vitest` unit tests | 15 / 15 passed (SSE parser, card schema mirror, YAML line mapping, PII masking, reason labels, pydantic error mapping, Prometheus parser) |
| E2E on the dev server (Vite) | 23 / 23 passed, 0 browser errors |
| E2E on the **production build behind the production nginx config** | 23 / 23 passed, 0 browser errors (after fixing the CSP defect found by this run) |
| SSE through nginx | Events arrive incrementally over the run (+0.00 s … +1.40 s), not buffered |
| Security headers | CSP, X-Frame-Options, nosniff and Referrer-Policy present on HTML, and assets cached for 1 year |

2.1.0 (two-sided cards):

| Check | Result |
|---|---|
| Backend test suite, `feature/two-sided-cards` | 74 / 74 passed |
| `tsc -b` / `oxlint` | 0 errors |
| `vitest` | 28 / 28 passed (adds front/back pairing and sides schema tests) |
| **Existing** 23-step e2e, unchanged, against the 2.1 server | 23 / 23 passed (dev server and production build behind nginx) |
| **Existing** 23-step e2e, unchanged, against the 2.0 server | 23 / 23 passed — the upgrade does not break current deployments |
| New 16-step two-sided e2e (`e2e/two-sided.e2e.mjs`) | 16 / 16 passed on the dev server and on the production build behind nginx (strict CSP); re-runnable, it cleans up the references it enrols |

The 23 E2E steps (`e2e/console.e2e.mjs`):
1. Operator view is locked.
2. Admin sign-in.
3. Overview loads.
4. Live validation ending in REVIEW.
5. Unknown card ending in REJECT (*Embed → Search · not matching → Family · unknown card → REJECT*).
6. Batch of 4 photos.
7. A review accepted, and the queue count drops.
8. Run history filtered, run detail and re-validate.
9. Programme list.
10. YAML edit and save.
11. YAML error caught before saving.
12. Field layout on a reference image.
13. Reference upload and delete.
14. New programme through the wizard.
15. Type-to-confirm delete.
16. Registry sync and reload.
17. What-if evaluation to a report.
18. Settings apply and reset.
19. Evaluations list, set and report.
20. Set built from reviewed runs.
21. Metrics.
22. Command palette.
23. Sign-out locks admin screens again.

The 16 two-sided steps (`e2e/two-sided.e2e.mjs`):
1. Sign in.
2. One photo is still the default (sends `image`, as before).
3. Front and back → ACCEPT, with both straightened photos and fields by side.
4. Per-photo rows in the Quality stage and the side-assignment table in Fields.
5. Swapped front/back is detected and shown as "side corrected".
6. Front only → REJECT `SIDE_REQUIRED:back`, fields marked "not photographed", **Add a photo of the back** → ACCEPT.
7. Sides unknown (`images`) → ACCEPT.
8. One photo of a back-only programme → ACCEPT.
9. Batch pairs `*_front`/`*_back` files into one card.
10. Programme list and overview show sides and per-side reference counts.
11. Field layout per side (back shows only back fields).
12. Upload a reference to the back of a variant and delete it.
13. Run detail shows both photos; review enrols both with a side each.
14. Wizard creates a two-sided programme with a field on the back (YAML has `sides` and `side: back`), then deletes it.
15. Evaluation report lists both files of two-photo cases.
16. Decision settings expose `scoring.sides_mismatch_geometry`.

## 9. Deployment and configuration

| Setting | Where | Default |
|---|---|---|
| Upstream API | `CARD_AGENT_API` (container env / Vite dev) | `http://card-agent:8080` (container), `http://127.0.0.1:8080` (dev) |
| API base for a cross-origin setup | sign-in dialog, or `VITE_API_BASE` at build time | empty (same origin) |
| Admin token | entered by the user; server side `CARDAGENT_API__ADMIN_TOKEN` | — |
| CORS (cross-origin only) | server `api.cors_origins` | `[]` |

```bash
docker build -f deploy/Dockerfile -t card-agent-console .
docker run -p 8081:8080 -e CARD_AGENT_API=http://card-agent:8080 card-agent-console
```
The container is `nginx-unprivileged` on port 8080 with health check `/console-health`. To add it to the backend's `deploy/docker-compose.yml`, put it on the same network as the agent and set `CARD_AGENT_API=http://agent:8080`.

## 10. Known limitations and next steps

- **One shared admin token.** The API has a single token, so the console cannot attribute actions per user beyond the free-text reviewer name. Next step: put an identity-aware proxy (OIDC) in front of the console and API and pass the user into the server's audit log.
- **Statistics window.** `/v1/stats` caps at `runs.stats_max_runs`. The overview warns when its numbers are truncated.
- **Matcher and models are not editable at runtime.** By design these settings are fixed; the console shows them read-only.
- **Not verified in this environment:** the DINOv2/GPU path, PaddleOCR and the VLM fallback (all server-side), and a real container build (no Docker daemon was available; the nginx template itself was verified with nginx 1.24).
- **Two-sided cards on the DINOv2/GPU matcher** were not exercised here (classic matcher only), and the side detection quality must be measured on real, consented two-sided cards with an evaluation set that uses `files`.
- **Demo data is synthetic.** Layouts, colours and formats must be calibrated on real, consented cards before ACCEPTs are trusted (backend OPERATIONS §5).

## 11. Two-sided cards (schema 2.1)

### 11.1 What changed in the backend
`feature/two-sided-cards` lets a programme declare `sides: [{id: front}, {id: back, required: …}]` and put each field on a side. A validation can carry up to two photos. The pipeline runs ingest, quality, normalise, OCR and embedding **per photo**, merges the evidence into one decision and reports `photos[]` (side, how the side was decided, quality, fields read, matched reference) and `missing_sides`. New reason codes: `SIDE_REQUIRED:<side>` (a required side was not photographed) and `SIDES_MISMATCH` (the two photos do not belong to the same card); a rule can be skipped with `SIDE_NOT_CAPTURED:<side>`. References, run images, reviews and evaluation manifests gained a side as well.

### 11.2 How the console follows it

| Area | Change | Compatibility |
|---|---|---|
| Types (`src/api/types.ts`) | `Side`, `PhotoInfo`, `photos`, `missing_sides`, `fields[].side`, card `sides`, `reference_images_by_side`, `missing_references`, run `images`, review `photo_sides` / `enrolled_photos`, evaluation `files` | Every new property is optional; a 2.0 response is still valid |
| Requests (`endpoints.ts`) | `validatePhotos({image} \| {front, back} \| {images})`; `uploadReferences(…, side)`; `runImagePath(id, {side, photo})` | `validate(image)` still sends only `image`; `side` is only sent when chosen |
| Validate | Three modes; the default **One photo** is the old behaviour. Missing-side callout with a one-click fix. Straightened photos per photo with that side's regions | 2.0 servers: a clear message if a two-photo mode is used |
| Timeline (`pipeline.tsx`) | Per-photo sub-sections for per-photo stages; fields table gets a Side column and a side-assignment table; `SIDES_MISMATCH` note on the search step | Single-photo detail is rendered exactly as before |
| Result | Side badge per field, "not photographed" for fields whose side is missing, Photos panel | Shown only when the card is two-sided or several photos were sent |
| Programmes | Sides section in the form editor, side per field, per-side layout editor, references grouped by side, `missing_references` warning, wizard **Sides** step | A one-sided programme has no `sides` in its YAML, and it stays that way unless an operator adds a back |
| Review | Both photos shown; enrol each photo as Front / Back / not at all; `photo_sides` is sent only when the reviewer changed the agent's sides | Single-photo review unchanged |
| Batch | `pairFiles`: `x_front`+`x_back` (or `-f`/`-b`) → one card; `x_1`+`x_2` → `images`; everything else → one photo | Turn **Pair front/back** off to send every file alone |

### 11.3 Procedures
- **Turn a programme into a two-sided one.** Programme › Form editor › Sides › *Front and back*. Choose whether the back is *Automatic*, *Required* or *Optional*, move fields that are printed on the back with their Side selector, draw their regions on the back in Field layout, then upload 3–20 back references per variant. Until every variant has back references, the overview shows a `missing_references` warning. Run an evaluation that includes front+back cases before relying on it.
- **Validate a card that has data on both sides.** Validate › *Front and back*, add both photos and validate. If only one side was photographed and the other is required, the result is REJECT `SIDE_REQUIRED:<side>`; click **Add a photo of the <side>**. When you do not know which photo is which, use *Sides unknown*: the agent decides and reports how.
- **Review a two-photo run.** Check both photos. When enrolling, confirm the side of each photo (the agent's choice is pre-selected); set *Do not enrol* for a blurred one.
- **Evaluate.** In `manifest.json`, a case may use `"files": {"front": "a.jpg", "back": "b.jpg"}` or `"files": ["a.jpg", "b.jpg"]` instead of `"file"`. The report lists both files.
- **Tune.** `scoring.sides_mismatch_geometry` sets how weak the geometric agreement between the two photos may get before the agent reports `SIDES_MISMATCH`. Use what-if evaluation before applying, as for any threshold (5.3).

