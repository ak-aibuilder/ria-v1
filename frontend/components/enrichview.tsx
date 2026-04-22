"use client";

import React, { useEffect, useState } from 'react';
import { useAppStore, EnrichedProduct } from '../lib/store';
import { Sparkles, Check, X, ArrowRight, Database, ShieldCheck, Bot, MessageSquare, Edit2, Save, Plus, Trash2 } from 'lucide-react';

// Mock enrichment logic
const generateMockEnrichment = (products: any[]): EnrichedProduct[] => {
  return products.map(p => {
    return {
      sku: p.sku,
      original_fields: { ...p },
      enriched_fields: {
        description: p.description 
          ? `${p.description} This premium item is designed for maximum comfort and durability. Perfect for everyday use or special occasions.`
          : `A high-quality ${p.category || 'product'} that delivers exceptional value. Designed with premium materials for lasting durability.`,
        q_and_a: [
          { q: `Is the ${p.name} suitable for daily use?`, a: "Yes, it is designed specifically for durable, everyday use." },
          { q: "What are the care instructions?", a: "We recommend standard care procedures. Check the label for specific details." }
        ],
        agent_facets: {
          "best_for": "everyday use",
          "durability": "high",
          "style": "classic"
        },
        relationship_type: "complementary_to_basics"
      },
      provenance_metadata: {
        source: "Claude 3.5 Sonnet",
        timestamp: new Date().toISOString()
      },
      confidence_scores: {
        description: 0.92,
        q_and_a: 0.88,
        agent_facets: 0.95
      }
    };
  });
};

