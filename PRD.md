# PRODUCT REQUIREMENTS DOCUMENT

**Product Name:** RIA (Retail Integration Agent)

**Product Vision:** RIA transforms retailer product catalogs from human-readable to agent-ready by auditing against emerging agentic commerce standards (Google's Universal Commerce Protocol and Stripe/OpenAI's Agentic Commerce Protocol), enriching missing conversational attributes and structured metadata, and validating improvements through a live shopping agent demonstration.

**Core Purpose:** Retailers deploying AI shopping agents face a critical data quality gap: their product catalogs were built for human browsing and SEO, not for AI agents reasoning over structured data. This causes agents to hallucinate product details, suggest incorrect items, and fail to answer basic customer questions. RIA identifies these gaps automatically and transforms catalogs to be agent-ready within minutes instead of months.

**Target Users:** Ecommerce Merchandisers and Catalog Operations Leads at mid-to-large retailers (50+ SKUs) who are deploying or planning to deploy AI shopping agents and need their product data to meet agentic commerce standards.

**Key MVP Features:**
- CSV Catalog Upload & Parsing - System Data (View + Export)
- UCP/ACP Readiness Audit with Scoring - System Data (View + Export)
- Claude API-Powered Data Enrichment - System Data (View + Export)
- Shopping Agent Validation Demo - System Data (View + Export)
- Session-Based State Management - Configuration (View + Reset)

**Platform:** Web application (responsive, accessible via browser on all devices)

**Complexity Assessment:** Moderate
- State Management: Server-side in-memory session store (30-minute TTL, no disk persistence)
- External Integrations: Claude API (Anthropic) for all intelligence operations - reduces complexity
- Business Logic: Moderate - deterministic scoring algorithm, structured enrichment pipeline, agent validation loop

**MVP Success Criteria:**
- Users complete full workflow (upload → audit → enrich → validate) in under 2 minutes
- Shopping agent correctly answers 3+ natural language questions post-enrichment that failed pre-enrichment
- Before/after comparison visually demonstrates catalog improvement via heatmap and agent transcript
- All enriched data downloadable as CSV/JSON with provenance tracking

---

## 1. USERS & PERSONAS

**Primary Persona:**
- **Name:** "Alex the Ecommerce Merchandiser"
- **Context:** Catalog Operations Lead at a 500-SKU apparel retailer, tasked by leadership to "add AI" to the shopping experience. Deployed a chatbot 6 months ago that performs poorly because product descriptions lack structured attributes. Manually auditing catalog gaps via spreadsheets, hiring copywriters to rewrite descriptions one by one. Frustrated by lack of automated tools to identify what's missing or transform data at scale.
- **Goals:** Identify which products are blocking agent performance, transform catalog to meet agentic commerce standards, demonstrate measurable improvement to justify internal investment in data quality initiatives.
- **Pain Points:** No automated way to audit catalog readiness for AI agents, manual enrichment takes months and costs hundreds of thousands, existing AI copywriting tools don't understand agentic protocol requirements, chatbot failures erode customer trust and waste AI investment.

---

## 2. FUNCTIONAL REQUIREMENTS

### 2.1 Core MVP Features (Priority 0)

**FR-001: CSV Catalog Upload & Parsing**
- **Description:** User uploads product catalog CSV file; system parses and normalizes data into structured format
- **Entity Type:** System Data
- **Operations:** Upload file, View parsed data, Export normalized JSON
- **Key Rules:** CSV must contain minimum fields (sku, name, price); parser handles missing/malformed fields gracefully; session-scoped only (no disk writes)
- **Acceptance:** User uploads CSV and sees normalized product list with field validation feedback

**FR-002: UCP/ACP Readiness Audit with Scoring**
- **Description:** System scores each product against 6-dimension rubric (Structured Attributes 25%, Description 15%, Q&A 20%, Reviews 10%, Relationships 15%, Agent Facets 15%); generates per-product scorecard and gap analysis
- **Entity Type:** System Data
- **Operations:** View audit results, View dimension scores, View gap details, Export scorecard CSV
- **Key Rules:** Scoring is deterministic (same input → same score); gaps flagged when dimension score <6.0; heatmap visualizes before/after state
- **Acceptance:** User sees per-product readiness scores with color-coded heatmap showing which dimensions need enrichment

