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


_OPTION_RE = re.compile(r"^option(\d+)_(name|value)$")


def parse_csv_bytes(raw: bytes) -> tuple[list[dict], dict[str, str]]:
    """Permissive CSV parse + alias normalization.

    Also picks up Shopify-style `Option{N} Name / Option{N} Value` pairs and
    materializes them as `attributes` so size/color variants from variant rows
    survive into the final product. Returns (rows, alias_mapping_used).
    """
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text), skipinitialspace=True)
    if not reader.fieldnames:
        return [], {}

    alias_mapping: dict[str, str] = {}
    canonical_for: dict[str, str] = {}
    # n -> {"name_header": "Option1 Name", "value_header": "Option1 Value"}
    option_headers: dict[int, dict[str, str]] = {}

    for header in reader.fieldnames:
        snake = _snake(header)
        canon = ALIAS_MAP.get(snake)
        if canon:
            alias_mapping[header] = canon
            canonical_for[header] = canon
            continue
        m = _OPTION_RE.match(snake or "")
        if m:
            n = int(m.group(1))
            slot = option_headers.setdefault(n, {})
            slot[f"{m.group(2)}_header"] = header

    all_rows = list(reader)

    # First pass: figure out the canonical attribute name for each option slot
    # (e.g. n=1 -> "size") by scanning every row for the first non-empty Name.
    option_names: dict[int, str] = {}
    for n, refs in option_headers.items():
        name_header = refs.get("name_header")
        if not name_header:
            continue
        for raw_row in all_rows:
            raw_name = (raw_row.get(name_header) or "").strip()
            if raw_name and raw_name.lower() != "title":
                option_names[n] = raw_name.lower().replace(" ", "_")
                break

    rows: list[dict] = []
    for raw_row in all_rows:
        row: dict = {}
        attrs: dict[str, list[str]] = {}

        for header, value in raw_row.items():
            canon = canonical_for.get(header)
            if not canon:
                continue
            v = (value or "").strip()
            if not v:
                continue
            row[canon] = v

        for n, refs in option_headers.items():
            value_header = refs.get("value_header")
            if not value_header:
                continue
            raw_value = (raw_row.get(value_header) or "").strip()
            if not raw_value or raw_value.lower() == "default title":
                continue
            key = option_names.get(n, f"option{n}")
            bucket = attrs.setdefault(key, [])
            if raw_value not in bucket:
                bucket.append(raw_value)

        if attrs:
            row["attributes"] = attrs
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
        attributes = row.get("attributes")
        if isinstance(attributes, dict):
            # Collapse single-element lists down to scalars for cleaner downstream use.
            attributes = {
                k: (v[0] if isinstance(v, list) and len(v) == 1 else v)
                for k, v in attributes.items()
            }
        elif isinstance(attributes, str):
            attributes = {"raw": attributes}
        else:
            attributes = {}

        product = {
            "sku": sku,
            "name": name,
            "description": row.get("description"),
            "price": price,
            "category": row.get("category"),
            "image_urls": _coerce_image_urls(row.get("image_urls")),
            "brand": row.get("brand"),
            "attributes": attributes,
            "q_and_a": None,
            "raw_review_data": None,
            "relationship_type": None,
            "agent_facets": None,
        }
        kept.append(product)
    return kept, dropped


def _merge_pair(a: dict, b: dict) -> dict:
    """Merge b into a: prefer the value with more populated fields per field.

    Special-case `attributes`: union the per-key lists so variant rows for the
    same SKU contribute their option values (e.g. size: [Small,Medium,Large]).
    """
    out = dict(a)
    for k, v in b.items():
        if v in (None, "", [], {}):
            continue
        existing = out.get(k)
        if k == "attributes" and isinstance(v, dict):
            merged = dict(existing) if isinstance(existing, dict) else {}
            for ak, av in v.items():
                if isinstance(av, list):
                    bucket = merged.get(ak)
                    if not isinstance(bucket, list):
                        bucket = [bucket] if bucket not in (None, "") else []
                    for item in av:
                        if item not in bucket:
                            bucket.append(item)
                    merged[ak] = bucket
                else:
                    if not merged.get(ak):
                        merged[ak] = av
            out[k] = merged
            continue
        if existing in (None, "", [], {}):
            out[k] = v
        elif k == "description" and isinstance(existing, str) and isinstance(v, str) and v not in existing:
            out[k] = f"{existing} {v}".strip()
    return out


def _dedupe_rows(
    rows: list[dict], strategy: DedupeStrategy
) -> tuple[list[dict], int]:
    """Dedupe by SKU on raw rows (post-parse, pre-normalize). Returns (rows, duplicate_count).

    Operating on raw rows lets us catch Shopify-style variant rows where the
    parent carries Title/Description and follow-up rows only carry option
    values + price. Strategies:

    - "first":  keep the first row that carries a SKU.
    - "merge":  start from the most-populated row per SKU, fill in missing
                fields from siblings (descriptions are concatenated).
    - "detect": no dedupe; just count colliding SKUs.
    """
    by_sku: dict[str, list[dict]] = {}
    order: list[str] = []
    for row in rows:
        sku = row.get("sku")
        if not sku:
            continue
        if sku not in by_sku:
            by_sku[sku] = []
            order.append(sku)
        by_sku[sku].append(row)

    duplicate_skus = sum(1 for v in by_sku.values() if len(v) > 1)

    if strategy == "detect":
        return rows, duplicate_skus

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


# Backwards-compatible name kept for any external callers / tests.
dedupe_products = _dedupe_rows


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

    deduped_rows, duplicate_count = _dedupe_rows(rows, strategy)
    normalized, dropped = normalize_rows(deduped_rows)
    report = ValidationReport(
        rows_parsed=len(rows),
        rows_dropped=dropped,
        duplicate_count=duplicate_count,
        alias_mapping=alias_mapping,
    )
    needs_dedupe = strategy == "detect" and duplicate_count > 0
    # On detect, return the normalized rows for preview only — they are NOT
    # persisted (frontend re-sends with merge|first to actually commit).
    return IngestResult(products=normalized, report=report, needs_dedupe=needs_dedupe)
