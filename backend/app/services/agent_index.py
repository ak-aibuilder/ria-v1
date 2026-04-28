"""EnrichedProductIndex builder — Phase 4 supporting structure (PDF section 4.2).

Two simple in-memory indexes per session:
- by_sku:      O(1) product lookup
- facet_index: facet_name -> facet_value -> set[sku]

Built fresh on every validation request (cheap for ≤500 products).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable


def _flatten(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip().lower()]
    if isinstance(value, list):
        return [str(v).strip().lower() for v in value if v]
    return []


# Defensive synonym map — Claude occasionally hands back near-misses for the
# closed-vocab facets despite the tool schema enums. Normalize before lookup.
FACET_SYNONYMS: dict[str, dict[str, str]] = {
    "weather": {
        "rainy": "rain", "rain_resistant": "rain", "waterproof": "rain",
        "snowy": "snow", "snowing": "snow",
        "hot_weather": "hot", "warm_weather": "warm",
        "cool_weather": "cool", "cold_weather": "cold", "freezing": "cold",
    },
    "occasion": {
        "sport": "athletic", "sporty": "athletic", "gym": "athletic",
        "office": "work", "business": "work", "professional": "work",
        "everyday": "casual", "daily": "casual",
        "party": "formal", "evening": "formal",
        "lounge": "loungewear", "loungewear": "loungewear", "home": "loungewear",
        "holiday": "vacation", "travel": "vacation", "beach": "vacation",
    },
    "season": {
        "summery": "summer", "summer_time": "summer",
        "winter_time": "winter", "wintery": "winter", "wintry": "winter",
        "autumn": "fall", "autumnal": "fall",
        "springtime": "spring",
    },
    "fit": {
        "skinny": "slim", "tight": "slim", "fitted": "slim",
        "loose": "relaxed", "baggy": "oversized", "boxy": "oversized",
        "standard": "regular", "normal": "regular",
    },
    "care": {
        "machine_washable": "machine_wash", "washable": "machine_wash",
        "handwash": "hand_wash", "hand_washable": "hand_wash",
        "drycleanonly": "dry_clean", "dry_clean_only": "dry_clean",
    },
}


def _normalize_filter_value(facet_name: str, raw: str) -> str:
    norm = raw.strip().lower().replace(" ", "_").replace("-", "_")
    return FACET_SYNONYMS.get(facet_name, {}).get(norm, norm)


def _tokens(text: str) -> set[str]:
    if not text:
        return set()
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) >= 2}


@dataclass
class EnrichedProductIndex:
    by_sku: dict[str, dict] = field(default_factory=dict)
    facet_index: dict[str, dict[str, set[str]]] = field(default_factory=dict)

    def add(self, product: dict) -> None:
        sku = product["sku"]
        self.by_sku[sku] = product
        # Claude-generated agent facets (D6).
        for facet_name, value in (product.get("agent_facets") or {}).items():
            for v in _flatten(value):
                self.facet_index.setdefault(facet_name, {}).setdefault(v, set()).add(sku)
        # Source attributes (D1) — size / color / material come from the CSV
        # itself (e.g. Shopify Option columns) and are critical for variant
        # filtering. Reuse the same facet_index so the agent's filter:
        # {"size": "M"} hits whether the data is from the source or enriched.
        for attr_name, value in (product.get("attributes") or {}).items():
            for v in _flatten(value):
                self.facet_index.setdefault(attr_name.lower(), {}).setdefault(v, set()).add(sku)

    @classmethod
    def from_products(cls, products: list[dict], *, use_enriched: bool) -> "EnrichedProductIndex":
        idx = cls()
        for p in products:
            view = dict(p)
            if use_enriched and p.get("enriched"):
                enriched = p["enriched"] or {}
                for field_name in ("description", "q_and_a", "agent_facets", "relationship_type"):
                    val = enriched.get(field_name)
                    if val not in (None, "", [], {}):
                        view[field_name] = val
            idx.add(view)
        return idx

    def search(
        self,
        *,
        query: str,
        filters: dict[str, str | float | None] | None = None,
        limit: int = 8,
    ) -> list[dict]:
        filters = filters or {}
        candidate_skus: set[str] | None = None

        for facet_name in ("size", "color", "occasion", "weather", "fit", "care", "season"):
            wanted = filters.get(facet_name)
            if not wanted:
                continue
            # If NO product in the catalog has this facet indexed, the catalog
            # simply doesn't carry that data — skip the filter rather than
            # zeroing out the candidate set. Strict filtering still applies
            # when the facet IS present on some products but not the value.
            if not self.facet_index.get(facet_name):
                continue
            wanted_lc = _normalize_filter_value(facet_name, str(wanted))
            sku_set = self.facet_index[facet_name].get(wanted_lc, set())
            candidate_skus = sku_set if candidate_skus is None else candidate_skus & sku_set

        category = filters.get("category")
        price_max = filters.get("price_max")

        if candidate_skus is None:
            candidate_skus = set(self.by_sku.keys())

        query_tokens = _tokens(query)
        scored: list[tuple[float, dict]] = []
        for sku in candidate_skus:
            p = self.by_sku[sku]
            if category and category.lower() not in (p.get("category") or "").lower():
                continue
            if price_max is not None and p.get("price") is not None and p["price"] > float(price_max):
                continue
            haystack = " ".join(
                str(x or "")
                for x in (
                    p.get("name"),
                    p.get("brand"),
                    p.get("description"),
                    p.get("category"),
                )
            )
            tokens = _tokens(haystack)
            overlap = len(query_tokens & tokens)
            scored.append((float(overlap), p))

        scored.sort(key=lambda t: (-t[0], (t[1].get("name") or "")))
        return [p for _, p in scored[:limit]]