**FR-003: Claude API-Powered Data Enrichment**
- **Description:** System generates missing conversational attributes (Q&A pairs, agent facets, enhanced descriptions, product relationships) via Claude API; merges enriched data with original catalog while preserving source fields
- **Entity Type:** System Data
- **Operations:** View enrichment preview, Approve/reject enrichments, View provenance tracking, Export enriched catalog
- **Key Rules:** Original fields never overwritten; enriched fields tagged with provenance (source/deterministic/ria_enriched) and confidence scores; review synthesis opt-in only and always flagged synthetic
- **Acceptance:** User sees enriched product data with before/after comparison and can download enriched catalog with provenance metadata

**FR-004: Shopping Agent Validation Demo**
- **Description:** Claude-powered shopping agent with tool-use runs against pre-enrichment and post-enrichment catalog; demonstrates improved discovery, recommendation accuracy, and structured checkout intent generation
- **Entity Type:** System Data
- **Operations:** View agent transcript, Run scripted test queries, Enter custom queries, View before/after comparison, Export agent interaction logs
- **Key Rules:** Agent uses three tools (search_products, get_product_details, stage_cart); same agent runs on both indexes; scripted queries cover weather facets, relational context, conversational Q&A
- **Acceptance:** User sees side-by-side agent transcripts showing failed queries pre-enrichment and successful queries post-enrichment

**FR-005: Session-Based State Management**
- **Description:** System maintains workflow state in server-side memory keyed to session cookie; survives page refreshes within 30-minute TTL; no data persisted to disk
- **Entity Type:** Configuration
- **Operations:** View current session state, Reset session, Export session data before expiry
- **Key Rules:** 30-minute inactivity TTL; session dies on backend restart or explicit reset; no disk writes at any point
- **Acceptance:** User can refresh page mid-workflow and resume from current phase; session expires after 30 minutes of inactivity

**FR-006: User Authentication**
- **Description:** Simple session-based authentication for demo access; no persistent user accounts
- **Entity Type:** Configuration
- **Operations:** Start session, View session status, End session
- **Key Rules:** Session cookie only; no password storage; no user data persistence
- **Acceptance:** User can access demo interface and maintain session state across page refreshes

---

## 3. USER WORKFLOWS

### 3.1 Primary Workflow: Catalog Transformation & Validation

**Trigger:** Retailer needs to prepare product catalog for AI shopping agent deployment

**Outcome:** Retailer sees measurable before/after improvement in agent performance and downloads enriched catalog ready for production use

**Steps:**
1. User uploads product catalog CSV file (50-500 products)
2. System parses CSV, normalizes data, displays product list with field validation
3. System runs UCP/ACP readiness audit, displays heatmap with per-product scores and gap analysis
4. User reviews audit results, clicks "Enrich Catalog" to trigger Claude API enrichment
5. System generates enriched attributes (Q&A, facets, descriptions, relationships), displays before/after comparison with provenance tracking
6. User clicks "Validate with Agent" to run shopping agent demo
7. System runs agent against pre-enrichment and post-enrichment indexes with scripted queries, displays side-by-side transcripts showing improvement
8. User downloads enriched catalog CSV/JSON with provenance metadata and agent validation report

### 3.2 Key Supporting Workflows

**Upload Catalog:** User navigates to upload screen → selects CSV file → clicks upload → sees parsed product list with validation feedback

**View Audit Results:** User clicks "Audit" after upload → sees heatmap with color-coded dimension scores → clicks product row to view detailed gap analysis

**Enrich Catalog:** User clicks "Enrich" from audit view → system processes enrichments via Claude API → user sees before/after comparison with provenance tags

**Run Agent Demo:** User clicks "Validate" from enriched view → selects scripted or custom queries → sees agent transcripts side-by-side → exports interaction logs

**Download Enriched Data:** User clicks "Export" from any phase → selects format (CSV/JSON) → downloads file with provenance metadata

**Reset Session:** User clicks "Start Over" → confirms reset → returns to upload screen with session cleared

---

## 4. BUSINESS RULES

### 4.1 Entity Lifecycle Rules

