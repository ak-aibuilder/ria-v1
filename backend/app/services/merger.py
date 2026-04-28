"""ProductMerger — Phase 3 of the RIA pipeline.

Per PDF section 3.4:
- Originals are never overwritten.
- Each enriched field carries provenance + confidence.
- Conflicts favor the source; conflicts logged to audit_trail.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

# Deterministic vocab for fall-back color/material extraction from name/desc.
# Catches obvious cases Claude sometimes misses (e.g. "Black Leather Bag" →
# color=black, material=leather). Only single-word, unambiguous tokens.
_COLOR_WORDS = {
    "black", "white", "red", "blue", "navy", "green", "yellow", "pink",
    "purple", "orange", "brown", "grey", "gray", "beige", "ivory", "tan",
    "gold", "silver", "olive", "maroon", "teal", "cream", "khaki",
    "burgundy", "charcoal",
}
_MATERIAL_WORDS = {
    "leather", "silk", "wool", "cotton", "denim", "linen", "cashmere",
    "polyester", "nylon", "fleece", "down", "satin", "suede", "velvet",
    "spandex", "lycra",
}
_TOKEN_RE = re.compile(r"[a-z]+")

# Phrase → controlled-vocab value mappings. Phrase match is substring on the
# lowercased name+description so multi-word terms like "water-resistant" work.
_WEATHER_PHRASES: list[tuple[str, str]] = [
    ("waterproof", "rain"), ("water-resistant", "rain"), ("water-repellent", "rain"),
    ("water repellent", "rain"), ("rain-ready", "rain"), ("rainproof", "rain"),
    ("rainy", "rain"), ("rain ", "rain"),
    ("snow", "snow"), ("snowy", "snow"),
    ("winter", "cold"), ("thermal", "cold"), ("fleece", "cold"), ("wool", "cold"),
    ("down-filled", "cold"), ("parka", "cold"), ("insulated", "cold"),
    ("heavy", "cool"),
    ("summer", "hot"), ("lightweight", "warm"), ("breathable", "warm"),
    ("linen", "warm"), ("tank", "hot"), ("shorts", "hot"),
]
_OCCASION_PHRASES: list[tuple[str, str]] = [
    ("tuxedo", "formal"), ("tux", "formal"), ("gown", "formal"),
    ("blazer", "work"), ("suit ", "work"),
    ("wedding", "wedding"), ("bridal", "wedding"),
    ("athletic", "athletic"), ("sporty", "athletic"), ("sport", "athletic"),
    ("running", "athletic"), ("yoga", "athletic"), ("gym", "athletic"),
    ("loungewear", "loungewear"), ("pajama", "loungewear"), ("sleep", "loungewear"),
    ("vacation", "vacation"), ("beach", "vacation"), ("travel", "vacation"),
    ("casual", "casual"), ("everyday", "casual"), ("daily", "casual"),
]
_SEASON_PHRASES: list[tuple[str, str]] = [
    ("spring", "spring"),
    ("summer", "summer"),
    ("fall", "fall"), ("autumn", "fall"),
    ("winter", "winter"),
]

FACET_VOCAB: dict[str, set[str]] = {
    "occasion": {"casual", "work", "formal", "athletic", "loungewear", "wedding", "vacation"},
    "weather": {"hot", "warm", "mild", "cool", "cold", "rain", "snow"},
    "fit": {"slim", "regular", "relaxed", "oversized"},
    "care": {"machine_wash", "hand_wash", "dry_clean"},
    "season": {"spring", "summer", "fall", "winter"},
    "price_band": {"under_50", "50_100", "100_200", "200_plus"},
    # Taxonomic — open vocab; coerce only normalizes case/whitespace.
    "color": set(),
    "material": set(),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _extract_deterministic_facets(product: dict) -> dict[str, Any]:
    """Mine name + description for unambiguous facet signals.

    Returns a dict whose values are scalars (color, material) OR lists
    (weather, occasion, season). The caller unions list values with anything
    Claude already produced — both sources contribute, neither overrides.
    """
    haystack = " ".join(
        str(x or "") for x in (product.get("name"), product.get("description"))
    ).lower()
    if not haystack:
        return {}
    tokens = set(_TOKEN_RE.findall(haystack))
    out: dict[str, Any] = {}

    color_hits = sorted(tokens & _COLOR_WORDS)
    if color_hits:
        out["color"] = color_hits[0]
    material_hits = sorted(tokens & _MATERIAL_WORDS)
    if material_hits:
        out["material"] = material_hits[0]

    def collect(phrases: list[tuple[str, str]]) -> list[str]:
        seen = []
        for phrase, value in phrases:
            if phrase in haystack and value not in seen:
                seen.append(value)
        return seen

    weather = collect(_WEATHER_PHRASES)
    if weather:
        out["weather"] = weather
    occasion = collect(_OCCASION_PHRASES)
    if occasion:
        out["occasion"] = occasion
    season = collect(_SEASON_PHRASES)
    if season:
        out["season"] = season

    return out


def _union_facet(existing: Any, addition: Any) -> Any:
    """Merge a new facet value into an existing one, preferring union for lists."""
    if existing in (None, "", [], {}):
        return addition
    if isinstance(existing, list) or isinstance(addition, list):
        ex_list = list(existing) if isinstance(existing, list) else [existing]
        add_list = list(addition) if isinstance(addition, list) else [addition]
        for item in add_list:
            if item not in ex_list:
                ex_list.append(item)
        return ex_list
    return existing  # scalar already set — keep Claude's value


def _coerce_facets(raw: Any) -> dict[str, Any]:
    """Filter facets against controlled vocab. Discard unknown keys/values.

    Closed-vocab keys (occasion/weather/fit/care/season/price_band) are
    enforced strictly. Open-vocab keys (color/material) accept any
    short-string value and are lower-cased for index consistency.
    """
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in FACET_VOCAB:
            continue
        allowed = FACET_VOCAB[key]
        is_open = len(allowed) == 0
        if isinstance(value, list):
            cleaned = [
                v.lower().strip()
                for v in value
                if isinstance(v, str) and v.strip() and (is_open or v in allowed)
            ]
            if cleaned:
                out[key] = cleaned
        elif isinstance(value, str) and value.strip():
            v = value.strip()
            if is_open or v in allowed:
                out[key] = v.lower() if is_open else v
    return out


def _coerce_qa(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        q = item.get("question") or item.get("q")
        a = item.get("answer") or item.get("a")
        if not isinstance(q, str) or not isinstance(a, str):
            continue
        out.append(
            {
                "question": q.strip(),
                "answer": a.strip(),
                "intent": str(item.get("intent", "")).strip().lower() or None,
                "speculative": bool(item.get("speculative", False)),
            }
        )
    return out


def _coerce_relationships(
    raw: Any, valid_skus: set[str], focus_sku: str
) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    valid_types = {"often_bought_with", "substitute", "complementary", "accessory_for"}
    for item in raw:
        if not isinstance(item, dict):
            continue
        related = item.get("related_sku")
        rtype = item.get("relationship_type") or item.get("type")
        if not isinstance(related, str) or related == focus_sku or related not in valid_skus:
            continue
        if rtype not in valid_types:
            continue
        entry: dict[str, Any] = {
            "related_sku": related,
            "relationship_type": rtype,
        }
        rationale = item.get("rationale")
        if isinstance(rationale, str) and rationale.strip():
            entry["rationale"] = rationale.strip()
        out.append(entry)
    return out


def _qa_confidence(qa: list[dict[str, Any]]) -> float:
    if not qa:
        return 0.0
    speculative = sum(1 for item in qa if item.get("speculative"))
    return round(1.0 - (speculative / len(qa)) * 0.5, 2)


def merge_enrichments(
    *,
    product: dict[str, Any],
    enriched_payload: dict[str, dict[str, Any]],
    catalog_skus: set[str],
) -> dict[str, Any]:
    """Apply ProductMerger rules. Returns updated copy of `product`.

    `enriched_payload` is keyed by gap dimension (D2/D3/D5/D6) → the parsed
    Claude response for that dimension. Missing keys mean that dimension was
    not enriched (already passing or skipped due to error).
    """
    enriched = dict(product.get("enriched") or {})
    enriched_provenance = dict(product.get("enriched_provenance") or {})
    audit_trail = list(product.get("audit_trail") or [])

    for dim, payload in enriched_payload.items():
        if not isinstance(payload, dict):
            continue
        if dim == "D2":
            new_desc = payload.get("enhanced_description")
            if isinstance(new_desc, str) and new_desc.strip():
                enriched["description"] = new_desc.strip()
                enriched_provenance["description"] = {
                    "by": "ria_enriched",
                    "confidence": 0.85,
                    "ts": _now().isoformat(),
                }
                claims_added = payload.get("claims_added") or []
                if claims_added:
                    audit_trail.append(
                        {"dim": "D2", "type": "claims_added", "items": claims_added}
                    )
        elif dim == "D3":
            qa = _coerce_qa(payload.get("q_and_a"))
            if qa:
                enriched["q_and_a"] = qa
                enriched_provenance["q_and_a"] = {
                    "by": "ria_enriched",
                    "confidence": _qa_confidence(qa),
                    "ts": _now().isoformat(),
                }
        elif dim == "D5":
            rels = _coerce_relationships(
                payload.get("relationships"),
                valid_skus=catalog_skus,
                focus_sku=product["sku"],
            )
            if rels:
                enriched["relationship_type"] = rels
                enriched_provenance["relationship_type"] = {
                    "by": "ria_enriched",
                    "confidence": 0.7,
                    "ts": _now().isoformat(),
                }
        elif dim == "D6":
            facets = _coerce_facets(payload.get("agent_facets"))
            existing_attrs = product.get("attributes") or {}
            for key, value in facets.items():
                source_value = existing_attrs.get(key)
                if source_value and source_value != value:
                    audit_trail.append(
                        {
                            "dim": "D6",
                            "type": "conflict",
                            "field": key,
                            "source": source_value,
                            "claude": value,
                            "kept": "source",
                        }
                    )
                    facets[key] = source_value
            if facets:
                enriched["agent_facets"] = facets
                enriched_provenance["agent_facets"] = {
                    "by": "ria_enriched",
                    "confidence": 0.88,
                    "ts": _now().isoformat(),
                }

    # Deterministic top-up: ensure obvious tokens from name/description make
    # it into agent_facets even when Claude misses them. Scalar facets
    # (color/material) only fill gaps; list facets (weather/occasion/season)
    # are unioned with Claude's so both signals contribute.
    det = _extract_deterministic_facets(product)
    if det:
        before = dict(enriched.get("agent_facets") or {})
        facets = dict(before)
        for k, v in det.items():
            facets[k] = _union_facet(facets.get(k), v)
        if facets != before:
            enriched["agent_facets"] = facets
            enriched_provenance.setdefault(
                "agent_facets",
                {"by": "deterministic+ria_enriched", "confidence": 0.9, "ts": _now().isoformat()},
            )

    out = dict(product)
    out["enriched"] = enriched or None
    out["enriched_provenance"] = enriched_provenance
    out["audit_trail"] = audit_trail
    return out
