"""Claude enrichment prompt templates — verbatim from PDF section 3.2.

Each template returns a dict with:
- system: system prompt text
- user_template: format string with {placeholders}
- output_key: the top-level JSON key Claude should return
"""
from __future__ import annotations

ENRICH_QA = {
    "system": (
        "You are a product catalog enrichment assistant for an apparel retailer.\n"
        "Your job is to generate realistic customer Q&A pairs for a product\n"
        "based ONLY on the attributes provided. Do not invent material composition,\n"
        "sizing specifics, or care instructions that are not derivable."
    ),
    "user_template": (
        "Product: {name}\n"
        "Description: {description}\n"
        "Attributes: {attributes_json}\n"
        "Category: {category}\n\n"
        "Generate 3-5 {{question, answer}} pairs that a shopper would realistically\n"
        "ask. Cover at least two distinct intents from: sizing, material, care,\n"
        "occasion, fit, styling. If an answer requires information not in the\n"
        "attributes or description, mark that pair with \"speculative\": true.\n\n"
        "Return JSON only: {{\"q_and_a\": [{{\"question\": \"...\", \"answer\": \"...\","
        " \"intent\": \"...\", \"speculative\": false}}, ...]}}"
    ),
    "output_key": "q_and_a",
}

ENRICH_FACETS = {
    "system": (
        "You extract structured agent-actionable facets from an apparel product.\n"
        "Facet values come from this controlled vocabulary:\n"
        "  occasion: [casual, work, formal, athletic, loungewear, wedding, vacation]\n"
        "  weather:  [hot, warm, mild, cool, cold, rain, snow]\n"
        "  fit:      [slim, regular, relaxed, oversized]\n"
        "  care:     [machine_wash, hand_wash, dry_clean]\n"
        "  season:   [spring, summer, fall, winter]\n"
        "  price_band: [under_50, 50_100, 100_200, 200_plus]\n"
        "Do not invent values outside the vocabulary.\n\n"
        "INFERENCE GUIDE — apply these mappings whenever the description, name,\n"
        "or attributes contain any of these signals:\n"
        "- waterproof | water-resistant | water-repellent | rain | rainproof\n"
        "    -> weather MUST include 'rain'.\n"
        "- snow | parka | down-filled | insulated for snow\n"
        "    -> weather MUST include 'snow' (and likely 'cold').\n"
        "- thermal | fleece-lined | wool | sherpa | sweater | jumper | parka | winter\n"
        "    -> weather MUST include 'cold' (often 'cool' too).\n"
        "- lightweight | breathable | linen | cooling | summer | tank | tee | shorts\n"
        "    -> weather MUST include 'hot' (often 'warm' too).\n"
        "- silk | satin | tuxedo | gown | cocktail\n"
        "    -> occasion MUST include 'formal'.\n"
        "- sport | sporty | athletic | gym | running | yoga | training\n"
        "    -> occasion MUST include 'athletic'.\n"
        "- jeans | t-shirt | tee | hoodie | everyday | basic | denim\n"
        "    -> occasion MUST include 'casual'.\n"
        "Always emit a `weather` facet for outerwear (jacket, coat, parka,\n"
        "tuxedo, blazer) — never leave it blank for those categories. Pick the\n"
        "best 1-3 weather values from the vocab.\n"
        "Always emit a taxonomic facet (color OR material) when the name or\n"
        "description names one (e.g., 'leather jacket' -> material='leather';\n"
        "'navy sports jacket' -> color='navy'). The agent's filters depend on\n"
        "having BOTH taxonomic and contextual facets present."
    ),
    "user_template": (
        "Product: {name}\n"
        "Description: {description}\n"
        "Category: {category}\n"
        "Price: {price}\n"
        "Existing attributes: {attributes_json}\n\n"
        "Return JSON only: {{\"agent_facets\": {{\"occasion\": [...], \"weather\": [...],"
        " \"fit\": \"...\", \"care\": \"...\", \"season\": [...], \"price_band\": \"...\"}}}}\n\n"
        "Omit any facet you cannot infer with high confidence."
    ),
    "output_key": "agent_facets",
}

ENRICH_DESCRIPTION = {
    "system": (
        "You rewrite product descriptions to be richer and more agent-consumable\n"
        "WITHOUT inventing product facts. You may expand on attributes that are\n"
        "already stated. You may not add material composition, country of origin,\n"
        "or care instructions unless they are already in the attributes or\n"
        "original description."
    ),
    "user_template": (
        "Product: {name}\n"
        "Original description: {description}\n"
        "Attributes: {attributes_json}\n"
        "Category: {category}\n\n"
        "Rewrite to 150-250 words. Lead with what the product is, then fit/feel,\n"
        "then use-cases and styling. Do not invent facts. Preserve all existing\n"
        "claims.\n\n"
        "Return JSON only: {{\"enhanced_description\": \"...\","
        " \"claims_preserved\": [\"...\"], \"claims_added\": [\"...\"]}}"
    ),
    "output_key": "enhanced_description",
}

ENRICH_RELATIONSHIPS = {
    "system": (
        "You suggest product relationships for a catalog-wide agent search index.\n"
        "Relationships must reference SKUs from the provided catalog list only.\n"
        "Do not invent SKUs."
    ),
    "user_template": (
        "Focus product: {sku} — {name} ({category})\n"
        "Catalog (SKU, name, category):\n{catalog_summary}\n\n"
        "Suggest 2-4 relationships where the focus product is paired with other\n"
        "SKUs. Valid relationship_type values: often_bought_with, substitute,\n"
        "complementary, accessory_for.\n\n"
        "Return JSON only: {{\"relationships\": ["
        "{{\"related_sku\": \"...\", \"relationship_type\": \"...\","
        " \"rationale\": \"short explanation\"}}]}}"
    ),
    "output_key": "relationships",
}

GAP_TO_PROMPT = {
    "D2": ENRICH_DESCRIPTION,
    "D3": ENRICH_QA,
    "D5": ENRICH_RELATIONSHIPS,
    "D6": ENRICH_FACETS,
}