**Uploaded Catalog (CSV):**
- **Type:** System Data
- **Creation:** Any user can upload CSV file
- **Editing:** Not allowed - upload new file to replace
- **Deletion:** Session reset or 30-minute TTL expiry

**Normalized Product Data:**
- **Type:** System Data
- **Creation:** Automatically generated from CSV upload
- **Editing:** Not allowed - source data immutable
- **Deletion:** Session reset or 30-minute TTL expiry

**Audit Scorecard:**
- **Type:** System Data
- **Creation:** Automatically generated after parsing
- **Editing:** Not allowed - deterministic scoring
- **Deletion:** Session reset or 30-minute TTL expiry

**Enriched Product Data:**
- **Type:** System Data
- **Creation:** Generated via Claude API after user clicks "Enrich"
- **Editing:** User can approve/reject enrichments before finalizing
- **Deletion:** Session reset or 30-minute TTL expiry

**Agent Validation Transcript:**
- **Type:** System Data
- **Creation:** Generated when user runs agent demo
- **Editing:** Not allowed - immutable interaction log
- **Deletion:** Session reset or 30-minute TTL expiry

**Session State:**
- **Type:** Configuration
- **Creation:** Automatically created on first upload
- **Editing:** Updated on every user action (resets TTL)
- **Deletion:** 30-minute inactivity, explicit reset, or backend restart

### 4.2 Data Validation Rules

**Uploaded CSV:**
- **Required Fields:** sku, name, price
- **Field Constraints:** sku must be unique; name minimum 3 characters; price must be numeric >0; category recommended but optional; image_urls must be valid URLs if present

**Normalized Product:**
- **Required Fields:** sku, name, price, category, brand, attributes
- **Field Constraints:** All fields from CSV preserved; missing fields set to null; malformed data flagged in validation report

**Enriched Product:**
- **Required Fields:** All original fields plus enriched object with provenance
- **Field Constraints:** Original fields never overwritten; enriched fields must include provenance tag (source/deterministic/ria_enriched) and confidence score 0-1; review data must be flagged synthetic if generated

**Agent Query:**
- **Required Fields:** query_text
- **Field Constraints:** Query text minimum 10 characters; maximum 500 characters; must be natural language question

### 4.3 Access & Process Rules
- Users can only access their own session data (session cookie scoped)
- Maximum 500 products per upload (performance constraint)
- Enrichment runs sequentially per product (no batch parallelization in MVP)
- Agent demo limited to 10 queries per session (rate limiting)
- Session expires after 30 minutes of inactivity (no extension)
- No data persisted to disk at any point (memory-only storage)
- Backend restart clears all sessions (acceptable for demo)

---

## 5. DATA REQUIREMENTS

### 5.1 Core Entities

**Session**
- **Type:** Configuration | **Storage:** Server-side in-memory
- **Key Fields:** session_id, created_at, last_activity, ttl_expires_at, current_phase
- **Relationships:** has one UploadedCatalog, has one AuditResult, has one EnrichedCatalog, has many AgentTranscripts
- **Lifecycle:** Create on first upload, Update on every action, Delete after 30-minute TTL or explicit reset

**UploadedCatalog**
- **Type:** System Data | **Storage:** Server-side in-memory
- **Key Fields:** session_id, filename, upload_timestamp, raw_csv_data, product_count
- **Relationships:** belongs to Session, has many NormalizedProducts
- **Lifecycle:** Create on upload, View only, Delete with session

**NormalizedProduct**
- **Type:** System Data | **Storage:** Server-side in-memory
- **Key Fields:** sku, name, description, price, category, image_urls, brand, attributes, q_and_a, raw_review_data, relationship_type, agent_facets
- **Relationships:** belongs to UploadedCatalog, has one ScoredProduct, has one EnrichedProduct
- **Lifecycle:** Create during parsing, View only, Delete with session

**ScoredProduct**
- **Type:** System Data | **Storage:** Server-side in-memory
- **Key Fields:** sku, readiness_score, dimension_scores (D1-D6), gaps (array of gap objects with dimension, severity, reason)
- **Relationships:** belongs to NormalizedProduct
- **Lifecycle:** Create during audit, View + Export, Delete with session

