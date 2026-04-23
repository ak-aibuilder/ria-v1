"""CatalogIngestor — Phase 1 of the RIA pipeline.

Deterministic CSV parsing, header alias normalization, type coercion, and
dedupe per the Technical Design (PDF §1.1).
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from typing import Iterable, Literal

# Static alias dictionary — additions OK, do not remove existing entries.
ALIAS_MAP: dict[str, str] = {
    # sku
    "sku": "sku",
    "product_id": "sku",
    "item_id": "sku",
    "style": "sku",
    "variant_sku": "sku",  # Shopify export
    "handle": "sku",        # Shopify slug fallback when Variant SKU is blank
    # name
    "name": "name",
    "product_name": "name",
    "title": "name",
    "style_name": "name",
    # description
    "description": "description",
    "desc": "description",
    "long_description": "description",
    "product_description": "description",
    "body_html": "description",  # Shopify "Body (HTML)" after _snake()
    # price
    "price": "price",
    "unit_price": "price",
    "sale_price": "price",
    "msrp": "price",
    "variant_price": "price",  # Shopify export
    # category
    "category": "category",
    "department": "category",
    "category_path": "category",
    "taxonomy": "category",
    "type": "category",     # Shopify product type
    "tags": "category",     # Shopify tags fallback when Type is blank
    # image_urls
    "image": "image_urls",
    "images": "image_urls",
    "image_url": "image_urls",
    "image_urls": "image_urls",
    "photo_url": "image_urls",
    "image_src": "image_urls",   # Shopify export
    "variant_image": "image_urls",
    # brand
    "brand": "brand",
    "brand_name": "brand",
    "manufacturer": "brand",
    "vendor": "brand",   # Shopify export
    # attributes
    "attributes": "attributes",
    "specs": "attributes",
    "features": "attributes",
    "details": "attributes",
}

REQUIRED_FIELDS = ("sku", "name", "price")
DedupeStrategy = Literal["detect", "merge", "first"]


@dataclass
class ValidationReport:
    rows_parsed: int = 0
    rows_dropped: int = 0
    duplicate_count: int = 0
    alias_mapping: dict[str, str] = field(default_factory=dict)
    missing_required: list[str] = field(default_factory=list)


@dataclass
class IngestResult:
    products: list[dict]
    report: ValidationReport
    needs_dedupe: bool = False


def _snake(header: str) -> str:
    h = header.strip().lstrip("\ufeff").lower()
    h = re.sub(r"[\s\-]+", "_", h)
    h = re.sub(r"[^a-z0-9_]+", "", h)
    return h


def _coerce_price(value: str) -> float | None:
    if value is None:
        return None
    cleaned = re.sub(r"[^\d\.\-]", "", str(value))
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _coerce_image_urls(value: str | None) -> list[str]:
    if not value:
        return []
    parts = re.split(r"[|;,\s]+", str(value).strip())
    return [p for p in (s.strip() for s in parts) if p.startswith(("http://", "https://"))]


def _populated_field_count(row: dict) -> int:
    return sum(1 for v in row.values() if v not in (None, "", [], {}))


def parse_csv_bytes(raw: bytes) -> tuple[list[dict], dict[str, str]]:
    """Permissive CSV parse + alias normalization.

    Returns (rows_as_canonical_dicts, alias_mapping_used).
    """
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text), skipinitialspace=True)
    if not reader.fieldnames:
        return [], {}

    alias_mapping: dict[str, str] = {}
    canonical_for: dict[str, str] = {}
    for header in reader.fieldnames:
        canon = ALIAS_MAP.get(_snake(header))
        if canon:
            alias_mapping[header] = canon
            canonical_for[header] = canon

    rows: list[dict] = []
    for raw_row in reader:
        row: dict = {}
        for header, value in raw_row.items():
            canon = canonical_for.get(header)
            if not canon:
                continue
            v = (value or "").strip()
            if not v:
                continue
            row[canon] = v
        if row:
            rows.append(row)
    return rows, alias_mapping


def normalize_rows(rows: list[dict]) -> tuple[list[dict], int]:
    """Coerce types; drop rows missing required fields. Returns (kept, dropped)."""
    kept: list[dict] = []
    dropped = 0
    for row in rows:
        sku = row.get("sku")
        name = row.get("name")
        price = _coerce_price(row.get("price")) if "price" in row else None
        if not sku or not name or price is None or price <= 0:
            dropped += 1
            continue
        product = {
            "sku": sku,
            "name": name,
            "description": row.get("description"),
            "price": price,
            "category": row.get("category"),
            "image_urls": _coerce_image_urls(row.get("image_urls")),
            "brand": row.get("brand"),
            "attributes": {},
            "q_and_a": None,
            "raw_review_data": None,
            "relationship_type": None,
            "agent_facets": None,
        }
        if "attributes" in row:
            product["attributes"] = {"raw": row["attributes"]}
        kept.append(product)
    return kept, dropped


def _merge_pair(a: dict, b: dict) -> dict:
    """Merge b into a: prefer the value with more populated fields per field."""
    out = dict(a)
    for k, v in b.items():
        if v in (None, "", [], {}):
            continue
        existing = out.get(k)
        if existing in (None, "", [], {}):
            out[k] = v
        elif k == "description" and isinstance(existing, str) and isinstance(v, str) and v not in existing:
            out[k] = f"{existing} {v}".strip()
    return out


def dedupe_products(
    products: list[dict], strategy: DedupeStrategy
) -> tuple[list[dict], int]:
    """Return (deduped, duplicate_count). Strategy:

    - "first": keep first row per SKU.
    - "merge": merge fields per SKU, keeping the most-populated values.
    - "detect": no dedupe; just count.
    """
    by_sku: dict[str, list[dict]] = {}
    order: list[str] = []
    for p in products:
        sku = p["sku"]
        if sku not in by_sku:
            by_sku[sku] = []
            order.append(sku)
        by_sku[sku].append(p)

    duplicate_skus = sum(1 for v in by_sku.values() if len(v) > 1)

    if strategy == "detect":
        return products, duplicate_skus

    deduped: list[dict] = []
    if strategy == "first":
        for sku in order:
            deduped.append(by_sku[sku][0])
    else:  # "merge"
        for sku in order:
            group = by_sku[sku]
            if len(group) == 1:
                deduped.append(group[0])
                continue
            best = max(group, key=_populated_field_count)
            for other in group:
                if other is best:
                    continue
                best = _merge_pair(best, other)
            deduped.append(best)
    return deduped, duplicate_skus


def ingest(raw_csv: bytes, strategy: DedupeStrategy = "merge") -> IngestResult:
    rows, alias_mapping = parse_csv_bytes(raw_csv)
    missing = [c for c in REQUIRED_FIELDS if c not in set(alias_mapping.values())]
    if missing:
        report = ValidationReport(
            rows_parsed=len(rows),
            rows_dropped=len(rows),
            alias_mapping=alias_mapping,
            missing_required=missing,
        )
        return IngestResult(products=[], report=report)

    normalized, dropped = normalize_rows(rows)
    deduped, duplicate_count = dedupe_products(normalized, strategy)
    report = ValidationReport(
        rows_parsed=len(rows),
        rows_dropped=dropped,
        duplicate_count=duplicate_count,
        alias_mapping=alias_mapping,
    )
    needs_dedupe = strategy == "detect" and duplicate_count > 0
    return IngestResult(products=deduped, report=report, needs_dedupe=needs_dedupe)
