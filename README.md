# RIA — Retail Integration Agent

Turn a retailer's CSV catalog into an agent-ready data layer in minutes.

RIA scores a product catalog against the emerging Universal Commerce Protocol (UCP) and Agentic Commerce Protocol (ACP) standards, enriches the gaps with Claude, and proves the result with a side-by-side shopping-agent demo.

> Built for Marily Nika's AI PM Bootcamp capstone (Demo Day: 2026-05-01).

---

## Why this exists

Retailers' product catalogs were built for human browsing and SEO — not for AI agents reasoning over structured data. When an agent has to recommend, compare, or transact against that catalog, it hallucinates: "size M is in stock", "this jacket is waterproof", "pair this with…". RIA closes the gap programmatically:

1. **Audit** — score every SKU against a 6-dimension UCP/ACP rubric.
2. **Enrich** — generate the missing structured fields (Q&A, agent facets, relationships) with Claude, with provenance + confidence on every field.
3. **Validate** — run the same shopping agent against the pre- and post-enrichment catalog and watch the difference.

---

## The pipeline

| Phase | Component | Determinism | LLM? |
| --- | --- | --- | --- |
| **1. Ingest** | `CatalogIngestor` | Fully deterministic (CSV parse + alias map + dedupe) | No |
| **2. Audit** | `ReadinessAuditor` + `RubricEngine` | Fully deterministic 6-dimension scoring | No |
| **3. Enrich** | `EnrichmentOrchestrator` + `ClaudeEnrichmentClient` + `ProductMerger` | Templated LLM calls per gap, deterministic merge with provenance | Yes (Claude prompts) |
| **4. Validate** | `ValidationAgent` + `AgentToolkit` + `CheckoutIntentBuilder` | **Agentic** — Claude tool-use loop drives 3 tools | Yes (Claude tool use) |

The 6-dimension rubric:

| # | Dimension | Weight |
| --- | --- | --- |
| D1 | Structured Attribute Completeness | 25% |
| D2 | Descriptive Richness | 15% |
| D3 | Conversational Q&A Coverage (ACP `q_and_a`) | 20% |
| D4 | Review Signal Presence (ACP `raw_review_data`) | 10% |
| D5 | Relational Context (ACP `relationship_type`) | 15% |
| D6 | Agent-Actionable Facets | 15% |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 15 + React 19, Tailwind 4)                       │
│  Login → Upload → Audit (heatmap) → Enrich (edit UX) → Validate    │
│  (side-by-side pre vs post agent + CheckoutIntent payload)          │
└─────────────────────────────────────────────────────────────────────┘
                              │  /api/v1/*  (JWT)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Backend (FastAPI, Python 3.13, async)                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐    │
│  │ Auth    │  │ Catalog │  │ Audit   │  │ Enrich              │    │
│  │ (JWT)   │  │ Ingest  │  │ Rubric  │  │ Orchestrator+Merger │    │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────────┘    │
│                                          ┌─────────────────────┐    │
│                                          │ Validate Agent      │    │
│                                          │ (Claude tool-use)   │    │
│                                          └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
   ┌─────────────────┐                ┌──────────────────────┐
   │ MongoDB Atlas   │                │ Anthropic Claude API │
   │ (Motor/async)   │                │ (Sonnet 4.6)         │
   └─────────────────┘                └──────────────────────┘
```

Mongo collections: `users`, `sessions` (TTL 30 min), `products`, `transcripts`, `agent_chats`.

---

## Local setup

### Prerequisites

- Python 3.13 (pinned in `backend/runtime.txt`)
- Node.js 20+ (Next.js 15)
- A MongoDB Atlas cluster (free tier works)
- An Anthropic API key

### Backend

```bash
cd backend
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env  # then fill in MONGODB_URI, ANTHROPIC_API_KEY
.venv/bin/uvicorn app.main:app --reload --port 8000
```

`backend/.env` requires:

```
MONGODB_URI=mongodb+srv://...
MONGODB_DB=ria
CORS_ORIGINS=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6
```

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1" > .env.local
npm run dev
```

Visit http://localhost:3000 → sign up → upload a CSV → audit → enrich → validate.

---

## Demo flow (2 minutes)

1. **Sign up** with any email + password (≥8 chars).
2. **Upload** the included Shopify-style apparel CSV (or any CSV with `sku`, `name`, `price`).
3. **Audit** — heatmap shows red cells on D2/D3/D5/D6 for most products.
4. **Enrich** — Claude tags each gap; ~30s for 20 products. Heatmap turns green.
5. **Validate** — pick a scripted query like *"jacket for a rainy day in size M"*. Watch the post side use facet filters to find the right product, while baseline gropes around. Add to cart on the post side and expand the **CheckoutIntent (acp/0.1)** payload — that JSON is the demo's structural payoff.

---

## Deployment

- **Backend**: Render (`backend/` as root directory, auto-detected from `Procfile` / `main.py`).
- **Frontend**: Vercel or any Next.js host.
- Set the same env vars in your deploy environment. Add the deployed frontend URL to `CORS_ORIGINS`.

---

## Repository layout

```
backend/
  app/
    api/v1/        # FastAPI routes (auth, catalog, audit, enrich, validate, session)
    core/          # config, security (JWT), deps
    db/            # Mongo client, indexes
    services/      # ingest, audit (rubric), enrich, prompts, claude client,
                   # merger, agent (tool-use loop), agent_index, agent_index
  main.py          # uvicorn entrypoint for Render
  requirements.txt
  Procfile

frontend/
  app/             # Next.js App Router
  components/      # uploadview, auditview, enrichview, validateview, mainapp,
                   # loginview, rubricinfo
  lib/             # api client, auth provider, app store

PRD.md             # Product Requirements Document
RIA_Technical_Design.pdf  # 4-phase pipeline spec
Backend-dev-plan.md       # sprint-by-sprint dev plan
```

---

## Tech stack

- **Backend**: FastAPI, Motor (async MongoDB), Pydantic v2, python-jose (JWT), Argon2, Anthropic SDK
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind v4, lucide-react
- **Database**: MongoDB Atlas
- **LLM**: Anthropic Claude Sonnet 4.6 (via tool use for the validation agent)

---

## License

Capstone project — not licensed for production use.