**EnrichedProduct**
- **Type:** System Data | **Storage:** Server-side in-memory
- **Key Fields:** sku, original_fields, enriched_fields (description, q_and_a, agent_facets, relationship_type), provenance_metadata, confidence_scores, audit_trail
- **Relationships:** belongs to NormalizedProduct
- **Lifecycle:** Create during enrichment, View + Export, Delete with session

**AgentTranscript**
- **Type:** System Data | **Storage:** Server-side in-memory
- **Key Fields:** session_id, query_text, index_type (pre/post), tool_calls, agent_response, timestamp
- **Relationships:** belongs to Session
- **Lifecycle:** Create during agent demo, View + Export, Delete with session

### 5.2 Data Storage Strategy
- **Primary Storage:** Server-side in-memory dictionary keyed by session_id
- **Capacity:** No hard limit (memory-bound by server resources)
- **Persistence:** Data survives page refresh within session TTL; dies on backend restart or session expiry
- **Audit Fields:** All entities include created_at, updated_at; enriched entities include provenance and confidence scores

---

## 6. INTEGRATION REQUIREMENTS

**Claude API (Anthropic):**
- **Purpose:** All intelligence operations - audit scoring, data enrichment (Q&A, facets, descriptions, relationships), shopping agent with tool-use
- **Type:** Frontend and backend API calls (backend for enrichment, frontend for agent demo)
- **Data Exchange:** Sends product data + prompt templates, Receives structured JSON responses (enriched attributes, agent tool calls, agent responses)
- **Trigger:** User clicks "Enrich" (enrichment) or "Validate" (agent demo) or enters custom query (agent interaction)
- **Error Handling:** Display error message to user, log failed enrichments, allow retry, fallback to partial enrichment if some products fail

---

## 7. VIEWS & NAVIGATION

### 7.1 Primary Views

**Upload Screen** (`/`) - CSV file upload interface, drag-and-drop or file picker, displays parsing progress and validation feedback

**Audit Dashboard** (`/audit`) - Heatmap grid showing per-product readiness scores color-coded by dimension (D1-D6), summary stats (average score, gap distribution), "Enrich Catalog" button, product detail drill-down

**Enrichment View** (`/enrich`) - Before/after comparison table with original vs enriched fields, provenance tags and confidence scores, approve/reject controls, "Validate with Agent" button, export enriched catalog

**Agent Demo** (`/validate`) - Side-by-side agent transcripts (pre-enrichment vs post-enrichment), scripted query buttons, custom query input, tool call visualization, structured checkout intent display, export interaction logs

**Session Status** (`/session`) - Current phase indicator, session TTL countdown, reset session button, export all data button

### 7.2 Navigation Structure

**Main Nav:** Upload | Audit | Enrich | Validate | Session
**Default Landing:** Upload screen
**Mobile:** Responsive layout with collapsible navigation, heatmap scrolls horizontally, agent transcripts stack vertically

---

## 8. MVP SCOPE & CONSTRAINTS

### 8.1 MVP Success Definition

The MVP is successful when:
- ✅ User completes upload → audit → enrich → validate workflow in under 2 minutes
- ✅ Audit heatmap visually shows before/after improvement (red cells → green cells)
- ✅ Shopping agent correctly answers 3+ scripted queries post-enrichment that failed pre-enrichment
- ✅ Enriched catalog downloadable with provenance metadata
- ✅ Session state survives page refresh within 30-minute TTL
- ✅ Demo artifacts (video, screenshots) generate interest from target users

### 8.2 In Scope for MVP

Core features included:
- FR-001: CSV Catalog Upload & Parsing
- FR-002: UCP/ACP Readiness Audit with Scoring
- FR-003: Claude API-Powered Data Enrichment
- FR-004: Shopping Agent Validation Demo
- FR-005: Session-Based State Management
- FR-006: User Authentication

### 8.3 Technical Constraints

- **Data Storage:** Server-side in-memory only (no disk writes, no database)
- **Concurrent Users:** Single-user demo (no multi-tenancy in MVP)
- **Performance:** Audit completes in <10 seconds for 100 products; enrichment <30 seconds for 20 products; agent demo <5 seconds per query
- **Browser Support:** Chrome, Firefox, Safari, Edge (last 2 versions)
- **Mobile:** Responsive design, iOS/Android browser support
- **Offline:** Not supported (requires Claude API connectivity)
- **Session Limits:** 30-minute TTL, 500 products max, 10 agent queries max