export default function EnrichView() {
  const { state, setEnrichedProducts, setPhase, updateEnrichedProduct, reAuditProduct } = useAppStore();
  const [isEnriching, setIsEnriching] = useState(true);
  const [progress, setProgress] = useState(0);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editFacets, setEditFacets] = useState<Array<{key: string, value: string}>>([]);
  const [editQA, setEditQA] = useState<Array<{q: string, a: string}>>([]);

  useEffect(() => {
    if (state.enrichedProducts.length === 0 && state.products.length > 0) {
      // Simulate API progress
      let current = 0;
      const interval = setInterval(() => {
        current += 10;
        setProgress(current);
        if (current >= 100) {
          clearInterval(interval);
          const enriched = generateMockEnrichment(state.products);
          setEnrichedProducts(enriched);
          setIsEnriching(false);
          if (enriched.length > 0) {
            setSelectedSku(enriched[0].sku);
          }
        }
      }, 300);
      return () => clearInterval(interval);
    } else if (state.enrichedProducts.length > 0) {
      setIsEnriching(false);
      if (!selectedSku) setSelectedSku(state.enrichedProducts[0].sku);
    }
  }, [state.products, state.enrichedProducts.length, setEnrichedProducts]);

  // Reset edit state when selected product changes
  useEffect(() => {
    setIsEditing(false);
  }, [selectedSku]);

  const selectedProduct = state.enrichedProducts.find(p => p.sku === selectedSku);

  const handleEditClick = () => {
    if (!selectedProduct) return;
    setEditDesc(selectedProduct.enriched_fields.description || '');
    
    const facets = selectedProduct.enriched_fields.agent_facets || {};
    setEditFacets(Object.entries(facets).map(([k, v]) => ({ key: k, value: v as string })));
    
    setEditQA([...(selectedProduct.enriched_fields.q_and_a || [])]);
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    if (!selectedProduct) return;
    
    const newFacets: Record<string, string> = {};
    editFacets.forEach(f => {
      if (f.key.trim()) newFacets[f.key.trim()] = f.value.trim();
    });

    updateEnrichedProduct(selectedProduct.sku, {
      description: editDesc,
      agent_facets: newFacets,
      q_and_a: editQA.filter(qa => qa.q.trim() && qa.a.trim())
    });
    
    reAuditProduct(selectedProduct.sku);
    setIsEditing(false);
  };

  if (isEnriching) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500 max-w-md mx-auto">
        <div className="w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.4)] animate-pulse">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-2xl font-bold mb-2">Enriching Catalog</h3>
        <p className="text-white/60 text-center mb-8">
          Claude is generating missing conversational attributes, Q&A pairs, and agent facets...
        </p>
        
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-sm text-white/40 font-mono">{progress}% Complete</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
        <div>
          <h2 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
            Data Enrichment
          </h2>
          <p className="text-lg text-white/70 max-w-2xl">
            Review and modify the AI-generated attributes. Saving changes will automatically re-run the readiness audit for that product.
          </p>
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
        {/* Product List Sidebar */}
        <div className="lg:col-span-1 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl flex flex-col h-[600px]">
          <div className="p-4 border-b border-white/10 bg-black/20">
            <h3 className="font-semibold">Products ({state.enrichedProducts.length})</h3>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {state.enrichedProducts.map(p => {
              // Check if this product has a perfect score now
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

        {/* Comparison View */}
        {selectedProduct && (
          <div className="lg:col-span-3 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl flex flex-col h-[600px]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
              <div>
                <h3 className="text-xl font-bold">{selectedProduct.original_fields.name}</h3>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm text-white/50 font-mono">{selectedProduct.sku}</span>
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    {selectedProduct.provenance_metadata.source}
                  </span>
                  {state.scoredProducts.find(sp => sp.sku === selectedProduct.sku) && (
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white/10 text-white/70 border border-white/20">
                      Score: {state.scoredProducts.find(sp => sp.sku === selectedProduct.sku)?.readiness_score.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button 
                      onClick={() => setIsEditing(false)} 
                      className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                    <button 
                      onClick={handleSaveClick} 
                      className="px-4 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 text-sm font-medium transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                    >
                      <Save className="w-4 h-4" /> Save & Re-Audit
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={handleEditClick} 
                      className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <Edit2 className="w-4 h-4" /> Edit
                    </button>
                    <button className="px-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 text-sm font-medium transition-colors flex items-center gap-2">
                      <Check className="w-4 h-4" /> Approve
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Description Comparison */}
              <div>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4" /> Description Enhancement
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                    <div className="text-xs text-white/40 mb-2">Original</div>
                    <p className="text-sm text-white/70 leading-relaxed">
                      {selectedProduct.original_fields.description || <span className="italic opacity-50">No description provided</span>}
                    </p>
                  </div>
                  <div className={`p-4 rounded-xl relative transition-colors ${isEditing ? 'bg-purple-500/5 border border-purple-500/40' : 'bg-purple-500/10 border border-purple-500/20'}`}>
                    {!isEditing && (
                      <div className="absolute top-4 right-4 text-xs text-purple-400 font-mono bg-purple-500/20 px-2 py-0.5 rounded">
                        Conf: {selectedProduct.confidence_scores.description}
                      </div>
                    )}
                    <div className="text-xs text-purple-400 mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Enriched
                    </div>
                    
                    {isEditing ? (
                      <textarea 
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        className="w-full bg-black/40 border border-purple-500/30 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
                        rows={5}
                        placeholder="Enter enriched description..."
                      />
                    ) : (
                      <p className="text-sm text-white leading-relaxed">
                        {selectedProduct.enriched_fields.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Q&A Generation */}
              <div>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Generated Q&A Pairs
                </h4>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {editQA.map((qa, idx) => (
                      <div key={idx} className="flex gap-3 items-start p-4 rounded-xl bg-blue-500/5 border border-blue-500/30">
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className="text-xs text-blue-300/70 mb-1 block">Question</label>
                            <input 
                              value={qa.q}
                              onChange={e => {
                                const newQA = [...editQA];
                                newQA[idx].q = e.target.value;
                                setEditQA(newQA);
                              }}
                              placeholder="e.g., Is this suitable for daily use?"
                              className="w-full bg-black/40 border border-blue-500/30 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-blue-300/70 mb-1 block">Answer</label>
                            <input 
                              value={qa.a}
                              onChange={e => {
                                const newQA = [...editQA];
                                newQA[idx].a = e.target.value;
                                setEditQA(newQA);
                              }}
                              placeholder="e.g., Yes, it is highly durable."
                              className="w-full bg-black/40 border border-blue-500/30 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={() => setEditQA(editQA.filter((_, i) => i !== idx))} 
                          className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg transition-colors mt-6"
                          title="Remove Q&A"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => setEditQA([...editQA, {q: '', a: ''}])} 
                      className="text-sm text-blue-400 flex items-center gap-1 hover:text-blue-300 px-4 py-2 rounded-lg hover:bg-blue-500/10 transition-colors border border-dashed border-blue-500/30 w-full justify-center"
                    >
                      <Plus className="w-4 h-4" /> Add New Q&A Pair
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedProduct.enriched_fields.q_and_a?.map((qa, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <div className="font-medium text-sm mb-2 text-blue-100">Q: {qa.q}</div>
                        <div className="text-sm text-blue-200/70">A: {qa.a}</div>
                      </div>
                    ))}
                    {(!selectedProduct.enriched_fields.q_and_a || selectedProduct.enriched_fields.q_and_a.length === 0) && (
                      <div className="text-sm text-white/40 italic">No Q&A pairs generated.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Agent Facets */}
              <div>
                <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Bot className="w-4 h-4" /> Agent-Actionable Facets
                </h4>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {editFacets.map((facet, idx) => (
                      <div key={idx} className="flex gap-3 items-center">
                        <input 
                          value={facet.key}
                          onChange={e => {
                            const newFacets = [...editFacets];
                            newFacets[idx].key = e.target.value;
                            setEditFacets(newFacets);
                          }}
                          placeholder="Facet Key (e.g. best_for)"
                          className="w-1/3 bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-white/50 font-mono transition-colors"
                        />
                        <input 
                          value={facet.value}
                          onChange={e => {
                            const newFacets = [...editFacets];
                            newFacets[idx].value = e.target.value;
                            setEditFacets(newFacets);
                          }}
                          placeholder="Value"
                          className="flex-1 bg-black/40 border border-white/20 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-white/50 transition-colors"
                        />
                        <button 
                          onClick={() => setEditFacets(editFacets.filter((_, i) => i !== idx))} 
                          className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg transition-colors"
                          title="Remove Facet"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => setEditFacets([...editFacets, {key: '', value: ''}])} 
                      className="text-sm text-white/60 flex items-center gap-1 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 transition-colors border border-dashed border-white/20 w-full justify-center"
                    >
                      <Plus className="w-4 h-4" /> Add New Facet
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(selectedProduct.enriched_fields.agent_facets || {}).map(([key, val]) => (
                      <div key={key} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                        <span className="text-xs text-white/50 font-mono">{key}</span>
                        <span className="text-sm font-medium">{val}</span>
                      </div>
                    ))}
                    {(!selectedProduct.enriched_fields.agent_facets || Object.keys(selectedProduct.enriched_fields.agent_facets).length === 0) && (
                      <div className="text-sm text-white/40 italic">No facets generated.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

