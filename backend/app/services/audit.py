"""ReadinessAuditor + RubricEngine — Phase 2 of the RIA pipeline.

Pure-Python deterministic scoring per PDF section 2. Same input -> same score.
"""
from __future__ import annotations

import re
from typing import Iterable

GAP_THRESHOLD = 6.0

WEIGHTS = {
    "D1": 0.25,  # Structured Attribute Completeness
    "D2": 0.15,  # Descriptive Richness
    "D3": 0.20,  # Conversational Q&A Coverage
    "D4": 0.10,  # Review Signal Presence
    "D5": 0.15,  # Relational Context
    "D6": 0.15,  # Agent-Actionable Facets
}


def _is_present(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def _category_depth(category: str | None) -> int:
    if not category:
        return 0
    parts = [p for p in re.split(r"[\\/>]+", category) if p.strip()]
    return len(parts)


def _score_d1_structured(p: dict) -> float:
    points = 0.0
    if _is_present(p.get("sku")):
        points += 1.5
    name = p.get("name") or ""
    if _is_present(name) and len(name.strip()) >= 10:
        points += 1.5
    price = p.get("price")
    if isinstance(price, (int, float)) and price > 0:
        points += 1.5
    if _category_depth(p.get("category")) >= 2:
        points += 1.5
    images = p.get("image_urls") or []
    if isinstance(images, list) and len(images) >= 1:
        points += 1.5
    if _is_present(p.get("brand")):
        points += 1.0
    attributes = p.get("attributes") or {}
    if isinstance(attributes, dict) and len(attributes) >= 2:
        points += 1.5
    return min(points, 10.0)


def _mentions(text: str, terms: Iterable[str]) -> bool:
    lo = text.lower()
    return any(term in lo for term in terms)


def _score_d2_description(p: dict) -> float:
    desc = (p.get("description") or "").strip()
    if not desc:
        return 0.0
    points = 2.0
    if len(desc) >= 50:
        points += 2.0
    if len(desc) >= 150:
        points += 2.0
    if _mentions(desc, ("material", "fabric", "composition", "cotton", "wool", "linen", "leather", "polyester")):
        points += 2.0
    if _mentions(desc, ("fit", "care", "wash", "dry-clean", "iron", "styling", "wear")):
        points += 2.0
    return min(points, 10.0)


def _score_d3_qa(p: dict) -> float:
    qa = p.get("q_and_a")
    if not isinstance(qa, list) or len(qa) == 0:
        return 0.0 if qa is None else 3.0
    points = 3.0
    if len(qa) >= 3:
        points += 3.0
    well_formed = all(
        isinstance(item, dict)
        and isinstance(item.get("question") or item.get("q"), str)
        and isinstance(item.get("answer") or item.get("a"), str)
        and len((item.get("question") or item.get("q") or "").strip()) >= 10
        and len((item.get("answer") or item.get("a") or "").strip()) >= 10
        for item in qa
    )
    if well_formed:
        points += 2.0

    intents = {(item.get("intent") or "").strip().lower() for item in qa if isinstance(item, dict)}
    intents.discard("")
    if len(intents) >= 2:
        points += 2.0
    return min(points, 10.0)


def _score_d4_review(p: dict) -> float:
    rev = p.get("raw_review_data")
    if rev is None:
        return 0.0
    points = 4.0
    if isinstance(rev, list) and len(rev) >= 1:
        points += 3.0
    elif isinstance(rev, dict) and rev:
        points += 3.0
    has_signal = False
    if isinstance(rev, list):
        for item in rev:
            if isinstance(item, dict) and (
                "rating" in item or "score" in item or "sentiment" in item
            ):
                has_signal = True
                break
    elif isinstance(rev, dict):
        has_signal = any(k in rev for k in ("rating", "score", "sentiment", "average_rating"))
    if has_signal:
        points += 3.0
    return min(points, 10.0)


def _score_d5_relational(p: dict) -> float:
    rel = p.get("relationship_type")
    if rel is None:
        return 0.0
    if not isinstance(rel, list):
        rel = [rel] if rel else []
    points = 3.0
    has_obw = any(
        isinstance(r, dict) and (r.get("relationship_type") or r.get("type")) == "often_bought_with"
        for r in rel
    )
    has_other = any(
        isinstance(r, dict)
        and (r.get("relationship_type") or r.get("type")) in ("substitute", "complementary", "accessory_for")
        for r in rel
    )
    if has_obw:
        points += 3.0
    if has_other:
        points += 4.0
    return min(points, 10.0)


def _score_d6_facets(p: dict) -> float:
    facets = p.get("agent_facets")
    if not isinstance(facets, dict) or len(facets) == 0:
        return 0.0
    points = 2.0
    populated = [k for k, v in facets.items() if _is_present(v)]
    if len(populated) >= 4:
        points += 3.0
    taxonomic_keys = {"size", "color", "material"}
    contextual_keys = {"occasion", "weather", "season", "fit", "care"}
    has_taxonomic = any(k in taxonomic_keys for k in populated)
    has_contextual = any(k in contextual_keys for k in populated)
    if has_taxonomic and has_contextual:
        points += 3.0
    enumerated = all(
        not isinstance(v, str) or len(v.split()) <= 4 for v in facets.values() if _is_present(v)
    )
    if enumerated and populated:
        points += 2.0
    return min(points, 10.0)


GAP_REASONS = {
    "D1": "Core structured attributes incomplete (sku/name/price/category/images/brand/attributes).",
    "D2": "Description is too short or lacks material/fit/care detail for agent reasoning.",
    "D3": "No conversational Q&A pairs available — agent must hallucinate answers.",
    "D4": "No review data; will be flagged as synthetic if enriched.",
    "D5": "Missing product relationships (often_bought_with / substitute / complementary).",
    "D6": "Missing agent-actionable facets (occasion/weather/fit/care/season).",
}


def _severity(score: float) -> str:
    if score < 3.0:
        return "high"
    if score < 5.0:
        return "medium"
    return "low"


def score_product(product: dict) -> dict:
    dims = {
        "D1": _score_d1_structured(product),
        "D2": _score_d2_description(product),
        "D3": _score_d3_qa(product),
        "D4": _score_d4_review(product),
        "D5": _score_d5_relational(product),
        "D6": _score_d6_facets(product),
    }
    readiness = sum(dims[k] * WEIGHTS[k] for k in dims)
    gaps = [
        {"dimension": k, "severity": _severity(dims[k]), "reason": GAP_REASONS[k]}
        for k in ("D1", "D2", "D3", "D4", "D5", "D6")
        if dims[k] < GAP_THRESHOLD
    ]
    return {
        "readiness_score": round(readiness, 2),
        "dimension_scores": {k: round(v, 2) for k, v in dims.items()},
        "gaps": gaps,
    }