### 8.4 Known Limitations

**For MVP:**
- Session data lost on backend restart (acceptable for demo)
- No multi-device sync (session tied to browser cookie)
- No collaborative editing (single-user session)
- No undo/redo for enrichment (must reset session to start over)
- Review synthesis opt-in only and always flagged synthetic (honesty guardrail)
- No Shopify URL input (CSV only; Shopify is stretch goal)

**Future Enhancements:**
- Persistent storage with user accounts for production use
- Shopify/BigCommerce/Magento direct integrations
- Batch enrichment with parallelization for large catalogs
- Custom rubric configuration for different verticals (apparel vs electronics vs grocery)
- Multi-language support for international catalogs
- Collaborative review workflows for merchandising teams

---

## 9. ASSUMPTIONS & DECISIONS

### 9.1 Platform Decisions
- **Type:** Web application (full-stack with backend API)
- **Storage:** Server-side in-memory session store (no database)
- **Auth:** Session cookie only (no persistent user accounts)

### 9.2 Entity Lifecycle Decisions

**Uploaded Catalog:** View + Export only
- **Reason:** Source data immutability - user uploads new file to replace

**Normalized Product:** View + Export only
- **Reason:** Deterministic parsing output - no manual editing allowed

**Audit Scorecard:** View + Export only
- **Reason:** Deterministic scoring algorithm - no manual overrides

**Enriched Product:** View + Export with approval controls
- **Reason:** User needs to review AI-generated content before finalizing

**Agent Transcript:** View + Export only
- **Reason:** Immutable interaction log for validation purposes

**Session State:** View + Reset
- **Reason:** Configuration data - user can reset to start over

### 9.3 Key Assumptions

1. **Retailers have product catalogs in CSV format**
   - Reasoning: CSV is universal export format from all ecommerce platforms; Shopify URL input is stretch goal

2. **50-500 products is sufficient demo size**
   - Reasoning: Large enough to show heatmap patterns, small enough to complete enrichment in <2 minutes

3. **Claude API is reliable for production use**
   - Reasoning: Tool-use capability is critical for agent demo; Claude chosen intentionally over multi-LLM abstraction

4. **Session-based storage is acceptable for demo**
   - Reasoning: Privacy-first approach (no data persistence) aligns with retailer concerns about sharing catalog data

5. **Before/after agent demo is the "aha moment"**
   - Reasoning: Visual proof of improvement is more compelling than scorecard numbers alone

### 9.4 Clarification Q&A Summary

**Q:** How is the UCP/ACP readiness rubric defined?
**A:** 6-dimension scoring algorithm with deterministic sub-checks: D1 Structured Attributes (25%), D2 Description (15%), D3 Q&A (20%), D4 Reviews (10%), D5 Relationships (15%), D6 Agent Facets (15%). Each dimension scores 0-10 based on presence and quality of fields. Gaps flagged when dimension score <6.0.
**Decision:** Rubric weights prioritize conversational coverage (D3) and agent-actionable facets (D6) because these are most demo-visible gaps.

**Q:** Does the user manually type questions into the agent demo, or are test questions auto-generated?
**A:** Both. System provides 3 scripted queries (weather facet, relational context, conversational Q&A) that demonstrate repeatable before/after improvement. User can also enter custom queries to test specific scenarios.
**Decision:** Scripted queries ensure demo reliability; custom queries allow exploration and validation of edge cases.

**Q:** Does the merchandiser review/approve enrichments before validation, or is enrichment fully automated?
**A:** Enrichment is automated but user can review before/after comparison and approve/reject changes before finalizing. Provenance tracking shows which fields were enriched and confidence scores.
**Decision:** Approval controls balance speed (automated enrichment) with trust (human review before production use).

**Q:** How does the system handle page refreshes given no data persistence?
**A:** Session state stored in server-side in-memory dictionary keyed by session cookie. Page refresh within 30-minute TTL hydrates UI from session state. Session dies on backend restart or explicit reset.
**Decision:** Session-based storage allows page refresh UX while maintaining "no disk writes" privacy guarantee.

---

**PRD Complete - Ready for Development**
