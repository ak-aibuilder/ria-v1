# Backend Development Plan — RIA (Retail Integration Agent)

## 1. Executive Summary

- Build a FastAPI backend that powers the existing Next.js frontend's 4-phase pipeline: Upload → Audit → Enrich → Validate.
- Replace all frontend mock/dummy logic (CSV parsing, mock scoring, mock enrichment, mock agent) with real backend endpoints.
- Implement the deterministic UCP/ACP readiness rubric (6 dimensions) and Claude-driven enrichment + validation agent per the attached Technical Design PDF.
- Stack: FastAPI on Python 3.13 (async), MongoDB Atlas via Motor + Pydantic v2, Anthropic SDK for Claude.
- No Docker. No queues (use FastAPI `BackgroundTasks` only when strictly needed). Single Git branch `main`. Manual UI testing per task.
- Sprint count is dynamic. Plan covers S0 → S6.

## 2. In-Scope & Success Criteria

- In-scope (matches frontend + PRD):
  - Session bootstrap with 30-minute TTL.
  - CSV upload + parse + normalize + dedupe.
  - Deterministic readiness audit with per-product scores, dimension scores, gaps.
  - Claude enrichment (description, Q&A, agent facets, relationships) with provenance + confidence.
  - Validation agent demo with side-by-side pre/post tool-use transcripts.
  - Export endpoints (full session JSON for the header "Export" button).
  - Reset session.
- Out of scope: pagination (no UI controls), multi-tenant auth, persistent users, file storage beyond MongoDB documents, vector search.
- Success Criteria:
  - All 4 frontend phases work end-to-end against the live backend.
  - Each task's Manual Test Step passes via the UI.
  - After every sprint's tasks pass, code is committed and pushed to `main`.

## 3. API Design

- Base path: `/api/v1`.
- All endpoints return JSON. Errors use envelope: `{ "error": "message" }`.
- Auth: every endpoint (except `/auth/*` and `/healthz`) requires a `Bearer <jwt>` header tied to a session.

- `GET /healthz`
  - Purpose: liveness + MongoDB ping.
  - Response: `{ "status": "ok", "db": "ok" }`.

- `POST /api/v1/auth/signup`
  - Purpose: create demo user (PRD allows session-only; we add minimal account for the JWT contract).
  - Request: `{ "email": str, "password": str }`.
  - Response: `{ "token": str, "session_id": str }`.
  - Validation: email format; password ≥ 8 chars; unique email.

- `POST /api/v1/auth/login`
  - Request: `{ "email": str, "password": str }`.
  - Response: `{ "token": str, "session_id": str }`.

- `POST /api/v1/auth/logout`
  - Response: `{ "ok": true }`.

- `GET /api/v1/auth/me`
  - Response: `{ "email": str, "session_id": str, "phase": str }`.

- `POST /api/v1/session/reset`
  - Purpose: clear session-scoped data (products, scored, enriched, transcripts) for current session.
  - Response: `{ "session_id": str, "phase": "upload" }`.

- `GET /api/v1/session`
  - Purpose: hydrate frontend on refresh.
  - Response: `{ "session_id": str, "phase": str, "products": [...], "scored_products": [...], "enriched_products": [...], "transcripts": [...] }`.

- `POST /api/v1/catalog/upload`
  - Purpose: accept CSV, parse, normalize, dedupe.
  - Request: `multipart/form-data` with `file: <csv>`.
  - Response: `{ "products": [NormalizedProduct], "report": { "rows_parsed": int, "rows_dropped": int, "alias_mapping": {} } }`.
  - Validation: requires `sku`, `name`, `price` columns (or accepted aliases); rejects with `400` and report otherwise.

- `POST /api/v1/audit/run`
  - Purpose: deterministic 6-dimension scoring on current session products.
  - Response: `{ "scored_products": [ScoredProduct] }`.
  - Validation: requires non-empty session products; otherwise `409`.

