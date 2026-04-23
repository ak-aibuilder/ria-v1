"""ProductMerger — Phase 3 of the RIA pipeline.

Per PDF section 3.4:
- Originals are never overwritten.
- Each enriched field carries provenance + confidence.
- Conflicts favor the source; conflicts logged to audit_trail.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

FACET_VOCAB: dict[str, set[str]] = {
    "occasion": {"casual", "work", "formal", "athletic", "loungewear", "wedding", "vacation"},
    "weather": {"hot", "warm", "mild", "cool", "cold", "rain", "snow"},
    "fit": {"slim", "regular", "relaxed", "oversized"},
    "care": {"machine_wash", "hand_wash", "dry_clean"},
    "season": {"spring", "summer", "fall", "winter"},
    "price_band": {"under_50", "50_100", "100_200", "200_plus"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_facets(raw: Any) -> dict[str, Any]:
    """Filter facets against controlled vocab. Discard unknown keys/values."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in FACET_VOCAB:
            continue
        allowed = FACET_VOCAB[key]
        if isinstance(value, list):
            cleaned = [v for v in value if isinstance(v, str) and v in allowed]
            if cleaned:
                out[key] = cleaned
        elif isinstance(value, str) and value in allowed:
            out[key] = value
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

    out = dict(product)
    out["enriched"] = enriched or None
    out["enriched_provenance"] = enriched_provenance
    out["audit_trail"] = audit_trail
    return out
