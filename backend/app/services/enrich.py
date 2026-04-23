"""EnrichmentOrchestrator — Phase 3 controller.

For each ScoredProduct, fire one Claude prompt per gap dimension that maps to
an enrichment template. Returns merged EnrichedProducts with per-field
provenance.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.services.audit import score_product
from app.services.claude import ClaudeEnrichmentClient, EnrichmentError
from app.services.merger import merge_enrichments
from app.services.prompts import GAP_TO_PROMPT

logger = logging.getLogger(__name__)


def _catalog_summary(products: list[dict], focus_sku: str, limit: int = 30) -> str:
    lines = []
    for p in products:
        if p["sku"] == focus_sku:
            continue
        lines.append(f"- {p['sku']} | {p.get('name','')} | {p.get('category','')}")
        if len(lines) >= limit:
            break
    return "\n".join(lines) if lines else "(no other products in catalog)"


def _format_user_prompt(template: str, product: dict, **extra: Any) -> str:
    return template.format(
        sku=product.get("sku") or "",
        name=product.get("name") or "",
        description=(product.get("description") or "").strip() or "(none provided)",
        attributes_json=json.dumps(product.get("attributes") or {}, ensure_ascii=False),
        category=product.get("category") or "(uncategorized)",
        price=product.get("price") if product.get("price") is not None else "n/a",
        **extra,
    )


PRODUCT_CONCURRENCY = 8


async def enrich_products(
    products: list[dict],
    *,
    client: ClaudeEnrichmentClient,
    max_concurrency: int = PRODUCT_CONCURRENCY,
    on_product_done=None,
) -> list[dict]:
    """Enrich each product against its gaps; return merged copies.

    Per-gap calls within a product run concurrently. Across products we cap at
    `max_concurrency` in flight at once to hit the PRD perf target without
    hammering the API or burning tokens on a stalled call.
    """
    catalog_skus = {p["sku"] for p in products}
    semaphore = asyncio.Semaphore(max_concurrency)

    async def enrich_one(product: dict) -> dict:
        async with semaphore:
            score = product.get("score") or score_product(product)
            gap_dims = [g["dimension"] for g in score.get("gaps", [])]
            active_dims = [d for d in gap_dims if d in GAP_TO_PROMPT]

            async def run_dim(dim: str) -> tuple[str, dict | None, str | None]:
                template = GAP_TO_PROMPT[dim]
                extra: dict = {}
                if dim == "D5":
                    extra["catalog_summary"] = _catalog_summary(products, product["sku"])
                user_prompt = _format_user_prompt(template["user_template"], product, **extra)
                try:
                    result = await client.call_json(
                        system=template["system"],
                        user=user_prompt,
                        max_tokens=1024,
                    )
                    return dim, result, None
                except EnrichmentError as exc:
                    logger.warning(
                        "enrichment failed sku=%s dim=%s: %s", product["sku"], dim, exc
                    )
                    return dim, None, str(exc)

            results = await asyncio.gather(*(run_dim(d) for d in active_dims))
            payload: dict[str, dict] = {}
            failures: dict[str, str] = {}
            for dim, parsed, err in results:
                if parsed is not None:
                    payload[dim] = parsed
                elif err:
                    failures[dim] = err

            merged = merge_enrichments(
                product=product,
                enriched_payload=payload,
                catalog_skus=catalog_skus,
            )
            merged["enrichment_status"] = "failed" if failures and not payload else "ok"
            if failures:
                merged.setdefault("audit_trail", []).append(
                    {"type": "enrichment_failures", "by_dim": failures}
                )
            merged["score"] = score_product(_apply_enriched_view(merged))
            if on_product_done is not None:
                try:
                    on_product_done(merged["sku"])
                except Exception:  # noqa: BLE001
                    logger.exception("on_product_done callback raised")
            return merged

    return await asyncio.gather(*(enrich_one(p) for p in products))


def _apply_enriched_view(product: dict) -> dict:
    """Return a flattened product where enriched fields shadow source nulls
    (used to re-score after enrichment)."""
    view = dict(product)
    enriched = product.get("enriched") or {}
    for field in ("description", "q_and_a", "agent_facets", "relationship_type"):
        value = enriched.get(field)
        if value not in (None, "", [], {}):
            view[field] = value
    return view