- `POST /api/v1/enrich/run`
  - Purpose: invoke Claude per gap; merge with provenance.
  - Request: `{ "include_reviews": bool }` (defaults to `false`; D4 opt-in).
  - Response: `{ "enriched_products": [EnrichedProduct] }`.
  - Validation: requires audit to have run; otherwise `409`.

- `POST /api/v1/validate/query`
  - Purpose: run validation agent for one query against pre and post indexes.
  - Request: `{ "query": str }`.
  - Response: `{ "pre": AgentTranscript, "post": AgentTranscript }`.
  - Validation: query 10–500 chars; requires enrichment to have run.

- `GET /api/v1/export`
  - Purpose: full session snapshot for header "Export" button.
  - Response: full session JSON (same shape as `GET /api/v1/session`).

## 4. Data Model (MongoDB Atlas)

- Collection `users`
  - `_id`: ObjectId
  - `email`: str (required, unique)
  - `password_hash`: str (Argon2)
  - `created_at`: datetime
  - Example:
    ```json
    { "_id": "...", "email": "demo@ria.app", "password_hash": "$argon2id$...", "created_at": "2026-04-20T12:00:00Z" }
    ```

- Collection `sessions`
  - `_id`: str (uuid; matches JWT `sid` claim)
  - `user_id`: ObjectId
  - `phase`: str (one of `upload|audit|enrich|validate`)
  - `created_at`: datetime
  - `last_activity`: datetime (TTL: 30 minutes from this)
  - Example:
    ```json
    { "_id": "8f1c...", "user_id": "...", "phase": "audit", "created_at": "...", "last_activity": "..." }
    ```

- Collection `products` (normalized + enriched embedded together for simplicity)
  - `_id`: ObjectId
  - `session_id`: str (foreign to `sessions._id`)
  - `sku`: str
  - `name`: str
  - `description`: str | null
  - `price`: float
  - `category`: str | null
  - `image_urls`: [str]
  - `brand`: str | null
  - `attributes`: dict
  - `q_and_a`: list | null (ACP)
  - `raw_review_data`: list | null (ACP)
  - `relationship_type`: list | null (ACP)
  - `agent_facets`: dict | null (RIA-defined)
  - `score`: object | null (D1..D6 + readiness_score + gaps)
  - `enriched`: object | null (description, q_and_a, agent_facets, relationship_type)
  - `provenance`: dict (per-field `source|deterministic|ria_enriched`)
  - `enriched_provenance`: dict (per-field `{by, confidence}`)
  - `audit_trail`: [object]
  - `created_at`, `updated_at`: datetime
  - Example:
    ```json
    {
      "_id": "...", "session_id": "8f1c...", "sku": "JC-LT-0143",
      "name": "Men's Linen Short-Sleeve Shirt", "price": 89.5,
      "category": "Men/Shirts/Linen", "brand": "J.Crew",
      "attributes": {"color":"White","size":["S","M","L","XL"]},
      "score": null, "enriched": null,
      "provenance": {"sku":"source","name":"source"}, "enriched_provenance": {},
      "audit_trail": [], "created_at":"...", "updated_at":"..."
    }
    ```

- Collection `transcripts`
  - `_id`: ObjectId
  - `session_id`: str
  - `query_text`: str
  - `index_type`: str (`pre`|`post`)
  - `tool_calls`: [object]
  - `agent_response`: str
  - `cart_preview`: [object] | null
  - `checkout_intent`: object | null
  - `created_at`: datetime
  - Example:
    ```json
    { "_id": "...", "session_id": "8f1c...", "query_text":"jacket for rain size M under $200",
      "index_type":"post", "tool_calls":[{"name":"search_products","args":{},"result":{}}],
      "agent_response":"I'd recommend ...", "cart_preview":[], "checkout_intent": null,
      "created_at":"..." }
    ```

## 5. Frontend Audit & Feature Map

- Component `app/page.tsx` → `components/mainapp.tsx`
  - Purpose: shell, phase nav, header (Export, Reset).
  - Backend: `GET /api/v1/session`, `POST /api/v1/session/reset`, `GET /api/v1/export`.
  - Auth: yes (Bearer token).

