"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useAppStore, EnrichedProduct, ScoredProduct } from '../lib/store';
import {
  runEnrichment,
  patchEnrichedProduct,
  getEnrichmentProgress,
  EnrichmentPatch,
} from '../lib/api';
import {
  Sparkles, Check, X, ArrowRight, Database, ShieldCheck, Bot,
  MessageSquare, Edit2, Save, Plus, Trash2, AlertTriangle, Tags, Link2,
} from 'lucide-react';
import RubricInfo from './rubricinfo';

type ServerQA = { question?: string; answer?: string; q?: string; a?: string; intent?: string; speculative?: boolean };

type ServerEnrichedProduct = {
  sku: string;
  original_fields: any;
  enriched_fields: {
    description?: string;
    q_and_a?: ServerQA[];
    agent_facets?: Record<string, string | string[]>;
    relationship_type?: any[];
  };
  provenance_metadata: { source: string; timestamp?: string };
  confidence_scores: Record<string, number>;
  enrichment_status?: "ok" | "failed";
};

type EnrichmentResponse = {
  enriched_products: ServerEnrichedProduct[];
  scored_products: ScoredProduct[];
  report: { succeeded: number; failed: number };
};

type RelationshipRow = { related_sku: string; relationship_type: string; rationale?: string };

const REL_TYPES = ["often_bought_with", "substitute", "complementary", "accessory_for"] as const;

const facetValueToString = (v: string | string[] | undefined): string => Array.isArray(v) ? v.join(", ") : (v ?? "");
const stringToFacetValue = (s: string): string | string[] => {
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : (parts[0] ?? "");
};

const adaptFromServer = (server: ServerEnrichedProduct): EnrichedProduct => ({
  sku: server.sku,
  original_fields: server.original_fields,
  enriched_fields: {
    description: server.enriched_fields.description,
    q_and_a: (server.enriched_fields.q_and_a || []).map(qa => ({
      q: qa.q ?? qa.question ?? "",
      a: qa.a ?? qa.answer ?? "",
      intent: qa.intent,
      speculative: qa.speculative,
    })),
    agent_facets: Object.fromEntries(
      Object.entries(server.enriched_fields.agent_facets || {}).map(([k, v]) => [k, facetValueToString(v)])
    ),
    relationship_type: (server.enriched_fields.relationship_type as any) ?? undefined,
  },
  provenance_metadata: {
    source: server.provenance_metadata.source,
    timestamp: server.provenance_metadata.timestamp ?? new Date().toISOString(),
  },
  confidence_scores: server.confidence_scores,
});

const DimBadge = ({ id, label }: { id: string; label: string }) => (
  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 tracking-wider uppercase">
    {id} · {label}
  </span>
);

