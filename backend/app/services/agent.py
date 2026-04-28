"""ValidationAgent — Phase 4 of the RIA pipeline (PDF section 4).

A Claude tool-use loop with three pure functions over an EnrichedProductIndex.
The same agent runs against a pre-enrichment index and a post-enrichment index;
what changes between the two demo runs is the data, not the agent.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from anthropic import APIError, AsyncAnthropic

from app.core.config import get_settings
from app.services.agent_index import EnrichedProductIndex
from app.services.claude import EnrichmentError

logger = logging.getLogger(__name__)

MAX_TURNS = 6  # PDF section 5: hard cap on tool_use turns


SYSTEM_PROMPT = (
    "You are a shopping assistant for an apparel retailer. You help shoppers "
    "discover products and stage a cart. Always reason from the product index "
    "via the provided tools. NEVER invent SKUs or product attributes. If the "
    "data does not let you answer confidently, say so plainly.\n\n"
    "Workflow:\n"
    "1. For any new shopping query that mentions product attributes (size, "
    "color, occasion, weather, price, category, etc.), ALWAYS call "
    "search_products fresh. Do NOT rely on results from earlier turns in this "
    "conversation — the catalog index may have been updated since. Treat each "
    "new request as if you have no prior knowledge of the catalog.\n"
    "2. Use structured filters in search_products whenever the user mentions "
    "a controlled-vocab attribute (occasion, weather, fit, care, season). "
    "If your first structured search returns 0 results, IMMEDIATELY retry "
    "with fewer filters — drop the most specific filter first (usually size "
    "or color). Don't give up after one empty result.\n"
    "3. When search_products returns multiple matches (≥2), surface the top "
    "2-3 of them in your answer. Don't silently narrow to one — let the user "
    "choose.\n"
    "4. Call get_product_details to confirm the answer when a single product "
    "is the focus. Specifically: if the user requested a SIZE or COLOR, use "
    "get_product_details to check the product's `attributes` field BEFORE "
    "promising the variant exists. If `attributes` has no `size` (or `color`) "
    "key, tell the user explicitly that variant availability is not in the "
    "product data — do not assume the size is in stock.\n"
    "5. Call add_to_cart only when the user has agreed to a specific item. "
    "If the result is `added_unverified_variant`, mention in your reply that "
    "the variant could not be verified from the catalog data.\n"
    "Keep your final answer to ≤3 short sentences (longer is fine when "
    "presenting multiple product options)."
)


TOOL_DEFS = [
    {
        "name": "search_products",
        "description": (
            "Search the catalog by natural-language query and optional structured facet filters. "
            "Closed-vocab filters (occasion, weather, fit, care, season) MUST use one of the listed enum values exactly."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural-language search query."},
                "filters": {
                    "type": "object",
                    "properties": {
                        "price_max": {"type": "number"},
                        "size": {"type": "string", "description": "Free-form (e.g. S, M, L, XL)."},
                        "color": {"type": "string", "description": "Free-form (e.g. black, navy, red)."},
                        "occasion": {
                            "type": "string",
                            "enum": ["casual", "work", "formal", "athletic", "loungewear", "wedding", "vacation"],
                        },
                        "weather": {
                            "type": "string",
                            "enum": ["hot", "warm", "mild", "cool", "cold", "rain", "snow"],
                        },
                        "season": {
                            "type": "string",
                            "enum": ["spring", "summer", "fall", "winter"],
                        },
                        "fit": {
                            "type": "string",
                            "enum": ["slim", "regular", "relaxed", "oversized"],
                        },
                        "care": {
                            "type": "string",
                            "enum": ["machine_wash", "hand_wash", "dry_clean"],
                        },
                        "category": {"type": "string"},
                    },
                    "additionalProperties": False,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_product_details",
        "description": "Fetch the full enriched record for a single SKU.",
        "input_schema": {
            "type": "object",
            "properties": {"sku": {"type": "string"}},
            "required": ["sku"],
        },
    },
    {
        "name": "add_to_cart",
        "description": "Stage a product in the cart for checkout.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sku": {"type": "string"},
                "variant": {
                    "type": "object",
                    "properties": {
                        "size": {"type": "string"},
                        "color": {"type": "string"},
                    },
                },
                "quantity": {"type": "integer", "minimum": 1, "default": 1},
            },
            "required": ["sku"],
        },
    },
]


def _project_search_match(p: dict, score: dict | None) -> dict:
    return {
        "sku": p["sku"],
        "name": p.get("name"),
        "price": p.get("price"),
        "category": p.get("category"),
        "readiness_score": (score or p.get("score") or {}).get("readiness_score"),
    }


def _project_full(p: dict) -> dict:
    return {
        "sku": p["sku"],
        "name": p.get("name"),
        "description": p.get("description"),
        "price": p.get("price"),
        "category": p.get("category"),
        "brand": p.get("brand"),
        "image_urls": p.get("image_urls"),
        "attributes": p.get("attributes"),
        "agent_facets": p.get("agent_facets"),
        "q_and_a": p.get("q_and_a"),
        "relationship_type": p.get("relationship_type"),
    }


class ToolExecutor:
    """Pure-function toolkit. Holds an in-memory cart per agent run."""

    def __init__(self, index: EnrichedProductIndex) -> None:
        self.index = index
        self.cart: list[dict] = []

    def execute(self, name: str, payload: dict) -> dict:
        if name == "search_products":
            matches = self.index.search(
                query=payload.get("query", ""),
                filters=payload.get("filters") or {},
                limit=8,
            )
            return {
                "matches": [_project_search_match(p, p.get("score")) for p in matches],
                "result_count": len(matches),
            }

        if name == "get_product_details":
            sku = payload.get("sku")
            if not sku or sku not in self.index.by_sku:
                return {"error": "sku_not_found", "sku": sku}
            return _project_full(self.index.by_sku[sku])

        if name == "add_to_cart":
            sku = payload.get("sku")
            qty = int(payload.get("quantity") or 1)
            variant = payload.get("variant") or {}
            if not sku or sku not in self.index.by_sku:
                return {"status": "sku_not_found", "sku": sku, "cart_preview": self.cart}
            product = self.index.by_sku[sku]
            attrs = product.get("attributes") or {}
            allowed_sizes = _flatten_attr(attrs.get("size"))
            allowed_colors = _flatten_attr(attrs.get("color"))
            if variant.get("size") and allowed_sizes and variant["size"].lower() not in allowed_sizes:
                return {
                    "status": "invalid_variant",
                    "reason": f"size {variant['size']!r} not in {sorted(allowed_sizes)}",
                    "cart_preview": self.cart,
                }
            if variant.get("color") and allowed_colors and variant["color"].lower() not in allowed_colors:
                return {
                    "status": "invalid_variant",
                    "reason": f"color {variant['color']!r} not in {sorted(allowed_colors)}",
                    "cart_preview": self.cart,
                }
            # Detect "we can't verify this variant" — the user asked for a
            # specific size/color but the product has no variant data at all.
            warnings: list[str] = []
            if variant.get("size") and not allowed_sizes:
                warnings.append(
                    f"product carries no size attribute; size {variant['size']!r} is unverified"
                )
            if variant.get("color") and not allowed_colors:
                warnings.append(
                    f"product carries no color attribute; color {variant['color']!r} is unverified"
                )
            cart_item = {
                "cart_item_id": str(uuid.uuid4()),
                "sku": sku,
                "name": product.get("name"),
                "unit_price": product.get("price"),
                "variant": variant,
                "quantity": qty,
            }
            self.cart.append(cart_item)
            return {
                "status": "added_unverified_variant" if warnings else "added",
                "cart_item_id": cart_item["cart_item_id"],
                "warnings": warnings or None,
                "cart_preview": self.cart,
            }

        return {"error": "unknown_tool", "tool": name}


def _flatten_attr(value) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, str):
        return {value.lower()}
    if isinstance(value, list):
        return {str(v).lower() for v in value if v}
    if isinstance(value, dict):
        return {str(k).lower() for k in value.keys()}
    return set()


def build_checkout_intent(
    *,
    agent_id: str,
    retailer_id: str,
    cart: list[dict],
    index: EnrichedProductIndex,
    is_enriched: bool,
) -> dict | None:
    """PDF section 4.5 — ACP-shaped JSON payload from the staged cart.

    The payload is intentionally richer on the enriched side: line items carry
    `agent_facets` and provenance, `ucp_alignment.agent_context_preserved` is
    true, and `fulfillment_hints` reflect whether variants could be verified.
    The pre-enrichment side emits a structurally-valid but information-thin
    intent — exactly what baseline catalog data gives a downstream agent.
    """
    if not cart:
        return None

    line_items: list[dict] = []
    any_unverified = False
    for item in cart:
        product = index.by_sku.get(item["sku"], {})
        attrs = product.get("attributes") or {}
        variant = item.get("variant") or {}
        verified = True
        if variant.get("size") and not _flatten_attr(attrs.get("size")):
            verified = False
        if variant.get("color") and not _flatten_attr(attrs.get("color")):
            verified = False
        if not verified:
            any_unverified = True

        li: dict = {
            "sku": item["sku"],
            "name": item["name"],
            "variant": variant,
            "variant_verified": verified,
            "quantity": item.get("quantity", 1),
            "unit_price": item.get("unit_price") or 0.0,
            "currency": "USD",
        }
        if is_enriched:
            facets = product.get("agent_facets") or {}
            if facets:
                li["agent_facets"] = facets
            rels = product.get("relationship_type") or []
            if rels:
                li["related_skus"] = [
                    {"sku": r.get("related_sku"), "type": r.get("relationship_type") or r.get("type")}
                    for r in rels
                    if isinstance(r, dict) and r.get("related_sku")
                ][:3]
            qa = product.get("q_and_a") or []
            if qa:
                li["q_and_a_count"] = len(qa)
            li["enrichment_provenance"] = "ria_enriched"
        else:
            li["enrichment_provenance"] = "source_only"
        line_items.append(li)

    subtotal = round(sum((li["unit_price"] or 0) * li["quantity"] for li in line_items), 2)

    enriched_keys: list[str] = []
    if is_enriched:
        if any("agent_facets" in li for li in line_items):
            enriched_keys.append("agent_facets")
        if any("related_skus" in li for li in line_items):
            enriched_keys.append("relationship_type")
        if any("q_and_a_count" in li for li in line_items):
            enriched_keys.append("q_and_a")

    return {
        "intent_version": "acp/0.1",
        "intent_type": "checkout",
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "agent": {"agent_id": agent_id, "agent_vendor": "RIA"},
        "retailer": {"retailer_id": retailer_id, "storefront_url": None},
        "line_items": line_items,
        "totals": {"subtotal": subtotal, "currency": "USD"},
        "fulfillment_hints": {
            "requires_variant_confirmation": any_unverified,
            "data_sufficiency": "agent_ready" if is_enriched else "human_review_recommended",
        },
        "ucp_alignment": {
            "version": "0.1",
            "agent_context_preserved": bool(is_enriched and enriched_keys),
            "enriched_attributes": enriched_keys,
        },
        "handoff": {
            "next_step": "payment_authorization",
            "payment_processor": None,
            "downstream_capabilities": (
                ["facet_filter", "relationship_traversal", "qa_citation"]
                if is_enriched else []
            ),
        },
    }


async def run_agent(
    *,
    query: str,
    index: EnrichedProductIndex,
    index_label: str,
    retailer_id: str,
    agent_id: str,
    prior_messages: list[dict] | None = None,
    prior_cart: list[dict] | None = None,
) -> dict:
    """One Claude tool-use loop. Returns a transcript dict.

    prior_messages and prior_cart let the caller maintain conversation memory
    across /validate/query invocations so the agent can resolve back-references
    like "add both to cart".
    """
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise EnrichmentError("ANTHROPIC_API_KEY is not set; agent cannot run")

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    toolkit = ToolExecutor(index)
    if prior_cart:
        toolkit.cart = list(prior_cart)
    tool_calls: list[dict] = []

    messages: list[dict] = list(prior_messages or [])
    messages.append({"role": "user", "content": query})
    final_text = ""
    turns_used = 0
    terminator = "max_turns"

    for turn in range(MAX_TURNS):
        turns_used = turn + 1
        try:
            response = await client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=TOOL_DEFS,
                messages=messages,
            )
        except APIError as exc:
            raise EnrichmentError(f"Claude API error: {exc}") from exc

        assistant_blocks: list[dict] = []
        tool_uses: list[dict] = []
        for block in response.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                final_text = (final_text + "\n" + block.text).strip() if final_text else block.text
                assistant_blocks.append({"type": "text", "text": block.text})
            elif btype == "tool_use":
                tool_uses.append({"id": block.id, "name": block.name, "input": dict(block.input)})
                assistant_blocks.append(
                    {"type": "tool_use", "id": block.id, "name": block.name, "input": dict(block.input)}
                )

        messages.append({"role": "assistant", "content": assistant_blocks})

        if response.stop_reason != "tool_use" or not tool_uses:
            terminator = "natural"
            break

        tool_result_blocks: list[dict] = []
        for tu in tool_uses:
            result = toolkit.execute(tu["name"], tu["input"])
            tool_calls.append(
                {"name": tu["name"], "args": tu["input"], "result": result}
            )
            tool_result_blocks.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": json.dumps(result),
                }
            )
        messages.append({"role": "user", "content": tool_result_blocks})
    else:
        # PDF section 5: hard cap reached. Force one final summary turn.
        try:
            cleanup = await client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=512,
                system=SYSTEM_PROMPT,
                tools=TOOL_DEFS,
                messages=messages
                + [
                    {
                        "role": "user",
                        "content": "Tool budget exhausted. Summarize the best answer for the user with what you have so far, in ≤3 sentences. Do not call any more tools.",
                    }
                ],
            )
            for block in cleanup.content:
                if getattr(block, "type", None) == "text":
                    final_text = block.text
                    break
        except APIError:
            final_text = final_text or "I couldn't finish reasoning over the catalog within the tool budget."

    return {
        "index_type": index_label,
        "query_text": query,
        "tool_calls": tool_calls,
        "agent_response": final_text or "(no response)",
        "turns_used": turns_used,
        "terminator": terminator,
        "cart_preview": toolkit.cart,
        "checkout_intent": build_checkout_intent(
            agent_id=agent_id,
            retailer_id=retailer_id,
            cart=toolkit.cart,
            index=index,
            is_enriched=(index_label == "post"),
        ),
        "messages": messages,  # full message log for persistence across queries
    }