- Component `components/uploadview.tsx`
  - Purpose: drag-drop CSV; show parsed table; "Run Readiness Audit".
  - Backend: `POST /api/v1/catalog/upload` (replace in-browser CSV parser).
  - Models: `NormalizedProduct`.
  - Notes: today the frontend parses CSV client-side; switch to server upload so backend deterministic alias mapping runs.

- Component `components/auditview.tsx`
  - Purpose: heatmap of D1..D6, drill-down gaps, "Enrich Catalog".
  - Backend: `POST /api/v1/audit/run`.
  - Models: `ScoredProduct`.
  - Notes: replaces `generateMockScores`.

- Component `components/enrichview.tsx`
  - Purpose: side-by-side original vs enriched, Q&A, facets, provenance, confidence; "Validate with Agent".
  - Backend: `POST /api/v1/enrich/run`.
  - Models: `EnrichedProduct`.
  - Notes: `include_reviews` defaults `false` (PDF safety guardrail).

- Component `components/validateview.tsx`
  - Purpose: scripted + custom queries; pre vs post chats with tool calls.
  - Backend: `POST /api/v1/validate/query`.
  - Models: `AgentTranscript`, optional `CheckoutIntent`.

- Note: header "Export" button currently exports local `state` JSON; rewire to `GET /api/v1/export` so it reflects server truth.

## 6. Configuration & ENV Vars (core only)

- `APP_ENV` — `development` | `production`
- `PORT` — `8000`
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — token signing key
- `JWT_EXPIRES_IN` — `1800` (seconds)
- `CORS_ORIGINS` — `http://localhost:3000`
- `ANTHROPIC_API_KEY` — Claude API key
- `CLAUDE_MODEL` — `claude-sonnet-4-6`

## 7. Background Work

- Enrichment (`POST /api/v1/enrich/run`) runs synchronously in the request for ≤ 20 products (PRD demo size). For larger catalogs (≤ 500), use FastAPI `BackgroundTasks` to fire-and-forget; UI polls `GET /api/v1/session` to detect `enriched_products` populated.
- Idempotency: re-running enrichment overwrites previous `enriched` fields atomically per SKU; provenance/audit_trail appended.

## 8. Integrations

- Anthropic Claude API (Messages + tool-use)
  - Used by `ClaudeEnrichmentClient` (Phase 3 — 4 prompt templates per PDF) and `ValidationAgent` (Phase 4 — 3 tools per PDF).
  - Env vars: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`.
  - Failure handling: per PDF §5 — retry once on malformed JSON, mark per-product `status: failed`, hard cap of 6 tool-use turns per agent query.

## 9. Testing Strategy (Manual via Frontend)

- Validation only through the UI in a real browser; backend started via `uvicorn`, frontend via `npm run dev`.
- Each task lists a Manual Test Step (exact UI action + expected result) and a User Test Prompt (copy-pasteable instruction).
- After all tasks in a sprint pass: commit and push to `main`.
- If any test fails: fix and retest before pushing.

## 10. Dynamic Sprint Plan & Backlog

### S0 — Environment Setup & Frontend Connection

- Objectives:
  - Create FastAPI skeleton with `/api/v1` and `/healthz`.
  - Connect to MongoDB Atlas via Motor; `/healthz` performs DB ping.
  - Enable CORS for frontend origin.
  - Replace dummy frontend API URLs with real backend (introduce `NEXT_PUBLIC_API_BASE_URL`).
  - Initialize Git only once at root, default branch `main`, push to GitHub.
  - Single root `.gitignore` covering `__pycache__`, `.env`, `*.pyc`, `.venv/`, `node_modules`.

- User Stories:
  - As a developer, I want a runnable backend wired to MongoDB Atlas so the frontend can stop using mocks.

- Tasks:
  - Scaffold backend (`backend/app/main.py`, `backend/pyproject.toml`, `backend/.env.example`).
    - Manual Test Step: `uvicorn app.main:app --reload` starts on `:8000`; visit `http://localhost:8000/healthz` → `{ "status":"ok","db":"ok" }`.
    - User Test Prompt: "Start the backend with `uvicorn`, then open http://localhost:8000/healthz and confirm both `status` and `db` are `ok`."
  - Add Motor client + `/healthz` DB ping.
    - Manual Test Step: kill the Atlas network temporarily → `/healthz` returns 503 with `{ "db": "error" }`.
    - User Test Prompt: "Hit `/healthz`. Confirm DB status reflects MongoDB connectivity."
  - Enable CORS for `http://localhost:3000`.
    - Manual Test Step: from frontend dev server, fetch `/healthz` from a temporary console call → no CORS error.
    - User Test Prompt: "Open the frontend, run `fetch('http://localhost:8000/healthz').then(r=>r.json()).then(console.log)` in DevTools; expect a JSON result, not a CORS error."
  - Add `NEXT_PUBLIC_API_BASE_URL` env in `frontend/.env.local`; create `frontend/lib/api.ts` helper.
    - Manual Test Step: frontend boots without errors; helper points at `http://localhost:8000/api/v1`.
    - User Test Prompt: "Run `npm run dev`, open the app, confirm no console errors and Network tab shows requests to `localhost:8000/api/v1` once connected."
  - Initialize Git at root (already initialized) and ensure `main` branch + GitHub remote; consolidate `.gitignore`.
    - Manual Test Step: `git status` clean after first push; remote shows commit on `main`.
    - User Test Prompt: "Run `git log -1` and `git remote -v`; confirm `main` and remote URL."