export default function EnrichView() {
  const store = useAppStore();
  const { state, setEnrichedProducts, setScoredProducts, setProducts, setPhase } = store;
  const storeRef = useRef(store);
  storeRef.current = store;

  const [isEnriching, setIsEnriching] = useState(state.enrichedProducts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ succeeded: number; failed: number } | null>(null);
  const [progress, setProgress] = useState<{ total: number; completed: number } | null>(null);
  const [selectedSku, setSelectedSku] = useState<string | null>(state.enrichedProducts[0]?.sku ?? null);
  const [saving, setSaving] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  // D1 source-field edit state
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editImageUrls, setEditImageUrls] = useState('');
  const [editAttributes, setEditAttributes] = useState<Array<{ key: string; value: string }>>([]);
  // D2 / D3 / D5 / D6 enriched edit state
  const [editDesc, setEditDesc] = useState('');
  const [editQA, setEditQA] = useState<Array<{ q: string; a: string; intent?: string; speculative?: boolean }>>([]);
  const [editFacets, setEditFacets] = useState<Array<{ key: string; value: string }>>([]);
  const [editRels, setEditRels] = useState<RelationshipRow[]>([]);

  const ranEnrichment = useRef(false);

  useEffect(() => {
    if (state.enrichedProducts.length > 0) {
      setIsEnriching(false);
      if (!selectedSku) setSelectedSku(state.enrichedProducts[0].sku);
      return;
    }
    if (state.products.length === 0) {
      setIsEnriching(false);
      return;
    }
    if (ranEnrichment.current) return;
    ranEnrichment.current = true;

    setIsEnriching(true);
    setError(null);
    setProgress({ total: state.products.length, completed: 0 });

    let stopPolling = false;
    const poll = async () => {
      while (!stopPolling) {
        try {
          const p = await getEnrichmentProgress();
          if (p.status === "running" || p.status === "done") {
            setProgress({ total: p.total, completed: p.completed });
          }
        } catch {
          /* ignore */
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    };
    poll();

    (async () => {
      try {
        const res = await runEnrichment<EnrichmentResponse>(false);
        const adapted = res.enriched_products.map(adaptFromServer);
        const { setEnrichedProducts, setScoredProducts } = storeRef.current;
        setEnrichedProducts(adapted);
        if (res.scored_products?.length) setScoredProducts(res.scored_products);
        setReport(res.report);
        if (adapted.length > 0) setSelectedSku(adapted[0].sku);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enrichment failed");
        ranEnrichment.current = false;
      } finally {
        stopPolling = true;
        setIsEnriching(false);
      }
    })();
  }, [state.products.length, state.enrichedProducts.length]);

  useEffect(() => { setIsEditing(false); }, [selectedSku]);

  const selectedProduct = state.enrichedProducts.find(p => p.sku === selectedSku);
  const selectedScored = state.scoredProducts.find(sp => sp.sku === selectedSku);
  const allSkus = state.products.map(p => p.sku);

  const handleEditClick = () => {
    if (!selectedProduct) return;
    const o = selectedProduct.original_fields;
    setEditName(o.name ?? '');
    setEditPrice(o.price != null ? String(o.price) : '');
    setEditCategory(o.category ?? '');
    setEditBrand(o.brand ?? '');
    setEditImageUrls(Array.isArray(o.image_urls) ? o.image_urls.join(", ") : (o.image_urls ?? ''));
    setEditAttributes(Object.entries(o.attributes ?? {}).map(([k, v]) => ({ key: k, value: String(v) })));

    setEditDesc(selectedProduct.enriched_fields.description ?? '');
    const qa = (selectedProduct.enriched_fields.q_and_a as any[]) ?? [];
    setEditQA(qa.map(q => ({ q: q.q, a: q.a, intent: q.intent, speculative: q.speculative })));
    setEditFacets(Object.entries(selectedProduct.enriched_fields.agent_facets ?? {}).map(([k, v]) => ({ key: k, value: String(v) })));
    setEditRels(((selectedProduct.enriched_fields.relationship_type as unknown as any[]) ?? []).map(r => ({
      related_sku: r.related_sku ?? '',
      relationship_type: r.relationship_type ?? r.type ?? 'often_bought_with',
      rationale: r.rationale,
    })));
    setIsEditing(true);
  };

  const handleSaveClick = async () => {
    if (!selectedProduct || saving) return;
    setSaving(true);
    setError(null);

    const newAttrs: Record<string, string> = {};
    editAttributes.forEach(a => { if (a.key.trim()) newAttrs[a.key.trim()] = a.value.trim(); });

    const newFacets: Record<string, string | string[]> = {};
    editFacets.forEach(f => { const k = f.key.trim(); if (k) newFacets[k] = stringToFacetValue(f.value); });

    const cleanedQA = editQA.filter(qa => qa.q.trim() && qa.a.trim());
    const serverQA = cleanedQA.map(qa => ({
      question: qa.q.trim(),
      answer: qa.a.trim(),
      intent: qa.intent ?? undefined,
      speculative: false,
    }));
    const localQA = cleanedQA.map(qa => ({ q: qa.q.trim(), a: qa.a.trim(), intent: qa.intent, speculative: false }));

    const cleanedRels = editRels.filter(r => r.related_sku.trim() && r.relationship_type.trim());
    const imageList = editImageUrls.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const priceNum = editPrice.trim() ? Number(editPrice) : undefined;

    const patch: EnrichmentPatch = {
      name: editName.trim() || undefined,
      price: priceNum != null && !Number.isNaN(priceNum) ? priceNum : undefined,
      category: editCategory.trim() || undefined,
      brand: editBrand.trim() || undefined,
      image_urls: imageList.length ? imageList : undefined,
      attributes: Object.keys(newAttrs).length ? newAttrs : undefined,
      description: editDesc.trim() || undefined,
      agent_facets: newFacets,
      q_and_a: serverQA,
      relationship_type: cleanedRels,
    };

    try {
      const res = await patchEnrichedProduct<{ score: any; source_fields: any }>(selectedProduct.sku, patch);

      // Apply BOTH the source-field updates (D1 → original_fields) and the
      // enriched-field updates (D2/D3/D5/D6 → enriched_fields) in a single
      // setEnrichedProducts call. Doing them in separate calls causes the
      // second one to stomp the first because closure-captured state is stale.
      const newOriginal = {
        ...selectedProduct.original_fields,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.price !== undefined ? { price: patch.price } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.brand !== undefined ? { brand: patch.brand } : {}),
        ...(patch.image_urls !== undefined ? { image_urls: patch.image_urls } : {}),
        ...(patch.attributes !== undefined ? { attributes: patch.attributes } : {}),
      };
      const newEnrichedFields = {
        ...selectedProduct.enriched_fields,
        description: editDesc.trim() || undefined,
        agent_facets: Object.fromEntries(
          Object.entries(newFacets).map(([k, v]) => [k, facetValueToString(v as any)])
        ),
        q_and_a: localQA,
        relationship_type: cleanedRels as any,
      };

      const updatedEnriched = state.enrichedProducts.map(ep =>
        ep.sku === selectedProduct.sku
          ? { ...ep, original_fields: newOriginal as any, enriched_fields: newEnrichedFields }
          : ep
      );
      setEnrichedProducts(updatedEnriched);

      const updatedProducts = state.products.map(p =>
        p.sku === selectedProduct.sku
          ? {
              ...p,
              name: patch.name ?? p.name,
              price: patch.price ?? p.price,
              category: patch.category ?? p.category,
              brand: patch.brand ?? p.brand,
              image_urls: (patch.image_urls?.join(", ") ?? p.image_urls) as any,
              attributes: (patch.attributes ?? p.attributes) as any,
            }
          : p
      );
      setProducts(updatedProducts);

      // Reflect new score in heatmap
      if (res.score) {
        const updatedScores = state.scoredProducts.map(sp =>
          sp.sku === selectedProduct.sku ? { sku: selectedProduct.sku, ...res.score } : sp
        );
        setScoredProducts(updatedScores);
      }
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (isEnriching) {
    const total = progress?.total ?? state.products.length;
    const completed = progress?.completed ?? 0;
    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500 max-w-md mx-auto">
        <div className="w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.4)] animate-pulse">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-2xl font-bold mb-2">Enriching Catalog</h3>
        <p className="text-white/60 text-center mb-8">
          Generating missing conversational attributes, Q&A pairs, and agent facets...
        </p>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 text-sm text-white/70 font-mono">
          {completed} of {total} products enriched
        </div>
      </div>
    );
  }

  if (error && state.enrichedProducts.length === 0) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertTriangle className="w-8 h-8 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Enrichment failed</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-2xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              Data Enrichment
            </h2>
            <RubricInfo />
          </div>
          <p className="text-lg text-white/70 max-w-2xl">
            Edit any of D1–D6 directly. Saving re-runs the readiness audit for that product.
          </p>
          {report && (report.failed > 0) && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
              <AlertTriangle className="w-3 h-3" />
              Enrichment skipped: {report.failed} product{report.failed === 1 ? "" : "s"}
            </div>
          )}
        </div>

        <button
          onClick={() => setPhase('validate')}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-300 transform hover:-translate-y-0.5 whitespace-nowrap"
        >
          <Bot className="w-5 h-5" />
          Validate with Agent
          <ArrowRight className="w-5 h-5 ml-1" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl flex flex-col h-[280px] lg:h-[680px]">
          <div className="p-4 border-b border-white/10 bg-black/20">
            <h3 className="font-semibold">Products ({state.enrichedProducts.length})</h3>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {state.enrichedProducts.map(p => {
              const scored = state.scoredProducts.find(sp => sp.sku === p.sku);
              const isReady = scored && scored.readiness_score >= 8;
              return (
                <button
                  key={p.sku}
                  onClick={() => setSelectedSku(p.sku)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between ${
                    selectedSku === p.sku
                      ? 'bg-purple-500/20 border border-purple-500/30 text-white'
                      : 'hover:bg-white/5 text-white/70 border border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.original_fields.name}</div>
                    <div className="text-xs opacity-60 font-mono mt-1">{p.sku}</div>
                  </div>
                  {isReady && <Check className="w-4 h-4 text-green-400 flex-shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>

        {selectedProduct && (
          <div className="lg:col-span-3 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl flex flex-col min-h-[600px] lg:h-[680px]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
              <div>
                <h3 className="text-xl font-bold">{selectedProduct.original_fields.name}</h3>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm text-white/50 font-mono">{selectedProduct.sku}</span>
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    {selectedProduct.provenance_metadata.source}
                  </span>
                  {selectedScored && (
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white/10 text-white/70 border border-white/20">
                      Score: {selectedScored.readiness_score.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button onClick={() => setIsEditing(false)} disabled={saving} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-60">
                      <X className="w-4 h-4" /> Cancel
                    </button>
                    <button onClick={handleSaveClick} disabled={saving} className="px-4 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 text-sm font-medium transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.2)] disabled:opacity-60">
                      <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save & Re-Audit"}
                    </button>
                  </>
                ) : (
                  <button onClick={handleEditClick} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2">
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* D1 Structured Attributes */}
              <section>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Tags className="w-4 h-4" /> Structured Attributes
                  <DimBadge id="D1" label="Attributes" />
                </h4>
                {isEditing ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <LabeledInput label="Name" value={editName} onChange={setEditName} placeholder="Product name (≥10 chars)" />
                    <LabeledInput label="Price (USD)" value={editPrice} onChange={setEditPrice} placeholder="89.50" type="number" />
                    <LabeledInput label="Category" value={editCategory} onChange={setEditCategory} placeholder="Men/Shirts/Linen (depth ≥2)" />
                    <LabeledInput label="Brand" value={editBrand} onChange={setEditBrand} placeholder="Brand name" />
                    <div className="md:col-span-2">
                      <LabeledInput label="Image URLs (comma-separated)" value={editImageUrls} onChange={setEditImageUrls} placeholder="https://… , https://…" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-white/40 mb-1 block">Free-form attributes (≥2 keys boosts D1)</label>
                      <KeyValueRows rows={editAttributes} setRows={setEditAttributes} placeholderKey="material" placeholderValue="cotton" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <ReadField label="Name" value={selectedProduct.original_fields.name} />
                    <ReadField label="Price" value={selectedProduct.original_fields.price != null ? `$${selectedProduct.original_fields.price}` : "—"} />
                    <ReadField label="Category" value={selectedProduct.original_fields.category} />
                    <ReadField label="Brand" value={selectedProduct.original_fields.brand} />
                    <ReadField label="Images" value={`${(selectedProduct.original_fields.image_urls?.length || 0)} URL(s)`} />
                    <ReadField label="Attributes" value={`${Object.keys(selectedProduct.original_fields.attributes || {}).length} key(s)`} />
                  </div>
                )}
              </section>

              {/* D2 Description */}
              <section>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4" /> Description Enhancement
                  <DimBadge id="D2" label="Description" />
                  {selectedProduct.confidence_scores?.description != null && !isEditing && (
                    <span className="text-xs text-purple-400 font-mono bg-purple-500/20 px-2 py-0.5 rounded ml-auto">
                      Conf: {selectedProduct.confidence_scores.description.toFixed(2)}
                    </span>
                  )}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                    <div className="text-xs text-white/40 mb-2">Original</div>
                    <p className="text-sm text-white/70 leading-relaxed">
                      {selectedProduct.original_fields.description || <span className="italic opacity-50">No description provided</span>}
                    </p>
                  </div>
                  <div className={`p-4 rounded-xl relative transition-colors ${isEditing ? 'bg-purple-500/5 border border-purple-500/40' : 'bg-purple-500/10 border border-purple-500/20'}`}>
                    <div className="text-xs text-purple-400 mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Enriched
                    </div>
                    {isEditing ? (
                      <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full bg-black/40 border border-purple-500/30 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors resize-none" rows={6} placeholder="≥150 chars + mention material, fit, care boosts D2" />
                    ) : (
                      <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
                        {selectedProduct.enriched_fields.description || <span className="italic opacity-50">No enriched description.</span>}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* D3 Q&A */}
              <section>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Generated Q&A Pairs
                  <DimBadge id="D3" label="Q&A" />
                  {selectedProduct.confidence_scores?.q_and_a != null && !isEditing && (
                    <span className="text-xs text-purple-400 font-mono bg-purple-500/20 px-2 py-0.5 rounded ml-auto">
                      Conf: {selectedProduct.confidence_scores.q_and_a.toFixed(2)}
                    </span>
                  )}
                </h4>
                {isEditing ? (
                  <div className="space-y-3">
                    {editQA.map((qa, idx) => (
                      <div key={idx} className="flex gap-3 items-start p-4 rounded-xl bg-blue-500/5 border border-blue-500/30">
                        <div className="flex-1 space-y-3">
                          <input value={qa.q} onChange={e => { const n = [...editQA]; n[idx].q = e.target.value; setEditQA(n); }} placeholder="Question (≥10 chars)" className="w-full bg-black/40 border border-blue-500/30 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
                          <input value={qa.a} onChange={e => { const n = [...editQA]; n[idx].a = e.target.value; setEditQA(n); }} placeholder="Answer (≥10 chars)" className="w-full bg-black/40 border border-blue-500/30 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
                          <input value={qa.intent ?? ''} onChange={e => { const n = [...editQA]; n[idx].intent = e.target.value; setEditQA(n); }} placeholder="Intent (sizing, material, care, occasion, fit, styling) — ≥2 distinct intents boosts D3" className="w-full bg-black/40 border border-blue-500/20 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono" />
                        </div>
                        <button onClick={() => setEditQA(editQA.filter((_, i) => i !== idx))} className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg" title="Remove Q&A"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    ))}
                    <button onClick={() => setEditQA([...editQA, { q: '', a: '', intent: '' }])} className="text-sm text-blue-400 flex items-center gap-1 hover:text-blue-300 px-4 py-2 rounded-lg hover:bg-blue-500/10 border border-dashed border-blue-500/30 w-full justify-center"><Plus className="w-4 h-4" /> Add New Q&A Pair</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedProduct.enriched_fields.q_and_a?.map((qa: any, idx: number) => (
                      <div key={idx} className={`p-4 rounded-xl border ${qa.speculative ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-blue-500/10 border-blue-500/20'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="font-medium text-sm text-blue-100">Q: {qa.q}</div>
                          {qa.intent && <span className="text-[10px] uppercase tracking-wider text-blue-300/60 font-mono">{qa.intent}</span>}
                          {qa.speculative && <span className="text-[10px] text-yellow-400 font-mono">speculative</span>}
                        </div>
                        <div className="text-sm text-blue-200/70">A: {qa.a}</div>
                      </div>
                    ))}
                    {(!selectedProduct.enriched_fields.q_and_a || selectedProduct.enriched_fields.q_and_a.length === 0) && (
                      <div className="text-sm text-white/40 italic">No Q&A pairs generated.</div>
                    )}
                  </div>
                )}
              </section>

              {/* D5 Relationships */}
              <section>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Link2 className="w-4 h-4" /> Product Relationships
                  <DimBadge id="D5" label="Relational" />
                </h4>
                {isEditing ? (
                  <div className="space-y-3">
                    {editRels.map((rel, idx) => (
                      <div key={idx} className="flex gap-3 items-center">
                        <select value={rel.related_sku} onChange={e => { const n = [...editRels]; n[idx].related_sku = e.target.value; setEditRels(n); }} className="w-1/3 bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-white/50 font-mono">
                          <option value="">— pick a SKU —</option>
                          {allSkus.filter(s => s !== selectedProduct.sku).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={rel.relationship_type} onChange={e => { const n = [...editRels]; n[idx].relationship_type = e.target.value; setEditRels(n); }} className="bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-white/50">
                          {REL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input value={rel.rationale ?? ''} onChange={e => { const n = [...editRels]; n[idx].rationale = e.target.value; setEditRels(n); }} placeholder="Rationale (optional)" className="flex-1 bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-white/50" />
                        <button onClick={() => setEditRels(editRels.filter((_, i) => i !== idx))} className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg" title="Remove"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    ))}
                    <div className="text-[11px] text-white/40 px-1">Add ≥1 <code>often_bought_with</code> AND ≥1 of <code>substitute / complementary / accessory_for</code> for full D5 score.</div>
                    <button onClick={() => setEditRels([...editRels, { related_sku: '', relationship_type: 'often_bought_with', rationale: '' }])} className="text-sm text-white/60 flex items-center gap-1 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 border border-dashed border-white/20 w-full justify-center"><Plus className="w-4 h-4" /> Add Relationship</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {((selectedProduct.enriched_fields.relationship_type as unknown as any[]) ?? []).map((r: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 text-sm">
                        <span className="font-mono text-white/70">{r.related_sku}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">{r.relationship_type}</span>
                        {r.rationale && <span className="text-white/50 text-xs">{r.rationale}</span>}
                      </div>
                    ))}
                    {!(selectedProduct.enriched_fields.relationship_type as unknown as any[])?.length && (
                      <div className="text-sm text-white/40 italic">No relationships set.</div>
                    )}
                  </div>
                )}
              </section>

              {/* D6 Facets */}
              <section>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Bot className="w-4 h-4" /> Agent-Actionable Facets
                  <DimBadge id="D6" label="Facets" />
                  {selectedProduct.confidence_scores?.agent_facets != null && !isEditing && (
                    <span className="text-xs text-purple-400 font-mono bg-purple-500/20 px-2 py-0.5 rounded ml-auto">
                      Conf: {selectedProduct.confidence_scores.agent_facets.toFixed(2)}
                    </span>
                  )}
                </h4>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="text-[11px] text-white/40 px-1">D6 boosts when facets bridge <strong>taxonomic</strong> (size / color / material) AND <strong>contextual</strong> (occasion / weather / fit / care / season). Comma-separate values for lists.</div>
                    <KeyValueRows rows={editFacets} setRows={setEditFacets} placeholderKey="occasion" placeholderValue="casual, vacation" />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(selectedProduct.enriched_fields.agent_facets || {}).map(([key, val]) => (
                      <div key={key} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                        <span className="text-xs text-white/50 font-mono">{key}</span>
                        <span className="text-sm font-medium">{String(val)}</span>
                      </div>
                    ))}
                    {(!selectedProduct.enriched_fields.agent_facets || Object.keys(selectedProduct.enriched_fields.agent_facets).length === 0) && (
                      <div className="text-sm text-white/40 italic">No facets generated.</div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {error && (
              <div className="px-6 py-3 border-t border-red-500/20 bg-red-500/10 text-red-400 text-sm">{error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder, type = "text" }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-xs text-white/40 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-white/50" />
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: any }) {
  return (
    <div className="p-3 rounded-lg bg-black/20 border border-white/5">
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-white/80 truncate">{value ?? <span className="text-white/30 italic">—</span>}</div>
    </div>
  );
}

function KeyValueRows({ rows, setRows, placeholderKey, placeholderValue }:
  { rows: Array<{ key: string; value: string }>; setRows: (r: Array<{ key: string; value: string }>) => void; placeholderKey: string; placeholderValue: string }) {
  return (
    <div className="space-y-2">
      {rows.map((row, idx) => (
        <div key={idx} className="flex gap-3 items-center">
          <input value={row.key} onChange={e => { const n = [...rows]; n[idx].key = e.target.value; setRows(n); }} placeholder={placeholderKey} className="w-1/3 bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm text-white font-mono focus:outline-none focus:border-white/50" />
          <input value={row.value} onChange={e => { const n = [...rows]; n[idx].value = e.target.value; setRows(n); }} placeholder={placeholderValue} className="flex-1 bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-white/50" />
          <button onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg"><Trash2 className="w-5 h-5" /></button>
        </div>
      ))}
      <button onClick={() => setRows([...rows, { key: '', value: '' }])} className="text-sm text-white/60 flex items-center gap-1 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 border border-dashed border-white/20 w-full justify-center"><Plus className="w-4 h-4" /> Add Row</button>
    </div>
  );
}