- Definition of Done:
  - Backend boots, DB ping returns ok, frontend can call backend without CORS errors, repo on GitHub `main`.

- Post-sprint: commit and push to `main`.

### S1 — Session Bootstrap & Auth

- Objectives:
  - Implement JWT signup/login/logout per template.
  - Create per-session document on signup; bind JWT `sid` to session.
  - Protect all `/api/v1/*` routes except `/auth/*`.
  - Add minimal "Demo Login" gate on the frontend (single email/password field) — smallest viable UI since the existing app has none.

- Endpoints:
  - `POST /api/v1/auth/signup`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`

- Tasks:
  - Implement Argon2 password hashing + user creation.
    - Manual Test Step: from the demo login screen, sign up `demo@ria.app / demo1234` → success; refresh shows logged-in state.
    - User Test Prompt: "Open the app, sign up with `demo@ria.app` / `demo1234`. Confirm you land on the Upload screen."
  - Implement JWT issuance on login (HS256, 30-min expiry).
    - Manual Test Step: log in with same creds → frontend stores token in localStorage; protected calls include `Authorization: Bearer ...`.
    - User Test Prompt: "Log out, then log back in. In DevTools → Application → Local Storage, confirm a JWT exists and Network tab shows `Authorization` headers."
  - Implement logout (client clears token; server is stateless).
    - Manual Test Step: click Logout → app returns to login; calling `/api/v1/session` returns 401.
    - User Test Prompt: "Click Logout, refresh, and confirm you cannot reach Upload until you log in again."
  - Add session document creation on signup/login (insert into `sessions`); store `session_id` on JWT claim `sid`.
    - Manual Test Step: in MongoDB Atlas, see one new `sessions` doc per login.
    - User Test Prompt: "Open Mongo Atlas → `sessions` collection. Confirm a new document appears after login."
  - Auth dependency that rejects expired/invalid tokens.
    - Manual Test Step: edit JWT to garbage → `/api/v1/session` returns 401.
    - User Test Prompt: "Tamper with the JWT in localStorage and refresh. Confirm 401 and a forced logout."

- Definition of Done:
  - Auth flow works end-to-end; protected routes enforce JWT.

- Post-sprint: commit and push to `main`.

### S2 — Catalog Upload & Normalization (CatalogIngestor)

- Objectives:
  - Move CSV parsing from the browser to the backend (per PDF §1.1).
  - Apply deterministic alias mapping, type coercion, dedupe by SKU.
  - Persist `NormalizedProduct` docs scoped by `session_id`; set session `phase = "upload"`.

- Endpoints:
  - `POST /api/v1/catalog/upload`
  - `GET /api/v1/session` (returns products list)

- Tasks:
  - Implement permissive CSV reader (BOM, quoting, trailing commas).
    - Manual Test Step: drag the sample CSV (5 rows) into Upload → table shows 5 rows fetched from backend.
    - User Test Prompt: "Click 'Or use sample catalog data', then 'Run Readiness Audit'; in Network tab confirm POST `/api/v1/catalog/upload` returns 200 with 5 products."
  - Implement static alias dictionary (per PDF §1.1 table) and snake_case header normalization.
    - Manual Test Step: upload a CSV with `Product_Name`, `MSRP` headers → response normalizes to `name`, `price`.
    - User Test Prompt: "Upload a CSV using `Product_Name` and `MSRP` headers; confirm the parsed table shows correct product names and prices."
  - Type coercion (price → float, image URLs → list).
    - Manual Test Step: upload CSV with `price = $89.50` → backend strips currency, returns 89.5.
    - User Test Prompt: "Upload a CSV with `$89.50` as a price. Confirm displayed price is `89.5`."
  - Dedupe by SKU (keep most-populated record).
    - Manual Test Step: upload CSV with duplicate SKU rows (one sparse, one full) → only the full row appears.
    - User Test Prompt: "Upload a CSV with two rows sharing the same SKU; confirm only one row (the more complete one) shows in the table."
  - Validation report on `400` (missing required columns).
    - Manual Test Step: upload CSV missing `price` → red error banner with backend message.
    - User Test Prompt: "Upload a CSV without a `price` column; confirm the UI shows a clear error explaining the missing column."
  - Replace `frontend/components/uploadview.tsx` client-parser with the API call; preserve table rendering.
    - Manual Test Step: parse table now reflects backend response; refreshing page reloads products via `GET /api/v1/session`.
    - User Test Prompt: "Upload a CSV, refresh the page, and confirm the parsed table still shows the same products without re-uploading."

- Definition of Done:
  - All upload flows work via backend; mock client CSV parsing removed; session refresh hydrates products.

- Post-sprint: commit and push to `main`.

### S3 — Readiness Audit (ReadinessAuditor + RubricEngine)

- Objectives:
  - Implement deterministic 6-dimension scoring per PDF §2 (D1..D6 sub-checks, weights, gap threshold 6.0).
  - Output `ScoredProduct` with `dimension_scores`, `readiness_score`, `gaps` (severity high/medium/low).
  - Persist scores into `products.score`; set session `phase = "audit"`.

- Endpoints:
  - `POST /api/v1/audit/run`

- Tasks:
  - Implement per-dimension sub-check functions exactly per PDF §2.3.
    - Manual Test Step: upload sample CSV → audit heatmap renders deterministic colors; rerunning yields identical scores.
    - User Test Prompt: "Upload sample data, run the audit, note D1..D6 numbers, then click Reset and repeat. Confirm identical scores."
  - Implement weighted formula (0.25/0.15/0.20/0.10/0.15/0.15).
    - Manual Test Step: pick one product; manually compute score from displayed dimensions; matches "Overall" cell.
    - User Test Prompt: "Pick any product row, multiply each dimension by its weight, and confirm the sum equals the displayed Overall score (±0.1)."
  - Generate `gaps[]` with severity per dimension threshold.
    - Manual Test Step: click any product row → modal lists gaps with reasons matching what the PDF rubric specifies.
    - User Test Prompt: "Open a product modal, confirm gaps list dimensions with score < 6.0 and human-readable reasons."
  - Persist scores in `products.score`; set session `phase = "audit"`.
    - Manual Test Step: refresh page → audit heatmap is preserved.
    - User Test Prompt: "After running audit, refresh the page; confirm the heatmap reappears without re-running."
  - Replace `generateMockScores` in `auditview.tsx` with API call.
    - Manual Test Step: Network tab shows POST `/api/v1/audit/run` returning 200; no client-side mock fallback runs.
    - User Test Prompt: "Open DevTools → Network and click 'Run Readiness Audit'; confirm the request hits `/api/v1/audit/run`."

- Definition of Done:
  - Heatmap reflects deterministic backend scores; gap drill-downs match rubric reasons.

- Post-sprint: commit and push to `main`.

### S4 — Enrichment (EnrichmentOrchestrator + ClaudeEnrichmentClient + ProductMerger)

- Objectives:
  - Per PDF §3, fire one Claude prompt per gap dimension (ENRICH_DESCRIPTION, ENRICH_QA, ENRICH_FACETS, ENRICH_RELATIONSHIPS), with ENRICH_REVIEW opt-in.
  - Use Anthropic Messages API with structured JSON outputs and the system/user prompts from PDF §3.2.
  - Apply ProductMerger rules: never overwrite source; per-field provenance + confidence; conflicts log to `audit_trail`.
  - Persist `enriched`, `_enriched_provenance` into `products`; set session `phase = "enrich"`.

- Endpoints:
  - `POST /api/v1/enrich/run`

- Tasks:
  - Implement `ClaudeEnrichmentClient` wrapper with retry-on-malformed-JSON (PDF §5).
    - Manual Test Step: run Enrich on sample data → progress completes; backend logs show 1 successful Claude call per gap per product.
    - User Test Prompt: "Run Enrich. Confirm the progress bar reaches 100% and the comparison view populates."
  - Implement 4 prompt templates as Python constants matching PDF §3.2 verbatim.
    - Manual Test Step: enriched description is 150–250 words; Q&A has 3–5 pairs.
    - User Test Prompt: "Open any enriched product; confirm the description is roughly 150–250 words and 3–5 Q&A pairs are listed."
  - Implement `ProductMerger` with provenance and conflict detection.
    - Manual Test Step: original `description` field still visible; enriched displayed alongside; no overwrite.
    - User Test Prompt: "Pick a product whose source had a description; confirm the 'Original' column still shows the source text and 'Enriched' shows the new one."
  - Implement controlled-vocabulary validation for facets (occasion/weather/fit/care/season/price_band).
    - Manual Test Step: Agent Facets section shows only enum values; no free-text blobs.
    - User Test Prompt: "On the enriched view, scan the Agent-Actionable Facets pills; confirm values look like `casual`, `warm`, `regular`, etc."
  - Confidence scores rendered (already in UI as `confidence_scores`).
    - Manual Test Step: each enriched section shows `Conf: 0.x` chip from the backend.
    - User Test Prompt: "Hover or look near each enriched block; confirm a confidence number 0–1 is visible."
  - D4 review enrichment is OFF by default (UI flag stays disabled).
    - Manual Test Step: run Enrich without toggling reviews → `raw_review_data` remains null.
    - User Test Prompt: "Run Enrich; in the JSON export confirm `raw_review_data` is null and no synthetic reviews appear."
  - Failure modes: malformed JSON retried once; on second failure record `enrichment_status = failed` per product (per PDF §5).
    - Manual Test Step: simulate failure by setting bogus `ANTHROPIC_API_KEY` → UI banner says "enrichment skipped: N products" but the run completes.
    - User Test Prompt: "Temporarily break the API key, re-run Enrich; confirm a banner appears and the app does not crash."

- Definition of Done:
  - Enrichment view fully populated from backend; provenance + confidence visible; mock generator removed.

- Post-sprint: commit and push to `main`.

### S5 — Validation Agent (ValidationAgent + AgentToolkit + CheckoutIntentBuilder)

- Objectives:
  - Implement Claude tool-use loop per PDF §4 with 3 tools: `search_products`, `get_product_details`, `add_to_cart`.
  - Build pre-enrichment and post-enrichment in-memory `EnrichedProductIndex` from session products.
  - Run the same agent against both indexes; return paired transcripts to the UI.
  - Build `CheckoutIntent` payload (PDF §4.5) from staged cart on the post-enrichment side; include in transcript.
  - Persist transcripts; set session `phase = "validate"`.

- Endpoints:
  - `POST /api/v1/validate/query`

- Tasks:
  - Implement in-memory index builder: `by_sku` + `facet_index`.
    - Manual Test Step: backend log shows index built with `len(products)` and a few facet keys.
    - User Test Prompt: "Run a validate query; backend logs should mention 'index built' once per request."
  - Implement `search_products`, `get_product_details`, `add_to_cart` as pure functions per PDF §4.1.
    - Manual Test Step: `add_to_cart` with invalid size returns `status: invalid_variant` (visible in transcript).
    - User Test Prompt: "Run the scripted query 'Show me items good for winter.' Then a custom query 'Add the jacket in size XXL'; confirm a sensible response."
  - Implement Claude tool-use loop with hard cap of 6 turns.
    - Manual Test Step: pathological query returns a final answer within ~6 tool calls; never loops forever.
    - User Test Prompt: "Type 'List every possible attribute combination'. Confirm the agent terminates within a few seconds with a summary."
  - Run agent twice per request: pre-index uses raw `products`, post-index uses enriched.
    - Manual Test Step: scripted query 'I need a jacket for a rainy day in size M under $200' → pre-side falls back generically, post-side returns a coherent recommendation.
    - User Test Prompt: "Click the rainy-day scripted query; the right (Enhanced) chat returns a more specific answer than the left (Baseline)."
  - `CheckoutIntentBuilder` emits ACP-shaped JSON when post-side stages cart.
    - Manual Test Step: when post agent calls `add_to_cart`, transcript includes `checkout_intent` with `intent_version: acp/0.1`.
    - User Test Prompt: "After running the rainy-day query, expand the post transcript and confirm a `checkout_intent` payload is shown."
  - Replace stubbed setTimeout in `validateview.tsx` with real API.
    - Manual Test Step: scripted and custom queries hit `POST /api/v1/validate/query`.
    - User Test Prompt: "Open DevTools → Network. Send any query; confirm one POST to `/api/v1/validate/query` and a JSON response with `pre` and `post` transcripts."

- Definition of Done:
  - Side-by-side chats are powered by the real agent; checkout intent renders post-enrichment.

- Post-sprint: commit and push to `main`.

### S6 — Session Reset & Export Wiring

- Objectives:
  - Wire the header "Reset Session" button to backend.
  - Wire the header "Export" button to backend.
  - Ensure session `last_activity` is bumped on every authenticated request (TTL extension).

- Endpoints:
  - `POST /api/v1/session/reset`
  - `GET /api/v1/export`

- Tasks:
  - Implement reset: delete session-scoped products and transcripts; reset `phase = "upload"`.
    - Manual Test Step: click "Reset Session" → app returns to Upload; refresh shows empty.
    - User Test Prompt: "Click Reset Session in the header; confirm the app returns to the Upload screen with no products."
  - Implement export: build full session snapshot JSON.
    - Manual Test Step: click "Export" → downloaded file matches a `GET /api/v1/export` response.
    - User Test Prompt: "Click Export; open the downloaded JSON; confirm it contains your products, scores, enriched products, and transcripts."
  - Implement TTL bump on every authenticated request.
    - Manual Test Step: leave the app idle for ~25 min; perform an action → still authenticated; idle 31 min → 401 + forced re-login.
    - User Test Prompt: "Use the app, wait long enough for the session to expire, refresh, and confirm you are logged out."

- Definition of Done:
  - Header actions match backend state; session TTL behavior matches PRD.

- Post-sprint: commit and push to `main`.

---

## Compliance Checklist

- FastAPI 3.13 async ✅
- MongoDB Atlas + Motor + Pydantic v2 ✅
- No Docker ✅
- Single `main` branch ✅
- `/api/v1/*` base path ✅
- No pagination (frontend has none) ✅
- `BackgroundTasks` only used optionally for >20-product enrichment ✅
- Manual UI tests per task ✅
- Each task includes a Manual Test Step + User Test Prompt ✅
